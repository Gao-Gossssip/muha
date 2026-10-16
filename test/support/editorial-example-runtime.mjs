// Controlled example fixture. No native Harness, downloaded third-party files, auth or provider.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fakeChatRuntime } from './chat-example-runtime.mjs';

export function fakeEditorialPlatform(specs = []) {
  const calls = [], runtimes = [], sources = [];
  const platform = {
    calls, runtimes, sources,
    async prepareSkill(skill, root, signal) {
      calls.push({ operation: 'prepare', skill });
      if (platform.prepareBarrier) await platform.prepareBarrier;
      signal.throwIfAborted();
      const source = join(root, skill.name); sources.push(source);
      await mkdir(source, { recursive: true });
      await writeFile(join(source, 'SKILL.md'), `---\nname: ${skill.name}\n---\nControlled fixture only.\n`);
      await writeFile(join(source, 'LICENSE'), 'Controlled MIT license fixture, not an upstream copy.\n');
      return source;
    },
    async createRuntime(harness) {
      const spec = specs[runtimes.length] || {}, runtime = fakeChatRuntime();
      runtime.enabledHarnesses = [harness]; runtime.spec = spec;
      calls.push({ operation: 'runtime', harness }); runtimes.push(runtime);
      if (platform.runtimeBarrier) await platform.runtimeBarrier;
      runtime.configureWorkspace = async options => {
        calls.push({ operation: 'configure', options });
        if (platform.configureBarrier) await platform.configureBarrier;
        if (spec.installFails) return { workspacePath: options.workspacePath, created: false,
          attempts: [{ kind: 'skill', harness, inputIndex: 0, status: 'failed', error: { code: 'SKILL_CONFIGURATION_FAILED' } }] };
        for (const skill of options.skills) {
          assertFixtureSource(await readFile(join(skill.source, 'SKILL.md'), 'utf8'));
          const destination = join(options.workspacePath, '.agents', 'skills', skill.skillNames[0]);
          await mkdir(destination, { recursive: true }); await cp(skill.source, destination, { recursive: true });
        }
        return { workspacePath: options.workspacePath, created: false,
          attempts: options.skills.map((_, inputIndex) => ({ kind: 'skill', harness, inputIndex, status: 'succeeded' })) };
      };
      const originalCreate = runtime.createSession.bind(runtime);
      runtime.createSession = async options => {
        calls.push({ operation: 'create', options });
        const session = await originalCreate(options), originalStart = session.startTurn.bind(session);
        session.startTurn = async input => {
          calls.push({ operation: 'submitted', input, sessionId: session.reference.sessionId });
          const turn = await originalStart([{ type: 'text', text: spec.command || '[events]' }]);
          const output = spec.text ?? (runtimes.length === 1 ? '选定主题：一个真实来源的 AI 更新。\n参考链接与素材。\n' : '一篇待人工核查的文章草稿。\n');
          const originalIterator = turn[Symbol.asyncIterator].bind(turn), originalResult = turn.result;
          const policyReply = turn.respondToApproval.bind(turn);
          const originalQuestionReply = turn.respondToQuestion.bind(turn);
          if (spec.onQuestionReply) turn.respondToQuestion = async (requestId, response) => {
            await spec.onQuestionReply(requestId, response);
            return originalQuestionReply(requestId, response);
          };
          if (options.approvalPolicy === 'autoApprove') {
            turn.respondToApproval = async () => { throw new Error('The example must not duplicate Core policy approval'); };
          }
          turn.result = originalResult.then(result => result.status === 'completed' ?
            { ...result, message: { ...result.message, text: output } } : result);
          turn[Symbol.asyncIterator] = async function* () {
            let sequence = 0, retriesShown = false;
            for await (const event of originalIterator()) {
              // Mimic Core's policy-owned residual approval while still exposing
              // both public events. The script must not ask or submit a reply.
              if (event.type === 'approval.requested' && options.approvalPolicy === 'autoApprove') {
                await policyReply(event.requestId, 'allowOnce');
                runtime.calls.at(-1).source = 'policy';
              }
              if (!retriesShown && event.type !== 'turn.started') {
                retriesShown = true;
                for (let retryNumber = 1; retryNumber <= (spec.retries || 0); retryNumber++) yield {
                  type: 'turn.retrying', turnId: turn.turnId, sequence: ++sequence, timestamp: event.timestamp,
                  retryNumber, maxRetries: options.turnRetryPolicy.maxRetries, error: { code: 'HARNESS_ERROR', harness,
                    operation: 'startTurn', message: 'Controlled connection failure' },
                };
              }
              let value = { ...event, sequence: ++sequence };
              if (event.type === 'question.requested' && spec.question) {
                value = { ...value, ...structuredClone(spec.question), requestId: event.requestId };
              }
              if (event.type === 'approval.resolved' && options.approvalPolicy === 'autoApprove') {
                value = { ...value, outcome: 'allowOnce', source: 'policy' };
              }
              if (event.type === 'assistant.message.delta') {
                if (spec.finalOnly) continue;
                if (spec.interleaved) {
                  yield { ...value, sequence: sequence++, delta: output.slice(0, 4) };
                  yield { ...value, sequence: sequence++, type: 'tool.completed', toolCallId: 'hidden-tool', output: 'HIDDEN_TOOL_RESULT', isError: false };
                  yield { ...value, sequence: sequence++, type: 'assistant.reasoning.delta', messageId: event.messageId, delta: 'HIDDEN_REASONING' };
                  value = { ...value, sequence, delta: output.slice(4) };
                } else value = { ...value, delta: spec.delta ?? output };
              }
              if (event.type === 'assistant.message.completed' || event.type === 'turn.completed') {
                value = { ...value, message: { ...event.message, text: output } };
              }
              if (spec.omitTerminal && event.type.startsWith('turn.') && event.type !== 'turn.started') continue;
              if (spec.beforeTerminal && event.type === 'turn.completed') await spec.beforeTerminal(session);
              yield value;
            }
          };
          return turn;
        };
        return session;
      };
      const originalClose = runtime.close.bind(runtime);
      runtime.close = async () => {
        calls.push({ operation: 'close', harness });
        if (platform.closeBarrier) await platform.closeBarrier;
        await originalClose();
        if (spec.closeFails) throw new Error('Controlled native cleanup failure');
      };
      return runtime;
    },
  };
  return platform;
}
function assertFixtureSource(text) {
  if (!text.includes('Controlled fixture')) throw new Error('Only controlled Skill sources are allowed in this fixture');
}
