export type Role =
  | 'conductor'
  | 'auditor'
  | 'spec-writer'
  | 'implementer'
  | 'drift-detector'
  | 'adversarial-reviewer'
  | 'reviewer'
  | 'gatekeeper'
  | 'integrator'
  | 'researcher'
  | 'devsecops'
  | 'technical-writer'
  | 'release-manager'
  | 'master-coordinator';

export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export type GateType = 'human-review' | 'build' | 'test' | 'lint' | 'typecheck' | 'adversarial-review';

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

export type ObservabilityBackend = 'none' | 'langfuse' | 'otel';

export interface ArchFenceRule {
  pattern: string;
  allowedImports: string[];
  forbiddenImports: string[];
  canonicalLocation?: string;
}

export interface AntiPattern {
  id: string;
  name: string;
  description: string;
  rootCause: string;
  avoidanceRule: string;
  detectionCommand: string;
  mitigation: string;
}

export interface RatchetEntry {
  metric: string;
  baseline: number;
  ciCheck: string;
  description: string;
}

export interface RatchetScore {
  metric: string;
  count: number;
  baseline: number;
  delta: number;
  status: 'pass' | 'fail';
}

export interface BranchModel {
  main: string;
  dev: string;
  prefix: string;
}

export interface GateConfig {
  type: GateType;
  blocking: boolean;
  timeoutMinutes: number;
}

export interface McpTool {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface OwnedPackage {
  name: string;
  path: string;
  private: boolean;
}

export interface PhaseEvent {
  phase: string;
  role: Role;
  timestamp: string;
  status: 'started' | 'completed' | 'failed' | 'blocked';
  metadata?: Record<string, unknown>;
}

export interface GateTiming {
  gateId: string;
  openedAt: string;
  closedAt: string | null;
  durationHours: number | null;
}

export interface RetrospectiveEvidence {
  specId: string;
  auditGaps: string[];
  ratchetDeltas: { increased: string[]; decreased: string[] };
  specOutcome: 'followed' | 'diverged' | 'abandoned';
  gateEvents: GateTiming[];
  externalResearchCitations: number;
  unresolvedResearch: number;
}

export interface ModelTierConfig {
  role: Role;
  tier: ModelTier;
  model: string;
}

export interface SwarmContext {
  packageManager: PackageManager;
  buildCommand: string;
  lintCommand: string;
  testCommand: string;
  typecheckCommand: string;
  archFenceRules: ArchFenceRule[];
  ownedPackages: OwnedPackage[];
  mcpTools: McpTool[];
  antiPatterns: AntiPattern[];
  ratchetBaselines: RatchetEntry[];
  branchModel: BranchModel;
  gateConfig: GateConfig[];
  auditTemplatePaths: string[];
  deferredWorkPath: string;
  observabilityBackend: ObservabilityBackend;
  modelTiers: ModelTierConfig[];
}

export interface SwarmObservability {
  emitPhaseEvent(event: PhaseEvent): void;
  emitRatchetScores(scores: RatchetScore[]): void;
  emitGateTiming(timing: GateTiming): void;
  emitRetrospective(evidence: RetrospectiveEvidence): void;
  flush(): Promise<void>;
}

export interface DispatchOptions {
  role: Role;
  taskPrompt: string;
  context: SwarmContext;
  tools?: string[];
  excludeDynamicSections?: boolean;
  workingDirectory?: string;
  agents?: Record<string, AgentDefinition>;
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
}

export interface AgentFrontmatter {
  name: string;
  description: string;
  tools: string[];
  model?: string;
}

export interface AgentDefinition {
  description: string;
  tools?: string[];
  disallowedTools?: string[];
  prompt: string;
  model?: string;
  mcpServers?: AgentMcpServerSpec[];
  skills?: string[];
  initialPrompt?: string;
  maxTurns?: number;
  background?: boolean;
  memory?: 'user' | 'project' | 'local';
  effort?: ('low' | 'medium' | 'high' | 'xhigh' | 'max') | number;
  permissionMode?: PermissionMode;
}

export type AgentMcpServerSpec = string | Record<string, McpServerConfigForProcessTransport>;

export interface McpServerConfigForProcessTransport {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export type PermissionMode = 'default' | 'acceptEdits' | 'auto' | 'dontAsk' | 'bypassPermissions' | 'plan';

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PostToolBatch'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'UserPromptExpansion'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'StopFailure'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
  | 'PermissionRequest'
  | 'PermissionDenied'
  | 'Setup'
  | 'TeammateIdle'
  | 'TaskCreated'
  | 'TaskCompleted'
  | 'Elicitation'
  | 'ElicitationResult'
  | 'ConfigChange'
  | 'WorktreeCreate'
  | 'WorktreeRemove'
  | 'InstructionsLoaded'
  | 'CwdChanged'
  | 'FileChanged'
  | 'MessageDisplay';

export interface HookCallbackMatcher {
  matcher?: string;
  hooks: HookCallback[];
  timeout?: number;
}

export type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal },
) => Promise<HookJSONOutput>;

export interface HookInput {
  hook_event_name: HookEvent;
  session_id: string;
  transcript_path: string;
  cwd: string;
  prompt_id?: string;
  permission_mode?: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
  tool_response?: unknown;
  stop_hook_active?: boolean;
  source?: string;
}

export interface HookJSONOutput {
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  decision?: 'approve' | 'block';
  systemMessage?: string;
  reason?: string;
  hookSpecificOutput?: Record<string, unknown>;
}

export interface MemoryServerConfig {
  dbPath: string;
  namespace?: string;
  model?: string;
  modelCache?: string;
  dimensions?: number;
}

export interface SwarmHookConfig {
  scriptsDir: string;
  swarmDir: string;
  enabledHooks: HookEvent[];
}
