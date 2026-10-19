import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = ["contracts", "internals"].flatMap(area =>
  readdirSync(join(root, "test", area)).filter(name => name.endsWith(".test.mjs")).sort()
    .map(name => `test/${area}/${name}`));
const installations = new Set(["test/contracts/local-release.test.mjs", "test/contracts/package-install.test.mjs"]);
for (const file of installations) if (!files.includes(file)) throw new Error(`Missing installation contract: ${file}`);

// On Windows, simultaneous isolated npm extractions compete with each other
// and with native CLI startup. Preserve every file, but run the two expensive
// installation suites separately and serially. Linux keeps its original plan.
const groups = process.platform === "win32"
  ? [{ files: files.filter(file => !installations.has(file)), concurrency: 2 },
    { files: files.filter(file => installations.has(file)), concurrency: 1 }]
  : [{ files, concurrency: 2 }];
for (const group of groups) {
  console.log(`SDK controlled contracts: ${group.files.length} files, concurrency ${group.concurrency}`);
  const result = spawnSync(process.execPath, ["--test", `--test-concurrency=${group.concurrency}`, ...group.files],
    { cwd: root, stdio: "inherit" });
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
