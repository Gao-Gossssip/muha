import assert from 'node:assert/strict';
import { mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { createMuhaRuntime } from '@muha-sdk/core';
import { agyAdapter } from '@muha-sdk/agy-adapter';
import { mkdtemp } from '../support/temporary-directory.mjs';
import { auditProductionDependencies } from '../../scripts/dependency-audit.mjs';

async function aliasFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'muha-path-alias-'));
  const actual = join(root, 'actual'), alias = join(root, 'alias');
  await mkdir(actual);
  await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, actual, alias };
}

test('dependency audit resolves an aliased installation root before computing lock paths', async t => {
  const { actual, alias } = await aliasFixture(t);
  await mkdir(join(actual, 'packages/core'), { recursive: true });
  await mkdir(join(actual, 'node_modules/fixture'), { recursive: true });
  const dependency = { name: 'fixture', version: '1.0.0', license: 'MIT' };
  await writeFile(join(actual, 'node_modules/fixture/package.json'), JSON.stringify(dependency));
  const result = await auditProductionDependencies({ root: alias,
    packages: [{ directory: 'core', manifest: { name: '@muha-sdk/core', dependencies: { fixture: '1.0.0' } } }],
    lock: { packages: { 'node_modules/fixture': { ...dependency, integrity: 'sha512-fixture' } } } });
  assert.deepEqual(result.problems, []);
  assert.equal(result.dependencies[0].path, 'node_modules/fixture');
  assert.equal(result.dependencies[0].lockPath, 'node_modules/fixture');
});

test('Windows fixture directories have canonical identities beneath an aliased TEMP', { skip: process.platform !== 'win32' }, async t => {
  const { actual, alias } = await aliasFixture(t);
  const fixture = await mkdtemp(join(alias, 'fixture-'));
  assert.equal(fixture, await realpath(fixture));
  assert.equal(dirname(fixture), await realpath(actual));
});

test('AGY initializes beneath an aliased Windows TEMP without conflicting native Workspace metadata',
  { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
    const { root, actual, alias } = await aliasFixture(t);
    const before = { TEMP: process.env.TEMP, TMP: process.env.TMP };
    process.env.TEMP = alias; process.env.TMP = alias;
    let runtime;
    try {
      runtime = await createMuhaRuntime({ dataDir: join(root, 'diagnostics'), harnesses: [agyAdapter({
        env: { HOME: join(root, 'home'), PATH: [resolve(import.meta.dirname, '../fixtures/harness-bin'), dirname(process.execPath)].join(delimiter) },
        startupTimeoutMs: 10000, shutdownTimeoutMs: 5000,
      })] });
      const session = await runtime.createSession({ harness: 'agy', workspacePath: alias, approvalPolicy: 'harnessManaged' });
      assert.equal(session.reference.workspacePath, await realpath(actual));
      const turn = await session.startTurn([{ type: 'text', text: 'alias regression' }]);
      for await (const event of turn) {}
      assert.equal((await turn.result).status, 'completed');
    } finally {
      try { await runtime?.close(); }
      finally { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
    }
  });
