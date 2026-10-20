# 示例

[English](README.md) | [简体中文](README.zh-CN.md) · [Muha](../README.zh-CN.md)

基于 `@muha-sdk/muha` 公共 API 的可运行示例。每个场景独占一个目录，包含
TypeScript 入口和运行说明，方便后续持续增加新的 examples。

示例属于 GitHub 项目内容，不是 npm 包、SDK 导出或 npm 安装附带的文件。
更新示例不要求升级 SDK 版本，也不需要重新打包或发布 npm。

两个示例都要求**完整安装 `@muha-sdk/muha`**，不要只装 Core 或个别 Adapter。
自己的 ESM 项目使用 `npm install @muha-sdk/muha`；仓库中使用下方的
`npm ci` 和构建步骤。示例只列出本地已安装的 Harness：通过 `PATH`
检测四家的原生 CLI，Pi SDK 则随完整包安装，无需全局 `pi` 命令。
不要求安装全部原生工具；检测不代表认证或模型可用性已通过。

## 已有示例

| 项目 | 概述 | 位置 |
| --- | --- | --- |
| [多 Harness 集成 Chat](local-chat/README.zh-CN.md) | 单个 TS 文件包含服务端和聊天界面，从五种适配器中仅启用本地已安装的 Harness，支持原生 model/effort、内联 Turn 事件、审批、追问和停止。配置仅在新建对话后生效。 | [local-chat/](local-chat/) · [main.ts](local-chat/main.ts) |
| [AI 热点选题与写作](auto-social-media/README.zh-CN.md) | 纯命令行交互：两个独立配置的 Agent 分别使用 `content-strategy` 选题与 `khazix-writer` 写文。单 TS、仅流式展示模型回复、不打印工具与事件日志、有限重试、保留产出；需确认真实模型调用，不自动发布。 | [auto-social-media/](auto-social-media/) · [main.ts](auto-social-media/main.ts) |

## 在仓库中运行

使用 Node.js >=22.20.0，宿主为 Linux x64（glibc）或原生 Windows x64，
并按各示例要求准备所选 Harness。下方 Windows 说明使用本分支的仓库构建；
npm 包支持的平台以所安装版本为准。Windows 构建需要 Visual Studio 2022
C++ Build Tools 与 Windows SDK。在仓库根目录先统一安装、构建一次：

```sh
npm ci
npm run build
```

Windows PowerShell 中使用 `npm.cmd ci`、`npm.cmd run build`，不依赖
PowerShell 对 npm 的 `.ps1` shim 的执行权限。之后选择一个案例运行。

**多 Harness 集成 Chat** 启动本机服务，直到停止前持续运行：

```sh
node examples/local-chat/main.ts .
```

打开 `http://127.0.0.1:3000`。`.` 表示真实存在的当前工作目录。选择 Harness
和模型、新建对话后发送消息；打开页面不会发送 Turn。Ctrl+C 关闭 Runtime。
Windows PowerShell 中如需限定 Harness、修改端口：

```powershell
$env:MUHA_HARNESSES = 'codex,pi'
$env:PORT = '3001'
node examples/local-chat/main.ts .
```

**AI 热点选题与写作** 全程在终端交互：

```sh
node examples/auto-social-media/main.ts
```

确认真实模型、工具操作与重试说明，配置选题 Agent，等待 `topic.md` 保存后，
独立配置写文 Agent。终端打印的 `examples/auto-social-media/workspaces/muha-social-*`
目录保留 `topic.md`、`article.md`、`provenance.json`，不会发布草稿。输入 `q`
或 Ctrl+C 停止并保留已有产出。单独指南也给出带空格的 Windows 产出路径写法。

仓库的 workspace 依赖需要先构建，这不是打包或发布。复制单文件到自己的
ESM 项目时，完整安装 `@muha-sdk/muha` 并遵循对应指南。认证、模型可用性、
原生权限及调用费用由使用者负责。

## 测试两个案例

构建后，在仓库根目录运行聚焦测试：

```sh
npm run test:examples
```

Windows PowerShell 使用 `npm.cmd run test:examples`。它自动收集所有
`*example*.test.mjs` 契约，Windows CI 的 Node 22.20.0、LTS、current
矩阵也会单独执行。Windows 与 Linux 的完整 `npm test` / `npm run check`
同样包含这些契约。

| 案例 | 受控覆盖 |
| --- | --- |
| Chat | 五种 Harness 的 HTTP/浏览器控制；真实 Core/Pi Adapter/固定 SDK 的文本流、会话历史与所属进程关闭，使用含中文和空格的路径。 |
| 选题写作 | 授权、配置、审批/追问、中断与失败；真实 SDK 配置 Skill、两个串行原生 Session、原样交接选题、保留产出与关闭 Runtime，使用 Windows CRLF 输入。 |

集成测试只连接本机受控 Provider，使用临时配置和本地 Skill 夹具，不依赖
原生 CLI、真实凭据、外网 Skill 下载或付费模型。这些测试验证示例集成，
完整 Harness/Capability 资格保持单独的范围。

## 目录与扩展示例

```text
examples/
  README.md
  README.zh-CN.md
  local-chat/
    main.ts
    README.md
    README.zh-CN.md
  auto-social-media/
    main.ts
    README.md
    README.zh-CN.md
```

后续新增场景时，与 `local-chat/` 并列创建有明确含义的 kebab-case 目录，
使用 `main.ts` 作为入口，`README.md` 作为说明，按需增加中文说明及场景资源。
不要创建未实现的占位示例，也不要将 examples 注册为 npm workspace。
详见[贡献约定](../CONTRIBUTING.md#examples)。

同步更新两份索引，说明准备步骤、仓库根目录下的启动命令、权限、费用与
资源清理。仅使用 SDK 公共 API，测试放在 `test/`，凭据与私有验收证据不要
放入示例目录。常规类型检查自动覆盖 `examples/**/*.ts`，默认使用受控测试。
