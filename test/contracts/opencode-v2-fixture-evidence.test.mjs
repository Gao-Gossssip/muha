import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawnHarnessProcess, closeHarnessProcess } from "@muha-sdk/core/internal/host-process";
import { readV2Evidence } from "../support/v2-evidence.mjs";

const fixture = resolve(import.meta.dirname, "../fixtures/v2-harness-bin/opencode");

test("OpenCode v2 fixture evidence remains complete during concurrent requests", { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "muha-v2-evidence-"));
  const evidenceFile = join(root, "evidence.json");
  const child = spawn(process.execPath, [fixture, "serve", "--stdio", "--port", "0"], {
    env: { ...process.env, OPENCODE_PASSWORD: "fixture-password",
      OPENCODE_SERVER_PASSWORD: "", MUHA_V2_EVIDENCE_FILE: evidenceFile },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  let stderr = "";
  let holder;
  let releaseTimer;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => { stderr += chunk; });
  try {
    const ready = await new Promise((resolveReady, rejectReady) => {
      lines.once("line", (line) => resolveReady(JSON.parse(line)));
      child.once("exit", (code) => rejectReady(new Error(`fixture exited before ready: ${code}`)));
    });
    const headers = { authorization: "Basic " + Buffer.from("opencode:fixture-password").toString("base64") };
    const info = () => fetch(`${ready.url}/api/info`, { headers }).then((response) => {
      assert.equal(response.status, 200);
    });
    await info();
    const deadline = Date.now() + 2_000;
    while (true) {
      try {
        JSON.parse(await readFile(evidenceFile, "utf8"));
        break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await new Promise((resolveWait) => setTimeout(resolveWait, 5));
      }
    }

    if (process.platform === "win32") {
      // Real Windows file sharing can delay atomic replacement beyond the
      // fixture's former 200ms retry budget while HTTP requests still succeed.
      holder = spawnHarnessProcess("powershell.exe", ["-NoProfile", "-NonInteractive", "-File",
        fileURLToPath(new URL("../fixtures/windows-hold-file.ps1", import.meta.url)), evidenceFile],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      holder.stderr.resume();
      const [ready] = await once(holder.stdout, "data");
      assert.equal(ready.toString().trim(), "ready");
      releaseTimer = setTimeout(() => holder.stdin.end("release\n"), 1000);
    }
    const requests = Promise.all(Array.from({ length: 120 }, () => info()));
    let settled = false;
    void requests.then(() => { settled = true; }, () => { settled = true; });
    let reads = 0;
    let parseFailure;
    while (!settled || reads < 300) {
      try {
        const snapshot = JSON.parse(await readFile(evidenceFile, "utf8"));
        assert.ok(snapshot.authenticated >= 1);
      } catch (error) {
        parseFailure = error;
        break;
      }
      reads += 1;
      if (reads >= 3_000) break;
    }
    try { await requests; } catch (error) { throw new Error(`Fixture request failed: ${error.cause?.code ?? error.message}; ${stderr}`, { cause: error }); }
    if (parseFailure) throw parseFailure;
    assert.ok(reads >= 300);
    const final = await readV2Evidence(evidenceFile, snapshot => snapshot.authenticated === 121);
    assert.equal(final.requests.length, 121, "coalescing must retain every cumulative request receipt");
    assert.ok(final.requests.every(path => path === "/api/info"));
  } finally {
    clearTimeout(releaseTimer);
    if (holder) {
      if (!holder.stdin.writableEnded) holder.stdin.end("release\n");
      await closeHarnessProcess(holder).catch(() => {});
    }
    lines.close();
    child.stdin.end();
    child.kill();
    await rm(root, { recursive: true, force: true });
  }
});
