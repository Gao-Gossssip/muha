import { readFileSync } from "node:fs";

const sdkVersion = JSON.parse(readFileSync(new URL("../packages/pi-adapter/package.json", import.meta.url), "utf8"))
  .dependencies["@earendil-works/pi-coding-agent"];

export function assertPiPublicationQualification(qualification) {
  const latest = qualification.requalifications?.filter(item => item.harness === "pi").at(-1);
  if (latest?.sdkVersion !== sdkVersion || latest.status !== "PASS") {
    throw new Error("Latest Pi runtime requalification must pass before publication");
  }
}
