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

使用 SDK 支持的 Node.js/Linux 环境，并按示例要求准备原生 Harness。
在仓库根目录执行：

```sh
npm ci
npm run build
node examples/local-chat/main.ts .
```

`.` 表示真实存在的当前工作目录。仓库中的依赖通过 workspace 链接到本地包，
因此需要先构建；这不是打包或发布。将示例复制到自己的 ESM 项目时，改为
通过 npm 安装 `@muha-sdk/muha`，并遵循对应示例说明，无需构建 Muha 仓库。

认证、模型可用性、原生权限及模型调用费用由使用者负责；聊天服务启动后
不会自动发送 Turn。

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
