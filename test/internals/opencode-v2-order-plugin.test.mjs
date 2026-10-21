import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { restoreOrderedMessages } from "../../packages/opencode-adapter/dist/opencode-v2-order-plugin.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const image = (bytes, mediaType = "image/png") => ({
  type: "media", media: { source: { type: "base64", mediaType, data: Buffer.from(bytes).toString("base64") } },
});
const imageOrder = (index, part) => ({
  type: "image", index, mime: part.media.source.mediaType, sha256: hash(Buffer.from(part.media.source.data, "base64")),
});

test("OpenCode v2 private hook reconstructs model-facing interleaved content", () => {
  const first = image([1, 2, 3]);
  const second = image([4, 5, 6], "image/jpeg");
  const message = {
    metadata: { muhaOrderedInput: {
      version: 1, textSha256: hash("beforeafter"),
      parts: [
        imageOrder(0, first), { type: "text", length: 6 },
        imageOrder(1, second), { type: "text", length: 5 },
      ],
    } },
    content: [{ type: "text", text: "beforeafter" }, first, second],
  };
  restoreOrderedMessages({ messages: [message] });
  assert.deepEqual(message.content.map((part) => part.type), ["media", "text", "media", "text"]);
  assert.deepEqual(message.content.filter((part) => part.type === "text").map((part) => part.text),
    ["before", "after"]);
  assert.equal(message.content[0], first);
  assert.equal(message.content[2], second);
});

test("OpenCode v2 private hook supports image-only and preserves unrelated native messages", () => {
  const picture = image([7, 8, 9]);
  const message = {
    metadata: { muhaOrderedInput: { version: 1, textSha256: hash(""), parts: [imageOrder(0, picture)] } },
    content: [picture],
  };
  const unrelated = { content: [{ type: "text", text: "native" }] };
  restoreOrderedMessages({ messages: [unrelated, message] });
  assert.deepEqual(message.content, [picture]);
  assert.deepEqual(unrelated.content, [{ type: "text", text: "native" }]);
});

test("OpenCode v2 private hook rejects content changed after Muha admission", () => {
  const picture = image([1, 2, 3]);
  const message = {
    metadata: { muhaOrderedInput: {
      version: 1, textSha256: hash("before"),
      parts: [{ type: "text", length: 6 }, imageOrder(0, picture)],
    } },
    content: [{ type: "text", text: "changed" }, picture],
  };
  assert.throws(() => restoreOrderedMessages({ messages: [message] }), /text changed/);
  assert.deepEqual(message.content.map((part) => part.type), ["text", "media"]);
});

test("OpenCode v2.0.28 canonical inline Assets retain byte and MIME verification", () => {
  const raw = Buffer.from([1, 2, 3]);
  for (const [type, data] of [["base64", raw.toString("base64")], ["bytes", raw], ["bytes", raw.toString("base64")]]) {
    const picture = { type: "media", media: { source: { type, data, mediaType: "image/png" } }, filename: "native.png" };
    const message = { metadata: { muhaOrderedInput: { version: 1, textSha256: hash(""), parts: [{ type: "image", index: 0, mime: "image/png", sha256: hash(raw) }] } }, content: [picture] };
    restoreOrderedMessages({ messages: [message] });
    assert.equal(message.content[0], picture, "preserve the native Asset, including its metadata");
  }
});

for (const [name, mutate] of [
  ["changed image bytes", part => { part.media.source.data = Buffer.from([4, 5, 6]).toString("base64"); }],
  ["changed image MIME", part => { part.media.source.mediaType = "image/jpeg"; }],
  ["conflicting Asset MIME", part => { part.media.mediaType = "image/jpeg"; }],
  ["non-string base64 source", part => { part.media.source.data = Buffer.from([1, 2, 3]); }],
  ["URL source", part => { part.media.source = { type: "url", url: "https://invalid.example/image.png", mediaType: "image/png" }; }],
  ["provider ref", part => { part.media.source = { type: "ref", provider: "controlled", id: "file", mediaType: "image/png" }; }],
  ["legacy top-level shape", part => { part.mediaType = part.media.source.mediaType; part.data = part.media.source.data; delete part.media; }],
  ["absent Asset", part => { delete part.media; }],
]) test(`OpenCode v2 canonical media rejects ${name} without replacing the content`, () => {
  const picture = image([1, 2, 3]), order = imageOrder(0, picture);
  const message = { metadata: { muhaOrderedInput: { version: 1, textSha256: hash(""), parts: [order] } }, content: [picture] };
  mutate(picture);
  assert.throws(() => restoreOrderedMessages({ messages: [message] }), /image changed/);
  assert.equal(message.content[0], picture);
});
