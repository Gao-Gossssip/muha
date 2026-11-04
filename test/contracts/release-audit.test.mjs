import assert from "node:assert/strict";
import test from "node:test";
import { auditRelease, validateReleaseAudit } from "../../scripts/release-audit.mjs";

// Both exceptions were approved by maintainer Sijie Gao on 2026-11-04 for 0.1.20 only.
function fixture() {
  const urls = ["GHSA-4qv8-2p9j-2685", "GHSA-f72v-6w45-q472", "GHSA-xjj6-f33q-929c",
    "GHSA-4w7w-5xrc-9h26", "GHSA-2m5v-pch6-74hx", "GHSA-qrxm-fqhp-jwvm",
    "GHSA-9fm3-97px-rjf6", "GHSA-55wc-3pg8-jfw6"];
  return {
    lock: { packages: {
      ...Object.fromEntries(["core", "codex-adapter", "opencode-adapter", "kimi-adapter", "pi-adapter", "agy-adapter", "claude-code-adapter", "muha"]
        .map(name => [`packages/${name}`, { version: "0.1.20" }])),
      "node_modules/@earendil-works/pi-coding-agent": { version: "1.2.0", dependencies: { minimatch: "10.2.6" } },
      "node_modules/undici": { version: "8.10.2" },
      "node_modules/minimatch": { version: "10.2.6" },
      "node_modules/zod": { version: "4.6.7" },
    } },
    report: { auditReportVersion: 2, metadata: { dependencies: { prod: 161 }, vulnerabilities: { total: 3 } }, vulnerabilities: {
      "@earendil-works/pi-coding-agent": { name: "@earendil-works/pi-coding-agent", severity: "moderate", via: ["undici", "minimatch"], nodes: ["node_modules/@earendil-works/pi-coding-agent"] },
      undici: { name: "undici", severity: "high", nodes: ["node_modules/undici"],
        via: urls.map(url => ({ name: "undici", dependency: "undici", url: `https://github.com/advisories/${url}`, severity: "high" })) },
      minimatch: { name: "minimatch", severity: "moderate", nodes: ["node_modules/minimatch"],
        via: [{ name: "minimatch", dependency: "minimatch", severity: "moderate",
          url: "https://github.com/advisories/GHSA-g3hv-75wg-m249" }] },
    } },
  };
}

test("release audit discloses exactly the approved 0.1.20 residual findings", () => {
  const { report, lock } = fixture();
  const result = validateReleaseAudit(report, lock);
  assert.equal(result.status, "PASS_WITH_APPROVED_0_1_20_EXCEPTION");
  assert.deepEqual(result.acceptedResidualAdvisories, [
    "GHSA-4qv8-2p9j-2685", "GHSA-f72v-6w45-q472", "GHSA-xjj6-f33q-929c",
    "GHSA-4w7w-5xrc-9h26", "GHSA-2m5v-pch6-74hx", "GHSA-qrxm-fqhp-jwvm",
    "GHSA-9fm3-97px-rjf6", "GHSA-55wc-3pg8-jfw6", "GHSA-g3hv-75wg-m249",
  ].map(id => `https://github.com/advisories/${id}`).sort());
  assert.equal(result.minimatchVersion, "10.2.6");
});

test("new packages, advisories, direct SDK findings and critical severity stay blocked", () => {
  for (const mutate of [
    f => { f.report.vulnerabilities.undici.via.push({ name: "undici", dependency: "undici", url: "https://github.com/advisories/GHSA-new", severity: "high" }); },
    f => { f.report.vulnerabilities.zod = { name: "zod", severity: "high", via: ["new"], nodes: ["node_modules/zod"] }; f.report.metadata.vulnerabilities.total++; },
    f => { f.report.vulnerabilities["@earendil-works/pi-coding-agent"].via = [{ url: "https://github.com/advisories/GHSA-new", severity: "moderate" }]; },
    f => { f.report.vulnerabilities.undici.severity = "critical"; },
    f => { f.report.vulnerabilities.undici.via[0].severity = "critical"; },
    f => { delete f.report.vulnerabilities.undici; f.report.metadata.vulnerabilities.total--; },
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => validateReleaseAudit(f.report, f.lock));
  }
});

test("the approved exception expires with any cohort or scoped dependency change", () => {
  for (const [path, version] of [
    ["packages/core", "0.1.21"], ["packages/core", "0.1.19"], ["node_modules/@earendil-works/pi-coding-agent", "1.4.0"],
    ["node_modules/minimatch", "10.2.5"], ["node_modules/minimatch", "10.2.7"],
    ["node_modules/minimatch", "11.0.1"], ["node_modules/undici", "8.12.2"], ["node_modules/zod", "4.6.5"],
  ]) {
    const f = fixture(); f.lock.packages[path].version = version;
    assert.throws(() => validateReleaseAudit(f.report, f.lock));
  }
});

test("each cohort package must remain exactly 0.1.20", () => {
  for (const path of Object.keys(fixture().lock.packages).filter(path => path.startsWith("packages/"))) {
    for (const version of ["0.1.19", "0.1.21", "0.1.20-rc.1"]) {
      const f = fixture(); f.lock.packages[path].version = version;
      assert.throws(() => validateReleaseAudit(f.report, f.lock), /expires outside 0.1.20/);
    }
  }
});

test("approved advisory subsets retain their exact scoped exceptions", () => {
  for (const name of ["undici", "minimatch"]) {
    const f = fixture();
    const other = name === "undici" ? "minimatch" : "undici";
    delete f.report.vulnerabilities[other]; f.report.metadata.vulnerabilities.total--;
    f.report.vulnerabilities["@earendil-works/pi-coding-agent"].via = [name];
    assert.deepEqual(validateReleaseAudit(f.report, f.lock).acceptedResidualAdvisories,
      f.report.vulnerabilities[name].via.map(item => item.url).sort());
  }
});

test("a clean complete production audit needs no exception for future versions", () => {
  const f = fixture(); f.report.vulnerabilities = {}; f.report.metadata.vulnerabilities.total = 0;
  f.lock.packages["packages/core"].version = "0.1.21";
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

test("minimatch accepts only the approved advisory, identity, node and Pi dependency path", () => {
  for (const mutate of [
    f => { f.report.vulnerabilities.minimatch.via[0].url = "https://github.com/advisories/GHSA-new"; },
    f => { f.report.vulnerabilities.minimatch.via[0].url += "?approved=true"; },
    f => { f.report.vulnerabilities.minimatch.via[0].url = f.report.vulnerabilities.undici.via[0].url; },
    f => { f.report.vulnerabilities.undici.via[0].url = f.report.vulnerabilities.minimatch.via[0].url; },
    f => { f.report.vulnerabilities.minimatch.via[0].name = "undici"; },
    f => { f.report.vulnerabilities.minimatch.via[0].dependency = "undici"; },
    f => { f.report.vulnerabilities.minimatch.via[0].severity = "critical"; },
    f => { f.report.vulnerabilities.minimatch.severity = "critical"; },
    f => { f.report.vulnerabilities.minimatch.nodes = ["node_modules/other/node_modules/minimatch"]; },
    f => { delete f.lock.packages["node_modules/minimatch"]; },
    f => { f.lock.packages["node_modules/@earendil-works/pi-coding-agent"].dependencies.minimatch = "^10.2.6"; },
    f => { f.report.vulnerabilities["@earendil-works/pi-coding-agent"].via = ["undici"]; },
    f => { delete f.report.vulnerabilities.minimatch; f.report.metadata.vulnerabilities.total--; },
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => validateReleaseAudit(f.report, f.lock));
  }
});

function propagatedFixture() {
  const f = fixture();
  for (const [name, version, via] of [
    ["@earendil-works/pi-agent-core", "1.2.0", ["@earendil-works/pi-ai"]],
    ["@earendil-works/pi-ai", "1.2.0", ["openai"]],
    ["openai", "7.19.0", ["undici"]],
  ]) {
    f.lock.packages[`node_modules/${name}`] = { version };
    f.report.vulnerabilities[name] = { name, severity: "moderate", via, nodes: [`node_modules/${name}`] };
    f.report.metadata.vulnerabilities.total++;
  }
  f.report.vulnerabilities["@earendil-works/pi-coding-agent"].via.push(
    "@earendil-works/pi-agent-core", "@earendil-works/pi-ai");
  return f;
}

test("indirect Pi findings require complete chains ending only at approved advisories", () => {
  const f = propagatedFixture();
  assert.equal(validateReleaseAudit(f.report, f.lock).acceptedResidualAdvisories.length, 9);
  for (const mutate of [
    f => { f.report.vulnerabilities.openai.via.push("minimatch"); },
    f => { f.report.vulnerabilities.openai.via = [{ name: "openai", dependency: "openai",
      url: "https://github.com/advisories/GHSA-new", severity: "moderate" }]; },
    f => { delete f.report.vulnerabilities.openai; f.report.metadata.vulnerabilities.total--; },
    f => { f.report.vulnerabilities.openai.severity = "critical"; },
    f => { f.lock.packages["node_modules/openai"].version = "7.20.0"; },
    f => { f.report.vulnerabilities.undici.via[0].url = "https://github.com/advisories/GHSA-new"; },
    f => { f.report.vulnerabilities["@earendil-works/pi-ai"].via = ["@earendil-works/pi-agent-core"]; },
  ]) {
    const f = propagatedFixture(); mutate(f);
    assert.throws(() => validateReleaseAudit(f.report, f.lock));
  }
});

test("the exception rejects missing, extra and substituted cohort packages", () => {
  for (const replacement of [undefined, "packages/extra", "packages/substitute"]) {
    const f = fixture();
    if (replacement !== "packages/extra") delete f.lock.packages["packages/claude-code-adapter"];
    if (replacement) f.lock.packages[replacement] = { version: "0.1.20" };
    assert.throws(() => validateReleaseAudit(f.report, f.lock), /exact eight-package/);
  }
});
