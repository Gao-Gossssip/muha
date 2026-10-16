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

Use the SDK's supported Node.js/Linux environment and prepare the chosen native
harnesses as described in each example. From the repository root:

```sh
npm ci
npm run build
node examples/local-chat/main.ts .
```

`.` is the existing current workspace directory, not a placeholder. Building is
needed when using this repository's workspace-linked packages; it does **not**
pack or publish a release. If you copy an example to your own ESM project,
install `@muha-sdk/muha` from npm and follow its individual guide instead.
Native authentication, model availability, permissions and any provider charges
remain your responsibility. Starting the chat does not automatically send a Turn.

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
