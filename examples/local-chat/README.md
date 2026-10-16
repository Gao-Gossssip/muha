# Multi-Harness Chat

[English](README.md) | [简体中文](README.zh-CN.md) · [All examples](../README.md)

[main.ts](main.ts) contains the entire Node HTTP server, HTML, CSS and browser
JavaScript. It uses the public `@muha-sdk/muha` API and Node built-ins only.
There is no frontend build, Gradio dependency or separate frontend file.

Sending a message calls a **real model** and can consume subscription quota or
incur provider charges. Native tools can also read/write files and run commands.
Opening the page or creating a conversation does not automatically send a Turn.

## Complete Muha installation

Install the complete `@muha-sdk/muha` entry package, not individual Core/Adapter
packages. It includes all five adapters and their npm dependencies, including
Pi's SDK. It does **not** install Codex, OpenCode, Kimi or AGY's native CLI.
You need only the native harnesses you want to use, not all five.

To use the standalone file in your own ESM project:

```sh
npm install @muha-sdk/muha
node main.ts .
```

Copy [main.ts](main.ts) into that project first. For workspace-linked packages in
this repository, install the complete workspace set and build instead:

From this repository (Node.js 22.20.0 or newer, supported Linux/WSL2):

```sh
npm ci
npm run build
node examples/local-chat/main.ts .
```

Here `.` uses the existing current directory as the workspace. You can instead
pass the path of another **existing project directory**; do not literally use a
placeholder such as `/absolute/project`. Open `http://127.0.0.1:3000`.
At startup the example finds executable `codex`, `opencode`, `kimi` and
`agy` files on `PATH`, and enables only those installed harnesses plus
Pi. Pi's SDK comes with complete Muha installation; no global `pi` command is
needed. The browser menu contains only the enabled subset, and missing CLIs are
reported and omitted before Runtime initialization. OpenCode must still be v2.

Discovery checks installation presence only: it does not run CLIs, install
tools or verify authentication/model availability. Configure credentials and
models for the harnesses you use. An installed but unready/incompatible harness
still fails Runtime initialization; no silent fallback is added. Restart after
installing another CLI. Optionally narrow the installed subset or change ports:

```sh
MUHA_HARNESSES=codex,pi PORT=3001 node examples/local-chat/main.ts .
```

`MUHA_HARNESSES` is intersected with local installations; it cannot force an
absent CLI into the menu. If none of the requested harnesses is installed, startup
stops with setup guidance before creating a Runtime. Invalid/duplicate names
remain errors. Pi still needs its native provider credentials and model configuration.

Only **`main.ts`** is needed in your ESM project. Node's built-in
[TypeScript type stripping](https://nodejs.org/download/release/v22.20.0/docs/api/typescript.html#type-stripping)
executes the file; it does not perform type checking. No `tsx` installation is
needed. The example is repository content, not an extra npm package/export.

## Conversation and selection behavior

- A Session is bound to one harness and workspace. All left-side controls are
  **draft configuration for a new conversation**. Changing harness, model,
  effort or policy does not alter the active Session, chat area or history.
  The conversation header identifies the currently active harness/model.
- Click **“新对话”** to create and validate a new native Session. Only after
  success does the UI close the previous live handle and replace the chat area.
  Failed creation keeps the previous Session and visible history intact.
  Returning to a previously selected harness starts a fresh native conversation;
  it does not automatically resume its old Session or transfer context.
  Stop an active Turn before starting a new conversation. You may prepare draft
  settings while the current Turn is running; sending still uses the active Session.
- Model and effort are **opaque native strings**. Enter any native identifier;
  the model datalist contains illustrative values, not a discovered catalog,
  availability guarantee or complete list. Blank on a new Session omits the
  option and uses native configuration. Authentication/subscriptions determine
  which models actually work. No Muha model alias or effort normalization exists.
- Kimi suggestions are `k3` or `deepseek/deepseek-flash`. The latter is a
  **third-party provider configuration example for Kimi Code**: set up its
  provider, credentials and model in Kimi Code's native settings first. Muha
  does not automatically configure it or substitute models. Selecting Kimi
  displays this explanation; hints do not constitute new real-model qualification.
- There is no “Apply to current Session” action. Models and efforts are supplied
  only when clicking “新对话”; they never invoke idle setters from this UI.
  Blank configuration on the new conversation selects native defaults.
  The SDK's idle-setter API and behavior remain unchanged.
- AGY has create/resume-only model/effort selection, not idle setters. Start a
  new conversation to change them. Its accepted `claude-sonnet-4-6` model does
  not accept explicit effort; leave effort blank. Other harnesses' accepted
  effort values are also model-dependent, not the same universal dropdown.
- Profiles and `selectedOnly` versus `effective` observation are visible in
  the page. A Profile permits an operation; it is not a live model capability
  probe. Invalid selections return the underlying structured SDK error.
- “新对话” closes the old live handle and clears its browser display on success;
  it does not delete native history or diagnostics. Browser refresh loses the
  browser's handles/history; the server retains its owned Sessions until closed.
  Restarting the server closes those handles and resets the conversation limit.
  This example does not implement persisted Session References, automatic resume
  or context import.

## Turns, permissions and safety

Assistant output and **public Turn events appear directly in the chat by
default**, without a separate collapsed round-event panel. Inline cards display
reasoning, tool input/updates/output, usage, retries, interaction requests and
terminal outcomes when emitted. Streaming deltas update their corresponding
message/reasoning block instead of creating a card for every token. Earlier
rounds and intermediate assistant messages stay visible until a successful new
conversation; the authoritative final message is not duplicated. Missing
reasoning is not an error. Completion uses the final Turn Result, not deltas.
Stopping or disconnecting interrupts the owned Turn. Ctrl+C closes the Runtime
and its processes. A fatal harness loss closes the whole Runtime, not just its
conversation; restart the example to continue. No automatic retry is enabled.

Choose a declared approval policy before clicking “新对话”. Codex/OpenCode/Kimi
default to `interactive`; Pi/AGY to `harnessManaged`. Approvals require an explicit
one-shot decision, inline in the chat. Questions show their typed constraints and
an editable answer JSON template, or can be explicitly dismissed. This keeps all public Question
types/conditions/private defaults accessible without flattening them into text;
Core validates responses and invalid responses remain editable. Resolved request
cards remain as history with disabled controls. Do not submit
`externalAcknowledged` until the external action really happened.

This is a **local, single-user development example, not a sandbox or hosted
service**. Harness tools can read/edit your launch workspace and execute native
commands according to their native rules. `harnessManaged` and `autoApprove`
may run tools without asking; `autoDeny` does not deny actions that never request
approval. The example does not configure Skills/MCP or edit credentials/features.

The server listens only on `127.0.0.1`, fixes the workspace at launch, checks
Host/Origin, requires a per-run API token, and loads no external frontend assets.
It limits request bodies to 256 KiB and live conversations to 20. Browser data
uses text-safe rendering; native private diagnostics remain under Muha's normal
storage/retention behavior. Other local processes/users with access to the page
can use this server; do not forward its port or expose it through a proxy.

Controlled HTTP/browser tests do not constitute new paid harness qualification.
No real model calls, publication or consumer application tests are required to
run the example's controlled contract suite.
