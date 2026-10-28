<h1 align="center">Muha</h1>

<p align="center">
  <strong>一套 TypeScript API，驱动多种编码 Agent。</strong>
</p>

<p align="center">Codex · OpenCode · Pi · Agy · ...</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@muha-sdk/muha"><img src="https://img.shields.io/npm/v/@muha-sdk/muha?style=flat-square&amp;color=3178c6" alt="npm 版本"></a>
  <a href="https://github.com/Gao-Sijie/muha/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Gao-Sijie/muha/ci.yml?branch=main&amp;style=flat-square&amp;label=CI" alt="CI 状态"></a>
  <a href="https://github.com/Gao-Sijie/muha/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-64748b?style=flat-square" alt="MIT 许可证"></a>
</p>

<p align="center">
  <a href="#安装">安装</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#示例">示例</a> ·
  <a href="https://github.com/Gao-Sijie/muha/blob/main/README.md">English</a> ·
  <strong>简体中文</strong>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Gao-Sijie/muha/main/assets/muha-banner.png" width="960" alt="一套 TypeScript API 通过 Muha 连接 Codex、OpenCode、Pi、Agy 等 Harness">
</p>

Muha 是轻量 TypeScript SDK，将已有编码 Agent 接入脚本和应用。
你选择 Harness 与模型，用代码串联任务；Muha 统一执行控制，保留原生能力。
Harness 是包含模型、工具、权限与会话历史的 Agent 运行环境，不只是模型 API。

## 为什么需要 Muha

- **按需分配成本** 常规任务使用高性价比的模型，复杂任务使用更强配置，在同一工作流中组合现有订阅与 Provider 资源。
- **自动化 Agent 协作** 用代码串联调研、写作与审查，传递资料、处理结果，减少手工终端操作。
- **减少接入胶水** 通过同一 API 管理不同 Harness 的启动、会话、事件与交互，不必为每个应用重复接入。

## Muha 如何工作

- **轻量化 TypeScript API** 在普通 Node.js 脚本或应用中管理 Session 与 Turn，处理流式输出、交互、中断和可选重试，无需额外的工作流 DSL。
- **显式创建与恢复 Session** 通过 `createSession` 选择 Harness、workspace 和支持的模型配置；复用 Session 连续处理任务，保存引用后可用 `resumeSession` 恢复原生上下文。
- **结构化 Question 交互** 将 Agent 的追问作为事件交给应用，支持选择、文本、数字等类型化输入；调用方可接入终端、聊天界面或表单来收集答案。
- **Workspace 级 Skills 与 MCP** 通过 `configureWorkspace` 将 Skill 来源和 MCP Server 配置写入所选 Harness 的原生项目文件，供该 workspace 下的 Session 使用。
- **无需额外部署** 不要求部署 Muha 服务、容器平台或额外沙箱层。适配器可管理本地辅助进程或原生服务；Muha 不是安全隔离边界。

## 可以用它做什么

- **灵活组织工作流** 持续上下文复用 Session，独立任务创建新 Session。一个 Session 同时只能有一个活动 Turn；并行任务使用不同 Session。
- **对比 Harness 与模型** 将同一任务交给不同 Harness 与模型，统一收集结果，用于评测、提示词实验或交叉检查；评分与成本估算由应用实现。
- **由 Agent 编排 Agent** 把 Muha 封装为工具或脚本，让一个 orchestrator Harness 调用其他 Harness、汇总结果；任务路由、规划与调度由调用方实现。
- **集成应用与脚本** 构建 Chat、调研写作、代码审查或批量文件处理工具，复用相同的执行接口。

## 使用边界

- Muha 不内置工作流调度器或 Orchestrator。
- Session 固定绑定 Harness 与 workspace，切换 Harness 需要创建新的 Session，不会自动迁移会话历史。
- Muha 使用 Harness 已配置的 API Provider 或订阅，不提供切换 API Provider 的统一接口，也不自动选择最低价模型。
- 可选功能以 Harness 的能力声明为准；统一接口不表示各家拥有相同的能力或输出。

## 安装

支持 **Windows 和 Linux**，暂不支持 macOS。

```sh
npm install @muha-sdk/muha
```

**给 Agent 的一句话启动：**

> 请查看 <https://github.com/Gao-Sijie/muha>，安装该项目，并检查当前环境中可用的 Harness CLI。

## 快速开始

安装并登录 Codex 后，将以下代码保存为 `example.mjs`：

```js
import { createMuhaRuntime, codexAdapter } from "@muha-sdk/muha";

const runtime = await createMuhaRuntime({ harnesses: [codexAdapter()] });
try {
  const session = await runtime.createSession({
    harness: "codex",
    workspacePath: process.cwd(),
    approvalPolicy: "autoDeny",
  });
  const turn = await session.startTurn([
    { type: "text", text: "Explain the structure of this project." },
  ]);
  for await (const event of turn) {
    if (event.type === "assistant.message.delta") process.stdout.write(event.delta);
    if (event.type === "question.requested") {
      await turn.respondToQuestion(event.requestId, { action: "dismiss" });
    }
  }
  const result = await turn.result;
  if (result.status !== "completed") {
    console.error(result);
    process.exitCode = 1;
  }
} finally {
  await runtime.close();
}
```

```sh
node example.mjs
```

示例会拒绝需要审批的工具操作，并忽略 Agent 的追问。实际使用时可选择
支持的审批策略，并处理追问；不同 Agent 的权限行为有所区别。

## 示例

在[示例索引](https://github.com/Gao-Sijie/muha/blob/main/examples/README.zh-CN.md)中查看可运行场景；每个示例拥有独立
的源码目录与运行说明，便于后续持续扩充。

两个示例都要求完整安装 `@muha-sdk/muha`，但不要求安装全部原生 CLI。
仅提供本地已安装的 Harness 选项；Pi SDK 随 Muha 安装，其他 Harness
需要对应原生命令在 `PATH` 上可执行。

| 项目 | 概述 | 位置 |
| --- | --- | --- |
| [多 Harness 集成 Chat](https://github.com/Gao-Sijie/muha/blob/main/examples/local-chat/README.zh-CN.md) | 单个 TS 文件包含服务端和聊天界面，支持五种适配器、原生 model/effort、内联 Turn 事件、审批、追问和停止。选项仅在点击“新对话”后生效，不迁移上下文。 | [examples/local-chat/](https://github.com/Gao-Sijie/muha/blob/main/examples/local-chat/) |
| [AI 热点选题与写作](https://github.com/Gao-Sijie/muha/blob/main/examples/auto-social-media/README.zh-CN.md) | 纯命令行交互：使用 `content-strategy` 选题、`khazix-writer` 写文；引导配置两阶段的 harness/model/effort，终端仅流式展示模型回复，保留工作目录。需明确确认真实模型调用，不自动发布。 | [examples/auto-social-media/](https://github.com/Gao-Sijie/muha/blob/main/examples/auto-social-media/) |

Examples 属于 GitHub 项目内容，不随 npm 包安装；新增示例不需要重新发布
SDK。新增场景的约定见[贡献说明](https://github.com/Gao-Sijie/muha/blob/main/CONTRIBUTING.md#examples)。

## 按需安装

只使用少数 Agent 时，也可以安装所需模块：

```sh
npm install @muha-sdk/core @muha-sdk/pi-adapter
```

随后从对应包导入 API，并保持使用同一个 Muha 发布版本。

## 使用问题

已启用的 Agent 无法启动时，先确认其原生命令可通过 `PATH` 找到，并且
认证已配置。包管理器阻止依赖安装脚本时，请查看它列出的依赖与脚本策略，
保留依赖正常安装行为；使用 Muha 无需编译本仓库。

## 参与贡献

开发和测试步骤见 [CONTRIBUTING.md](https://github.com/Gao-Sijie/muha/blob/main/CONTRIBUTING.md)。问题反馈请使用
[GitHub Issues](https://github.com/Gao-Sijie/muha/issues)，安全问题请参考
[SECURITY.md](https://github.com/Gao-Sijie/muha/blob/main/SECURITY.md)。许可证为 [MIT](https://github.com/Gao-Sijie/muha/blob/main/LICENSE)。

## 查询可用模型

```js
const models = await runtime.listModels({ harness: "codex", workspacePath: process.cwd() });
// 对已启用的 opencode、kimi、pi、agy 使用相同调用，只替换 harness。
console.log(models.map(model => ({ id: model.id, name: model.name })));
```

此接口查询 Harness 原生配置所报告的可选聊天模型。Workspace 必须存在；
查询不创建聊天会话、不调用模型推理、不修改默认模型。返回值是深度冻结、
可 JSON 序列化的数组，原生 `id` 可原样传给对应 Harness 的模型选择接口。
仅在原生目录提供时返回 `name`、`description`、`supportedEfforts` 和
`defaultEffort`；effort 保留原生含义。成功查询到空目录返回 `[]`，查询和格式
错误会明确拒绝。目录受原生配置、认证和缓存影响，不保证凭据、额度或下一次
模型调用成功。静态能力声明为 `runtime.getHarnessCapabilities(harness).model.listing`。

Codex、OpenCode、Kimi 和 Pi 可以在两次 Turn 之间调用
`await session.setModel(id)`，保留同一会话历史。切换会清除旧的显式 effort，
原生 Harness 仍可采用其默认值。AGY 目前仅支持在创建和恢复会话时选择模型。

## SDK 0.1.18 安全说明

随附的 Pi SDK 1.2.0 固定依赖 undici 8.10.2。本版通过明确授权的限定例外，
保留其已知拒绝服务、子资源完整性校验绕过、缓存污染与数据泄露、TLS 证书校验绕过风险：
[GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685)、
[GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472)、
[GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c)、
[GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26)、
[GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx)、
[GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm)、
[GHSA-9fm3-97px-rjf6](https://github.com/advisories/GHSA-9fm3-97px-rjf6)、
[GHSA-55wc-3pg8-jfw6](https://github.com/advisories/GHSA-55wc-3pg8-jfw6)。
范围与其他检查要求见[本版发布例外](https://github.com/Gao-Sijie/muha/blob/main/RELEASING.md#sdk-0118-production-audit-exception)。
