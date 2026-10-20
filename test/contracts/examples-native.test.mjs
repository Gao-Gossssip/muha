import assert from 'node:assert/strict';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createInstalledChatRuntime, startChatServer } from '../../examples/local-chat/main.ts';
import { createCommandLine, installedHarnesses, runEditorialScript, stagePrompt } from '../../examples/auto-social-media/main.ts';
import { controlledPi } from '../../packages/pi-adapter/test/support/controlled-pi.mjs';

// Actual Core, Pi Adapter, pinned SDK and owned workers. Only the provider and
// downloaded Skill bytes are controlled; no native credentials or paid models.
function reply(response, text) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const chunk = { id: 'examples-controlled', object: 'chat.completion.chunk', created: 1,
    model: 'controlled', choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] };
  response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  response.end(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
}

test('local-chat completes streamed conversations through the real SDK on a Chinese path with spaces', { timeout: 120000 }, async t => {
  const replies = ['你好，受控 Chat 回复。', '同一原生会话的第二个回复。'];
  const f = await controlledPi(t, (_, response, count) => reply(response, replies[count - 1]));
  const workspace = join(f.root, '聊天 项目 #1');
  await mkdir(workspace);
  const { runtime } = await createInstalledChatRuntime({ harnesses: 'pi', path: f.root,
    createRuntime: () => f.runtime() });
  const app = await startChatServer(runtime, { workspacePath: workspace, port: 0 });
  try {
    const html = await (await fetch(app.url)).text();
    const token = /name="muha-token" content="([a-f0-9]+)"/.exec(html)?.[1];
    assert.ok(token);
    const headers = { 'x-muha-token': token, 'content-type': 'application/json', origin: app.url };
    const api = (path, body) => fetch(app.url + path, { headers,
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), signal: t.signal });
    const config = await (await api('/api/config')).json();
    assert.deepEqual(config.harnesses.map(item => item.harness), ['pi']);
    assert.equal(config.workspacePath, await realpath(workspace));
    assert.equal(f.requests.length, 0, 'opening the example does not send a Turn');
    const created = await api('/api/sessions', { harness: 'pi', model: 'controlled/controlled',
      effort: 'low', approvalPolicy: 'harnessManaged' });
    assert.equal(created.status, 201, await created.clone().text());
    const session = await created.json();
    assert.equal(session.reference.workspacePath, config.workspacePath);
    for (const [index, text] of ['第一轮：读取当前项目。', '第二轮：保留上轮上下文。'].entries()) {
      const response = await api(`/api/sessions/${session.id}/turn`, { text });
      assert.equal(response.status, 200, await response.clone().text());
      const frames = (await response.text()).split('\n\n').filter(Boolean).map(frame => JSON.parse(frame.slice(6)));
      assert.equal(frames.filter(frame => frame.kind === 'accepted').length, 1);
      const events = frames.filter(frame => frame.kind === 'event').map(frame => frame.event);
      assert.deepEqual(events.filter(event => /^turn\.(completed|failed|interrupted)$/.test(event.type)).map(event => event.type), ['turn.completed']);
      const results = frames.filter(frame => frame.kind === 'result');
      assert.equal(results.length, 1);
      assert.equal(results[0].result.status, 'completed');
      assert.equal(results[0].result.message.text, replies[index]);
      assert.ok(events.some(event => event.type === 'assistant.message.delta'));
    }
    assert.equal(f.requests.length, 2);
    assert.ok(f.requests[1].messages.some(message => message.role === 'assistant' && JSON.stringify(message.content).includes(replies[0])));
  } finally { await app.close(); }
  assert.equal(runtime.status, 'closed');
});

test('auto-social-media uses real SDK Skills and serial Sessions to retain topic and article on Windows paths', { timeout: 180000 }, async t => {
  const topic = '受控选题原文：Windows 路径与中文。\nhttps://example.invalid/source\n';
  const article = '# 受控文章草稿\n\n仅用于离线集成测试。\n';
  const f = await controlledPi(t, (_, response, count) => reply(response, count === 1 ? topic : article));
  const outputRoot = join(f.root, '文章 产出 #2');
  await mkdir(outputRoot);
  const input = new PassThrough(), output = new PassThrough();
  let transcript = '';
  output.on('data', chunk => { transcript += chunk.toString(); });
  const io = createCommandLine(input, output), runtimes = [];
  try {
    const pending = runEditorialScript({ outputRoot, io, signal: t.signal,
      discoverHarnesses: () => installedHarnesses(f.root),
      async createRuntime(harness) {
        assert.equal(harness, 'pi');
        assert.ok(runtimes.every(runtime => runtime.status === 'closed'), 'topic resources close before writer starts');
        const runtime = await f.runtime(); runtimes.push(runtime); return runtime;
      },
      async prepareSkill(skill, sourceRoot, signal) {
        signal.throwIfAborted();
        const source = join(sourceRoot, skill.name);
        await mkdir(source);
        await writeFile(join(source, 'SKILL.md'), `---\nname: ${skill.name}\ndescription: controlled-${skill.name}\n---\nLocal integration fixture only.\n`);
        await writeFile(join(source, 'LICENSE'), 'Controlled fixture, not an upstream license copy.\n');
        return source;
      },
    });
    input.end(['yes', 'pi', 'controlled/controlled', 'low', 'pi', 'controlled/controlled', 'low'].join('\r\n') + '\r\n');
    const result = await pending;
    assert.equal(result.status, 'completed', JSON.stringify({ result, transcript }));
    assert.equal(await readFile(join(result.workspacePath, 'topic.md'), 'utf8'), topic);
    assert.equal(await readFile(join(result.workspacePath, 'article.md'), 'utf8'), article);
    assert.equal(result.workspacePath, await realpath(result.workspacePath));
    assert.ok(result.workspacePath.startsWith(await realpath(outputRoot)));
    const provenance = JSON.parse(await readFile(join(result.workspacePath, 'provenance.json'), 'utf8'));
    assert.equal(provenance.phase, 'completed');
    assert.equal(provenance.approvalPolicy, 'autoApprove');
    assert.deepEqual(Object.values(provenance.selections).map(selection => selection.model), ['controlled/controlled', 'controlled/controlled']);
    assert.equal(runtimes.length, 2);
    assert.notEqual(runtimes[0].runtimeId, runtimes[1].runtimeId);
    assert.ok(runtimes.every(runtime => runtime.status === 'closed'));
    assert.equal(f.requests.length, 2);
    assert.ok(JSON.stringify(f.requests[0]).includes('controlled-content-strategy'), 'native SDK discovers the installed topic Skill');
    assert.ok(JSON.stringify(f.requests[1]).includes('controlled-khazix-writer'), 'native SDK discovers the installed writer Skill');
    const writerMessages = f.requests[1].messages;
    assert.equal(writerMessages.some(message => message.role === 'assistant'), false, 'writer starts a new native Session');
    assert.ok(writerMessages.some(message => {
      const text = typeof message.content === 'string' ? message.content :
        message.content?.filter(part => part.type === 'text').map(part => part.text).join('');
      return message.role === 'user' && text?.includes(stagePrompt('writer', topic));
    }), 'the native provider request retains the exact writer prompt and topic handoff');
    assert.ok(transcript.includes(topic)); assert.ok(transcript.includes(article));
  } finally { io.close(); input.destroy(); output.destroy(); }
});
