import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import test from 'node:test';
import { exampleRegistrations, selectHarnesses, startChatServer } from '../../examples/local-chat/main.ts';
import { fakeChatRuntime } from '../support/chat-example-runtime.mjs';
import { chatBrowser } from '../support/chat-example-browser.mjs';

test('single-file example covers exactly the five official harnesses', () => {
  assert.deepEqual(selectHarnesses(), ['codex', 'opencode', 'kimi', 'pi', 'agy']);
  assert.deepEqual(selectHarnesses('pi,codex'), ['pi', 'codex']);
  for (const invalid of ['', 'unknown', 'pi,pi', 'codex,']) {
    assert.throws(() => selectHarnesses(invalid));
  }
  assert.equal(exampleRegistrations(selectHarnesses()).length, 5);
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'muha-chat-example-'));
  const runtime = fakeChatRuntime();
  const app = await startChatServer(runtime, { workspacePath: root, port: 0 });
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const pageResponse = await fetch(app.url);
  const html = await pageResponse.text();
  const token = /name="muha-token" content="([a-f0-9]+)"/.exec(html)?.[1];
  assert.ok(token);
  const headers = { 'x-muha-token': token, 'content-type': 'application/json', origin: app.url };
  const api = (path, method = 'GET', body) => fetch(app.url + path, { method, headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const create = async (harness = 'codex', extra = {}) => {
    const res = await api('/api/sessions', 'POST', { harness,
      approvalPolicy: ['pi', 'agy'].includes(harness) ? 'harnessManaged' : 'interactive', ...extra });
    assert.equal(res.status, 201, await res.clone().text()); return res.json();
  };
  return { app, runtime, html, headers, api, create, pageResponse };
}

async function frames(response) {
  const text = await response.text();
  return text.split('\n\n').filter(Boolean).map(frame => JSON.parse(frame.slice(6)));
}

async function active(response) {
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  let buffer = '';
  while (!buffer.includes('\n\n')) buffer += new TextDecoder().decode((await reader.read()).value);
  const turnId = JSON.parse(buffer.slice(6, buffer.indexOf('\n\n'))).turnId;
  assert.ok(turnId);
  return { turnId, reader, async drain() { while (!(await reader.read()).done) {} } };
}

test('loopback page is self-contained, script parses and API requires same-origin token', async t => {
  const { app, runtime, html, api, pageResponse } = await fixture(t);
  assert.ok(app.url.startsWith('http://127.0.0.1:'));
  assert.ok(pageResponse.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal(pageResponse.headers.get('cache-control'), 'no-store');
  assert.ok(!/<script[^>]+src=|<link[^>]+href=/.test(html));
  new Script(/<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.ok(html.includes('textContent'));
  assert.ok(html.includes('发送消息会调用真实模型'));
  assert.ok(!html.includes('innerHTML'));
  assert.equal((await fetch(app.url + '/api/config')).status, 403);
  const config = await (await api('/api/config')).json();
  assert.deepEqual(config.harnesses.map(h => h.harness), selectHarnesses());
  assert.equal(runtime.calls.length, 0, 'loading page/config never creates Sessions or Turns');
});

test('chat UI commits configuration only through New conversation and has no collapsed event panel', async t => {
  const { html } = await fixture(t);
  assert.ok(!html.includes('id="apply"'), 'remove the Apply-to-current action');
  assert.ok(html.includes('新对话'));
  assert.ok(!html.includes('id="events"'), 'events belong in the chat, not a separate hidden panel');
  assert.ok(html.includes('id="draft-note"'), 'make draft versus active selection explicit');
  assert.ok(html.includes('id="active-harness"'), 'show the active conversation harness separately');
});

test('Kimi model suggestions explain its third-party provider without selecting or substituting models', async t => {
  const { html, runtime, api, create } = await fixture(t);
  const config = await (await api('/api/config')).json();
  assert.deepEqual(config.harnesses.find(entry => entry.harness === 'kimi').models, ['k3', 'deepseek/deepseek-flash']);
  const browser = chatBrowser(html);
  browser.context.controlledConfig = config.harnesses;
  browser.evaluate('config = { harnesses: controlledConfig };');
  browser.node('harness').value = 'kimi';
  browser.evaluate('stageHarness();');
  assert.equal(browser.node('model').value, '');
  assert.deepEqual(Array.from(browser.node('models').children, node => node.value), ['k3', 'deepseek/deepseek-flash']);
  assert.match(browser.node('model-hint').textContent, /k3 或 deepseek\/deepseek-flash/);
  assert.match(browser.node('model-hint').textContent, /Kimi Code 的第三方 provider 配置示例/);
  assert.match(browser.node('model-hint').textContent, /需先在原生配置中设置对应 provider、凭据和模型；Muha 不会自动配置/);
  browser.node('harness').value = 'codex';
  browser.node('harness').onchange();
  assert.equal(browser.node('model-hint').textContent, '');
  assert.equal(runtime.calls.length, 0, 'reading suggestions or switching draft settings starts no Session or Turn');
  for (const model of ['k3', 'deepseek/deepseek-flash']) {
    assert.equal((await create('kimi', { model })).model, model);
  }
  assert.deepEqual(runtime.calls.map(call => [call.operation, call.options.model]), [
    ['create', 'k3'], ['create', 'deepseek/deepseek-flash'],
  ]);
});

test('rejects foreign Origin, cross-site fetch and DNS-rebinding Host even with token', async t => {
  const { app, headers } = await fixture(t);
  for (const extra of [{ origin: 'https://evil.invalid' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await fetch(app.url + '/api/config', { headers: { ...headers, ...extra } })).status, 403);
  }
  const status = await new Promise((resolve, reject) => {
    const req = request(app.url + '/api/config', { headers: { ...headers, host: 'evil.invalid' } }, res => {
      res.resume(); resolve(res.statusCode);
    });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 403);
});

test('browser interrupt acknowledgement cannot overwrite an earlier terminal result', async t => {
  const { html } = await fixture(t);
  let acknowledge;
  const browser = chatBrowser(html, path => {
    if (path === '/api/config') return new Promise(() => {}); // Do not run unrelated UI initialization.
    return new Promise(resolve => { acknowledge = () => resolve({ ok: true, json: async () => ({ ok: true }) }); });
  });
  browser.evaluate('current = { turnId: "turn-1", session: { id: "session-1" } }; busy = true;');
  const pending = browser.node('stop').onclick();
  // Streaming terminal delivery wins the race against the HTTP interrupt response.
  browser.evaluate('current.turnId = null; busy = false; note("interrupted");');
  acknowledge(); await pending;
  assert.equal(browser.node('status').textContent, 'interrupted');
});

function configureBrowser(browser) {
  browser.context.controlledConfig = fakeChatRuntime().enabledHarnesses.map(harness => ({
    harness, models: [], capabilities: fakeChatRuntime().getHarnessCapabilities(harness),
  }));
  browser.evaluate('config = { harnesses: controlledConfig };');
  browser.node('harness').value = 'codex'; browser.node('policy').value = 'interactive';
  browser.evaluate('stageHarness();');
}

test('draft harness/model/effort changes leave the active Session, header and chat untouched', async t => {
  const { html } = await fixture(t);
  const browser = chatBrowser(html);
  configureBrowser(browser);
  browser.evaluate('current = { session: { id: "original", reference: { harness: "codex", sessionId: "native-original" }, model: "old", effort: "low" }, selection: selections() }; updateActiveHeader();');
  browser.node('chat').textContent = 'original transcript';
  const header = browser.node('conversation-meta').textContent;
  browser.node('harness').value = 'pi'; browser.node('harness').onchange();
  browser.node('model').value = 'new-native-model'; browser.node('model').oninput();
  browser.node('effort').value = 'high'; browser.node('effort').oninput();
  assert.equal(browser.node('chat').textContent, 'original transcript');
  assert.equal(browser.node('conversation-meta').textContent, header);
  assert.equal(browser.node('active-harness').textContent, 'Codex CLI');
  assert.equal(browser.evaluate('current.session.id'), 'original');
  assert.ok(browser.node('draft-note').textContent.includes('当前对话保持不变'));
});

test('New conversation alone creates and swaps Sessions without making idle setter calls', async t => {
  const { html } = await fixture(t);
  const calls = [];
  const browser = chatBrowser(html, async (path, request) => {
    if (path === '/api/config') return new Promise(() => {});
    calls.push({ path, method: request.method, body: request.body && JSON.parse(request.body) });
    return { ok: true, json: async () => path === '/api/sessions' ? {
      id: 'replacement', reference: { harness: 'pi', sessionId: 'new-native-session' }, model: 'new-model', effort: 'high',
    } : { closed: true } };
  });
  configureBrowser(browser);
  browser.evaluate('current = { session: { id: "original", reference: { harness: "codex", sessionId: "old-native-session" } }, selection: selections() };');
  browser.node('chat').textContent = 'original transcript';
  browser.node('harness').value = 'pi'; browser.node('harness').onchange();
  browser.node('model').value = 'new-model'; browser.node('effort').value = 'high';
  await browser.node('fresh').onclick();
  assert.deepEqual(calls.map(call => [call.path, call.method]), [['/api/sessions', 'POST'], ['/api/sessions/original', 'DELETE']]);
  assert.equal(calls[0].body.harness, 'pi'); assert.equal(calls[0].body.model, 'new-model');
  assert.equal(calls[0].body.effort, 'high');
  assert.equal(browser.evaluate('current.session.id'), 'replacement');
  assert.equal(browser.node('active-harness').textContent, 'Pi');
  assert.ok(!browser.node('chat').textContent.includes('original transcript'));
});

test('failed New conversation preserves active history and never closes the old handle', async t => {
  const { html } = await fixture(t);
  const calls = [];
  const browser = chatBrowser(html, async (path, request) => {
    if (path === '/api/config') return new Promise(() => {});
    calls.push([path, request.method]);
    return { ok: false, json: async () => ({ error: { code: 'HARNESS_ERROR', message: 'Invalid native model' } }) };
  });
  configureBrowser(browser);
  browser.evaluate('current = { session: { id: "original" }, selection: selections() };');
  browser.node('chat').textContent = 'keep this transcript';
  await browser.node('fresh').onclick();
  assert.deepEqual(calls, [['/api/sessions', 'POST']]);
  assert.equal(browser.evaluate('current.session.id'), 'original');
  assert.equal(browser.node('chat').textContent, 'keep this transcript');
  assert.ok(browser.node('status').textContent.includes('HARNESS_ERROR'));
});

test('reasoning/tools/usage/terminal events render inline; final message is authoritative without duplication', async t => {
  const { html } = await fixture(t);
  const browser = chatBrowser(html);
  browser.evaluate('current = { session: { reference: { harness: "codex" } }, messages: new Map(), reasoning: new Map(), tools: new Map(), interactions: new Map() };');
  browser.node('chat').replaceChildren();
  const events = [
    { type: 'turn.started' },
    { type: 'assistant.message.started', messageId: 'message-1' },
    { type: 'assistant.reasoning.delta', messageId: 'message-1', delta: 'Thinking ' },
    { type: 'assistant.reasoning.delta', messageId: 'message-1', delta: 'carefully.' },
    { type: 'tool.started', toolCallId: 'tool-1', toolName: 'Read', input: { path: 'README.md' } },
    { type: 'tool.updated', toolCallId: 'tool-1', update: { progress: 'reading' } },
    { type: 'tool.completed', toolCallId: 'tool-1', output: 'file contents', isError: false },
    { type: 'usage.updated', usage: { inputTokens: 10, outputTokens: 20 } },
    { type: 'assistant.message.delta', messageId: 'message-1', delta: 'partial text' },
    { type: 'assistant.message.completed', message: { id: 'message-1', text: 'authoritative final' } },
    { type: 'turn.completed', message: { id: 'message-1', text: 'authoritative final' } },
  ];
  events.forEach((event, index) => {
    browser.context.controlledEvent = { sequence: index + 1, ...event };
    browser.evaluate('renderEvent(controlledEvent);');
  });
  const chat = browser.node('chat').textContent;
  for (const expected of ['本轮开始', 'Thinking carefully.', 'Read', 'README.md', 'reading', 'file contents', 'inputTokens', '本轮完成']) {
    assert.ok(chat.includes(expected), expected);
  }
  assert.equal(chat.split('authoritative final').length - 1, 1);
  assert.ok(!chat.includes('partial text'));
  assert.equal(browser.node('chat').children.filter(node => node.className.includes('reasoning')).length, 1);
});

test('all five harnesses create independent Sessions and preserve opaque model/effort strings', async t => {
  const { runtime, create } = await fixture(t);
  const ids = [];
  for (const harness of selectHarnesses()) {
    const session = await create(harness, { model: 'native/provider/model-x', effort: 'native-custom-effort' });
    assert.equal(session.reference.harness, harness);
    assert.equal(session.model, 'native/provider/model-x');
    assert.equal(session.effort, 'native-custom-effort');
    ids.push(session.reference.sessionId);
  }
  assert.equal(new Set(ids).size, 5);
  assert.ok(runtime.calls.every(call => call.operation === 'create'));
  assert.ok(runtime.calls.every(call => !('turnRetryPolicy' in call.options)));
});

test('native defaults are omitted, unsupported policies and unknown fields reject before creation', async t => {
  const { runtime, create, api } = await fixture(t);
  await create('agy');
  assert.ok(!Object.hasOwn(runtime.calls[0].options, 'effort'));
  assert.ok(!Object.hasOwn(runtime.calls[0].options, 'model'));
  for (const extra of [{ approvalPolicy: 'interactive' }, { harness: 'unknown' }, { workspacePath: '/elsewhere' }]) {
    const res = await api('/api/sessions', 'POST', { harness: 'agy', approvalPolicy: 'harnessManaged', ...extra });
    assert.equal(res.status, 400);
  }
  assert.equal(runtime.calls.length, 1);
});

test('harness switch uses distinct Sessions and coming back continues the original', async t => {
  const { create, api, runtime } = await fixture(t);
  const codex = await create('codex'), pi = await create('pi');
  for (const [session, prompt] of [[codex, 'first'], [pi, 'other'], [codex, 'continue']]) {
    const res = await api(`/api/sessions/${session.id}/turn`, 'POST', { text: prompt });
    assert.equal(res.status, 200);
    const values = await frames(res);
    assert.equal(values.filter(value => value.kind === 'result').length, 1);
    assert.equal(values.at(-1).result.status, 'completed');
    assert.equal(values.at(-1).result.message.text, `reply: ${prompt}`);
    assert.equal(values.filter(value => value.event?.type === 'turn.completed').length, 1);
  }
  assert.deepEqual(runtime.calls.filter(call => call.operation === 'startTurn').map(call => call.sessionId),
    [codex.reference.sessionId, pi.reference.sessionId, codex.reference.sessionId]);
});

test('idle selection updates model then effort and surfaces partial nontransactional success', async t => {
  const { create, api, runtime } = await fixture(t);
  const session = await create('pi', { model: 'old-model', effort: 'old-effort' });
  const path = `/api/sessions/${session.id}`;
  let res = await api(path, 'PATCH', { model: 'new-model', effort: 'high' });
  assert.equal(res.status, 200); assert.equal((await res.json()).effort, 'high');
  assert.deepEqual(runtime.calls.slice(-2).map(call => call.operation), ['setModel', 'setEffort']);
  res = await api(path, 'PATCH', { model: 'third-model', effort: 'bad' });
  assert.equal(res.status, 422);
  const value = await res.json();
  assert.equal(value.error.code, 'HARNESS_ERROR');
  assert.equal(value.session.model, 'third-model'); assert.equal(value.session.effort, null);
  for (const changes of [{ model: '' }, { effort: '' }, { harness: 'kimi' }, { workspacePath: '/other' }]) {
    assert.equal((await api(path, 'PATCH', changes)).status, 400);
  }
});

test('AGY has creation-only model/effort, no hidden session replacement', async t => {
  const { create, api, runtime } = await fixture(t);
  const session = await create('agy', { model: 'claude-sonnet-4-6' });
  assert.equal((await api(`/api/sessions/${session.id}`, 'PATCH', { model: 'other', effort: 'high' })).status, 409);
  assert.equal(runtime.calls.length, 1);
  assert.equal((await api(`/api/sessions/${session.id}`, 'DELETE')).status, 200);
  const next = await create('agy', { model: 'other-native-model', effort: 'native-effort' });
  assert.notEqual(next.reference.sessionId, session.reference.sessionId);
});

test('active Turn blocks another Turn, selection and deletion; stop restores same Session', async t => {
  const { create, api, runtime } = await fixture(t);
  const session = await create(); const path = `/api/sessions/${session.id}`;
  const stream = await active(await api(path + '/turn', 'POST', { text: '[hold]' }));
  assert.equal((await api(path + '/turn', 'POST', { text: 'duplicate' })).status, 409);
  assert.equal((await api(path, 'PATCH', { model: 'new' })).status, 409);
  assert.equal((await api(path, 'DELETE')).status, 409);
  assert.equal((await api(path + '/interrupt', 'POST', { turnId: 'stale' })).status, 409);
  assert.equal((await api(path + '/interrupt', 'POST', { turnId: stream.turnId })).status, 200);
  await stream.drain();
  assert.equal(runtime.sessions[0].status.status, 'idle');
  const values = await frames(await api(path + '/turn', 'POST', { text: 'after stop' }));
  assert.equal(values.at(-1).result.status, 'completed');
});

test('Turn acceptance window is guarded before startTurn resolves', async t => {
  const { create, api, runtime } = await fixture(t);
  const session = await create(); const path = `/api/sessions/${session.id}`;
  let release; runtime.startBarrier = new Promise(resolve => { release = resolve; });
  const pending = api(path + '/turn', 'POST', { text: 'first' });
  while (!runtime.calls.some(call => call.operation === 'startTurn')) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await api(path + '/turn', 'POST', { text: 'second' })).status, 409);
  assert.equal((await api(path, 'PATCH', { effort: 'high' })).status, 409);
  release(); assert.equal((await frames(await pending)).at(-1).result.status, 'completed');
});

test('selection window excludes concurrent mutation and Turn submission', async t => {
  const { create, api, runtime } = await fixture(t);
  const session = await create(); const path = `/api/sessions/${session.id}`;
  let release; runtime.selectionBarrier = new Promise(resolve => { release = resolve; });
  const pending = api(path, 'PATCH', { model: 'next' });
  while (!runtime.calls.some(call => call.operation === 'setModel')) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await api(path + '/turn', 'POST', { text: 'race' })).status, 409);
  assert.equal((await api(path, 'PATCH', { effort: 'high' })).status, 409);
  assert.equal((await api(path, 'DELETE')).status, 409);
  release(); assert.equal((await pending).status, 200);
});

test('pending Session creations count toward the cap, not only completed Sessions', async t => {
  const { api, runtime } = await fixture(t);
  let release; runtime.createBarrier = new Promise(resolve => { release = resolve; });
  const body = { harness: 'codex', approvalPolicy: 'interactive' };
  const pending = Array.from({ length: 20 }, () => api('/api/sessions', 'POST', body));
  while (runtime.calls.filter(call => call.operation === 'create').length < 20) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal((await api('/api/sessions', 'POST', body)).status, 429);
  release();
  for (const response of await Promise.all(pending)) assert.equal(response.status, 201);
});

test('approvals and Questions are answered explicitly on the current Turn, never automatically', async t => {
  const { create, api, runtime } = await fixture(t);
  const session = await create(); const path = `/api/sessions/${session.id}`;
  for (const action of ['approval', 'question']) {
    const stream = await active(await api(path + '/turn', 'POST', { text: `[${action}]` }));
    assert.ok(!runtime.calls.some(call => call.operation === action));
    const fields = action === 'approval' ? { requestId: 'approval-1', decision: 'deny' } :
      { requestId: 'question-1', response: { action: 'dismiss' } };
    assert.equal((await api(path + '/' + action, 'POST', { turnId: stream.turnId, ...fields })).status, 200);
    await stream.drain();
  }
  assert.equal(runtime.calls.filter(call => call.operation === 'approval').length, 1);
  assert.equal(runtime.calls.filter(call => call.operation === 'question').length, 1);
});

test('invalid Question answer remains recoverable and is not treated as successful', async t => {
  const { create, api } = await fixture(t);
  const session = await create(); const path = `/api/sessions/${session.id}`;
  const stream = await active(await api(path + '/turn', 'POST', { text: '[question]' }));
  const answer = response => api(path + '/question', 'POST', { turnId: stream.turnId, requestId: 'question-1', response });
  assert.equal((await answer({ action: 'wrong' })).status, 422);
  assert.equal((await answer({ action: 'dismiss' })).status, 200);
  await stream.drain();
});

test('failed accepted Turns and command rejections remain distinct', async t => {
  const { create, api } = await fixture(t);
  const session = await create(); const path = `/api/sessions/${session.id}/turn`;
  const rejected = await api(path, 'POST', { text: '[reject]' });
  assert.equal(rejected.status, 422); assert.ok(rejected.headers.get('content-type').startsWith('application/json'));
  const values = await frames(await api(path, 'POST', { text: '[fail]' }));
  assert.equal(values.at(-1).result.status, 'failed');
  assert.equal(values.filter(value => value.event?.type === 'turn.failed').length, 1);
});

test('disconnect interrupts the owned Turn and allows continued use', async t => {
  const { create, api, runtime } = await fixture(t);
  const session = await create(); const path = `/api/sessions/${session.id}/turn`;
  const stream = await active(await api(path, 'POST', { text: '[hold]' }));
  await stream.reader.cancel();
  while (!runtime.calls.some(call => call.operation === 'interrupt')) await new Promise(resolve => setImmediate(resolve));
  const values = await frames(await api(path, 'POST', { text: 'continue after disconnect' }));
  assert.equal(values.at(-1).result.status, 'completed');
});

test('request schemas, content type, body length and conversation count are bounded', async t => {
  const { create, api, app, headers } = await fixture(t);
  const session = await create(); const path = `/api/sessions/${session.id}/turn`;
  for (const body of [{ text: '' }, { text: 123 }, { text: 'ok', extra: 'no' }, []]) {
    assert.equal((await api(path, 'POST', body)).status, 400);
  }
  assert.equal((await fetch(app.url + path, { method: 'POST', headers: { ...headers, 'content-type': 'text/plain' }, body: 'text' })).status, 415);
  assert.equal((await fetch(app.url + path, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await api(path, 'POST', { text: 'x'.repeat(256 * 1024) })).status, 413);
  for (let i = 1; i < 20; i++) await create();
  assert.equal((await api('/api/sessions', 'POST', { harness: 'codex', approvalPolicy: 'interactive' })).status, 429);
  assert.equal((await api(`/api/sessions/${session.id}`, 'DELETE')).status, 200);
  await create();
});

test('server close is idempotent and interrupts active work before freeing sockets', async t => {
  const { create, api, app, runtime } = await fixture(t);
  const session = await create(); const path = `/api/sessions/${session.id}/turn`;
  const stream = await active(await api(path, 'POST', { text: '[hold]' }));
  await Promise.all([app.close(), app.close()]);
  assert.equal(runtime.calls.filter(call => call.operation === 'runtimeClose').length, 1);
  assert.equal(runtime.calls.filter(call => call.operation === 'interrupt').length, 1);
  try { await stream.drain(); } catch {} // shutdown may end or close the local socket.
});

test('invalid startup workspace/port releases the owned Runtime without model calls', async () => {
  for (const options of [{ workspacePath: '/does-not-exist' }, { workspacePath: tmpdir(), port: -1 }]) {
    const runtime = fakeChatRuntime();
    await assert.rejects(startChatServer(runtime, options));
    assert.equal(runtime.calls.filter(call => call.operation === 'runtimeClose').length, 1);
    assert.ok(!runtime.calls.some(call => call.operation === 'startTurn'));
  }
});
