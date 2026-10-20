import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { NATIVE_PLATFORMS, nativeResources } from "../../scripts/native-resources.mjs";
import { assembleNativeArtifacts, validateNativeArtifact, validateNativeBinary } from "../../scripts/platform-artifacts.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const source = { revision: "a".repeat(40), tree: "b".repeat(40),
  lockfileSha256: "c".repeat(64), runtimeManifestSha256: "d".repeat(64) };
const version = "0.1.17";

// Header fixtures test validation, not actual execution or real qualification.
function binary(platform) {
  const bytes = Buffer.alloc(128);
  if (platform === "linux-x64") {
    Buffer.from("7f454c46", "hex").copy(bytes);
    bytes[4] = 2; bytes[5] = 1; bytes.writeUInt16LE(62, 18);
  } else {
    bytes.write("MZ"); bytes.writeUInt32LE(64, 60);
    bytes.write("PE\0\0", 64); bytes.writeUInt16LE(0x8664, 68); bytes.writeUInt16LE(0x20b, 88);
  }
  return bytes;
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "muha-platform-artifacts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = join(root, "repository"), input = join(root, "input");
  const manifests = {};
  for (const platform of NATIVE_PLATFORMS) {
    const resources = [];
    for (const item of nativeResources(platform)) {
      const bytes = item.binary ? binary(platform) :
        await readFile(new URL("../../packages/core/native/" + item.sourceFile, import.meta.url));
      if (item.sourceFile) {
        const path = join(repository, "packages/core/native", item.sourceFile);
        await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
      }
      const path = join(input, platform, "files", item.artifactPath);
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
      resources.push({ directory: item.directory, path: item.path, artifactPath: item.artifactPath,
        mode: item.mode, bytes: bytes.length, sha256: digest(bytes) });
    }
    manifests[platform] = { format: "muha-native-artifact-v1", platform, version, source: { ...source }, resources };
    await writeFile(join(input, platform, "platform.json"), JSON.stringify(manifests[platform]));
  }
  return { repository, input, manifests };
}

test("native assembly installs exactly both platform allowlists from the same source", async t => {
  const { repository, input } = await fixture(t);
  const accepted = await assembleNativeArtifacts(repository, input, { source, version });
  assert.deepEqual(accepted.map(item => item.platform), NATIVE_PLATFORMS);
  for (const platform of NATIVE_PLATFORMS) for (const item of nativeResources(platform)) {
    const path = join(repository, "packages", item.directory, item.path);
    const bytes = await readFile(path);
    if (item.binary) {
      validateNativeBinary(bytes, platform);
      if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, item.mode);
    }
  }
  assert.equal((await readdir(join(repository, "packages/core/dist"))).length, 7);
});

for (const [name, mutation] of [
  ["wrong platform", m => { m.platform = "darwin-arm64"; }],
  ["wrong version", m => { m.version = "0.1.16"; }],
  ...Object.keys(source).map(key => ["mixed source " + key, m => { m.source[key] = "e".repeat(source[key].length); }]),
  ["missing resource", m => { m.resources.pop(); }],
  ["duplicate resource", m => { m.resources[1] = m.resources[0]; }],
  ["path traversal", m => { m.resources[0].artifactPath = "../../outside"; }],
  ["wrong mode", m => { m.resources[0].mode = 0o777; }],
  ["wrong digest", m => { m.resources[0].sha256 = "0".repeat(64); }],
  ["wrong byte length", m => { m.resources[0].bytes++; }],
]) {
  test("native assembly rejects " + name + " before writing either platform", async t => {
    const { repository, input, manifests } = await fixture(t);
    const preserved = join(repository, "packages/core/dist/acp-supervisor");
    await mkdir(dirname(preserved), { recursive: true }); await writeFile(preserved, "preserved");
    mutation(manifests["win32-x64"]);
    await writeFile(join(input, "win32-x64/platform.json"), JSON.stringify(manifests["win32-x64"]));
    await assert.rejects(assembleNativeArtifacts(repository, input, { source, version }));
    assert.equal(await readFile(preserved, "utf8"), "preserved");
  });
}

test("native assembly rejects a missing or extra platform", async t => {
  const { repository, input } = await fixture(t);
  await mkdir(join(input, "darwin-arm64"));
  await assert.rejects(assembleNativeArtifacts(repository, input, { source, version }), /exactly both/);
  await rm(join(input, "darwin-arm64"), { recursive: true });
  await rm(join(input, "win32-x64"), { recursive: true });
  await assert.rejects(assembleNativeArtifacts(repository, input, { source, version }), /exactly both/);
});

test("native artifacts reject extra files and tampered binaries", async t => {
  const { repository, input } = await fixture(t);
  const directory = join(input, "win32-x64");
  const options = { platform: "win32-x64", source, version, repository };
  await writeFile(join(directory, "files/core/extra.exe"), "extra");
  await assert.rejects(validateNativeArtifact(directory, options), /Unexpected native artifact files/);
  await rm(join(directory, "files/core/extra.exe"));
  await writeFile(join(directory, "files/core/acp-supervisor.exe"), "wrong");
  await assert.rejects(validateNativeArtifact(directory, options), /bytes differ/);
});

test("artifact source bytes must match the checkout even with a self-consistent manifest", async t => {
  const { repository, input, manifests } = await fixture(t);
  const directory = join(input, "win32-x64"), bytes = Buffer.from("substituted source");
  const record = manifests["win32-x64"].resources.find(item => item.path === "dist/windows-private.c");
  await writeFile(join(directory, "files", record.artifactPath), bytes);
  record.bytes = bytes.length; record.sha256 = digest(bytes);
  await writeFile(join(directory, "platform.json"), JSON.stringify(manifests["win32-x64"]));
  await assert.rejects(validateNativeArtifact(directory, { platform: "win32-x64", source, version, repository }), /source file differs/);
});

test("artifact files and directories cannot be symbolic links", { skip: process.platform === "win32" ? "Windows symlink creation requires optional privileges" : false }, async t => {
  const { repository, input } = await fixture(t);
  const directory = join(input, "win32-x64"), path = join(directory, "files/core/acp-supervisor.exe");
  const target = join(repository, "replacement.exe");
  await writeFile(target, binary("win32-x64"));
  await rm(path); await symlink(target, path);
  await assert.rejects(validateNativeArtifact(directory, { platform: "win32-x64", source, version, repository }), /regular file/);
});

test("native architecture validation rejects swapped formats and machines", () => {
  assert.throws(() => validateNativeBinary(binary("linux-x64"), "win32-x64"), /Windows/);
  assert.throws(() => validateNativeBinary(binary("win32-x64"), "linux-x64"), /Linux/);
  const linux = binary("linux-x64"); linux.writeUInt16LE(183, 18);
  assert.throws(() => validateNativeBinary(linux, "linux-x64"), /Linux/);
  const windows = binary("win32-x64"); windows.writeUInt16LE(0xaa64, 68);
  assert.throws(() => validateNativeBinary(windows, "win32-x64"), /Windows/);
  assert.throws(() => validateNativeBinary(binary("linux-x64"), "darwin-arm64"), /Unsupported/);
});
