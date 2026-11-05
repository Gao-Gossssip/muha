import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MUHA_DELIVERY_PACKAGES } from "./delivery-manifest.mjs";
import { spawnNpmSync } from "./npm-command.mjs";

// Maintainer Sijie Gao approved both exceptions on 2026-11-04 for 0.1.20 only:
// the same eight undici advisories as 0.1.19 and minimatch GHSA-g3hv-75wg-m249.
// These advisories remain risks, not fixed or unreachable vulnerabilities.
const permittedUndiciAdvisories = new Set([
  "https://github.com/advisories/GHSA-4qv8-2p9j-2685",
  "https://github.com/advisories/GHSA-f72v-6w45-q472",
  "https://github.com/advisories/GHSA-xjj6-f33q-929c",
  "https://github.com/advisories/GHSA-4w7w-5xrc-9h26",
  "https://github.com/advisories/GHSA-2m5v-pch6-74hx",
  "https://github.com/advisories/GHSA-qrxm-fqhp-jwvm",
  "https://github.com/advisories/GHSA-9fm3-97px-rjf6",
  "https://github.com/advisories/GHSA-55wc-3pg8-jfw6",
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
  assert.deepEqual(cohort.map(([path]) => path).sort(),
    MUHA_DELIVERY_PACKAGES.map(item => `packages/${item.directory}`).sort(),
    "exception requires the exact eight-package SDK cohort");
  assert.ok(cohort.every(([, item]) => item.version === "0.1.20"), "exception expires outside 0.1.20");
  assert.equal(lock.packages["node_modules/@earendil-works/pi-coding-agent"].version, "1.2.0");
  assert.equal(lock.packages["node_modules/undici"].version, "8.10.2");
  assert.equal(lock.packages["node_modules/zod"].version, "4.6.7");

  assert.equal(lock.packages["node_modules/minimatch"]?.version, "10.2.6");
  const pi = "@earendil-works/pi-coding-agent";
  assert.equal(lock.packages[`node_modules/${pi}`].dependencies?.minimatch, "10.2.6",
    "minimatch must be reached via Pi SDK 1.2.0");
  const permittedAdvisories = new Map([
    ["undici", permittedUndiciAdvisories],
    ["minimatch", new Set(["https://github.com/advisories/GHSA-g3hv-75wg-m249"])],
  ]);
  // npm can propagate undici through OpenAI and Pi's internal packages.
  // These are indirect causes only; each chain must end at approved advisory data.
  const indirectCauses = new Map([
    [pi, ["undici", "minimatch", "@earendil-works/pi-agent-core", "@earendil-works/pi-ai"]],
    ["@earendil-works/pi-agent-core", ["@earendil-works/pi-ai"]],
    ["@earendil-works/pi-ai", ["openai"]],
    ["openai", ["undici"]],
  ]);
  const indirectVersions = new Map([
    [pi, "1.2.0"], ["@earendil-works/pi-agent-core", "1.2.0"],
    ["@earendil-works/pi-ai", "1.2.0"], ["openai", "7.19.0"],
  ]);
  const accepted = new Set();
  for (const [name, finding] of findings) {
    assert.equal(finding.name, name);
    assert.ok(["moderate", "high"].includes(finding.severity), "unexpected severity requires review");
    assert.ok(Array.isArray(finding.via) && finding.via.length > 0);
    assert.deepEqual(finding.nodes, [`node_modules/${name}`]);
    if (indirectCauses.has(name)) {
      assert.equal(lock.packages[`node_modules/${name}`]?.version, indirectVersions.get(name));
      assert.ok(finding.via.every(cause => typeof cause === "string" &&
        indirectCauses.get(name).includes(cause) && Object.hasOwn(report.vulnerabilities, cause)),
      "only complete indirect chains to approved advisories are permitted");
      continue;
    }
    assert.ok(permittedAdvisories.has(name), "all other packages remain blocked");
    for (const advisory of finding.via) {
      assert.ok(advisory && typeof advisory === "object");
      assert.equal(advisory.name, name, "advisory package must match");
      assert.equal(advisory.dependency, name, "advisory dependency must match");
      assert.ok(permittedAdvisories.get(name).has(advisory.url), "new advisory is not approved");
      assert.ok(["moderate", "high"].includes(advisory.severity));
      accepted.add(advisory.url);
    }
  }
  const reached = new Set();
  function visit(name) {
    if (reached.has(name)) return;
    reached.add(name);
    for (const cause of report.vulnerabilities[name].via) {
      if (typeof cause === "string") visit(cause);
    }
  }
  assert.ok(Object.hasOwn(report.vulnerabilities, pi), "Pi dependency path evidence required");
  visit(pi);
  assert.equal(reached.size, findings.length, "all findings must be reached via Pi SDK 1.2.0");
  // An indirect package report cannot stand in for the actual advisory data.
  assert.ok(accepted.size > 0, "complete residual advisory evidence required");
  return { status: "PASS_WITH_APPROVED_0_1_20_EXCEPTION", version: "0.1.20",
    sdkVersion: "1.2.0", undiciVersion: "8.10.2", minimatchVersion: "10.2.6", acceptedResidualAdvisories: [...accepted].sort() };
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
