import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFile(join(root, path), 'utf8');

test('examples catalog and root READMEs link to a scenario-per-directory layout', async () => {
  const entries = await readdir(join(root, 'examples'), { withFileTypes: true });
  const scenarios = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
  assert.ok(scenarios.includes('local-chat'));
  for (const scenario of scenarios) {
    assert.match(scenario, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    for (const file of ['main.ts', 'README.md']) await access(join(root, 'examples', scenario, file));
    assert.ok((await read('examples/README.md')).includes(`${scenario}/README.md`));
    const chineseGuide = `examples/${scenario}/README.zh-CN.md`;
    try { await access(join(root, chineseGuide)); }
    catch { continue; }
    assert.ok((await read('examples/README.zh-CN.md')).includes(`${scenario}/README.zh-CN.md`));
  }
  assert.ok((await read('README.md')).includes('## Examples\n'));
  assert.ok((await read('README.zh-CN.md')).includes('## 示例\n'));
  assert.ok((await read('README.md')).includes('examples/README.md'));
  assert.ok((await read('README.zh-CN.md')).includes('examples/README.zh-CN.md'));
});

test('root READMEs and example catalogs present Project/Overview/Location tables', async () => {
  for (const path of ['README.md', 'README.zh-CN.md', 'examples/README.md', 'examples/README.zh-CN.md']) {
    const content = await read(path);
    const header = path.includes('zh-CN') ? '| 项目 | 概述 | 位置 |' : '| Project | Overview | Location |';
    assert.ok(content.includes(`${header}\n| --- | --- | --- |\n`), path);
    for (const [directory, english, chinese] of [['local-chat', 'Multi-Harness Chat', '多 Harness 集成 Chat'],
      ['auto-social-media', 'AI Topic & Writing', 'AI 热点选题与写作']]) {
      const name = path.includes('zh-CN') ? chinese : english;
      assert.ok(content.split('\n').some(line => line.startsWith(`| [${name}]`) &&
        (line.includes(`[${directory}/`) || line.includes(`[examples/${directory}/`))), `${path}: ${name}`);
    }
  }
});

test('example Markdown navigation resolves locally and launch commands use the real entry', async () => {
  const paths = ['examples/README.md', 'examples/README.zh-CN.md',
    'examples/local-chat/README.md', 'examples/local-chat/README.zh-CN.md',
    'examples/auto-social-media/README.md', 'examples/auto-social-media/README.zh-CN.md'];
  for (const path of paths) {
    const content = await read(path);
    for (const [, target] of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const local = target.split('#')[0];
      await assert.doesNotReject(access(resolve(root, dirname(path), local)), `${path}: ${target}`);
    }
  }
  for (const path of ['examples/local-chat/README.md', 'examples/local-chat/README.zh-CN.md']) {
    const content = await read(path);
    assert.ok(content.includes('node examples/local-chat/main.ts .'));
    assert.ok(!content.includes('node examples/chat.ts'));
  }
  for (const path of ['examples/auto-social-media/README.md', 'examples/auto-social-media/README.zh-CN.md']) {
    const content = await read(path);
    assert.ok(content.includes('node examples/auto-social-media/main.ts'));
    assert.ok(content.includes('content-strategy')); assert.ok(content.includes('khazix-writer'));
    assert.ok(content.includes('MIT')); assert.ok(content.includes('turn.completed'));
    assert.match(content, /command-line|命令行/);
    assert.doesNotMatch(content, /http:\/\/127\.0\.0\.1|PORT=|Click|点击/);
  }
});

test('future examples are automatically typechecked without adding npm workspace/export entries', async () => {
  const config = JSON.parse(await read('test/types/tsconfig.json'));
  assert.ok(config.include.includes('../../examples/**/*.ts'));
  assert.ok(config.exclude.includes('../../examples/auto-social-media/workspaces'));
  const manifest = JSON.parse(await read('package.json'));
  assert.ok(manifest.workspaces.every(workspace => workspace.startsWith('packages/')));
  for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkg = JSON.parse(await read(`packages/${entry.name}/package.json`));
    assert.ok(!JSON.stringify(pkg.exports).includes('examples'));
    assert.ok(pkg.files.every(file => !file.includes('examples')));
  }
});

test('editorial generated workspaces stay local and both guides describe script-relative retained output', async () => {
  assert.ok((await read('.gitignore')).split('\n').includes('/examples/auto-social-media/workspaces/'));
  for (const name of ['README.md', 'README.zh-CN.md']) {
    const guide = await read(`examples/auto-social-media/${name}`);
    assert.ok(guide.includes('examples/auto-social-media/workspaces/muha-social-*'));
    assert.ok(guide.includes('node examples/auto-social-media/main.ts /existing/output-directory'));
    assert.doesNotMatch(guide, /defaults to the OS temporary directory|默认在系统临时目录/);
  }
});

test('both example guides require complete Muha installation and distinguish Pi SDK from native CLIs', async () => {
  for (const scenario of ['local-chat', 'auto-social-media']) {
    for (const language of ['README.md', 'README.zh-CN.md']) {
      const path = `examples/${scenario}/${language}`, content = await read(path);
      assert.ok(content.includes('npm install @muha-sdk/muha'), path);
      assert.ok(content.includes('npm ci'), path);
      assert.ok(content.includes('npm run build'), path);
      assert.ok(content.includes('`agy`'), path);
      assert.ok(!content.includes('antigravity-cli'), path);
      assert.ok(content.includes('PATH'), path);
      assert.ok(content.includes('`k3`'), path);
      assert.ok(content.includes('`deepseek/deepseek-flash`'), path);
      assert.ok(content.includes('Kimi Code'), path);
      assert.match(content, /third-party provider|第三方 provider/, path);
      assert.match(content, /complete|完整/, path);
      assert.match(content, /no global `pi`|无需全局[\s\S]*?`pi`/, path);
      assert.doesNotMatch(content, /All five adapters are enabled by default|默认启用五种适配器/);
    }
  }
});
