import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessErrorData, OfficialAdapterOptions } from "@muha-sdk/core";
import { type AdapterCreateSessionOptions, type AdapterResumeSessionOptions,
  type AdapterSession, type AdapterTurn, type AdapterTurnEvent, type AdapterTurnInput,
  type LiveHarnessAdapter, type LiveHarnessAdapterContext } from "@muha-sdk/core/internal";
import { harnessEnvironment, OwnedHarnessProcess } from "@muha-sdk/core/internal/host-process";
const efforts = ["low", "medium", "high", "xhigh", "max"];
const failure = (message: string): HarnessErrorData => ({ code: "HARNESS_ERROR", harness: "claude", operation: "startTurn", message, retryable: false });
type Obj = Record<string, any>;
export class ClaudeProcess implements LiveHarnessAdapter {
  readonly kind = "claude" as const;
  readonly route = "native" as const;
  readonly sessions = new Set<ClaudeSession>();
  readonly env: NodeJS.ProcessEnv;
  readonly idleTimeoutMs: number;
  constructor(readonly options: OfficialAdapterOptions, readonly context: LiveHarnessAdapterContext) { this.env = harnessEnvironment(options.env);
    const idle = Number(this.env.MUHA_CLAUDE_TURN_IDLE_TIMEOUT_MS ?? 300000);
    this.idleTimeoutMs = Number.isSafeInteger(idle) && idle > 0 ? idle : 300000;
  }
  async initialize() {}
  async createSession(options: AdapterCreateSessionOptions): Promise<AdapterSession> { return this.session(options); }
  async resumeSession(options: AdapterResumeSessionOptions): Promise<AdapterSession> { return this.session(options, options.nativeSessionId); }
  private session(options: AdapterCreateSessionOptions, id?: string) {
    const session = new ClaudeSession(this, options, id); this.sessions.add(session); return session;
  }
  async listSessions(): Promise<never> { throw failure("Claude Code Session listing is unsupported"); }
  async listModels() {
    const ids = new Set(["default", "sonnet", "opus", "haiku", "opusplan", "fable"]);
    for (const key of ["ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL"]) {
      const value = this.env[key]; if (value) ids.add(value);
    }
    try {
      const settings = JSON.parse(await readFile(join(this.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json"), "utf8"));
      if (typeof settings.model === "string" && settings.model) ids.add(settings.model);
    } catch { /* Optional local configuration; no credentials are read into diagnostics. */ }
    return [...ids].map(id => ({ id, supportedEfforts: [...efforts] }));
  }
  async close() { await Promise.all([...this.sessions].map(session => session.close())); }
}
class ClaudeSession implements AdapterSession {
  readonly nativeSessionId: string;
  model: string | undefined;
  effort: string | undefined;
  closed = false;
  private resume: boolean;
  private turn?: ClaudeTurn;
  constructor(readonly owner: ClaudeProcess, readonly options: AdapterCreateSessionOptions, id?: string) {
    this.nativeSessionId = id ?? randomUUID(); this.resume = id !== undefined;
    this.model = options.model; this.effort = options.effort;
    if (this.effort !== undefined && !efforts.includes(this.effort)) throw { ...failure("Unsupported Claude Code effort"), operation: id === undefined ? "createSession" : "resumeSession" };
  }
  async setModel(model: string) { this.model = model; this.effort = undefined; }
  async setEffort(effort: string) { if (!efforts.includes(effort)) throw { ...failure("Unsupported Claude Code effort"), operation: "setEffort" }; this.effort = effort; }
  async startTurn(input: readonly AdapterTurnInput[]) {
    const args = ["-p", "--output-format", "stream-json", "--verbose", "--input-format", "text",
      this.resume ? "--resume" : "--session-id", this.nativeSessionId];
    if (this.model) args.push("--model", this.model);
    if (this.effort) args.push("--effort", this.effort);
    if (this.options.approvalPolicy === "autoApprove") args.push("--dangerously-skip-permissions");
    else args.push("--permission-mode", "dontAsk");
    this.turn = new ClaudeTurn(this, args, input.map(part => {
      if (part.type !== "text") throw failure("Claude Code supports text input only"); return part.text;
    }).join("\n"));
    this.resume = true;
    return this.turn;
  }
  async close() { this.closed = true; await this.turn?.interrupt(); this.owner.sessions.delete(this); }
}
class ClaudeTurn implements AdapterTurn {
  readonly nativeTurnId = randomUUID();
  private queue: AdapterTurnEvent[] = [];
  private wake?: () => void;
  private ended = false;
  private stopping?: Promise<void>;
  private owner!: OwnedHarnessProcess;
  private timer?: ReturnType<typeof setTimeout>;
  private init = false;
  private started = false;
  private receivedEvent = false;
  private message: { claudeId: string; nativeId: string; text: string } | undefined;
  private tools = new Set<string>();
  private sequence = 0;
  private resultEvent?: AdapterTurnEvent;
  private stderr = "";
  private cleanupError?: HarnessErrorData;
  constructor(readonly session: ClaudeSession, args: string[], prompt: string) {
    const adapter = session.owner;
    this.owner = new OwnedHarnessProcess("claude", args, adapter.env, adapter.options.shutdownTimeoutMs ?? 5000,
      (message, kind) => {
        if (kind === "ownership") {
          const error = failure(message);
          adapter.context.reportFatalError(error, [session]);
          void this.finish({ type: "turn.failed", error });
        }
      }, session.options.workspacePath);
    const child = this.owner.child;

    child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk: string) => { this.stderr = (this.stderr + chunk).slice(-4096); });
    this.deadline(adapter.options.startupTimeoutMs ?? 120000);
    child.stdin.end(prompt);
    void (async () => {
      let buffer = "";
      try {
        child.stdout.setEncoding("utf8");
        for await (const chunk of child.stdout) {
          buffer += chunk;
          if (Buffer.byteLength(buffer) > 8 * 1024 * 1024) throw new Error("Frame too large");
          let end: number;
          while ((end = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
            if (line.trim()) await this.receive(line);
          }
        }
        if (buffer.trim()) await this.receive(buffer);
        if (this.resultEvent && !this.stopping) await this.owner.nativeExited;
        if (!this.stopping) await this.finish(this.resultEvent ?? { type: "turn.failed", error: failure(`Claude Code exited without a result. ${this.sanitize(this.stderr)}`) });
      } catch {
        if (!this.stopping) { if (!this.started) { this.started = true; this.push({ type: "turn.started" }); } this.push({ type: "adapter.protocolError", message: "Invalid Claude Code stream-json output" });
          await this.finish({ type: "turn.failed", error: failure("Invalid Claude Code stream-json output") }); }
      }
    })();
  }
  private sanitize(text: string): string {
    const secrets = Object.entries(this.session.owner.env)
      .filter(([name, value]) => {
        if (!value || value.trim().length < 8) return false;
        // Known provider credentials retain coverage even for numeric-looking values.
        if (/^(?:ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|SECURITY_TOKEN))$/i.test(name)) return true;
        return /(^|_)(API_?KEY|KEY|TOKEN|SECRET|PASSWORD|AUTH(ORIZATION)?)(_|$)/i.test(name)
          && !/^(?:true|false|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i.test(value.trim());
      })
      .map(([, value]) => value!)
      .sort((a, b) => b.length - a.length);
    for (const value of secrets) text = text.split(value).join("[REDACTED]");
    return text.replace(/(authorization\s*[:=]\s*)([^\r\n]+)/ig, "$1[REDACTED]")
      .replace(/((?:api[_-]?key|auth[_-]?token|access[_-]?token|token|secret)\s*[:=]\s*)["']?[^\s,"'}]+/ig, "$1[REDACTED]")
      .replace(/\b(?:sk-|sk_ant_|sk-ant-)[\w-]+/g, "[REDACTED]");
  }
  private deadline(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.finish({ type: "turn.failed", error: failure(
      this.receivedEvent
        ? `Claude Code started (${this.init ? "session init received" : "stream-json event received"}) but produced no further output within ${ms} ms; the gateway may be slow or authentication (apiKeyHelper) may be retrying. Raise MUHA_CLAUDE_TURN_IDLE_TIMEOUT_MS to allow more time.`
        : `Claude Code produced no output within ${ms} ms; check authentication (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / apiKeyHelper in ~/.claude/settings.json) and ANTHROPIC_BASE_URL`) }); }, ms);
  }
  private async receive(line: string) {
    const scrub = (value: any): any => {
      if (typeof value === "string") return this.sanitize(value);
      if (Array.isArray(value)) return value.map(scrub);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) =>
        [key, key !== "apiKeySource" && /^(?:api[_-]?key|token|secret|authorization|password)$/i.test(key) && typeof entry === "string" ? "[REDACTED]" : scrub(entry)]));
      return value;
    };
    const payload: Obj = JSON.parse(line);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid event");
    await this.session.owner.context.recordNativeEvent("claude", scrub(payload));
    if (this.stopping) return;
    this.receivedEvent = true;
    this.deadline(this.session.owner.idleTimeoutMs);
    if (payload.type === "system" && payload.subtype === "init") {
      if (this.init || payload.session_id !== this.session.nativeSessionId) throw new Error("Session mismatch");
      this.init = true; this.started = true; this.push({ type: "turn.started" });
    } else if (payload.type === "assistant") {
      if (!this.init) throw new Error("Missing init");
      if (typeof payload.message?.id !== "string" || !payload.message.id || !Array.isArray(payload.message.content)) throw new Error("Invalid assistant message");
      if (this.message && this.message.claudeId !== payload.message.id) this.completeMessage();
      for (const block of payload.message.content) {
        if (block.type === "text" || block.type === "thinking") {
          const delta = block.type === "text" ? block.text : block.thinking;
          if (typeof delta !== "string") throw new Error("Invalid assistant block");
          if (!this.message) {
            const nativeId = `${this.nativeTurnId}:${payload.message.id}:${this.sequence++}`;
            this.message = { claudeId: payload.message.id, nativeId, text: "" };
            this.push({ type: "assistant.message.started", nativeMessageId: nativeId });
          }
          if (block.type === "text") this.message.text += delta;
          if (delta) this.push({ type: block.type === "text" ? "assistant.message.delta" : "assistant.reasoning.delta", nativeMessageId: this.message.nativeId, delta });
        } else if (block.type === "tool_use") {
          this.completeMessage();
          if (typeof block.id !== "string" || !block.id || typeof block.name !== "string" || !block.name || this.tools.has(block.id)) throw new Error("Invalid tool use");
          this.tools.add(block.id);
          this.push({ type: "tool.started", nativeToolCallId: block.id, toolName: block.name, input: block.input });
        }
      }
    } else if (payload.type === "user") {
      for (const block of payload.message?.content ?? []) if (block.type === "tool_result") {
        this.completeMessage();
        if (typeof block.tool_use_id !== "string" || !this.tools.delete(block.tool_use_id)) throw new Error("Unknown tool result");
        this.push({ type: "tool.completed", nativeToolCallId: block.tool_use_id, isError: block.is_error === true,
          output: { content: block.content, ...(payload.tool_use_result === undefined ? {} : { tool_use_result: payload.tool_use_result }) },
        });
      }
    } else if (payload.type === "result") {
      this.completeMessage();
      if (this.resultEvent) throw new Error("Repeated Claude result");
      if (payload.subtype !== "success" || payload.is_error) await this.finish({ type: "turn.failed", error: failure(
        `Claude Code ${String(payload.subtype)}: ${this.sanitize(JSON.stringify(payload.errors ?? payload.result ?? "Execution failed"))}`) });
      else {
        if (!this.init) throw new Error("Missing init");
        const u = payload.usage ?? {};
        this.push({ type: "usage.updated", usage: { inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
          cachedInputTokens: u.cache_read_input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 } });
        this.resultEvent = { type: "turn.completed" };
      }
    }
  }
  private completeMessage() {
    if (!this.message) return;
    this.push({ type: "assistant.message.completed", nativeMessageId: this.message.nativeId, text: this.message.text });
    this.message = undefined;
  }
  private push(event: AdapterTurnEvent) { this.queue.push(event); this.wake?.(); }
  private finish(event: AdapterTurnEvent): Promise<void> {
    // Core requires a start even when the native process fails before init.
    if (!this.started) { this.started = true; this.push({ type: "turn.started" }); }
    return this.stopping ??= (async () => {
      clearTimeout(this.timer);
      try {
        await this.owner.close();
        if (event.type === "turn.completed" && this.owner.nativeExitCode !== 0) event = {
          type: "turn.failed", error: failure(`Claude Code exited non-zero (${this.owner.nativeExitCode ?? "unknown"}). ${this.sanitize(this.stderr)}`),
        };
      }
      catch {
        this.cleanupError = failure("Claude Code owned process cleanup failed");
        this.session.owner.context.reportFatalError(this.cleanupError, [this.session]);
        event = { type: "turn.failed", error: this.cleanupError };
      }
      this.push(event); this.ended = true; this.wake?.();
    })();
  }
  async interrupt() { await this.finish({ type: "turn.interrupted" }); if (this.cleanupError) throw this.cleanupError; }
  async respondToApproval(): Promise<never> { throw failure("Claude Code interactive approvals are unsupported"); }
  async respondToQuestion(): Promise<never> { throw failure("Claude Code Questions are unsupported"); }
  async *[Symbol.asyncIterator]() {
    while (true) {
      const event = this.queue.shift();
      if (event) yield event;
      else if (this.ended) return;
      else await new Promise<void>(resolve => { this.wake = resolve; });
    }
  }
}
