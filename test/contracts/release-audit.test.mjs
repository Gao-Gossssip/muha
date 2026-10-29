import assert from "node:assert/strict";
import test from "node:test";
import { auditRelease, validateReleaseAudit } from "../../scripts/release-audit.mjs";

function fixture() {
  const urls = ["GHSA-4qv8-2p9j-2685", "GHSA-f72v-6w45-q472", "GHSA-xjj6-f33q-929c",
    "GHSA-4w7w-5xrc-9h26", "GHSA-2m5v-pch6-74hx", "GHSA-qrxm-fqhp-jwvm",
    "GHSA-9fm3-97px-rjf6", "GHSA-55wc-3pg8-jfw6"];
  return {
    lock: { packages: {
      ...Object.fromEntries(["core", "codex-adapter", "opencode-adapter", "kimi-adapter", "pi-adapter", "agy-adapter", "muha"]
        .map(name => [`packages/${name}`, { version: "0.1.19" }])),
      "node_modules/@earendil-works/pi-coding-agent": { version: "1.2.0" },
      "node_modules/undici": { version: "8.10.2" },
      "node_modules/zod": { version: "4.6.7" },
    } },
    report: { auditReportVersion: 2, metadata: { dependencies: { prod: 161 }, vulnerabilities: { total: 2 } }, vulnerabilities: {
      "@earendil-works/pi-coding-agent": { name: "@earendil-works/pi-coding-agent", severity: "moderate", via: ["undici"], nodes: ["node_modules/@earendil-works/pi-coding-agent"] },
      undici: { name: "undici", severity: "high", nodes: ["node_modules/undici"],
        via: urls.map(url => ({ url: `https://github.com/advisories/${url}`, severity: "high" })) },
    } },
  };
}

test("release audit discloses exactly the approved 0.1.19 residual findings", () => {
  const { report, lock } = fixture();
  const result = validateReleaseAudit(report, lock);
  assert.equal(result.status, "PASS_WITH_APPROVED_0_1_19_EXCEPTION");
  assert.equal(result.acceptedResidualAdvisories.length, 8);
});

test("new packages, advisories, direct SDK findings and critical severity stay blocked", () => {
  for (const mutate of [
    f => { f.report.vulnerabilities.undici.via.push({ url: "https://github.com/advisories/GHSA-new", severity: "high" }); },
    f => { f.report.vulnerabilities.zod = { name: "zod", severity: "high", via: ["new"], nodes: ["node_modules/zod"] }; f.report.metadata.vulnerabilities.total++; },
    f => { f.report.vulnerabilities["@earendil-works/pi-coding-agent"].via = [{ url: "https://github.com/advisories/GHSA-new", severity: "moderate" }]; },
    f => { f.report.vulnerabilities.undici.severity = "critical"; },
    f => { f.report.vulnerabilities.undici.via[0].severity = "critical"; },
    f => { delete f.report.vulnerabilities.undici; f.report.metadata.vulnerabilities.total = 1; },
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => validateReleaseAudit(f.report, f.lock));
  }
});

test("the approved exception expires with any cohort or scoped dependency change", () => {
  for (const [path, version] of [
    ["packages/core", "0.1.20"], ["packages/core", "0.1.18"], ["node_modules/@earendil-works/pi-coding-agent", "1.4.0"],
    ["node_modules/undici", "8.12.2"], ["node_modules/zod", "4.6.5"],
  ]) {
    const f = fixture(); f.lock.packages[path].version = version;
    assert.throws(() => validateReleaseAudit(f.report, f.lock));
  }
});

test("a clean complete production audit needs no exception for future versions", () => {
  const f = fixture(); f.report.vulnerabilities = {}; f.report.metadata.vulnerabilities.total = 0;
  f.lock.packages["packages/core"].version = "0.1.20";
  assert.deepEqual(validateReleaseAudit(f.report, f.lock), { status: "PASS", acceptedResidualAdvisories: [] });
});

test("partial reports, Registry errors and failed audit invocations cannot be waived", async () => {
  for (const mutate of [
    f => { f.report.error = { code: "EAI_AGAIN" }; }, f => { f.report.metadata.dependencies.prod = 10; },
    f => { delete f.report.auditReportVersion; }, f => { f.report.metadata.vulnerabilities.total = 0; },
    f => { f.report.vulnerabilities = {}; f.report.metadata.vulnerabilities.total = 0; delete f.report.metadata.dependencies; },
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => validateReleaseAudit(f.report, f.lock));
  }
  await assert.rejects(auditRelease("unused", () => ({ status: 2, stdout: "{}" })), /failed before/);
  await assert.rejects(auditRelease("unused", () => ({ status: 1, stdout: "invalid" })), /invalid report/);
});
