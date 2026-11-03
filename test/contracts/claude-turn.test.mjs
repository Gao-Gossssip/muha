import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { createMuhaRuntime, claudeCodeAdapter } from '@muha-sdk/muha';
import { claudeLinuxTest as test } from '../support/linux-test.mjs';
const bin = resolve(import.meta.dirname, '../fixtures/harness-bin');
async function fixture(t, scenario = 'text', extra = {}) {
  const root = await mkdtemp(join(tmpdir(), 'muha-claude-'));
  const workspacePath = join(root, 'workspace'), config = join(root, 'config'), evidence = join(root, 'evidence.jsonl');
  await mkdir(workspacePath); await mkdir(config);
  await writeFile(join(config, 'settings.json'), JSON.stringify({ model: 'settings-model' }));
  const runtime = await createMuhaRuntime({ dataDir: join(root, 'data'), harnesses: [claudeCodeAdapter({
    startupTimeoutMs: 1000, shutdownTimeoutMs: 2000,
    ...extra, env: { PATH: [bin, dirname(process.execPath)].join(delimiter), CLAUDE_CONFIG_DIR: config,
      MUHA_FAKE_CLAUDE_SCENARIO: scenario, MUHA_FAKE_CLAUDE_EVIDENCE: evidence,
      ANTHROPIC_AUTH_TOKEN: 'controlled-private-token', ANTHROPIC_MODEL: 'gateway-model', ...extra.env },
  })] });
  t.after(async () => { await runtime.close(); await rm(root, { recursive: true, force: true }); });
  const session = await runtime.createSession({ harness: 'claude', workspacePath, model: 'deepseek-v4.1-flash', effort: 'high', approvalPolicy: 'autoDeny' });
  return { runtime, session, workspacePath, evidence, root };
}
async function run(session) {
  const turn = await session.startTurn([{ type: 'text', text: '--literal $(never-execute)\nhello' }]);
  const events = []; for await (const event of turn) events.push(event);
  return { turn, events, result: await turn.result };
}
test('Claude text, token usage, safe stdin, passthrough model, permissions and create/resume identity', async t => {
  const f = await fixture(t);
  const first = await run(f.session);
  assert.equal(first.result.status, 'completed', JSON.stringify(first.result));
  assert.equal(first.result.message.text, 'Hello from Claude Code.');
  assert.deepEqual(first.result.usage, { inputTokens: 12, cachedInputTokens: 3, outputTokens: 4 });
  assert.equal(JSON.stringify(first.events).includes('cost'), false);
  const db = new DatabaseSync(join(f.runtime.dataDir, 'diagnostic-events.sqlite'), { readOnly: true });
  try {
    const records = db.prepare("SELECT payload_json FROM native_event_records WHERE harness = 'claude'").all().map(row => JSON.parse(row.payload_json));
    const result = records.find(record => record.type === 'result');
    assert.equal(result.total_cost_usd, 123);
    assert.equal(result.modelUsage.example.costUSD, 123);
    assert.deepEqual(result.permission_denials, []);
  } finally { db.close(); }
  await f.session.setModel('arbitrary/gateway-model'); await f.session.setEffort('max');
  await run(f.session);
  const reference = f.session.reference; await f.session.close();
  const resumed = await f.runtime.resumeSession({ reference, approvalPolicy: 'autoApprove' });
  await run(resumed);
  const calls = (await readFile(f.evidence, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls[0].argv.includes('--session-id'), true);
  assert.equal(calls[0].argv.includes('dontAsk'), true);
  assert.equal(calls[1].argv.includes('--resume'), true);
  assert.equal(calls[1].argv.includes('arbitrary/gateway-model'), true);
  assert.equal(calls[1].argv.includes('max'), true);
  assert.equal(calls[2].argv.includes('--dangerously-skip-permissions'), true);
  assert.equal(calls[0].cwd, f.workspacePath);
  assert.equal(calls[0].prompt, '--literal $(never-execute)\nhello');
  assert.ok(calls[0].envNames.includes('ANTHROPIC_AUTH_TOKEN'));
  assert.equal(calls[0].authTokenPreserved, true);
  assert.equal(JSON.stringify(calls).includes('controlled-private-token'), false);
});
test('Claude reasoning and native Tool lifecycle', async t => {
  const f = await fixture(t, 'rich'); const { events, result } = await run(f.session);
  assert.equal(result.status, 'completed', JSON.stringify(result));
  for (const type of ['assistant.reasoning.delta', 'tool.started', 'tool.completed']) assert.ok(events.some(e => e.type === type));
  const completed = events.filter(e => e.type === 'assistant.message.completed');
  assert.deepEqual(completed.map(e => e.message.text), ['Before tool.', 'Hello from Claude Code.']);
  const reasoning = events.find(e => e.type === 'assistant.reasoning.delta');
  assert.equal(reasoning.messageId, completed[0].message.id);
  assert.ok(events.filter(e => e.type === 'assistant.message.delta' && e.messageId === reasoning.messageId).length === 2);
  assert.equal(result.message.id, completed.at(-1).message.id);
  assert.equal(events.filter(e => e.type.startsWith('turn.') && e.type !== 'turn.started').length, 1);
});
for (const scenario of ['text', 'rich']) {
  test(`Claude ${scenario} ignores non-credential env values and preserves raw message identities`, async t => {
    const f = await fixture(t, scenario, { env: {
      SOME_KEYRING: '1', FEATURE_TOKEN: 'true', X_API_KEY: 'abc',
      NUMERIC_SECRET: '123456789', KEYRING: 'Hello from Claude Code.',
      FIRST_SECRET: 'same-message', SECOND_SECRET: 'final-message',
      SESSION_SECRET: '12345678-1234-1234-1234-123456789abc',
    } });
    const { result, events } = await run(f.session);
    assert.equal(result.status, 'completed', JSON.stringify(result));
    assert.equal(result.message.text, 'Hello from Claude Code.');
    if (scenario === 'rich') {
      assert.deepEqual(events.filter(e => e.type === 'assistant.message.completed').map(e => e.message.text),
        ['Before tool.', 'Hello from Claude Code.']);
      assert.equal(events.filter(e => e.type === 'tool.completed').length, 1);
    }
    const reference = f.session.reference;
    await f.session.close();
    const resumed = await f.runtime.resumeSession({ reference: { ...reference, sessionId: '12345678-1234-1234-1234-123456789abc' }, approvalPolicy: 'autoDeny' });
    assert.equal((await run(resumed)).result.status, 'completed');
    const db = new DatabaseSync(join(f.runtime.dataDir, 'diagnostic-events.sqlite'), { readOnly: true });
    try {
      const records = db.prepare("SELECT payload_json FROM native_event_records WHERE harness = 'claude'").all();
      assert.equal(JSON.stringify(records).includes('same-message'), false);
      assert.ok(JSON.stringify(records).includes('Hello from Claude Code.'));
    } finally { db.close(); }
  });
}
for (const scenario of ['error', 'malformed', 'exit', 'hang', 'idle', 'mismatch', 'nonzero-result', 'missing-content', 'invalid-content', 'missing-tool-id', 'missing-tool-name', 'unknown-tool-result', 'missing-result-id']) {
  test(`Claude ${scenario} terminates with a structured failure`, async t => {
    const f = await fixture(t, scenario, { startupTimeoutMs: 150, env: { MUHA_CLAUDE_TURN_IDLE_TIMEOUT_MS: '150' } });
    const { result } = await run(f.session);
    assert.equal(result.status, 'failed');
    assert.equal(JSON.stringify(result).includes('secret-token'), false);
    if (scenario === 'hang') assert.match(result.error.message, /produced no output within 150 ms; check authentication.*ANTHROPIC_API_KEY.*ANTHROPIC_AUTH_TOKEN.*apiKeyHelper.*ANTHROPIC_BASE_URL/);
    if (scenario === 'idle') assert.match(result.error.message, /started \(session init received\) but produced no further output within 150 ms.*gateway may be slow.*apiKeyHelper.*MUHA_CLAUDE_TURN_IDLE_TIMEOUT_MS/);
  });
}
test('Claude interruption reclaims its native process', async t => {
  const f = await fixture(t, 'idle', { env: { MUHA_FAKE_CLAUDE_DETACHED: '1' } });
  const turn = await f.session.startTurn([{ type: 'text', text: 'hang' }]);
  let call;
  for (let i = 0; i < 100; i++) {
    try { call = JSON.parse((await readFile(f.evidence, 'utf8')).trim()); break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(call?.pid); await turn.interrupt();
  assert.equal((await turn.result).status, 'interrupted');
  assert.throws(() => process.kill(call.pid, 0), e => e.code === 'ESRCH');
  assert.ok(call.descendantPid);
  assert.throws(() => process.kill(call.descendantPid, 0), e => e.code === 'ESRCH');
});
test('Claude catalog includes aliases, environment and config without inference; effort stays selectedOnly', async t => {
  const f = await fixture(t);
  const catalog = await f.runtime.listModels({ harness: 'claude', workspacePath: f.workspacePath });
  for (const id of ['default', 'sonnet', 'opus', 'haiku', 'fable', 'opusplan', 'gateway-model', 'settings-model']) assert.ok(catalog.some(m => m.id === id));
  assert.deepEqual(catalog[0].supportedEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(f.runtime.getHarnessCapabilities('claude').model.observation, 'selectedOnly');
  await assert.rejects(readFile(f.evidence), { code: 'ENOENT' });
});

for (const sample of ['stream-sample', 'think-deepseek-v4.1-flash', 'think-minimax-m3', 'think-claude-haiku-5-5']) {
  test('Claude replays scrubbed native sample ' + sample, async t => {
    const f = await fixture(t, 'sample:' + sample);
    const { result, events } = await run(f.session);
    assert.equal(result.status, 'completed', JSON.stringify(result));
    if (sample === 'stream-sample') assert.equal(events.filter(e => e.type === 'tool.completed').length, 2);
    else assert.equal(result.message.text, '391');
  });
}
test('Claude redacts credentials from error tails and Native Event Records, retaining unknown events', async t => {
  const f = await fixture(t, 'secret-error');
  const { result } = await run(f.session);
  assert.equal(result.status, 'failed');
  assert.equal(JSON.stringify(result).includes('controlled-private-token'), false);
  const db = new DatabaseSync(join(f.runtime.dataDir, 'diagnostic-events.sqlite'), { readOnly: true });
  try {
    const rows = db.prepare("SELECT payload_json FROM native_event_records WHERE harness = 'claude' ORDER BY record_id").all();
    assert.ok(rows.some(row => JSON.parse(row.payload_json).type === 'custom'));
    assert.equal(JSON.stringify(rows).includes('controlled-private-token'), false);
  } finally { db.close(); }
});

test('Claude tool results, system and unknown events reset the idle deadline', async t => {
  const f = await fixture(t, 'tool-keepalive', { env: { MUHA_CLAUDE_TURN_IDLE_TIMEOUT_MS: '200' } });
  const { result, events } = await run(f.session);
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.equal(events.filter(e => e.type === 'tool.completed').length, 5);
});
test('Claude thinking-only message closes before a tool and final text remains last', async t => {
  const f = await fixture(t, 'thinking-only');
  const { result, events } = await run(f.session);
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.deepEqual(events.filter(e => e.type === 'assistant.message.completed').map(e => e.message.text), ['', 'Hello from Claude Code.']);
  assert.equal(result.message.text, 'Hello from Claude Code.');
});
for (const value of ['0', '-1', '1.5', 'NaN', '9007199254740992']) {
  test('Claude invalid idle timeout falls back: ' + value, async t => {
    const f = await fixture(t, 'tool-keepalive', { env: { MUHA_CLAUDE_TURN_IDLE_TIMEOUT_MS: value } });
    assert.equal((await run(f.session)).result.status, 'completed');
  });
}

test('Claude credential selection ignores configuration and redacts known credentials longest first', async t => {
  const f = await fixture(t, 'redaction-values', { env: {
    NUMERIC_SECRET: '123456789', BOOLEAN_TOKEN: '   false   ', SOME_KEYRING: 'keyring-value', X_API_KEY: 'abc',
    AWS_SESSION_TOKEN: '987654321', SHORT_SECRET: 'overlap-credential', LONG_SECRET: 'overlap-credential-suffix',
  } });
  const { result } = await run(f.session);
  assert.equal(result.status, 'failed');
  const db = new DatabaseSync(join(f.runtime.dataDir, 'diagnostic-events.sqlite'), { readOnly: true });
  try {
    const records = db.prepare("SELECT payload_json FROM native_event_records WHERE harness = 'claude'").all();
    const custom = records.map(row => JSON.parse(row.payload_json)).find(row => row.type === 'custom');
    assert.deepEqual(custom.values, {
      NUMERIC_SECRET: '123456789', BOOLEAN_TOKEN: '   false   ', SOME_KEYRING: 'keyring-value', X_API_KEY: 'abc',
      AWS_SESSION_TOKEN: '[REDACTED]', SHORT_SECRET: '[REDACTED]', LONG_SECRET: '[REDACTED]',
    });
    for (const output of [result.error.message, JSON.stringify(records)]) {
      for (const secret of ['987654321', 'overlap-credential', '[REDACTED]-suffix']) assert.equal(output.includes(secret), false);
      assert.ok(output.includes('123456789'));
    }
  } finally { db.close(); }
});
