import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createMuhaRuntime } from "@muha-sdk/core";
import { kimiAdapter } from "@muha-sdk/kimi-adapter";
import { spawnHarnessProcess, closeHarnessProcess } from "@muha-sdk/core/internal/host-process";
import { mkdtemp } from "../support/temporary-directory.mjs";

test("Windows Kimi fixture preserves prompt evidence across a native file-sharing lock",
  { skip: process.platform !== "win32", timeout: 60000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), "muha-kimi-evidence-lock-"));
    const workspace = join(root, "workspace"), evidenceFile = join(root, "evidence.json");
    let runtime, holder;
    t.after(async () => {
      if (holder) {
        if (!holder.stdin.writableEnded) holder.stdin.end("release\n");
        await closeHarnessProcess(holder).catch(() => {});
      }
      try { await runtime?.close(); } finally { await rm(root, { recursive: true, force: true }); }
    });
    await mkdir(workspace);
    runtime = await createMuhaRuntime({ dataDir: join(root, "diagnostics"), harnesses: [kimiAdapter({
      env: { PATH: [resolve(import.meta.dirname, "../fixtures/harness-bin"), dirname(process.execPath)].join(delimiter),
        MUHA_FAKE_KIMI_SCENARIO: "normal", MUHA_FAKE_KIMI_EVIDENCE_FILE: evidenceFile },
      startupTimeoutMs: 10000, shutdownTimeoutMs: 5000,
    })] });
    const session = await runtime.createSession({ harness: "kimi", workspacePath: workspace, approvalPolicy: "autoApprove" });
    holder = spawnHarnessProcess("powershell.exe", ["-NoProfile", "-NonInteractive", "-File",
      fileURLToPath(new URL("../fixtures/windows-hold-file.ps1", import.meta.url)), evidenceFile],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    holder.stderr.resume();
    const [ready] = await once(holder.stdout, "data");
    assert.equal(ready.toString().trim(), "ready");
    await assert.rejects(stat(`${evidenceFile}.next`), { code: "ENOENT" });
    let settled = false, requestFailure;
    const starting = session.startTurn([{ type: "text", text: "Record this controlled prompt" }]);
    void starting.then(() => { settled = true; }, error => { settled = true; requestFailure = error; });
    const deadline = Date.now() + 5000;
    for (;;) {
      try { await stat(`${evidenceFile}.next`); break; }
      catch (error) { if (error.code !== "ENOENT" || Date.now() >= deadline) throw error; }
      await delay(10);
    }
    await delay(250);
    assert.equal(settled, false, requestFailure ? JSON.stringify(requestFailure.data)
      : "the fixture must retain the request until its evidence can be committed");
    holder.stdin.end("release\n");
    const turn = await starting;
    for await (const event of turn) { /* drain the controlled native stream */ }
    assert.equal((await turn.result).status, "completed");
    assert.equal(JSON.parse(await readFile(evidenceFile, "utf8")).prompts.length, 1);
  });
