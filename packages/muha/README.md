<h1 align="center">Muha</h1>

<p align="center">
  <strong>One TypeScript API for multiple coding agents.</strong>
</p>

<p align="center">Codex · OpenCode · Pi · Agy · ...</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@muha-sdk/muha"><img src="https://img.shields.io/npm/v/@muha-sdk/muha?style=flat-square&amp;color=3178c6" alt="npm version"></a>
  <a href="https://github.com/Gao-Gossssip/muha/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Gao-Gossssip/muha/ci.yml?branch=main&amp;style=flat-square&amp;label=CI" alt="CI status"></a>
  <a href="https://github.com/Gao-Gossssip/muha/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-64748b?style=flat-square" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#examples">Examples</a> ·
  <strong>English</strong> ·
  <a href="https://github.com/Gao-Gossssip/muha/blob/main/README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Gao-Gossssip/muha/main/assets/muha-banner.png" width="960" alt="One TypeScript API connects through Muha to Codex, OpenCode, Pi, Agy and other harnesses">
</p>

Muha is a lightweight TypeScript SDK for using coding agents in scripts and apps.
Choose harnesses and models, connect tasks in code, and keep their native capabilities.
A harness is a full agent runtime with models, tools, permissions, and history,
not just a model API.

## Why Muha

- **Task-aware spending** Use cost-effective models for routine work and stronger
  setups for difficult steps, combining existing subscriptions and providers.
- **Automated handoffs** Connect research, writing, and review in code, passing
  material and handling results without repeated terminal operations.
- **Less integration glue** Manage startup, sessions, events, and interactions
  across harnesses through one API instead of rebuilding each integration.

## How it works

- **Lightweight TypeScript API** Manage Sessions, Turns, streams, interactions,
  interruption, and opt-in retries in ordinary Node.js code, without a workflow DSL.
- **Explicit Session creation and resumption** Choose a harness, workspace, and
  supported model settings with `createSession`. Reuse Sessions for ongoing tasks,
  or save a reference and restore native context with `resumeSession`.
- **Structured Questions** Receive agent follow-up questions as events, with
  typed choices, text, numbers, and other inputs. Collect answers through a
  terminal, chat interface, or form.
- **Workspace Skills and MCP** Use `configureWorkspace` to write Skill sources
  and MCP Server settings into the selected harnesses' native project files,
  ready for Sessions in that workspace.
- **No extra deployment** No separate Muha server, container platform, or
  additional sandbox layer is required. Adapters may manage local helpers or native
  services; Muha is not a security isolation boundary.

## What you can build

- **Flexible workflows** Reuse Sessions for ongoing context or create a fresh
  Session per independent task. A Session permits one active Turn at a time;
  parallel tasks use separate Sessions.
- **Harness and model comparisons** Run the same task in separate Sessions for
  evaluations, prompt experiments, or cross-checks. Your application supplies
  scoring and cost estimates; Muha supplies a common execution API.
- **Agent-led orchestration** Expose Muha as tools or scripts so an orchestrator
  harness can delegate to others and collect results. Your code owns routing,
  planning, and scheduling.
- **Applications and scripts** Build chat, research-to-draft pipelines,
  code-review tools, or batch file processing with the same execution controls.

## Boundaries

- Muha is not a built-in workflow scheduler or orchestrator.
- A Session stays bound to its harness and workspace; switching harnesses requires
  a new Session, without automatic conversation-history migration.
- Muha uses each harness's configured API provider or subscription. It provides
  no common API for switching providers and does not automatically select the cheapest model.
- Optional features follow each harness's capability declaration. A common API
  does not promise identical capabilities or outputs.

## Install

Supports **Windows and Linux**. macOS is not currently supported.

```sh
npm install @muha-sdk/muha
```

**A one-line prompt for your agent:**

> Read <https://github.com/Gao-Gossssip/muha>, install the project, and check which Harness CLIs are available in the current environment.

## Quick start

With Codex installed and signed in, save this as `example.mjs`:

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

The example denies tool actions that request approval and dismisses follow-up
questions. Choose a supported approval policy and handle questions for your
workflow; policy details differ between agents.

## Examples

Browse the [examples catalog](https://github.com/Gao-Gossssip/muha/blob/main/examples/README.md) for runnable scenarios, each
with its own source and setup guide.

Both examples require the complete `@muha-sdk/muha` installation and offer only
locally installed harnesses; installing all native CLIs is unnecessary. Pi's SDK
comes with Muha, while other harnesses need their native CLI on `PATH`.

| Project | Overview | Location |
| --- | --- | --- |
| [Multi-Harness Chat](https://github.com/Gao-Gossssip/muha/blob/main/examples/local-chat/README.md) | Single-file server and chat UI: five adapters, native model/effort, inline Turn events, approvals, Questions and interruption. Settings apply to new conversations only. | [examples/local-chat/](https://github.com/Gao-Gossssip/muha/blob/main/examples/local-chat/) |
| [AI Topic & Writing](https://github.com/Gao-Gossssip/muha/blob/main/examples/auto-social-media/README.md) | Interactive command-line research-to-draft workflow using `content-strategy` and `khazix-writer`. Independently choose each agent's harness/model/effort, stream model replies in the terminal and inspect the retained workspace. Real models require explicit consent. | [examples/auto-social-media/](https://github.com/Gao-Gossssip/muha/blob/main/examples/auto-social-media/) |

Examples live in this GitHub repository, not the npm package. Adding examples
does not require a new SDK release. See [example contribution guidance](https://github.com/Gao-Gossssip/muha/blob/main/CONTRIBUTING.md#examples).

## Install only what you need

If you prefer a smaller dependency set:

```sh
npm install @muha-sdk/core @muha-sdk/pi-adapter
```

Import directly from those packages and keep them on the same Muha release.

## Troubleshooting

If an enabled agent cannot start, check its native tool is on `PATH` and its
authentication is configured. If your package manager blocks dependency install
scripts, review its reported dependencies and script policy. Keep normal install
behavior for dependencies;
compiling Muha from source is not a required setup step.

## Contributing

See [CONTRIBUTING.md](https://github.com/Gao-Gossssip/muha/blob/main/CONTRIBUTING.md) for development and tests.
Report problems in [GitHub Issues](https://github.com/Gao-Gossssip/muha/issues).
Security reports: [SECURITY.md](https://github.com/Gao-Gossssip/muha/blob/main/SECURITY.md). Licensed under [MIT](https://github.com/Gao-Gossssip/muha/blob/main/LICENSE).

## Available models

```js
const models = await runtime.listModels({ harness: "codex", workspacePath: process.cwd() });
// Use the same call with opencode, kimi, pi, or agy when enabled.
console.log(models.map(({ id, name, supportedEfforts, defaultEffort }) => ({
  id, name, supportedEfforts, defaultEffort,
})));
```

`listModels` reads the enabled Harness's native selectable chat-model catalog.
It requires an existing Workspace and does not create a Session, run inference,
or change model defaults. The result is a deeply frozen, JSON-safe array; each
native `id` can be passed unchanged to that Harness's model selection APIs.
Optional `name`, `description`, `supportedEfforts`, and `defaultEffort` appear only
when reported natively. Effort values retain their Harness-specific meaning.

`model.supportedEfforts` contains the native values accepted by `effort` at
Session creation/resumption or by idle `session.setEffort(value)`, subject to the
Harness's `effort.selectionAt` capability. An omitted field means the catalog
does not report this information; `[]` means it explicitly reports no selectable
values. A value such as `"off"` remains a selectable native value. `defaultEffort`
is a catalog default when supplied, not the current Session's effort.

| Harness | `supportedEfforts` source | `defaultEffort` source |
| --- | --- | --- |
| Codex | Native supported reasoning efforts | Native default reasoning effort |
| OpenCode | Workspace model variant IDs | Not reported |
| Kimi | Native supported thinking efforts | Native default effort, when reported |
| Pi | SDK per-model thinking levels, including custom mappings | Not reported |
| AGY | Not reported by the supported `agy models` output | Not reported |

Select a listed value directly; Muha does not normalize levels across Harnesses
or derive them from model names. Query again after changing native configuration.

```js
const model = models.find(model => model.id === session.model);
const effort = model?.supportedEfforts?.[0];
if (effort !== undefined &&
    runtime.getHarnessCapabilities("codex").effort.selectionAt.includes("idleSession")) {
  await session.setEffort(effort); // Between Turns; applies to the next Turn.
}
```

A successful empty catalog returns `[]`; query and format failures reject.
Catalogs reflect native configuration/authentication and native caching, and do
not guarantee credentials, quota, or the success of a later model request.
The static declaration is `runtime.getHarnessCapabilities(harness).model.listing`.

For Codex, OpenCode, Kimi, and Pi, use `await session.setModel(id)` between Turns
to retain the same conversation with a different model. This clears the previous
explicit effort selection; the Harness may apply its native default. AGY model
selection remains limited to create/resume; its idle setter is unsupported.

## SDK 0.1.18 security note

The included Pi SDK 1.2.0 pins undici 8.10.2, retaining known denial-of-service,
Subresource Integrity, cache poisoning/data disclosure and TLS-validation risks
under an exception limited to this release:
[GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685),
[GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472),
[GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c),
[GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26),
[GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx),
[GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm),
[GHSA-9fm3-97px-rjf6](https://github.com/advisories/GHSA-9fm3-97px-rjf6), and
[GHSA-55wc-3pg8-jfw6](https://github.com/advisories/GHSA-55wc-3pg8-jfw6).
See the [release exception](https://github.com/Gao-Gossssip/muha/blob/main/RELEASING.md#sdk-0118-production-audit-exception) for its exact scope.
