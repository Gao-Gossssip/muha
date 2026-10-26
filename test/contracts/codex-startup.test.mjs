import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { codexAdapter, createMuhaRuntime } from "@muha-sdk/muha";
import { mkdtemp } from "../support/temporary-directory.mjs";

const fakeHarnessBin = resolve(import.meta.dirname, "../fixtures/harness-bin");

test("Codex cold startup and new Sessions through the SDK entry package", async t => {
  const root = await mkdtemp(join(tmpdir(), "muha-codex-cold-start-"));
  const workspacePath = join(root, "workspace");
  const initializeGate = join(root, "initialize");
  const threadStartGate = join(root, "thread-start");
  const pidFile = join(root, "codex.pid");
  let registration, runtime, firstSession;
  try {
    await mkdir(workspacePath);
    await t.test("adapter registration starts no native process", async () => {
      registration = codexAdapter({
        env: {
          PATH: [fakeHarnessBin, dirname(process.execPath)].join(delimiter),
          MUHA_FAKE_PID_FILE: pidFile,
          MUHA_FAKE_NATIVE_SESSIONS_FILE: join(root, "sessions.json"),
          MUHA_FAKE_CODEX_INITIALIZE_GATE: initializeGate,
          MUHA_FAKE_CODEX_THREAD_START_GATE: threadStartGate,
          MUHA_FAKE_CODEX_QUESTION_FEATURE: "pending",
        },
        startupTimeoutMs: 5_000,
        shutdownTimeoutMs: 2_000,
      });
      await assert.rejects(access(`${initializeGate}.waiting`), { code: "ENOENT" });
      await assert.rejects(access(pidFile), { code: "ENOENT" });
    });
    await t.test("Runtime startup waits for the Codex initialization handshake", async () => {
      let ready = false;
      const starting = createMuhaRuntime({ harnesses: [registration], dataDir: join(root, "diagnostics") })
        .then(value => { ready = true; runtime = value; return value; });
      const seen = await readEventually(`${initializeGate}.waiting`);
      assert.ok(Number(seen) > 1);
      assert.equal(ready, false, "Runtime must not become ready before the native handshake");
      await writeFile(initializeGate, "continue");
      await starting;
      assert.equal(runtime.status, "active");
      await readEventually(pidFile);
      await assert.rejects(access(`${threadStartGate}.waiting`), { code: "ENOENT" });
    });
    await t.test("first new Session waits for thread/start, then admits with diagnostics pending", async () => {
      let ready = false;
      const creating = runtime.createSession({ harness: "codex", workspacePath })
        .then(value => { ready = true; firstSession = value; return value; });
      await readEventually(`${threadStartGate}.waiting`);
      assert.equal(ready, false, "Session must not become ready before native thread creation");
      await writeFile(threadStartGate, "continue");
      await withoutDiagnosticWait(creating);
      assert.equal(firstSession.reference.workspacePath, workspacePath);
      assert.equal(firstSession.reference.route, "native");
    });
    await t.test("an initialized adapter creates a distinct new Session without restarting", async () => {
      const pid = await readFile(pidFile, "utf8");
      const second = await withoutDiagnosticWait(runtime.createSession({ harness: "codex", workspacePath }));
      assert.notEqual(second.reference.sessionId, firstSession.reference.sessionId);
      assert.equal(await readFile(pidFile, "utf8"), pid);
      const listed = await runtime.listSessions({ harness: "codex", workspacePath });
      assert.equal(listed.length, 2);
      await second.close();
    });
  } finally {
    await runtime?.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function readEventually(path) {
  const deadline = Date.now() + 4_000;
  for (;;) {
    try { const text = await readFile(path, "utf8"); if (text.length) return text; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    assert.ok(Date.now() < deadline, `native startup did not reach ${path}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function withoutDiagnosticWait(operation) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("new Session waited for optional feature diagnostics")), 2_000);
    })]);
  } finally { clearTimeout(timer); }
}
