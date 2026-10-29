# SDK releases

The release consists of `@muha-sdk/muha`, Core and all five official adapters, using one
version and exact internal dependencies. The root workspace remains private.
Release consumers may install `@muha-sdk/muha` alone or select individual adapter packages.

1. Update all seven package versions and internal dependency pins together.
   Preserve external dependency locks unless their change is part of the approved scope.
2. Run the affected contracts, `npm run check`, `npm run audit:packages` and
   `node scripts/verify-sdk-source.mjs`. Changed qualified runtime resources
   require separately authorized bounded real-model qualification.
3. Push reviewed source and dispatch [sdk-release](.github/workflows/sdk-release.yml)
   with `action=prepare` and its full main commit SHA. This runs controlled checks
   on Ubuntu 22.04 / Node 22.20.0 and builds native helpers separately on
   Ubuntu 22.04 and Windows 2022. Each native artifact binds its platform,
   version, commit, Git tree, lockfile and qualified-resource manifest digest.
   Assembly validates both complete allowlists before modifying package outputs,
   after the final source build. It checks dependency/license closure and produces
   seven dual-platform tarballs plus `README.md`, `SHA256SUMS` and `release.json`.
   The unchanged tarballs must cold-install on Linux and Windows, using Node
   22.20.0 and LTS, before the preparation run is successful.
4. Review that artifact and its manifest SHA256. Dispatch `action=publish` with
   the same source SHA, successful preparation run ID and manifest SHA256.
   Publication downloads the original artifacts, without rebuilding them.
5. Core publishes first, adapters follow, and `@muha-sdk/muha` publishes last, using
   GitHub Actions OIDC trusted publishing, npm provenance and the `candidate` tag.
   Existing immutable versions must match
   the reviewed archive and provenance before the workflow can resume.
6. Anonymous public Registry consumers on Linux and Windows, each using Node
   22.20.0 and LTS, install Core,
   each adapter pair, all adapters, and `@muha-sdk/muha` alone. Their byte integrity,
   native resources, ESM/TypeScript and lifecycle contracts, dependency trees,
   and lockfile `npm ci` must pass before the explicit `latest` promotion job.
7. Read back all seven versions and `latest` tags, then create the source tag
   and public GitHub Release using the reviewed artifacts and registry receipt.

Formal candidates require both `linux-x64` and `win32-x64` helpers in Core and
AGY; consumers never compile these helpers during installation. Host-only
diagnostic packages are not publishable candidates. All latest Windows Core and
adapter qualification entries and the current Pi SDK qualification on both
platforms must be `PASS`. Historical smoke receipts and controlled fixtures
cannot clear a `PENDING` real-model qualification. Qualification evidence remains
scoped to the source, platform and dependencies it actually exercised.

## SDK 0.1.18 production audit exception

The maintainer accepted the initial three advisories on 2026-10-27 and resumed
publication on 2026-10-28 with the five additional risks listed below. This
eight-advisory exception applies only to the seven-package 0.1.18 cohort with
Pi SDK 1.2.0, its exact undici 8.10.2
dependency, and patched Zod 4.6.7. `node scripts/release-audit.mjs` still performs
a complete production npm audit. All other packages, advisories, critical
severity updates, incomplete reports and Registry errors fail publication.
The exception expires outside this release; a clean audit needs no exception.

These residual vulnerabilities remain present and are not claimed unreachable:

- [GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685): unbounded EventSource-parser memory can cause denial of service.
- [GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472): non-lowercase algorithm tokens can bypass Subresource Integrity.
- [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c): excessive content encodings can cause unhandled errors and denial of service.
- [GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26): cross-origin redirects with a shared cache can poison entries and disclose other users' data.
- [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx): dropped TLS callback options can bypass intended certificate validation.
- [GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm): TLS 1.2 certificate-changing renegotiation can crash the client process.
- [GHSA-9fm3-97px-rjf6](https://github.com/advisories/GHSA-9fm3-97px-rjf6): unbounded automatic WebSocket PONG buffering can cause denial of service.
- [GHSA-55wc-3pg8-jfw6](https://github.com/advisories/GHSA-55wc-3pg8-jfw6): asynchronous decompression handler exceptions can escape and crash the process.

The affected dependency bytes are unchanged from the preceding release. This
does not waive real-model qualification, licenses, immutable archive/provenance
verification, dual-platform acceptance or consumer installation. The release
notes and affected package READMEs must disclose the residual advisories.

Registry propagation is handled through read-only verification, bounded by
60 attempts and five minutes per operation. Identity, byte or provenance
mismatches stop immediately. Failed npm uploads are not
automatically retried. Diagnose the Registry state before resuming a failed run.
On initial publication npm may assign `latest` even when a different upload tag
is requested; the explicit promotion job still follows consumer acceptance.

## Trusted publisher setup

Before dispatching publication, a maintainer configures a GitHub Actions trusted
publisher in the npm settings of **each** of the seven existing packages:
`@muha-sdk/core`, `@muha-sdk/codex-adapter`, `@muha-sdk/opencode-adapter`,
`@muha-sdk/kimi-adapter`, `@muha-sdk/pi-adapter`, `@muha-sdk/agy-adapter`, and
`@muha-sdk/muha`. Use these identical fields:

- Organization or user: `Gao-Gossssip`
- Repository: `muha`
- Workflow filename: `sdk-release.yml` (not its directory path)
- Environment: leave blank; this workflow does not use a GitHub environment.
- Allowed actions: explicitly allow both `npm publish` and `npm dist-tag`.

Publish and dist-tag permissions are independent. Stage-only permission is not
sufficient for this direct-publication workflow; it would require a different
flow and human 2FA approval before Registry installation acceptance.
Saving the setup does not validate it. The first successful publish must occur
within two days; an expired setup must be removed and recreated by a maintainer.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

Upload and promotion run on GitHub-hosted Ubuntu 22.04 with Node 22.20.0 and
pinned npm 11.21.0, including its OIDC dist-tag support. Both jobs request
`id-token: write`; prepare and anonymous consumers do not. Publication requires
the reviewed main source, exact workflow/job, hosted runner and OIDC environment.
The npm commands use owned temporary credential-free configuration outside a
project, rejecting legacy token credentials instead of falling back to them.
No `NPM_PUBLISH_TOKEN` secret or local npm login is used. After successful OIDC
acceptance, a maintainer may remove the obsolete secret and restrict traditional
token publishing; these security-policy changes are not made automatically.

An authentication-only migration still changes the source revision. Prepare and
review a new source-bound candidate rather than rerunning an old token workflow
or accepting its archives at the new revision. Unchanged qualified runtime and
dependency digests retain their accepted model evidence; no model rerun is implied.

Current Git trees and published packages contain no `docs/` directories.
Plans, raw diagnostics and publication receipts stay in ignored `docs/` or
`.scratch/` paths. Historical Git objects may contain documentation.
