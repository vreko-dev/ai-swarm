export { hydrateContext } from './hydrate.js';
export { renderTemplate, renderTemplateFile, TOKEN_MAP } from './render-template.js';
export { dispatchRole, ROLE_TOOLS } from './dispatch.js';
export { ratchetGenerator } from './ratchet-generator.js';
export { createObservability, NoopObservability, LangfuseObservability } from './observability/index.js';
export { getModelForRole, getTierForRole, MODEL_TIERS } from './model-tiers.js';
export { parseFrontmatter, parseAgentTemplate, parseAgentTemplateString } from './frontmatter.js';
export { buildAgentDefinition, buildSubagentMap, buildSubagentMapFromDir } from './subagents.js';
export { createSwarmHooks, createDefaultHookConfig } from './hooks.js';
export {
  createMemoryServerConfig,
  memoryConfigToMcpServer,
  generateMcpConfig,
  generateMcpJson,
  ensureMemoryDbDir,
} from './memory.js';

export type {
  SwarmContext,
  SwarmObservability,
  Role,
  ModelTier,
  ModelTierConfig,
  GateType,
  PackageManager,
  ObservabilityBackend,
  ArchFenceRule,
  AntiPattern,
  RatchetEntry,
  RatchetScore,
  BranchModel,
  GateConfig,
  McpTool,
  OwnedPackage,
  PhaseEvent,
  GateTiming,
  RetrospectiveEvidence,
  DispatchOptions,
  AgentFrontmatter,
  AgentDefinition,
  AgentMcpServerSpec,
  McpServerConfigForProcessTransport,
  PermissionMode,
  HookEvent,
  HookCallbackMatcher,
  HookCallback,
  HookInput,
  HookJSONOutput,
  MemoryServerConfig,
  SwarmHookConfig,
} from './types.js';
