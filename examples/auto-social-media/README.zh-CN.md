# AI 热点选题与写作

[English](README.md) | [简体中文](README.zh-CN.md) · [全部示例](../README.zh-CN.md)

[main.ts](main.ts) 是**纯命令行交互脚本**，没有前端，也不起示例 HTTP 服务。
两个 Agent 串行完成选题和文章草稿，仅使用 `@muha-sdk/muha` 公开 API 与
Node 内置模块。不发布、不上传、不对外联系；目录名不代表对接了社交平台。

## 准备与运行

使用 Node.js >=22.20.0，宿主环境为 SDK 支持的 Linux/WSL2。
请**完整安装 `@muha-sdk/muha`**，不要只安装 Core 或个别 Adapter。
完整包提供五种适配器及 Pi SDK，不会安装其他四家的原生 CLI；
只需准备自己要使用的 Harness，不要求五家全部安装。

复制单个 [main.ts](main.ts) 到自己的 ESM 项目后：

```sh
npm install @muha-sdk/muha
node main.ts
```

使用仓库的 workspace 本地包时，在根目录完整安装依赖并构建：

```sh
npm ci
npm run build
node examples/auto-social-media/main.ts
```

全程在终端交互。默认在脚本旁的 `workspaces/` 下生成独立工作目录；
在本仓库中即 `examples/auto-social-media/workspaces/muha-social-*`。
该路径按 `main.ts` 的位置解析，不受启动时的当前目录影响；复制脚本到其他
ESM 项目后，则使用新脚本旁的 `workspaces/`。默认父目录在确认授权并完成
选题配置后自动创建，不再将 workspace 放在系统临时目录。
也可指定一个**已存在**的父目录覆盖默认位置：

```sh
node examples/auto-social-media/main.ts /existing/output-directory
```

不要照抄占位路径。每次运行在确认授权并完成选题配置后，新建一个
`muha-social-*` 工作目录，选题与写文共用该目录，不把源码仓库根目录作为
Agent 工作目录。停止后保留产出，不会自动删除或搬迁先前 `/tmp` 中的产出。
本仓库已将默认 `workspaces/` 加入 Git 忽略，并从示例 typecheck 中排除；
复制到自己的项目后，请按需配置忽略规则，勿提交文章、配置或原生会话数据。
Skill 下载仍使用短期临时目录，阶段结束后清理，与保留的 workspace 无关。

可将单个 `main.ts` 复制到安装了 `@muha-sdk/muha` 的 ESM 项目；
无需前端构建、`tsx` 或额外依赖。示例只丰富 GitHub 内容，不包含在 npm
包中，本次修改不需要发布 SDK。

确认授权后，每个阶段检查 `PATH` 上可执行的 `codex`、`opencode`、
`kimi`、`agy`，仅列出已安装项与 Pi，并按实际列表编号。
手动输入未安装的名称会要求重新选择，不初始化它；写文阶段重新检测。
只初始化当前阶段选中的 Harness。Pi SDK 随完整 Muha 安装，**无需全局
`pi` 命令**，仍需准备其 provider 凭据与模型。

检测只检查本地可执行文件，不运行 CLI、不自动安装、不检查认证、模型额度
或版本兼容性。请事先配置所选 Harness 的认证与可用模型；OpenCode 仍要求 v2。
已安装但无法就绪的工具仍返回初始化错误，不自动回退。
Adapter 仍管理必要的原生传输和子进程（包括 OpenCode 原生 serve），
但示例本身不提供 Web 服务。下载 Skill、调研资料需要网络，不会静默替换模型或 Harness。

## 命令行流程

1. 阅读真实模型额度/费用、工具操作与重试说明，输入 `y` 或 `yes`
   明确同意真实模型、自动允许工具操作（`autoApprove`）和重试。
   直接 Enter 默认拒绝；未确认时不创建工作目录、下载 Skill、初始化原生工具或调用模型。
2. 配置选题 Agent：输入菜单中已安装 Harness 的编号或名称，必填原生 Model，
   Effort 可选、Enter 留空。脚本自动创建工作目录，下载并校验 `content-strategy`，
   通过 `configureWorkspace` 安装项目级 Skill，再创建 Session。
   选题聚焦最近七天 AI 官方发布、项目更新等一手来源，直接选定主题并附推荐理由、素材与链接，
   不要求完整营销计划，也不声称掌握真实热度榜。
3. 仅将模型回复流式写入终端，不打印事件 JSON、消息 ID、工具、推理、用量或重试日志。
   其他事件仍在内部消费，自动重试不变；工具审批由 Core 自动处理，原生 Question
   追问仍使用简短文字并等待明确回答。
   仅在 `turn.completed` 与 Turn Result
   一致、原样保存 `topic.md` 并完成资源清理后进入写文配置；
   不新增格式、非空内容或编辑质量校验。Turn 成功不等于编辑质量合格。
4. 配置写文 Agent 独立的 Harness/Model/Effort，等待配置时不调用写文模型。
   使用 `khazix-writer`、相同工作目录和原样选题回复，创建全新原生 Session。
   即便两阶段使用同一 Harness，也不迁移原生历史；选题 Runtime 在写文配置前关闭。
5. 打开终端打印的绝对目录。`article.md` 是写文最终回复原文，不是程序提取、
   校验后的正文。`provenance.json` 记录配置、审批/重试策略与固定 Skill 来源，
   不是恢复会话格式。核查资料、修改并人工终审后再自行发布。

Model 提示不是动态模型目录或可用性保证。Kimi 推荐 `k3` 或
`deepseek/deepseek-flash`；后者是 **Kimi Code 的第三方 provider 配置示例**，
需先在 Kimi Code 原生配置中设置对应 provider、凭据与模型，不是 Muha 内置或
自动配置的 provider。提示不构成新的真实模型验收结论。
Model 仍必填，原生标识原样传入，不会自动选择或替换。
Pi 和 OpenCode 使用 `<provider>/<model>`：
将占位符替换为原生配置中可用的 provider ID 和 model ID，不指定或自动替换提供方。
其他 Harness 使用各自的原生模型标识。Effort 为模型原生参数，
AGY 已验收的 `claude-sonnet-4-6` 不接受显式 Effort，请留空。
不支持或无效的配置返回错误，不自动降级。

五种 Harness 的每阶段 Session 均使用 `turnRetryPolicy: { maxRetries: 5 }`：
符合条件的单个 Turn 最多自动重试五次，含首次执行共最多六次 Muha 尝试，
不重跑整个工作流或阶段配置。
不可重试错误、待处理交互和初始化/Skill 安装失败不会自动重试。
工具操作、输出或文件副作用可能重复，不提供 exactly-once 保证；原生 provider
的重试行为与费用不属于该预算。

两阶段、五种 Harness 统一使用 `approvalPolicy: "autoApprove"`（autoallow）。
Adapter 选择原生自主执行模式，Core 对剩余原生 Approval Request 自动允许一次。
脚本不再逐项询问工具审批，也不重复响应已由策略处理的请求。
原生拒绝规则仍可能拒绝操作，不同 Harness 的权限并不等价，这不是沙箱。
仅调整本示例的 Session 配置，不改写持久用户权限文件，也不改变 Chat 示例的默认策略。

Question 与审批不同：`autoApprove` 不会代答、自动 dismiss 或提交追问默认值。
OpenCode 本次报告的联网搜索设置问题采用专用编号菜单：输入 `1` 或 `允许`，
允许使用 Exa/Firecrawl/Parallel/Tavily/TinyFish；`2` 或 `换服务` 选择其他服务；
`3` 或 `禁用` 关闭搜索。Enter 不会自动同意，无效输入会重新提示。
脚本绑定当前问题与选项的真实 ID，在内部生成类型化答案，不展示 UUID，
也不要求用户手写 JSON。`dismiss` 跳过整个问题，不等同于“禁用搜索”；
`q`、EOF 或信号仍会停止并清理资源。不自动选择、不预配置用户权限或 provider 文件。
仅匹配这一条可见、无条件、无自定义输入的 OpenCode 单选题及三个已知选项；
结构变化或其他 Question 保留通用交互。

其他 Question 用文字展示公开问题、类型、选项和条件，不打印事件 JSON 或 JSON 模板；
仍输入单行类型化答案 JSON 或 `dismiss`，不自动回答或提交默认值。
JSON 或 Core 校验不通过可重新输入，其他控制错误停止阶段。
条件不满足的字段用 `skipped`，许可的默认值用 `useDefault`；
`externalAcknowledged` 只能在实际完成外部操作后提交。权限策略不是沙箱。
错误也只用文字提示，不输出 JSON。这里只过滤展示：不改写、拒绝模型本身输出的 JSON，
保存原文和跨阶段交接仍保持不变。

## Skill 来源与许可

不集成 AIHOT。两个 Skill 的来源、固定提交与许可：

| Skill | 固定来源提交 | 许可 |
| --- | --- | --- |
| `content-strategy` — Corey Haines | [28e4a81a3464475cbccc3c2bbcfe414bcabae32b](https://github.com/coreyhaines31/marketingskills/tree/28e4a81a3464475cbccc3c2bbcfe414bcabae32b/skills/content-strategy) | [MIT, © 2025 Corey Haines](https://github.com/coreyhaines31/marketingskills/blob/28e4a81a3464475cbccc3c2bbcfe414bcabae32b/LICENSE) |
| `khazix-writer` — 数字生命卡兹克 | [322346ded8129436b3f64707789a73e732ae24d9](https://github.com/KKKKhazix/khazix-skills/tree/322346ded8129436b3f64707789a73e732ae24d9/khazix-writer) | [MIT, © 2026 数字生命卡兹克](https://github.com/KKKKhazix/khazix-skills/blob/322346ded8129436b3f64707789a73e732ae24d9/LICENSE) |

每个固定清单包含 SKILL.md、两份引用资源和 LICENSE。按精确提交下载、
SHA-256 校验后安装项目副本，不跟随浮动版本、不安装全局 Skill、不执行上游安装脚本。
下载、校验或安装失败则不启动模型 Turn。阶段结束清理临时下载源，
工作目录中的安装副本及许可证保留。更新固定提交时需重新审查资源与许可。

MIT 仅覆盖这些 Skill 文件，**不代表联网读取的所有网页或文章可自由转载**。
仍需遵守实际来源的条款与版权，使用事实总结和链接，不再分发第三方全文。
提示词禁止绕过访问限制、执行网页指令、冒充原作者或编造个人经历，但不是网络/工具沙箱。
草稿须人工终审，不把新闻数据或第三方全文提交为示例资源。

## 停止与验收边界

任意提示输入 `q`，或按 Ctrl+C/发送 SIGTERM，可停止流程。
中断后排空已接受 Turn 的事件、关闭所属 Session/Runtime，保留产出。
已在等待的原生初始化或控制操作在返回后回收；清理失败明确报告，不宣称成功。
必填提示遇到 EOF 时停止。选题失败或中断不进入写文配置，不自动恢复；
重新运行会创建新目录并再次要求授权。

退出码：完成/拒绝授权为 0，错误、EOF 或 `q` 为 1，
Ctrl+C 为 130，SIGTERM 为 143。仅终端展示移除控制字符，
保存原文与跨阶段交接不变。原生权限、历史记录与诊断保留机制仍适用；
工作目录和提示词不是安全隔离。

受控命令行测试不调用真实模型，也不证明选题或写作质量。
付费真实测试须另行确定 Harness、Model 与预算。
