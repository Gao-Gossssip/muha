import { mkdtemp } from "../support/temporary-directory.mjs";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";

import { codexAdapter } from "@muha-sdk/codex-adapter";
import { createMuhaRuntime } from "@muha-sdk/core";

const fakeHarnessBin = resolve(import.meta.dirname, "../fixtures/harness-bin");

test("Codex warns without blocking a Session when the effective Question feature is disabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "muha-codex-question-feature-warning-"));
  const workspace = join(root, "workspace");
  const warnings = [];
  const onWarning = (warning) => warnings.push(warning);
  process.on("warning", onWarning);
  let runtime;
  let session;
  let resumed;
  try {
    await mkdir(workspace);
    runtime = await createMuhaRuntime({
      harnesses: [codexAdapter({
        env: {
          PATH: [fakeHarnessBin, dirname(process.execPath)].join(delimiter),
          MUHA_FAKE_CODEX_QUESTION_FEATURE: "disabled",
          MUHA_FAKE_NATIVE_SESSIONS_FILE: join(root, "native-sessions.json"),
        },
        startupTimeoutMs: 2_000,
        shutdownTimeoutMs: 2_000,
      })],
      dataDir: join(root, "diagnostics"),
    });
    session = await runtime.createSession({ harness: "codex", workspacePath: workspace });
    await settleFeatureQuery(runtime, workspace);
    assert.equal(session.reference.workspacePath, workspace);
    assert.equal(warnings.filter(({ code }) => code === "MUHA_CODEX_QUESTION_FEATURE_DISABLED").length, 1);
    const reference = session.reference;
    await session.close();
    resumed = await runtime.resumeSession({ reference });
    await settleFeatureQuery(runtime, workspace);
    assert.equal(warnings.filter(({ code }) => code === "MUHA_CODEX_QUESTION_FEATURE_DISABLED").length, 1);
  } finally {
    process.off("warning", onWarning);
    await resumed?.close();
    await session?.close();
    await runtime?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex rechecks the effective Question feature when a Session is resumed", async () => {
  const root = await mkdtemp(join(tmpdir(), "muha-codex-question-feature-resume-"));
  const workspace = join(root, "workspace");
  const nativeSessionsFile = join(root, "native-sessions.json");
  const warnings = [];
  const onWarning = (warning) => warnings.push(warning);
  process.on("warning", onWarning);
  let runtime;
  let session;
  try {
    await mkdir(workspace);
    const adapter = (feature) => codexAdapter({
      env: {
        PATH: [fakeHarnessBin, dirname(process.execPath)].join(delimiter),
        MUHA_FAKE_CODEX_QUESTION_FEATURE: feature,
        MUHA_FAKE_NATIVE_SESSIONS_FILE: nativeSessionsFile,
      },
      startupTimeoutMs: 2_000,
      shutdownTimeoutMs: 2_000,
    });
    runtime = await createMuhaRuntime({
      harnesses: [adapter("enabled")],
      dataDir: join(root, "first-diagnostics"),
    });
    session = await runtime.createSession({ harness: "codex", workspacePath: workspace });
    const reference = session.reference;
    await settleFeatureQuery(runtime, workspace);
    assert.equal(warnings.filter(({ code }) => code?.startsWith("MUHA_CODEX_QUESTION_FEATURE_")).length, 0);
    await session.close();
    await runtime.close();

    runtime = await createMuhaRuntime({
      harnesses: [adapter("disabled")],
      dataDir: join(root, "second-diagnostics"),
    });
    session = await runtime.resumeSession({ reference });
    await settleFeatureQuery(runtime, workspace);
    assert.deepEqual(session.reference, reference);
    assert.equal(warnings.filter(({ code }) => code === "MUHA_CODEX_QUESTION_FEATURE_DISABLED").length, 1);
  } finally {
    process.off("warning", onWarning);
    await session?.close();
    await runtime?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex keeps Session creation nonblocking when feature discovery is unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "muha-codex-question-feature-unknown-"));
  const warnings = [];
  const onWarning = (warning) => warnings.push(warning);
  process.on("warning", onWarning);
  let runtime;
  let session;
  try {
    runtime = await createMuhaRuntime({
      harnesses: [codexAdapter({
        env: {
          PATH: [fakeHarnessBin, dirname(process.execPath)].join(delimiter),
          MUHA_FAKE_CODEX_QUESTION_FEATURE: "unavailable",
        },
        startupTimeoutMs: 2_000,
        shutdownTimeoutMs: 2_000,
      })],
      dataDir: join(root, "diagnostics"),
    });
    session = await runtime.createSession({ harness: "codex", workspacePath: root });
    await settleFeatureQuery(runtime, root);
    assert.equal(session.reference.workspacePath, root);
    assert.equal(warnings.filter(({ code }) => code === "MUHA_CODEX_QUESTION_FEATURE_UNKNOWN").length, 1);
  } finally {
    process.off("warning", onWarning);
    await session?.close();
    await runtime?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex admits, uses, resumes and closes Sessions while feature discovery never responds", async () => {
  await withFeatureScenario("pending", async ({ runtime, root, warnings }) => {
    const session = await beforeDiagnosticTimeout(runtime.createSession({ harness: "codex", workspacePath: root }));
    await settleFeatureQuery(runtime, root);
    const turn = await session.startTurn([{ type: "text", text: "Controlled startup test" }]);
    for await (const _event of turn) { /* drain the controlled Turn */ }
    assert.equal((await turn.result).status, "completed");
    const reference = session.reference;
    await beforeDiagnosticTimeout(session.close());
    const resumed = await beforeDiagnosticTimeout(runtime.resumeSession({ reference }));
    assert.deepEqual(resumed.reference, reference);
    await settleFeatureQuery(runtime, root);
    await beforeDiagnosticTimeout(runtime.close());
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(warnings.length, 0, "shutdown must not turn a pending diagnostic into a warning");
  });
});

test("Codex suppresses feature observations received after their Session closes", async () => {
  await withFeatureScenario("after-close", async ({ runtime, root, warnings }) => {
    const session = await beforeDiagnosticTimeout(runtime.createSession({ harness: "codex", workspacePath: root }));
    await settleFeatureQuery(runtime, root);
    await session.close();
    await settleFeatureQuery(runtime, root);
    assert.equal(warnings.length, 0);
  });
});

test("Codex ignores stale Workspace feature observations that arrive after a newer check", async () => {
  await withFeatureScenario("out-of-order", async ({ runtime, root, warnings }) => {
    await beforeDiagnosticTimeout(runtime.createSession({ harness: "codex", workspacePath: root }));
    await settleFeatureQuery(runtime, root);
    await beforeDiagnosticTimeout(runtime.createSession({ harness: "codex", workspacePath: root }));
    await settleFeatureQuery(runtime, root);
    assert.equal(warnings.length, 0, "the older disabled result must not override the newer enabled value");
  });
});

test("Codex still warns when a live Session's background feature discovery times out", async () => {
  await withFeatureScenario("pending", async ({ runtime, root, warnings }) => {
    const observed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { process.off("warning", onWarning); reject(new Error("missing diagnostic timeout warning")); }, 10_000);
      function onWarning(warning) {
        if (warning.code !== "MUHA_CODEX_QUESTION_FEATURE_UNKNOWN") return;
        clearTimeout(timer);
        process.off("warning", onWarning);
        resolve();
      }
      process.on("warning", onWarning);
    });
    await runtime.createSession({ harness: "codex", workspacePath: root });
    await observed;
    assert.equal(warnings.filter(({ code }) => code === "MUHA_CODEX_QUESTION_FEATURE_UNKNOWN").length, 1);
  });
});

test("Codex keeps background feature checks independent across Workspaces", async () => {
  await withFeatureScenario("out-of-order", async ({ runtime, root, warnings }) => {
    const otherWorkspace = join(root, "other-workspace");
    await mkdir(otherWorkspace);
    await beforeDiagnosticTimeout(runtime.createSession({ harness: "codex", workspacePath: root }));
    await settleFeatureQuery(runtime, root);
    await runtime.createSession({ harness: "codex", workspacePath: otherWorkspace });
    await settleFeatureQuery(runtime, root);
    assert.equal(warnings.filter(({ code }) => code === "MUHA_CODEX_QUESTION_FEATURE_DISABLED").length, 1);
  });
});

async function settleFeatureQuery(runtime, workspacePath) {
  // The fixture processes this request after the diagnostic request. Unlike a
  // single event-loop tick, it also waits for responses from the native process.
  await runtime.listSessions({ harness: "codex", workspacePath });
  await new Promise(resolve => setImmediate(resolve));
}

async function beforeDiagnosticTimeout(operation) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Session control waited for optional feature discovery")), 2_000); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function withFeatureScenario(feature, run) {
  const root = await mkdtemp(join(tmpdir(), "muha-codex-background-feature-"));
  const warnings = [];
  const onWarning = warning => {
    if (warning.code?.startsWith("MUHA_CODEX_QUESTION_FEATURE_")) warnings.push(warning);
  };
  process.on("warning", onWarning);
  let runtime;
  try {
    runtime = await createMuhaRuntime({
      harnesses: [codexAdapter({
        env: {
          PATH: [fakeHarnessBin, dirname(process.execPath)].join(delimiter),
          MUHA_FAKE_CODEX_QUESTION_FEATURE: feature,
          MUHA_FAKE_NATIVE_SESSIONS_FILE: join(root, "native-sessions.json"),
        },
        startupTimeoutMs: 2_000,
        shutdownTimeoutMs: 2_000,
      })],
      dataDir: join(root, "diagnostics"),
    });
    await run({ runtime, root, warnings });
  } finally {
    await runtime?.close();
    process.off("warning", onWarning);
    await rm(root, { recursive: true, force: true });
  }
}
