import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(join(root, 'test/contracts'))
  .filter(name => name.includes('example') && name.endsWith('.test.mjs')).sort()
  .map(name => `test/contracts/${name}`);
if (!files.length) throw new Error('No example contracts found');
console.log(`Example contracts: ${files.length} files`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...files],
  { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
