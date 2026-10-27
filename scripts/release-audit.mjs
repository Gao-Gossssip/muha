import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnNpmSync } from "./npm-command.mjs";

// Maintainer-approved on 2026-10-27, exclusively for the 0.1.18 cohort.
// These advisories remain risks, not fixed or unreachable vulnerabilities.
const permittedAdvisories = new Set([
  "https://github.com/advisories/GHSA-4qv8-2p9j-2685",
  "https://github.com/advisories/GHSA-f72v-6w45-q472",
  "https://github.com/advisories/GHSA-xjj6-f33q-929c",
]);

export function validateReleaseAudit(report, lock) {
  assert.equal(report.auditReportVersion, 2, "complete npm audit v2 required");
  assert.equal(report.error, undefined, "Registry and audit errors cannot be waived");
  assert.ok(report.vulnerabilities && typeof report.vulnerabilities === "object");
  assert.ok(Number.isSafeInteger(report.metadata?.dependencies?.prod) && report.metadata.dependencies.prod > 0,
    "complete production dependency metadata required");
  const findings = Object.entries(report.vulnerabilities);
  assert.equal(report.metadata?.vulnerabilities?.total, findings.length);
  if (findings.length === 0) return { status: "PASS", acceptedResidualAdvisories: [] };

  assert.ok(report.metadata?.dependencies?.prod >= 150, "audit must cover the complete production closure");
  const cohort = Object.entries(lock.packages).filter(([path]) => path.startsWith("packages/"));
  assert.equal(cohort.length, 7);
  assert.ok(cohort.every(([, item]) => item.version === "0.1.18"), "exception expires outside 0.1.18");
  assert.equal(lock.packages["node_modules/@earendil-works/pi-coding-agent"].version, "1.2.0");
  assert.equal(lock.packages["node_modules/undici"].version, "8.10.2");
  assert.equal(lock.packages["node_modules/zod"].version, "4.6.7");

  const accepted = new Set();
  for (const [name, finding] of findings) {
    assert.equal(finding.name, name);
    assert.ok(["moderate", "high"].includes(finding.severity), "unexpected severity requires review");
    assert.ok(Array.isArray(finding.via) && finding.via.length > 0);
    if (name === "@earendil-works/pi-coding-agent") {
      assert.deepEqual(finding.nodes, ["node_modules/@earendil-works/pi-coding-agent"]);
      assert.ok(finding.via.every(item => item === "undici"), "only the indirect undici finding is approved");
      continue;
    }
    assert.equal(name, "undici", "all other packages remain blocked");
    assert.deepEqual(finding.nodes, ["node_modules/undici"]);
    for (const advisory of finding.via) {
      assert.ok(advisory && typeof advisory === "object");
      assert.ok(permittedAdvisories.has(advisory.url), "new advisory is not approved");
      assert.ok(["moderate", "high"].includes(advisory.severity));
      accepted.add(advisory.url);
    }
  }
  // An indirect package report cannot stand in for the actual advisory data.
  assert.ok(accepted.size > 0, "complete residual advisory evidence required");
  return { status: "PASS_WITH_APPROVED_0_1_18_EXCEPTION", version: "0.1.18",
    sdkVersion: "1.2.0", undiciVersion: "8.10.2", acceptedResidualAdvisories: [...accepted].sort() };
}

export async function auditRelease(root, run = spawnNpmSync) {
  const result = run(["audit", "--omit=dev", "--audit-level=low", "--json"], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || ![0, 1].includes(result.status)) throw new Error("npm audit failed before producing a complete report");
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { throw new Error("npm audit returned an invalid report"); }
  const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
  return validateReleaseAudit(report, lock);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  try { console.log(JSON.stringify(await auditRelease(root), null, 2)); }
  catch (error) { console.error(`Release production audit rejected: ${error.message}`); process.exitCode = 1; }
}
