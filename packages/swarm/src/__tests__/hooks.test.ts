import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSwarmHooks, createDefaultHookConfig } from '../hooks.js';
import type { HookInput, SwarmHookConfig } from '../types.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('branch-check.sh')) {
      if (cmd.includes('fail')) throw new Error('Branch check failed');
      return 'OK: On correct branch\n';
    }
    if (cmd.includes('swarm-state.sh')) {
      return '=== Swarm State ===\nWorktrees: 1\nOpen gates: 0\n';
    }
    if (cmd.includes('validate-agent-output.sh')) {
      return 'OK: Output validated\n';
    }
    return '';
  }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
}));

const mockExecSync = vi.mocked(await import('node:child_process')).execSync;

function makeHookConfig(overrides: Partial<SwarmHookConfig> = {}): SwarmHookConfig {
  return {
    scriptsDir: '/fake/.ai-swarm/scripts',
    swarmDir: '/fake/.ai-swarm',
    enabledHooks: ['PreToolUse', 'SessionStart', 'SubagentStop'],
    ...overrides,
  };
}

function makeHookInput(overrides: Partial<HookInput> = {}): HookInput {
  return {
    hook_event_name: 'PreToolUse',
    session_id: 'test-session',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/fake/project',
    ...overrides,
  };
}

beforeEach(() => {
  mockExecSync.mockClear();
});

describe('T7: swarm hooks', () => {
  it('T7.1 — createSwarmHooks returns hooks for all enabled events', () => {
    const config = makeHookConfig();
    const hooks = createSwarmHooks(config);

    expect(hooks.PreToolUse).toBeDefined();
    expect(hooks.SessionStart).toBeDefined();
    expect(hooks.SubagentStop).toBeDefined();
  });

  it('T7.2 — createSwarmHooks returns empty object when no hooks enabled', () => {
    const config = makeHookConfig({ enabledHooks: [] });
    const hooks = createSwarmHooks(config);

    expect(Object.keys(hooks)).toHaveLength(0);
  });

  it('T7.3 — PreToolUse hook allows non-write tools', async () => {
    const config = makeHookConfig({ enabledHooks: ['PreToolUse'] });
    const hooks = createSwarmHooks(config);
    const callback = hooks.PreToolUse![0].hooks[0];

    const input = makeHookInput({ tool_name: 'Read' });
    const result = await callback(input, 'tool-1', { signal: new AbortController().signal });

    expect(result.continue).toBe(true);
    expect(result.decision).toBeUndefined();
  });

  it('T7.4 — PreToolUse hook blocks write tools when branch check fails', async () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('Branch check failed');
    });

    const config = makeHookConfig({ enabledHooks: ['PreToolUse'] });
    const hooks = createSwarmHooks(config);
    const callback = hooks.PreToolUse![0].hooks[0];

    const input = makeHookInput({ tool_name: 'Write' });
    const result = await callback(input, 'tool-1', { signal: new AbortController().signal });

    expect(result.decision).toBe('block');
    expect(result.hookSpecificOutput).toBeDefined();
    expect((result.hookSpecificOutput as Record<string, unknown>).permissionDecision).toBe('deny');
  });

  it('T7.5 — PreToolUse hook allows write tools when branch check passes', async () => {
    const config = makeHookConfig({ enabledHooks: ['PreToolUse'] });
    const hooks = createSwarmHooks(config);
    const callback = hooks.PreToolUse![0].hooks[0];

    const input = makeHookInput({ tool_name: 'Edit' });
    const result = await callback(input, 'tool-1', { signal: new AbortController().signal });

    expect(result.continue).toBe(true);
  });

  it('T7.6 — PreToolUse hook matcher is Write|Edit', () => {
    const config = makeHookConfig({ enabledHooks: ['PreToolUse'] });
    const hooks = createSwarmHooks(config);

    expect(hooks.PreToolUse![0].matcher).toBe('Write|Edit');
  });

  it('T7.7 — SessionStart hook injects swarm state as additionalContext', async () => {
    const config = makeHookConfig({ enabledHooks: ['SessionStart'] });
    const hooks = createSwarmHooks(config);
    const callback = hooks.SessionStart![0].hooks[0];

    const input = makeHookInput({
      hook_event_name: 'SessionStart',
      source: 'startup',
    });
    const result = await callback(input, undefined, { signal: new AbortController().signal });

    expect(result.hookSpecificOutput).toBeDefined();
    const output = result.hookSpecificOutput as Record<string, unknown>;
    expect(output.hookEventName).toBe('SessionStart');
    expect(typeof output.additionalContext).toBe('string');
    expect((output.additionalContext as string)).toContain('Swarm State');
  });

  it('T7.8 — SubagentStop hook runs validate-agent-output.sh', async () => {
    const config = makeHookConfig({ enabledHooks: ['SubagentStop'] });
    const hooks = createSwarmHooks(config);
    const callback = hooks.SubagentStop![0].hooks[0];

    const input = makeHookInput({
      hook_event_name: 'SubagentStop',
      agent_type: 'implementer',
      agent_id: 'agent-1',
      stop_hook_active: false,
    });
    const result = await callback(input, undefined, { signal: new AbortController().signal });

    expect(result.continue).toBe(true);
  });

  it('T7.9 — SubagentStop hook reports validation failure', async () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('Validation failed');
    });

    const config = makeHookConfig({ enabledHooks: ['SubagentStop'] });
    const hooks = createSwarmHooks(config);
    const callback = hooks.SubagentStop![0].hooks[0];

    const input = makeHookInput({
      hook_event_name: 'SubagentStop',
      agent_type: 'implementer',
      agent_id: 'agent-1',
      stop_hook_active: false,
    });
    const result = await callback(input, undefined, { signal: new AbortController().signal });

    expect(result.hookSpecificOutput).toBeDefined();
    const output = result.hookSpecificOutput as Record<string, unknown>;
    expect((output.additionalContext as string)).toContain('Validation failed');
  });

  it('T7.10 — createDefaultHookConfig returns correct defaults', () => {
    const config = createDefaultHookConfig('/fake/.ai-swarm');

    expect(config.scriptsDir).toBe('/fake/.ai-swarm/scripts');
    expect(config.swarmDir).toBe('/fake/.ai-swarm');
    expect(config.enabledHooks).toEqual(['PreToolUse', 'SessionStart', 'SubagentStop']);
  });

  it('T7.11 — PostToolUse hook is created when enabled', () => {
    const config = makeHookConfig({ enabledHooks: ['PostToolUse'] });
    const hooks = createSwarmHooks(config);

    expect(hooks.PostToolUse).toBeDefined();
    expect(hooks.PostToolUse![0].matcher).toBe('Write|Edit');
  });
});
