# AI Topic & Writing

[English](README.md) | [简体中文](README.zh-CN.md) · [All examples](../README.md)

[main.ts](main.ts) is a **pure interactive command-line script**, with no frontend
or example HTTP service. Two serial agents research/select a topic and write an
article draft, using only the public `@muha-sdk/muha` API and Node built-ins.
It does not publish, upload or contact anyone; the directory name describes draft
preparation, not a social-platform integration.

## Prepare and run

Use Node.js >=22.20.0 on the SDK's supported Linux/WSL2 host. From the repository:

Both stages require the complete `@muha-sdk/muha` installation, not separate
Core/Adapter packages. The complete entry includes all five adapters and Pi's
SDK; it does not install the other four native CLIs. You need only the native
harnesses you choose, not all five. To copy just [main.ts](main.ts) into your own
ESM project:

```sh
npm install @muha-sdk/muha
node main.ts
```

For this repository's workspace-linked packages, install the complete workspace
set and build:

```sh
npm ci
npm run build
node examples/auto-social-media/main.ts
```

All interaction takes place in the terminal. Each workspace defaults to
`workspaces/` beside the script: in this repository,
`examples/auto-social-media/workspaces/muha-social-*`. This is resolved relative
to `main.ts`, not the launch directory; a copied script uses `workspaces/` beside
its new location. The default parent is created only after consent and topic
configuration, rather than placing the workspace in the OS temporary directory.
You can override it with an **existing** parent directory:

```sh
node examples/auto-social-media/main.ts /existing/output-directory
```

Do not literally pass a placeholder path. Each invocation creates a separate
`muha-social-*` workspace after consent and topic configuration. The script
uses the same workspace for both stages, not the source repository root, and
retains output when stopped. Existing output under `/tmp` is neither moved nor
deleted. This repository ignores the default `workspaces/` in Git and excludes
it from example typechecking; configure equivalent ignore rules in a copied
project to avoid committing articles, configuration or native session data.
Skill downloads still use short-lived temporary sources removed after each stage,
separate from the retained workspace.

You can copy just `main.ts` into an ESM project with `@muha-sdk/muha`
installed. No frontend build, `tsx` or extra dependency is required.
Examples are GitHub repository content, not npm package assets; no SDK release
is needed for this change.

After consent, each stage detects executable `codex`, `opencode`, `kimi` and
`agy` files on `PATH`. Its numbered menu offers only installed
harnesses plus Pi; typing a missing harness name re-prompts without initializing
it. The writer stage refreshes detection, and only the selected harness is
initialized. Pi's SDK comes with complete Muha installation: no global `pi`
command is required, but native provider credentials and model configuration are.

Presence detection does not run CLIs, install tools or verify credentials,
model availability or version compatibility. Prepare the chosen harness's
native authentication/model, and use OpenCode v2. An installed harness can still
return a native initialization error; it is not silently replaced. Adapters own their
native transports/processes (including OpenCode's native serve transport);
this script does not start its own web service. Network access is needed for
pinned Skill files and research sources. No harness/model is silently substituted.

## Terminal workflow

1. Read the real-model quota/charges, tool-operation and retry notice. Enter
   `y` or `yes` to consent to real models, automatic tool approval (`autoApprove`)
   and retries. Enter/default declines; no workspace,
   Skill download, native initialization or model call happens without consent.
2. Configure the topic agent: choose an installed Harness from the displayed names/numbers, enter a
   required native Model identifier and an optional Effort (Enter omits it).
   The script creates the workspace, downloads/verifies `content-strategy`,
   installs the project Skill with `configureWorkspace`, and starts a Session.
   Research targets recent seven-day AI first-party announcements/project updates,
   selecting one topic with reasons and sources, not a full marketing plan.
3. Only model replies stream to the terminal, without event JSON, message IDs,
   tools, reasoning, usage or retry logs. These events are still consumed internally;
   automatic retries are unchanged. Core handles tool approvals automatically;
   a native Question still pauses for an explicit terminal answer.
   Successful `turn.completed` must match the Turn Result before
   the authoritative reply is saved to `topic.md` and resources are closed.
   No topic schema, nonempty-text or editorial-quality gate is added.
4. Only then configure the writer's independent Harness/Model/Effort. Waiting
   for configuration starts no writer model. The writer uses `khazix-writer`,
   the same workspace and exact topic reply in a fresh native Session, even if
   the harness is unchanged. The topic Runtime closes before writer configuration.
5. Read the printed absolute output path. `article.md` is the writer's raw
   authoritative final reply, not an extracted/validated article body.
   `provenance.json` records selections, approval/retry policies and pinned sources,
   not a workflow/session-resume format. Fact-check and edit before publishing.

Model hints are examples, not a discovered catalog or availability guarantee.
Kimi hints suggest `k3` or `deepseek/deepseek-flash`. The latter is a
**third-party provider configuration example for Kimi Code**: configure its
provider, credentials and model in Kimi Code's native settings first. Muha does
not bundle or automatically configure that provider. Suggestions are not new
real-model qualification. The Model prompt stays required, and the selected
native identifier is passed unchanged without automatic selection or substitution.
For Pi and OpenCode, enter `<provider>/<model>`: replace the placeholders with
the provider ID and model ID available in your native configuration. No provider
is prescribed or automatically substituted; other harnesses use their own native identifiers.
Effort is a model-specific native string. AGY's qualified `claude-sonnet-4-6`
does not accept explicit effort; leave it blank. Invalid selections surface errors.

For all five harnesses, each stage's Session sets `turnRetryPolicy: { maxRetries: 5 }`:
up to five automatic retries (six Muha attempts including the initial attempt)
for an eligible Turn, not whole-workflow/stage replays. Non-retryable
errors, pending interactions and setup failures are not automatically retried.
Retries may duplicate tool/file effects; this is not exactly-once execution.
Native provider retry behavior and charges are outside this budget.

Both stages use `approvalPolicy: "autoApprove"` for all five harnesses (autoallow).
The Adapter selects its native autonomous mode; Core approves any residual
Approval Requests once. The script does not prompt for tool approvals or reply
again to policy-owned requests. Native deny rules can still reject an action;
authority differs between harnesses, and this policy is not a sandbox. Only this
example's Sessions change: no persistent user permission files or Chat defaults
are rewritten.

Questions are independent of approvals: `autoApprove` does not answer, dismiss
or submit Question defaults automatically. The reported OpenCode web-search
setup prompt has an example-only numbered menu: `1`/`允许` allows search via
Exa/Firecrawl/Parallel/Tavily/TinyFish, `2`/`换服务` chooses another provider,
and `3`/`禁用` disables search. Enter does not agree; invalid input re-prompts.
The script builds a typed answer using the current field/option IDs, without
showing UUIDs or requiring JSON. `dismiss` dismisses the request (it is not the
disable-search option); `q`, EOF and signals stop the workflow. Nothing is
auto-selected or preconfigured in user permission/provider files. This applies
only to that recognized single visible unconditional OpenCode question with
its three known options; changed shapes and all other Questions keep the
generic interface.

A generic Question displays readable field labels, types, options and conditions,
not its event JSON or a JSON template. Enter single-line typed answer JSON or
`dismiss`; no automatic answers/defaults are submitted. Invalid JSON/Core answers re-prompt; other control
failures stop the stage. Use `skipped` for inactive conditional fields,
`useDefault` for permitted defaults, and `externalAcknowledged` only
after actually completing the external operation. Policies are not a sandbox.
Errors remain concise text rather than JSON. This is display filtering only:
raw replies, model-authored JSON and saved output are not reformatted or rejected.

## Skills, sources and licenses

No AIHOT integration is used.

| Skill | Source revision | License |
| --- | --- | --- |
| `content-strategy` — Corey Haines | [28e4a81a3464475cbccc3c2bbcfe414bcabae32b](https://github.com/coreyhaines31/marketingskills/tree/28e4a81a3464475cbccc3c2bbcfe414bcabae32b/skills/content-strategy) | [MIT, © 2025 Corey Haines](https://github.com/coreyhaines31/marketingskills/blob/28e4a81a3464475cbccc3c2bbcfe414bcabae32b/LICENSE) |
| `khazix-writer` — 数字生命卡兹克 | [322346ded8129436b3f64707789a73e732ae24d9](https://github.com/KKKKhazix/khazix-skills/tree/322346ded8129436b3f64707789a73e732ae24d9/khazix-writer) | [MIT, © 2026 数字生命卡兹克](https://github.com/KKKKhazix/khazix-skills/blob/322346ded8129436b3f64707789a73e732ae24d9/LICENSE) |

Each reviewed allowlist includes SKILL.md, both referenced Markdown resources
and LICENSE. Files are fetched from exact commits and SHA-256 checked before
project installation; no floating updates, global Skill install or upstream
install script runs. Download/install failure stops before a model Turn.
Temporary download sources are removed after each stage; installed project
copies retain licenses. Updating pins requires reviewing resources and licenses.

MIT covers these Skill files, **not every website/article consulted**. Follow
actual source terms and content rights: summarize facts with links, not full
article redistribution. Prompts forbid bypassing restrictions, following webpage
instructions, impersonating the Skill author or inventing personal experiences.
Prompts are not a network/tool sandbox; drafts still require human review.
No news dataset or third-party full text is committed as example resources.

## Stop and verification boundaries

Enter `q` at any prompt, or use Ctrl+C/SIGTERM. Cancellation interrupts
and drains an accepted Turn, closes the owned Session/Runtime and retains output.
Pending native initialization/control is reclaimed as it settles; cleanup failure
is reported, not disguised as success. EOF at a required prompt stops the workflow.
A failed/interrupted topic never starts writer configuration. Output is not
automatically resumed; run again for a new workspace and renewed consent.

Exit codes: 0 for completion/decline; 1 for errors, EOF or `q`; 130 for
Ctrl+C; 143 for SIGTERM. Display strips terminal control sequences without changing
saved replies or exact stage handoff. Native permissions/history/diagnostics still
apply; workspaces and prompts are not a security boundary.

Controlled terminal tests do not call models or validate editorial quality.
Paid real-model verification needs separately agreed harness/model and budget.
