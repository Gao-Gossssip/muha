import type { HarnessCapabilities, HarnessRegistration, OfficialAdapterOptions } from "@muha-sdk/core";
import { composeWorkspaceConfigurator, createOfficialHarnessRegistration } from "@muha-sdk/core/internal";
import { ClaudeProcess } from "./process.js";
export type { OfficialAdapterOptions } from "@muha-sdk/core";
const points = Object.freeze(["createSession", "resumeSession", "idleSession"] as const);
const capabilities = Object.freeze({
  sessionListing: false, imageInput: false, approvalPolicies: Object.freeze(["autoDeny", "autoApprove"] as const),
  turnQuestions: false, workspaceSkills: false, workspaceMcp: false,
  model: Object.freeze({ listing: true, selectionAt: points, observation: "selectedOnly" }),
  effort: Object.freeze({ selectionAt: points, observation: "selectedOnly", requiresKnownModel: false }),
  assistantMessageStreaming: true, assistantReasoningStreaming: true, toolEvents: true, turnUsage: true,
} satisfies HarnessCapabilities);
export function claudeCodeAdapter(options: OfficialAdapterOptions = {}): HarnessRegistration {
  return createOfficialHarnessRegistration("claude", options, capabilities,
    composeWorkspaceConfigurator({
      planSkill() { throw new Error("Claude Code Workspace Skills are unsupported"); },
      planMcpServer() { throw new Error("Claude Code Workspace MCP is unsupported"); },
    }), (snapshot, context) => new ClaudeProcess(snapshot, context));
}
