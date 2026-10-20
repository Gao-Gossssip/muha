import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readReleaseSource } from "./release-source.mjs";
import { readReleaseVersion } from "./release-version.mjs";
import { NATIVE_PLATFORMS, nativeResources } from "./native-resources.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const sourceKeys = ["revision", "tree", "lockfileSha256", "runtimeManifestSha256"];
const sorted = value => JSON.stringify(sourceKeys.map(key => [key, value?.[key]]));
const root = resolve(import.meta.dirname, "..");

async function regular(path, maximum = 32 * 1024 * 1024) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.size > maximum) throw new Error("Native artifact must be a bounded regular file: " + path);
  return readFile(path);
}

function validateSource(source) {
  for (const key of sourceKeys) {
    if (!(key === "revision" || key === "tree" ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/).test(source?.[key] ?? "")) {
      throw new Error("Native artifact has invalid source identity");
    }
  }
}

export function validateNativeBinary(bytes, platform) {
  if (platform === "linux-x64") {
    if (bytes.length < 64 || bytes.subarray(0, 4).toString("hex") !== "7f454c46" ||
        bytes[4] !== 2 || bytes[5] !== 1 || bytes.readUInt16LE(18) !== 62) {
      throw new Error("Native helper is not a Linux x64 ELF");
    }
  } else if (platform === "win32-x64") {
    const offset = bytes.length >= 64 ? bytes.readUInt32LE(60) : -1;
    if (bytes.subarray(0, 2).toString() !== "MZ" || offset < 64 || offset + 26 > bytes.length ||
        bytes.subarray(offset, offset + 4).toString("hex") !== "50450000" ||
        bytes.readUInt16LE(offset + 4) !== 0x8664 || bytes.readUInt16LE(offset + 24) !== 0x20b) {
      throw new Error("Native helper is not a Windows x64 PE");
    }
  } else throw new Error("Unsupported native artifact platform");
}

export async function nativeSourceIdentity(repository) {
  const source = await readReleaseSource(repository);
  if (source.dirty || !source.revision || !source.tree) throw new Error("Native artifacts require clean committed source");
  return { revision: source.revision, tree: source.tree,
    lockfileSha256: digest(await readFile(join(repository, "package-lock.json"))),
    runtimeManifestSha256: digest(await readFile(join(repository, "scripts/fixtures/sdk-runtime-sha256.json"))) };
}

async function assertEmpty(directory) {
  try {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || (await readdir(directory)).length) throw new Error("Native artifact target must be an empty directory");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}

// Expected paths and permissions come only from the fixed native allowlist,
// never from downloaded metadata. Retain validated bytes to avoid re-reading
// different input after validation and before installation.
export async function validateNativeArtifact(directory, { platform, source, version, repository = root }) {
  validateSource(source);
  const metadata = await lstat(directory);
  if (!metadata.isDirectory()) throw new Error("Native artifact directory cannot be a link");
  if (JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(["files", "platform.json"])) {
    throw new Error("Unexpected native artifact root entries");
  }
  const manifest = JSON.parse(await regular(join(directory, "platform.json"), 1024 * 1024));
  validateSource(manifest.source);
  if (manifest.format !== "muha-native-artifact-v1" || manifest.platform !== platform ||
      manifest.version !== version || sorted(manifest.source) !== sorted(source)) {
    throw new Error("Native artifact platform, version or source differs from the reviewed source");
  }
  const expected = nativeResources(platform);
  if (!Array.isArray(manifest.resources) || manifest.resources.length !== expected.length) {
    throw new Error("Native artifact resource set is incomplete");
  }
  const filesRoot = join(directory, "files");
  if (!(await lstat(filesRoot)).isDirectory() ||
      JSON.stringify((await readdir(filesRoot)).sort()) !== JSON.stringify(["agy-adapter", "core"])) {
    throw new Error("Unexpected native artifact package directories");
  }
  for (const name of ["core", "agy-adapter"]) {
    const folder = join(filesRoot, name);
    if (!(await lstat(folder)).isDirectory()) throw new Error("Native artifact package directory cannot be a link");
    const names = expected.filter(item => item.directory === name).map(item => item.artifactPath.slice(name.length + 1)).sort();
    if (JSON.stringify((await readdir(folder)).sort()) !== JSON.stringify(names)) throw new Error("Unexpected native artifact files");
  }
  const resources = [];
  for (const [index, item] of expected.entries()) {
    const record = manifest.resources[index];
    if (record?.directory !== item.directory || record?.path !== item.path ||
        record?.artifactPath !== item.artifactPath || record?.mode !== item.mode) {
      throw new Error("Native artifact path or mode is outside its allowlist");
    }
    const bytes = await regular(join(filesRoot, item.artifactPath));
    if (record.bytes !== bytes.length || record.sha256 !== digest(bytes)) throw new Error("Native artifact bytes differ from their manifest");
    if (item.binary) validateNativeBinary(bytes, platform);
    else if (digest(bytes) !== digest(await regular(join(repository, "packages/core/native", item.sourceFile)))) {
      throw new Error("Native artifact source file differs from reviewed source");
    }
    resources.push({ ...item, bytes });
  }
  return { manifest, resources };
}

export async function exportNativeArtifact(repository, output, platform) {
  if (platform !== process.platform + "-" + process.arch) throw new Error("Native artifacts must be built on their own platform");
  const source = await nativeSourceIdentity(repository), version = await readReleaseVersion(repository);
  await assertEmpty(output);
  await mkdir(output, { recursive: true });
  const resources = [];
  for (const item of nativeResources(platform)) {
    const path = join(repository, "packages", item.directory, item.path);
    const bytes = await regular(path);
    if (item.binary) {
      validateNativeBinary(bytes, platform);
      if (platform === "linux-x64" && !((await lstat(path)).mode & 0o111)) throw new Error("Linux helper is not executable");
    }
    const target = join(output, "files", item.artifactPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx", mode: item.mode });
    if (process.platform !== "win32") await chmod(target, item.mode);
    resources.push({ directory: item.directory, path: item.path, artifactPath: item.artifactPath,
      mode: item.mode, bytes: bytes.length, sha256: digest(bytes) });
  }
  const manifest = { format: "muha-native-artifact-v1", platform, version, source, resources };
  await writeFile(join(output, "platform.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  await validateNativeArtifact(output, { platform, version, source, repository });
  return manifest;
}

export async function assembleNativeArtifacts(repository, input, { source, version } = {}) {
  source ??= await nativeSourceIdentity(repository);
  version ??= await readReleaseVersion(repository);
  const metadata = await lstat(input);
  if (!metadata.isDirectory() ||
      JSON.stringify((await readdir(input)).sort()) !== JSON.stringify([...NATIVE_PLATFORMS].sort())) {
    throw new Error("Assembly requires exactly both native platforms");
  }
  const accepted = [];
  // Validate every platform before changing any resource in the package tree.
  for (const platform of NATIVE_PLATFORMS) accepted.push(await validateNativeArtifact(join(input, platform), { platform, source, version, repository }));
  for (const artifact of accepted) for (const item of artifact.resources) {
    const path = join(repository, "packages", item.directory, item.path);
    const temporary = path + "." + randomUUID() + ".tmp";
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(temporary, item.bytes, { flag: "wx", mode: item.mode });
      if (process.platform !== "win32") await chmod(temporary, item.mode);
      await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
  }
  return accepted.map(item => item.manifest);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, flag, directory, ...extra] = process.argv.slice(2);
  if (extra.length || !directory || !["export", "assemble"].includes(command) ||
      flag !== (command === "export" ? "--output" : "--input")) {
    throw new Error("Use platform-artifacts.mjs export --output DIRECTORY or assemble --input DIRECTORY");
  }
  const result = command === "export"
    ? await exportNativeArtifact(root, resolve(directory), process.platform + "-" + process.arch)
    : await assembleNativeArtifacts(root, resolve(directory));
  console.log(JSON.stringify(result));
}
