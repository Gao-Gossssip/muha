import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');

test('contributor and agent guidance preserve the protected main workflow and separate release authority', async () => {
  const contributing = (await readFile(join(root, 'CONTRIBUTING.md'), 'utf8')).replace(/\s+/g, ' ');
  for (const concept of [
    /topic branch.*pull request targeting `main`/,
    /Direct pushes, force pushes and deletion of `main` are blocked/,
    /squash only/, /up to date with `main`/, /resolve review threads/,
    /required check from GitHub Actions/,
    /required approval count is zero/, /no standing bypass/,
    /agents need explicit user authorization/,
    /Add Windows checks only after that implementation is accepted and merged/,
    /PR checks do not call paid models or publish packages/,
    /manually dispatched OIDC release workflow/,
    /merging a PR does not publish an npm release/,
  ]) assert.match(contributing, concept);
  for (const name of ['contract (22.20.0)', 'contract (lts/*)', 'contract (current)']) {
    assert.ok(contributing.includes(`\`${name}\``), name);
  }

  const agents = (await readFile(join(root, 'AGENTS.md'), 'utf8')).replace(/\s+/g, ' ');
  for (const concept of [
    /topic branch and pull request/, /never push directly, force-push or delete `main`/,
    /no standing bypass/, /Zero required approvals/,
    /does not authorize an agent to merge/,
    /explicit user authorization before merging a pull request or changing\/bypassing protection/,
  ]) assert.match(agents, concept);
});

test('root READMEs explain motivation, the embedded SDK approach and application-level use cases', async () => {
  for (const [file, headings, concepts] of [
    ['README.md', ['Why Muha', 'How it works', 'What you can build', 'Install'],
      [/cost-effective models/, /Lightweight TypeScript API/, /No extra deployment/,
        /additional sandbox layer/, /fresh Session per independent/, /Harness and model comparisons/,
        /Agent-led orchestration/, /Applications and scripts/]],
    ['README.zh-CN.md', ['为什么需要 Muha', 'Muha 如何工作', '可以用它做什么', '安装'],
      [/高性价比的模型/, /轻量化 TypeScript API/, /无需额外部署/,
        /额外沙箱层/, /独立任务创建新 Session/, /不同 Harness 与模型/,
        /由 Agent 编排 Agent/, /集成应用与脚本/]],
  ]) {
    const contents = await readFile(join(root, file), 'utf8');
    const positions = headings.map(heading => contents.indexOf(`## ${heading}\n`));
    assert.ok(positions.every(position => position >= 0), file);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, file);
    for (const concept of concepts) assert.match(contents.replace(/\s+/g, ' '), concept, file);
    for (const heading of headings.slice(0, -1)) {
      const section = contents.split(`## ${heading}\n`)[1].split('\n## ')[0];
      const points = section.split('\n').filter(line => line.startsWith('- '));
      assert.ok(points.length > 0, `${file}: ${heading}`);
      assert.ok(points.every(line => /^- \*\*[^*]+\*\* \S/.test(line)), `${file}: ${heading}`);
    }
  }
});

test('root README positioning preserves native costs, Session binding and the orchestration boundary', async () => {
  const english = (await readFile(join(root, 'README.md'), 'utf8')).replace(/\s+/g, ' ');
  const chinese = await readFile(join(root, 'README.zh-CN.md'), 'utf8');
  for (const concept of [/does not automatically select the cheapest model/,
    /Adapters may manage/, /not a security\s+isolation boundary/,
    /one active\s+Turn at a time/, /not a built-in workflow scheduler or\s+orchestrator/,
    /switching\s+harnesses requires a new Session/, /without automatic conversation-history migration/,
    /does not promise identical\s+capabilities or outputs/]) assert.match(english, concept);
  for (const concept of [/不自动选择最低价模型/, /本地辅助进程或原生服务/,
    /不是安全隔离边界/, /只能有一个活动 Turn/, /不内置工作流调度器或 Orchestrator/,
    /切换 Harness 需要创建新的 Session/, /不会自动迁移会话历史/,
    /不表示各家拥有相同的能力或输出/]) assert.match(chinese, concept);
});

test('SDK guidance is self-contained and preserves qualification exceptions', async () => {
  const qualification = await readFile(join(root, 'QUALIFICATION.md'), 'utf8');
  for (const fact of ['gpt-5.6-luna', 'opencode-go/deepseek-v4.1-flash', 'deepseek/deepseek-flash',
    'claude-sonnet-4-6', 'opencode-go/qwen3.8-flash', 'NOT_TRIGGERED', 'WAIVED', 'N/A']) {
    assert.ok(qualification.includes(fact), fact);
  }
  for (const directory of ['core', 'codex-adapter', 'opencode-adapter', 'kimi-adapter', 'pi-adapter', 'agy-adapter']) {
    const manifest = JSON.parse(await readFile(join(root, 'packages', directory, 'package.json'), 'utf8'));
    assert.equal(manifest.repository.url, 'https://github.com/Gao-Sijie/muha.git');
    assert.equal(manifest.repository.directory, `packages/${directory}`);
    assert.equal(manifest.bugs.url, 'https://github.com/Gao-Sijie/muha/issues');
    assert.equal(manifest.homepage, `https://github.com/Gao-Sijie/muha/tree/main/packages/${directory}#readme`);
  }
  const tracked = spawnSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: root, encoding: 'utf8' });
  assert.equal(tracked.status, 0, tracked.stderr);
  const files = tracked.stdout.split('\0').filter(file => file && !file.split('/').includes('docs'));
  for (const required of ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CONTEXT.md',
    'QUALIFICATION.md']) assert.ok(files.includes(required), `missing shared guidance: ${required}`);
  for (const file of files) {
    const path = resolve(root, file), contents = await readFile(path, 'utf8');
    for (const [, target] of contents.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const local = target.split('#')[0];
      await assert.doesNotReject(access(resolve(dirname(path), local)), `${file}: ${target}`);
    }
  }
});
