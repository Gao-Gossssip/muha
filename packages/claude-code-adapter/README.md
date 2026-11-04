# @muha-sdk/claude-code-adapter

Official Claude Code Harness Adapter for Muha SDK. Node.js `>=22.20.0`.
Requires an independently installed and authenticated `claude` CLI on `PATH`.
Linux x64 is real-qualified. Windows is unsupported/untested;
macOS is untested. Muha never installs or runs CLI setup automatically.

```js
import { createMuhaRuntime } from "@muha-sdk/core";
import { claudeCodeAdapter } from "@muha-sdk/claude-code-adapter";
const runtime = await createMuhaRuntime({ harnesses: [claudeCodeAdapter()] });
try {
  const session = await runtime.createSession({
    harness: "claude", workspacePath: process.cwd(),
    model: "sonnet", approvalPolicy: "autoDeny",
  });
  const turn = await session.startTurn([{ type: "text", text: "Explain this project" }]);
  console.log(await turn.result);
} finally { await runtime.close(); }
```

Install Claude Code separately using Anthropic's native installer, then configure
native authentication. `OfficialAdapterOptions.env` passes overrides unchanged:
`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` support
Anthropic-compatible third-party gateways. Native `apiKeyHelper` in
`~/.claude/settings.json` also works. `CLAUDE_CONFIG_DIR` selects another config
directory. For opencode Go, set
`ANTHROPIC_BASE_URL=https://opencode.ai/inference/go/anthropic` plus
`ANTHROPIC_AUTH_TOKEN` through adapter `env` or the native environment. Never
print credentials. Credentials and environment values are never logged by this adapter.

The native route starts one headless process per Turn with stdin text input.
New Sessions use a UUID with `--session-id`, then `--resume`; explicit resume
always uses `--resume`. Init must confirm the requested session identity.
Resume existence and native configuration are checked by Claude on the next
Turn, rather than through a paid readiness probe.

Model IDs are arbitrary passthrough strings, including `deepseek-v4.1-flash`.
`listModels` is a static alias catalog (`default`, `sonnet`, `opus`, `haiku`,
`opusplan`, `fable`), augmented with `ANTHROPIC_MODEL`,
`ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`,
`ANTHROPIC_DEFAULT_HAIKU_MODEL` and the readable settings `model` field.
This is configuration discovery, not a live provider model inventory.
Model and effort selection are `selectedOnly` at create/resume/idle and apply
to the next Turn. CLI 2.1.197 help declares `--effort` levels
`low`, `medium`, `high`, `xhigh`, `max`; actual model/provider acceptance may vary.
Changing model clears explicit effort.

`autoApprove` maps to `--dangerously-skip-permissions`; `autoDeny` maps to
`--permission-mode dontAsk`. Native configured permissions can still allow tools;
this policy denies requests that would require prompting. Result
`permission_denials` remain in Native Event Records. Interactive approvals,
Questions, image input, Session listing, Workspace Skills and MCP configuration
are unsupported by the adapter declaration.

`startupTimeoutMs` defaults to 120000 ms until the first parsed event.
`MUHA_CLAUDE_TURN_IDLE_TIMEOUT_MS` in adapter env defaults to 300000 ms from
that event and resets on every parsed stream-json event; it bounds authentication stalls after
init and later idle periods. `shutdownTimeoutMs` defaults to 5000 ms.
Timeouts, interruption and close reclaim owned processes through Core's supervisor.

Usage inputTokens includes input_tokens plus cache_creation_input_tokens;
cachedInputTokens reports cache_read_input_tokens separately. Output tokens use
output_tokens. `total_cost_usd` and `modelUsage.costUSD` are Claude Code's
Anthropic list-price estimates, not actual gateway charges. They stay exclusively
in Native Event Records and never become Muha usage/cost fields.

Controlled fixtures cover protocol translation and process lifecycle. Linux x64 real
qualification passed with CLI 2.1.197, Node 22.23.4 and `deepseek-v4.1-flash`
through opencode Go, effort null and zero Muha retries. Initial modes ran at
`d5f05cf`; interrupt and resume-interrupt continuation passed at `e046b9e` after
a runner reporting fix. Full-mode continuation is not yet real-observed. See
[qualification](https://github.com/Gao-Gossssip/muha/blob/main/QUALIFICATION.md).
