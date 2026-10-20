# 多 Harness 集成 Chat

[English](README.md) | [简体中文](README.zh-CN.md) · [全部示例](../README.zh-CN.md)

[main.ts](main.ts) 在一个 TypeScript 文件中包含 Node HTTP 服务、HTML、CSS
与浏览器脚本，使用 `@muha-sdk/muha` 公共 API 和 Node 内置模块。
不需要单独的前端工程、Gradio 或前端构建工具。

发送消息会调用真实模型，可能消耗订阅额度或产生 Provider 费用；原生工具
也可能读写文件与执行命令。打开页面或创建“新对话”不会自动发送 Turn。

## 准备与启动

使用 Node.js >=22.20.0，宿主为 Linux x64（glibc）或原生 Windows x64。
请**完整安装 `@muha-sdk/muha`**，不要只安装 Core 或个别 Adapter。
完整包提供五种适配器及其 npm 依赖（包含 Pi SDK），但不会替你安装另外
四家的原生 CLI。只需安装自己要使用的 Harness，不要求五家全部安装。

复制单个 [main.ts](main.ts) 到自己的 ESM 项目后：

```sh
npm install @muha-sdk/muha
node main.ts .
```

从仓库根目录运行：

```sh
npm ci
npm run build
node examples/local-chat/main.ts .
```

原生 Windows 使用本分支的仓库构建；npm 包支持的平台以安装版本为准。
仓库构建需要 Visual Studio 2022 C++ Build Tools 与 Windows SDK。
Windows PowerShell 中执行：

```powershell
npm.cmd ci
npm.cmd run build
node examples/local-chat/main.ts .
```

使用 `npm.cmd` 不依赖 npm 的 PowerShell 脚本执行权限；显式传入含空格、
中文的项目路径时，用引号包住整个参数。

打开 `http://127.0.0.1:3000`。`.` 是真实存在的当前项目目录；也可以传入
另一个已存在的项目路径，不要照搬 `/absolute/project` 等占位路径。
已启用的任何 Harness 无法启动时，Runtime 初始化会失败，不会自动回退。

启动时检测 `PATH` 上可执行的 `codex`、`opencode`、`kimi`、
`agy`，只将已安装项与 Pi 加入 Runtime 和界面菜单。
缺失的 CLI 会在终端提示并省略，不会因未安装某家而要求补齐全部工具。
Pi SDK 随完整 Muha 安装，**无需全局 `pi` 命令**，仍需配置原生 provider
认证和模型。OpenCode 仍要求 v2。安装新的 CLI 后请重启示例。

检测只检查本地可执行文件，不运行 CLI、不自动安装、不验证认证或模型额度。
“已安装”不保证版本兼容或原生启动成功；已安装但无法就绪的 Harness 仍会
返回初始化错误，不静默回退。

只启用部分 Harness，或更换端口：

```sh
MUHA_HARNESSES=codex,pi PORT=3001 node examples/local-chat/main.ts .
```

上方环境变量语法用于 POSIX shell；Windows PowerShell 使用：

```powershell
$env:MUHA_HARNESSES = 'codex,pi'
$env:PORT = '3001'
$workspace = (Get-Location).Path
node examples/local-chat/main.ts "$workspace"
```

`MUHA_HARNESSES` 与本地检测结果取交集，不能强制启用缺失的原生 CLI。
交集为空时，在创建 Runtime 前给出准备提示；无效或重复名称仍报错。

只需复制 `main.ts`，无需额外示例文件。Node 原生类型擦除可以执行
该文件，无需安装 `tsx`，但不会代替 TypeScript 类型检查。
示例文件只在 GitHub 仓库中提供，不属于 SDK 的 npm 文件或导出。

## 对话与配置

- 左侧 harness、model、effort、approval policy 都是下一段对话的配置。
  修改选项不会改变当前 Session、对话区域或历史；右侧标题标识当前实际
  使用的 harness 和 model。
- 点击“新对话”创建并验证新的原生 Session。成功后才关闭旧句柄并切换
  聊天区域；创建失败会保留旧对话。即使返回同一种 Harness，也会新建
  对话，不会自动恢复之前的 Session 或迁移上下文。
- 运行中的 Turn 需要先停止，才能新建对话。运行期间可以准备下一段对话
  的配置；继续发送消息仍使用当前 Session。
- 没有“应用到当前会话”功能，UI 不会调用 idle model/effort setters。
  SDK 本身的相关 API 保持不变。新对话的空配置省略对应参数，使用原生默认。
- Model、effort 是各 Harness 的原生字符串。Model 输入提示只是示例，
  不是完整目录或可用性承诺，也支持自由输入。认证和订阅决定可用模型。
  Effort 与模型相关，没有跨 Harness 的统一枚举。
- Kimi 推荐 `k3` 或 `deepseek/deepseek-flash`。后者是 **Kimi Code 的第三方 provider 配置示例**，
  需先在 Kimi Code 原生配置中设置对应 provider、凭据与模型；Muha 不会自动配置或
  替换模型。页面切换到 Kimi 时显示该说明，提示不构成新的真实模型验收结论。
- AGY 不支持 idle setters；其已验收的 `claude-sonnet-4-6` 不接受显式
  effort，应留空。能力说明里的 `selectedOnly` 与 `effective` 区分仅选择
  和确认生效，不代表实时模型能力探测。
- 关闭句柄不删除原生历史或 Muha 私有诊断。刷新浏览器会丢失前端句柄与
  历史；服务器仍持有其 Session，重启服务会关闭这些句柄并重置数量上限。
  本例没有持久化 Session Reference、自动恢复或上下文导入功能。

## 事件、交互与停止

助手回复、推理、工具输入/更新/输出、用量、重试、审批、追问和终态默认
直接显示在聊天区域。流式 delta 合并到对应消息，保留前轮与中间消息，
不重复显示最终回复。Harness 未输出推理文本不算失败，完成状态以最终
Turn Result 为准，而非是否出现流式文本。

审批需要用户明确选择允许一次或拒绝。追问显示原生类型约束与可编辑的
JSON 答案模板，也可以明确 Dismiss；Core 校验失败后可以继续修改。
处理过的卡片保留在历史中，交互控件禁用。只有实际完成外部操作后，才能
提交 `externalAcknowledged`，不要将隐藏默认值读取或改写成普通文本。

Codex/OpenCode/Kimi 默认使用 `interactive`，Pi/AGY 默认使用
`harnessManaged`；策略在点击“新对话”时确定。默认不启用自动重试。
点击停止或断开流连接会中断当前 Turn，Ctrl+C 关闭 Runtime 及其进程。
致命 Harness 故障会关闭整个 Runtime，需要重启服务，不能仅靠新建对话恢复。

## 安全边界

这是本机、单用户的开发示例，不是沙箱或托管服务。原生工具可能读取和
修改项目文件、运行命令；`harnessManaged` / `autoApprove` 可能无需询问
直接执行工具，`autoDeny` 也不禁止从未发起审批的操作。
本例不配置 Skills/MCP，不编辑凭据或原生 feature。

服务只监听 `127.0.0.1`，启动时固定 workspace，检查 Host/Origin，API
使用每次运行生成的 token，不加载外部前端资源。请求体上限为 256 KiB，
最多持有 20 个对话；浏览器使用文本安全渲染。私有诊断沿用 Muha 原本的
存储与保留行为。能访问该页面的本机进程或用户也可使用服务，不要转发端口
或通过代理将其公开。

使用受控 HTTP/浏览器测试不会构成新的真实模型验收，也不需要执行 npm
发布或消费者应用测试。模型调用与费用仍需使用者自行授权和承担。

仓库构建后运行 `npm run test:examples`，PowerShell 使用
`npm.cmd run test:examples`。除五种 Harness 的 HTTP/浏览器夹具外，集成
测试通过本地受控 Provider 使用真实 Core/Pi Adapter/固定 SDK，验证含中文、
空格路径上的流式 Turn、原生会话历史与所属进程关闭。Windows CI 单独执行，
完整 SDK 检查也包含同一套测试，不需要真实凭据。
