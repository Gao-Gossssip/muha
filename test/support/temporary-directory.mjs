import { mkdtemp as nativeMkdtemp, realpath } from "node:fs/promises";

// A fixture used as a Workspace/Reference must have the same canonical identity
// as the SDK. Windows TEMP may contain an 8.3 alias (e.g. RUNNER~1).
export async function mkdtemp(prefix, options) {
  const path = await nativeMkdtemp(prefix, options);
  return process.platform === "win32" && typeof path === "string" ? realpath(path) : path;
}
