import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNpmPackResult } from "../../scripts/npm-pack-result.mjs";

test("npm pack normalizes legacy arrays and npm 12 package maps with exact identities", () => {
  const a = { name: "@fixture/a", files: [{ path: "package.json" }] };
  const b = { name: "fixture-b", files: [] };
  for (const value of [[b, a], { "fixture-b": b, "@fixture/a": a }]) {
    assert.deepEqual(normalizeNpmPackResult(value, [a.name, b.name]), [a, b]);
  }
  for (const value of [null, [], [a, a], [a, b], [{ files: [] }],
    [{ ...a, files: null }], [{ ...a, files: [null] }], [{ ...a, files: [{}] }],
    { wrong: a }, { [a.name]: { files: [] } }]) {
    assert.throws(() => normalizeNpmPackResult(value, [a.name]), /invalid npm pack result/);
  }
  for (const names of [null, [], [a.name, a.name], [undefined], [""]]) {
    assert.throws(() => normalizeNpmPackResult([a], names), /invalid npm pack result/);
  }
});
