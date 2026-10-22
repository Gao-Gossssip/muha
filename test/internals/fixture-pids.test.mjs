import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readFixturePids } from "../support/fixture-pids.mjs";

test("owned PID receipts distinguish incomplete writes from invalid complete data and I/O errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "muha-fixture-pids-")), file = join(root, "pids.json");
  try {
    assert.deepEqual(await readFixturePids(file), []);
    for (const text of ["", "[", "[123,"]) {
      await writeFile(file, text); assert.deepEqual(await readFixturePids(file), []);
    }
    await writeFile(file, "[123,456,789]"); assert.deepEqual(await readFixturePids(file), [123, 456, 789]);
    for (const text of ['{"pid":123}', "[0]", "[1]", "[2.5]", '["123"]']) {
      await writeFile(file, text); await assert.rejects(readFixturePids(file), /Invalid owned fixture PID list/);
    }
    const directory = join(root, "directory"); await mkdir(directory);
    await assert.rejects(readFixturePids(directory), error => !(error instanceof SyntaxError));
  } finally { await rm(root, { recursive: true, force: true }); }
});
