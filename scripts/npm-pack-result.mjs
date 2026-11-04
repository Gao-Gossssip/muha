// npm 10/11 return an array; npm 12 returns an object keyed by package name.
export function normalizeNpmPackResult(value, expectedNames) {
  const invalid = () => { throw new Error("invalid npm pack result"); };
  if (!Array.isArray(expectedNames) || !expectedNames.length ||
      expectedNames.some(name => typeof name !== "string" || !name.length) ||
      new Set(expectedNames).size !== expectedNames.length) invalid();
  let entries;
  if (Array.isArray(value)) entries = value;
  else if (value && typeof value === "object") {
    entries = Object.entries(value).map(([name, entry]) => {
      if (!entry || entry.name !== name) invalid();
      return entry;
    });
  } else invalid();
  if (entries.length !== expectedNames.length ||
      new Set(entries.map(entry => entry?.name)).size !== entries.length) invalid();
  for (const entry of entries) {
    if (!entry || !expectedNames.includes(entry.name) || !Array.isArray(entry.files) ||
        entry.files.some(file => !file || typeof file.path !== "string")) invalid();
  }
  return expectedNames.map(name => entries.find(entry => entry.name === name));
}
