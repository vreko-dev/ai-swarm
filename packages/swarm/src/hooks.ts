import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  HookCallback,
  HookCallbackMatcher,
  HookEvent,
  HookInput,
  HookJSONOutput,
  SwarmHookConfig,
} from './types.js';

export function createSwarmHooks(config: SwarmHookConfig): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};

  for (const event of config.enabledHooks) {
    switch (event) {
      case 'PreToolUse':
        hooks.PreToolUse = [createPreToolUseHook(config)];
        break;
      case 'SessionStart':
        hooks.SessionStart = [createSessionStartHook(config)];
        break;
      case 'SubagentStop':
        hooks.SubagentStop = [createSubagentStopHook(config)];
        break;
      case 'PostToolUse':
        hooks.PostToolUse = [createPostToolUseHook(config)];
        break;
    }
  }

  return hooks;
}

function runScript(scriptsDir: string, scriptName: string, args: string[] = []): { success: boolean; output: string } {
  const scriptPath = join(scriptsDir, scriptName);
  if (!existsSync(scriptPath)) {
    return { success: false, output: `Script not found: ${scriptPath}` };
  }

  try {
    const output = execSync(`bash ${scriptPath} ${args.join(' ')}`, {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: message };
  }
}

function createPreToolUseHook(config: SwarmHookConfig): HookCallbackMatcher {
  const callback: HookCallback = async (input: HookInput): Promise<HookJSONOutput> => {
    const toolName = input.tool_name || '';
    if (!isWriteTool(toolName)) {
      return { continue: true };
    }

    const { success, output } = runScript(config.scriptsDir, 'branch-check.sh');
    if (!success) {
      return {
        decision: 'block',
        reason: `Branch check failed: ${output}`,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Branch check failed: ${output}`,
        },
      };
    }

    return { continue: true };
  };

  return {
    matcher: 'Write|Edit',
    hooks: [callback],
    timeout: 30,
  };
}

function createSessionStartHook(config: SwarmHookConfig): HookCallbackMatcher {
  const callback: HookCallback = async (input: HookInput): Promise<HookJSONOutput> => {
    const { success, output } = runScript(config.scriptsDir, 'swarm-state.sh', ['status']);
    const contextParts: string[] = [];

    if (success && output) {
      contextParts.push('=== Swarm State ===');
      contextParts.push(output);
    }

    const archFencePath = join(config.swarmDir, 'docs', 'reference', 'architecture-fence.txt');
    if (existsSync(archFencePath)) {
      contextParts.push('\nArchitecture fence and anti-patterns are available in .ai-swarm/docs/reference/');
    }

    const additionalContext = contextParts.join('\n');

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext,
      },
    };
  };

  return {
    hooks: [callback],
    timeout: 15,
  };
}

function createSubagentStopHook(config: SwarmHookConfig): HookCallbackMatcher {
  const callback: HookCallback = async (input: HookInput): Promise<HookJSONOutput> => {
    const agentType = input.agent_type || 'unknown';

    const { success, output } = runScript(config.scriptsDir, 'validate-agent-output.sh', [agentType]);
    if (!success) {
      return {
        hookSpecificOutput: {
          hookEventName: 'SubagentStop',
          additionalContext: `Validation failed for agent ${agentType}: ${output}`,
        },
      };
    }

    return { continue: true };
  };

  return {
    hooks: [callback],
    timeout: 30,
  };
}

function createPostToolUseHook(config: SwarmHookConfig): HookCallbackMatcher {
  const callback: HookCallback = async (input: HookInput): Promise<HookJSONOutput> => {
    const toolName = input.tool_name || '';
    if (!isWriteTool(toolName)) {
      return { continue: true };
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: 'File modified. Run validation gates before proceeding.',
      },
    };
  };

  return {
    matcher: 'Write|Edit',
    hooks: [callback],
    timeout: 10,
  };
}

function isWriteTool(toolName: string): boolean {
  return toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit';
}

export function createDefaultHookConfig(swarmDir: string): SwarmHookConfig {
  return {
    scriptsDir: join(swarmDir, 'scripts'),
    swarmDir,
    enabledHooks: ['PreToolUse', 'SessionStart', 'SubagentStop'],
  };
}
