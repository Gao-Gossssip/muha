# Contributing

Use [Gao-Sijie/muha Issues](https://github.com/Gao-Sijie/muha/issues) for SDK work.
Read [CONTEXT.md](CONTEXT.md) and [qualification and exceptions](QUALIFICATION.md)
before changing behavior; the public API, static Profiles and native behavior
are contractual. Consult relevant local `docs/adr/` decisions when available.

## Develop

Requires Node.js >=22.20.0 on Linux x64 glibc, a C compiler and `readelf`.
Consumers install prebuilt Muha packages from npm; these commands are for contributors.
CI uses Ubuntu 22.04 as its qualified compiler host and enforces glibc 2.28 as
the native helper ABI floor.

```sh
npm ci
npm run clean
npm run build
npm run typecheck
npm run check
```

Use controlled fixtures at
Harness/provider process boundaries; verify public Runtime/Session/Turn behavior
and isolated package installation, rather than adding a public testing interface.
Run the affected test first and full `npm run check` before handoff. Preserve
resource/permission, ESM, declarations, ordinary dependency and cleanup guarantees.

This repository is the sole development source for the `@muha-sdk/muha` entry package,
Core and five official Adapters; Orchestrator belongs in its separate private project.
The seven SDK packages share one release version and public npm metadata; the root
workspace remains `private:true`. Publishing requires a clean, verified source
candidate and the controlled release workflow. Do not add Orchestrator workspaces or
copy private diagnostics into this SDK. Real models require explicit approval;
unchanged source can retain [qualified evidence and limitations](QUALIFICATION.md).

Plans, historical ADRs and private evidence stay in ignored local `docs/` and
`.scratch/` paths. Preserve local documents when removing their Git tracking.
New commits contain no `docs/` directory at any depth. Run
`npm run check:repository` before committing; CI checks the committed tree too.

See [RELEASING.md](RELEASING.md) for reviewed candidates, npm publication and
public Registry consumer acceptance.

## Examples

Examples are GitHub repository content outside the seven npm packages. Put a new
scenario in `examples/<kebab-case-name>/`, with `main.ts` as its entry and
`README.md` as its setup/run guide; add `README.zh-CN.md` where useful. Keep
scenario resources in that directory, use public SDK imports, and do not create
an npm workspace or export for examples.

Update both [English](examples/README.md) and [Chinese](examples/README.zh-CN.md)
catalogs. Explain native prerequisites, an executable repository-root command,
permissions, model costs, cleanup and limitations; do not commit credentials,
private evidence or speculative placeholder scenarios. Prefer Node's erasable
TypeScript syntax where the example runs directly with Node.

Regular typecheck covers `examples/**/*.ts`. Add controlled contracts under
`test/` for meaningful behavior and navigation, keeping test fixtures out of
the runnable example. Real models still need explicit approval. An examples-only
change does not require an SDK version bump, release packing or npm publication;
normal repository checks still apply.
