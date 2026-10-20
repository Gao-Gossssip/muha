# Examples

[English](README.md) | [简体中文](README.zh-CN.md) · [Muha](../README.md)

Runnable examples using the public `@muha-sdk/muha` API. Each scenario has its
own directory, TypeScript entry and setup guide. Examples belong to this GitHub
repository; they are not npm packages, package exports or npm installation assets.
Updating an example does not require a new SDK version or npm release.

Both examples require the **complete `@muha-sdk/muha` installation**, not only
Core or selected Adapter packages. In your own ESM project use
`npm install @muha-sdk/muha`; in this repository use `npm ci` and the build below.
Each example offers only locally installed harnesses. Codex, OpenCode, Kimi and
AGY are detected as executable CLI files on `PATH`; Pi's SDK comes with the
complete package, without requiring a global `pi` command. You do not need to
install all native CLIs. Detection does not verify authentication or models.

## Available examples

| Project | Overview | Location |
| --- | --- | --- |
| [Multi-Harness Chat](local-chat/README.md) | Single-file server and browser chat using installed harnesses from the five adapters, native model/effort, inline Turn events, approvals, Questions and interruption. Configuration applies only to a new conversation. | [local-chat/](local-chat/) · [main.ts](local-chat/main.ts) |
| [AI Topic & Writing](auto-social-media/README.md) | Pure command-line interaction: two independently configured agents use `content-strategy` for research/topic selection and `khazix-writer` for a draft. Single TS file, model-reply streams without Tool/event logs, bounded retry and retained output; explicit real-model consent, no auto-publishing. | [auto-social-media/](auto-social-media/) · [main.ts](auto-social-media/main.ts) |

## Run from the repository

Use Node.js >=22.20.0 on Linux x64 (glibc) or native Windows x64. Prepare the
chosen harnesses as described in each guide. These Windows instructions use this
branch's repository build; npm package support depends on the installed release.
Building on Windows requires Visual Studio 2022 C++ Build Tools and a Windows SDK.
From the repository root, install and build once:

```sh
npm ci
npm run build
```

In Windows PowerShell, use `npm.cmd ci` and `npm.cmd run build` to avoid depending
on PowerShell's permission to execute npm's `.ps1` shim. Then choose one case:

**Multi-Harness Chat** starts a loopback server and keeps running until stopped:

```sh
node examples/local-chat/main.ts .
```

Open `http://127.0.0.1:3000`. `.` uses the existing current workspace. Select a
harness/model, create a conversation, then send a message. Page loading does not
send a Turn. Ctrl+C closes the Runtime. For a subset and a different port in
Windows PowerShell:

```powershell
$env:MUHA_HARNESSES = 'codex,pi'
$env:PORT = '3001'
node examples/local-chat/main.ts .
```

**AI Topic & Writing** runs entirely in the terminal:

```sh
node examples/auto-social-media/main.ts
```

Confirm the real-model/tool/retry notice, configure the topic agent, wait for
`topic.md`, then configure the writer independently. The printed output directory
under `examples/auto-social-media/workspaces/muha-social-*` retains `topic.md`,
`article.md` and `provenance.json`; it does not publish the draft. Enter `q` or
Ctrl+C to stop and keep existing output. Its guide also shows a quoted Windows
output path with spaces.

Building workspace-linked packages does not pack or publish a release. For a
copied standalone file, install the complete `@muha-sdk/muha` in an ESM project
and follow its guide. Native authentication, models, permissions and provider
charges remain the user's responsibility.

## Test both cases

After the build, run the focused suite from the repository root:

```sh
npm run test:examples
```

Use `npm.cmd run test:examples` in Windows PowerShell. It discovers all
`*example*.test.mjs` contracts and is also run explicitly by the Windows CI
matrix (Node 22.20.0, LTS and current). The full `npm test` / `npm run check`
suite includes the same contracts on Windows and Linux.

| Case | Controlled coverage |
| --- | --- |
| Chat | HTTP/browser controls for all five harnesses; real Core/Pi Adapter/pinned SDK text streaming, conversation history and owned close, on a Chinese path with spaces. |
| Topic & Writing | Consent, selection, approvals/Questions, cancellation and failures; real SDK Skill configuration, two serial native Sessions, exact topic handoff, retained files and Runtime close, with Windows CRLF input. |

Integration tests use only a loopback provider, temporary configuration and local
Skill fixtures. They do not require installed native CLIs, real credentials,
external Skill downloads or paid models. They verify example integration; the
full harness/capability qualification retains its separate scope.

## Layout and adding examples

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

For another scenario, create one descriptive kebab-case directory alongside
`local-chat/`, with `main.ts` as the runnable entry and `README.md` as its guide.
Keep any scenario-specific files inside that directory; add a Chinese guide
where useful. Do not introduce empty placeholder scenarios or an npm workspace
for examples. See [contribution guidance](../CONTRIBUTING.md#examples).

Update both catalogs and document setup, the root-relative command, native
permissions/costs and cleanup. Use public SDK imports; keep verification under
`test/` and private credentials/evidence outside examples. Regular typecheck
automatically includes `examples/**/*.ts`; use controlled tests by default.
