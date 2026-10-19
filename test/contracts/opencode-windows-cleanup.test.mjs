import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, delimiter, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { OpenCodeV2Service } from '../../packages/opencode-adapter/dist/opencode-v2-service.js';
import { spawnHarnessProcess, closeHarnessProcess } from '@muha-sdk/core/internal/host-process';
import { mkdtemp } from '../support/temporary-directory.mjs';

test('Windows OpenCode cleanup waits for a transient native plugin-file sharing lock',
  { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), 'muha-opencode-cleanup-lock-'));
    const pidFile = join(root, 'pid');
    const records = [];
    const service = new OpenCodeV2Service({
      env: { PATH: [resolve(import.meta.dirname, '../fixtures/v2-harness-bin'), dirname(process.execPath)].join(delimiter),
        MUHA_V2_PID_FILE: pidFile }, startupTimeoutMs: 10000, shutdownTimeoutMs: 5000,
    }, { recordNativeEvent: async (_harness, value) => { records.push(value); }, reportFatalError: () => {} }, 'controlled-only');
    let holder;
    t.after(async () => {
      if (holder) {
        if (holder.stdin && !holder.stdin.writableEnded) holder.stdin.end('release\n');
        await closeHarnessProcess(holder).catch(() => {});
      }
      try { await service.close(); } finally { await rm(root, { recursive: true, force: true }); }
    });
    await service.initialize();
    await service.ensureOrderedPlugin(root);
    const plugin = records.find(value => Array.isArray(value.data))?.data[0]?.source.path;
    assert.equal(typeof plugin, 'string');
    holder = spawnHarnessProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
      fileURLToPath(new URL('../fixtures/windows-hold-file.ps1', import.meta.url)), plugin],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    holder.stderr.resume();
    const [ready] = await once(holder.stdout, 'data');
    assert.equal(ready.toString().trim(), 'ready');
    process.kill(Number(await readFile(pidFile, 'utf8')), 'SIGKILL');
    let settled = false;
    const closing = service.close();
    void closing.then(() => { settled = true; }, () => { settled = true; });
    await delay(150);
    assert.equal(settled, false, 'close must keep observing a locked configuration instead of silently claiming cleanup');
    holder.stdin.end('release\n');
    await closing;
    await assert.rejects(stat(dirname(dirname(plugin))), { code: 'ENOENT' });
  });
