import { readFile } from "node:fs/promises";

// A freshly created fixture receipt may exist before its writer finishes.
// Partial JSON is not readiness; permission/I/O errors and complete invalid
// PID lists remain errors rather than being hidden as an empty snapshot.
export async function readFixturePids(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(value) || value.some(pid => !Number.isSafeInteger(pid) || pid <= 1)) {
      throw new Error("Invalid owned fixture PID list");
    }
    return value;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}
