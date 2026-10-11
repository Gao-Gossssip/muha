import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { codexAdapter } from "@muha-sdk/codex-adapter";
import { createMuhaRuntime } from "@muha-sdk/core";
import { mapToolCompleted, mapToolStarted } from "../../packages/codex-adapter/dist/codex-process.js";

// Shape observed on Codex 0.162.1. Completions below are controlled fixtures,
// not captures from the failed application Turn.
const emptySearch = {
  type: "webSearch",
  id: "web_search_1",
  query: "",
  action: null,
  results: null,
};

test("Codex web search mappings preserve an empty display query and null fields", () => {
  assert.deepEqual(mapToolStarted(emptySearch, emptySearch.id), {
    type: "tool.started",
    nativeToolCallId: emptySearch.id,
    toolName: "webSearch",
    input: { query: "", action: null },
  });
  assert.deepEqual(mapToolCompleted(emptySearch, emptySearch.id), {
    type: "tool.completed",
    nativeToolCallId: emptySearch.id,
    output: { query: "", action: null, results: null },
    isError: false,
  });
});

test("Codex web search mappings preserve native actions, results and omitted fields", () => {
  for (const item of [
    { ...emptySearch, query: "muha", action: { type: "search", query: "muha", queries: ["muha", "codex"] }, results: [{ url: "https://example.test" }] },
    { ...emptySearch, action: { type: "search", query: "muha", queries: ["muha", "codex"] } },
    { ...emptySearch, action: { type: "openPage", url: "https://example.test" } },
    { ...emptySearch, action: { type: "findInPage", url: "https://example.test", pattern: "report" } },
    { ...emptySearch, action: { type: "other" } },
    { type: "webSearch", id: emptySearch.id, query: "" },
    { type: "webSearch", id: emptySearch.id, query: "muha" },
  ]) {
    const input = { query: item.query, ...(item.action === undefined ? {} : { action: item.action }) };
    assert.deepEqual(mapToolStarted(item, item.id).input, input);
    assert.deepEqual(mapToolCompleted(item, item.id).output, {
      ...input,
      ...(item.results === undefined ? {} : { results: item.results }),
    });
  }
});

test("Codex web search mappings still reject missing and non-string queries", () => {
  for (const query of [undefined, null, false, 42, {}, []]) {
    const item = { ...emptySearch, query };
    assert.throws(() => mapToolStarted(item, item.id), /Invalid web search query/);
    assert.throws(() => mapToolCompleted(item, item.id), /Invalid web search query/);
  }
  const { query, ...missingQuery } = emptySearch;
  assert.throws(() => mapToolStarted(missingQuery, missingQuery.id), /Invalid web search query/);
  assert.throws(() => mapToolCompleted(missingQuery, missingQuery.id), /Invalid web search query/);
});

test("accepting an empty web search query does not relax other native tool inputs", () => {
  assert.throws(() => mapToolStarted({ type: "commandExecution", command: "", cwd: "/tmp" }, "command"), /Invalid command/);
  assert.throws(() => mapToolStarted({ type: "commandExecution", command: "true", cwd: "" }, "command"), /Invalid command cwd/);
  assert.throws(() => mapToolStarted({ type: "imageView", path: "" }, "image"), /Invalid image path/);
  assert.throws(() => mapToolCompleted({ type: "imageView", path: "" }, "image"), /Invalid image path/);
});

for (const completedSearch of [
  emptySearch,
  { ...emptySearch, query: "muha", action: { type: "search", query: "muha", queries: ["muha", "codex"] }, results: [{ title: "Result", url: "https://example.test/muha" }] },
]) {
  test(`Codex native Turn survives an empty web search query (completed query: ${JSON.stringify(completedSearch.query)})`, { timeout: 10_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "muha-codex-empty-search-"));
    let runtime;
    let session;
    try {
      runtime = await createMuhaRuntime({
        harnesses: [codexAdapter({
          env: {
            PATH: [resolve(import.meta.dirname, "../fixtures/harness-bin"), dirname(process.execPath)].join(delimiter),
            MUHA_FAKE_TURN_SCENARIO: "rich",
            MUHA_FAKE_EXTRA_NATIVE_ITEMS: JSON.stringify([{ started: emptySearch, completed: completedSearch }]),
          },
          startupTimeoutMs: 2_000,
          shutdownTimeoutMs: 2_000,
        })],
        dataDir: join(root, "diagnostics"),
      });
      session = await runtime.createSession({ harness: "codex", workspacePath: root });
      assert.equal(session.reference.route, "native");
      const turn = await session.startTurn([{ type: "text", text: "Search for muha and codex." }]);
      const events = [];
      for await (const event of turn) events.push(event);
      const result = await turn.result;
      assert.equal(result.status, "completed", JSON.stringify(result));
      assert.equal(result.message.text, "Final.");
      assert.deepEqual(session.status, { status: "idle" });

      const starts = events.filter(event => event.type === "tool.started" && event.toolName === "webSearch");
      assert.equal(starts.length, 1);
      assert.deepEqual(starts[0].input, { query: "", action: null });
      const completions = events.filter(event => event.type === "tool.completed" && event.toolCallId === starts[0].toolCallId);
      assert.equal(completions.length, 1);
      assert.deepEqual(completions[0].output, {
        query: completedSearch.query,
        action: completedSearch.action,
        results: completedSearch.results,
      });
      assert.equal(completions[0].isError, false);
      assert.ok(completions[0].sequence > starts[0].sequence);
      assert.deepEqual(events.filter(event => ["turn.completed", "turn.failed", "turn.interrupted"].includes(event.type)).map(event => event.type), ["turn.completed"]);

      const database = new DatabaseSync(join(runtime.dataDir, "diagnostic-events.sqlite"), { readOnly: true });
      try {
        const nativeSearches = database.prepare(
          "SELECT payload_json FROM native_event_records WHERE harness = 'codex' AND json_extract(payload_json, '$.params.item.type') = 'webSearch' ORDER BY record_id",
        ).all().map(({ payload_json }) => JSON.parse(payload_json));
        assert.deepEqual(nativeSearches.map(({ method, params }) => ({ method, item: params.item })), [
          { method: "item/started", item: emptySearch },
          { method: "item/completed", item: completedSearch },
        ]);
      } finally {
        database.close();
      }

      const next = await session.startTurn([{ type: "text", text: "Continue the same Session." }]);
      for await (const _ of next) {}
      assert.equal((await next.result).status, "completed");
    } finally {
      await session?.close();
      await runtime?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
