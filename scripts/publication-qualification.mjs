import { readFileSync } from "node:fs";

const sdkVersion = JSON.parse(readFileSync(new URL("../packages/pi-adapter/package.json", import.meta.url), "utf8"))
  .dependencies["@earendil-works/pi-coding-agent"];

export function assertPiPublicationQualification(qualification) {
  const latest = qualification.requalifications?.filter(item => item.harness === "pi").at(-1);
  if (latest?.sdkVersion !== sdkVersion || latest.status !== "PASS") {
    throw new Error("Latest Pi runtime requalification must pass before publication");
  }
}

// Windows smoke receipts do not qualify the complete native capability matrix.
// A Pi-only PASS must not implicitly clear other native targets.
export function assertPublicationQualification(qualification) {
  assertPiPublicationQualification(qualification);
  const entries = qualification.requalifications ?? [];
  for (const harness of ["core", "codex", "opencode", "kimi", "pi", "agy"]) {
    const latest = entries.filter(item => item.harness === harness && item.platform === "win32-x64").at(-1);
    if (latest?.status !== "PASS" || (harness === "pi" && latest.sdkVersion !== sdkVersion)) {
      throw new Error(`Latest Windows ${harness} full qualification must pass before publication`);
    }
  }
  const linuxPi = entries.filter(item => item.harness === "pi" && item.platform === "linux-x64").at(-1);
  if (linuxPi?.status !== "PASS" || linuxPi.sdkVersion !== sdkVersion) {
    throw new Error("Latest Linux Pi runtime requalification must pass before publication");
  }
}
