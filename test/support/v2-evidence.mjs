import { readFile } from "node:fs/promises";

export async function readV2Evidence(file, predicate = () => true) {
  const deadline = Date.now() + (process.platform === "win32" ? 10_000 : 5_000);
  while (true) {
    let evidence;
    try {
      evidence = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (evidence && predicate(evidence)) return evidence;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for OpenCode v2 evidence snapshot; last snapshot: ${JSON.stringify(evidence ?? null).slice(0, 1000)}`);
    await new Promise((resolve) => setTimeout(resolve, process.platform === "win32" ? 25 : 5));
  }
}
