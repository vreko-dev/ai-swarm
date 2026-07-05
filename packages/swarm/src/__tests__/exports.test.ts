import { describe, it, expect } from 'vitest';
import * as swarm from '../index.js';
import type { SwarmContext, SwarmObservability, Role, AgentFrontmatter, AgentDefinition, HookEvent, MemoryServerConfig } from '../index.js';

describe('T7: exports', () => {
  it('T7.1 — exports hydrateContext', () => {
    expect(swarm.hydrateContext).toBeDefined();
    expect(typeof swarm.hydrateContext).toBe('function');
  });

  it('T7.2 — exports renderTemplate', () => {
    expect(swarm.renderTemplate).toBeDefined();
    expect(typeof swarm.renderTemplate).toBe('function');
  });

  it('T7.3 — exports dispatchRole', () => {
    expect(swarm.dispatchRole).toBeDefined();
    expect(typeof swarm.dispatchRole).toBe('function');
  });

  it('T7.4 — exports ratchetGenerator', () => {
    expect(swarm.ratchetGenerator).toBeDefined();
    expect(typeof swarm.ratchetGenerator).toBe('function');
  });

  it('T7.5 — exports createObservability', () => {
    expect(swarm.createObservability).toBeDefined();
    expect(typeof swarm.createObservability).toBe('function');
  });

  it('T7.6 — exports SwarmContext type', () => {
    const _ctx: SwarmContext | undefined = undefined;
    expect(_ctx).toBeUndefined();
  });

  it('T7.7 — exports SwarmObservability type', () => {
    const _obs: SwarmObservability | undefined = undefined;
    expect(_obs).toBeUndefined();
  });

  it('T7.8 — exports Role type', () => {
    const _role: Role | undefined = undefined;
    expect(_role).toBeUndefined();
  });

  it('T7.9 — exports getModelForRole, getTierForRole, MODEL_TIERS', () => {
    expect(swarm.getModelForRole).toBeDefined();
    expect(typeof swarm.getModelForRole).toBe('function');
    expect(swarm.getTierForRole).toBeDefined();
    expect(typeof swarm.getTierForRole).toBe('function');
    expect(swarm.MODEL_TIERS).toBeDefined();
    expect(Array.isArray(swarm.MODEL_TIERS)).toBe(true);
  });

  it('T7.10 — exports ROLE_TOOLS', () => {
    expect(swarm.ROLE_TOOLS).toBeDefined();
    expect(typeof swarm.ROLE_TOOLS).toBe('object');
  });

  it('T7.11 — exports frontmatter parsing functions', () => {
    expect(swarm.parseFrontmatter).toBeDefined();
    expect(typeof swarm.parseFrontmatter).toBe('function');
    expect(swarm.parseAgentTemplate).toBeDefined();
    expect(typeof swarm.parseAgentTemplate).toBe('function');
    expect(swarm.parseAgentTemplateString).toBeDefined();
    expect(typeof swarm.parseAgentTemplateString).toBe('function');
  });

  it('T7.12 — exports subagent builder functions', () => {
    expect(swarm.buildAgentDefinition).toBeDefined();
    expect(typeof swarm.buildAgentDefinition).toBe('function');
    expect(swarm.buildSubagentMap).toBeDefined();
    expect(typeof swarm.buildSubagentMap).toBe('function');
    expect(swarm.buildSubagentMapFromDir).toBeDefined();
    expect(typeof swarm.buildSubagentMapFromDir).toBe('function');
  });

  it('T7.13 — exports hooks functions', () => {
    expect(swarm.createSwarmHooks).toBeDefined();
    expect(typeof swarm.createSwarmHooks).toBe('function');
    expect(swarm.createDefaultHookConfig).toBeDefined();
    expect(typeof swarm.createDefaultHookConfig).toBe('function');
  });

  it('T7.14 — exports memory server functions', () => {
    expect(swarm.createMemoryServerConfig).toBeDefined();
    expect(typeof swarm.createMemoryServerConfig).toBe('function');
    expect(swarm.generateMcpJson).toBeDefined();
    expect(typeof swarm.generateMcpJson).toBe('function');
  });

  it('T7.15 — exports new types: AgentFrontmatter, AgentDefinition, HookEvent, MemoryServerConfig', () => {
    const _fm: AgentFrontmatter | undefined = undefined;
    const _ad: AgentDefinition | undefined = undefined;
    const _he: HookEvent | undefined = undefined;
    const _mc: MemoryServerConfig | undefined = undefined;
    expect(_fm).toBeUndefined();
    expect(_ad).toBeUndefined();
    expect(_he).toBeUndefined();
    expect(_mc).toBeUndefined();
  });
});
