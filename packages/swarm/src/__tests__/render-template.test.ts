import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderTemplate, renderTemplateFile, TOKEN_MAP } from '../render-template.js';
import type { SwarmContext } from '../types.js';

function makeContext(overrides: Partial<SwarmContext> = {}): SwarmContext {
  return {
    packageManager: 'pnpm',
    buildCommand: 'pnpm turbo run build',
    lintCommand: 'pnpm turbo run lint',
    testCommand: 'pnpm turbo run test',
    typecheckCommand: 'pnpm turbo run typecheck',
    archFenceRules: [
      { pattern: 'packages/*', allowedImports: ['shared'], forbiddenImports: ['other'] },
    ],
    ownedPackages: [{ name: '@marcelle-labs/swarm', path: 'packages/swarm', private: false }],
    mcpTools: [{ name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }],
    antiPatterns: [],
    ratchetBaselines: [],
    branchModel: { main: 'main', dev: 'dev', prefix: 'task/' },
    gateConfig: [],
    auditTemplatePaths: [],
    deferredWorkPath: '.ai-swarm/docs/reference/deferred-work.md',
    observabilityBackend: 'none',
    modelTiers: [],
    ...overrides,
  };
}

describe('T1: renderTemplate', () => {
  const ctx = makeContext();

  it('T1.1 — replaces all 13 canonical tokens', () => {
    const template = [
      '{{PACKAGE_MANAGER}}',
      '{{BUILD_COMMAND}}',
      '{{LINT_COMMAND}}',
      '{{TEST_COMMAND}}',
      '{{TYPECHECK_COMMAND}}',
      '{{ARCH_FENCE}}',
      '{{OWNED_PACKAGES}}',
      '{{MCP_TOOLS}}',
      '{{BRANCH_MAIN}}',
      '{{BRANCH_DEV}}',
      '{{BRANCH_PREFIX}}',
      '{{OBSERVABILITY_BACKEND}}',
      '{{SWARM_DIR}}',
    ].join('\n');

    const result = renderTemplate(template, ctx);

    expect(result).toContain('pnpm');
    expect(result).toContain('pnpm turbo run build');
    expect(result).toContain('pnpm turbo run lint');
    expect(result).toContain('pnpm turbo run test');
    expect(result).toContain('pnpm turbo run typecheck');
    expect(result).toContain('PATTERN: packages/*');
    expect(result).toContain('@marcelle-labs/swarm');
    expect(result).toContain('filesystem');
    expect(result).toContain('main');
    expect(result).toContain('dev');
    expect(result).toContain('task/');
    expect(result).toContain('none');
    expect(result).toContain('.ai-swarm');
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('T1.2 — throws Error on unresolved {{UNKNOWN_TOKEN}}', () => {
    const template = 'Hello {{UNKNOWN_TOKEN}} world';
    expect(() => renderTemplate(template, ctx)).toThrow(Error);
    expect(() => renderTemplate(template, ctx)).toThrow(/Unresolved template tokens/);
  });

  it('T1.3 — passes through templates with zero tokens unchanged', () => {
    const template = 'This is a plain string with no tokens at all.';
    expect(renderTemplate(template, ctx)).toBe(template);
  });

  it('T1.4 — replaces multiple occurrences of the same token in one template', () => {
    const template = '{{PACKAGE_MANAGER}} and {{PACKAGE_MANAGER}} and {{PACKAGE_MANAGER}}';
    const result = renderTemplate(template, ctx);
    expect(result).toBe('pnpm and pnpm and pnpm');
  });

  it('T1.5 — renderTemplateFile() reads file from disk and renders it', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'swarm-test-'));
    try {
      const templatePath = join(tmpDir, 'test-template.md');
      writeFileSync(templatePath, 'PM: {{PACKAGE_MANAGER}}', 'utf8');
      const result = renderTemplateFile(templatePath, ctx);
      expect(result).toBe('PM: pnpm');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('T1.6 — TOKEN_MAP exports all 13 token resolver functions', () => {
    const expectedTokens = [
      'PACKAGE_MANAGER',
      'BUILD_COMMAND',
      'LINT_COMMAND',
      'TEST_COMMAND',
      'TYPECHECK_COMMAND',
      'ARCH_FENCE',
      'OWNED_PACKAGES',
      'MCP_TOOLS',
      'BRANCH_MAIN',
      'BRANCH_DEV',
      'BRANCH_PREFIX',
      'OBSERVABILITY_BACKEND',
      'SWARM_DIR',
    ];

    expect(Object.keys(TOKEN_MAP).sort()).toEqual(expectedTokens.sort());
    for (const [, resolver] of Object.entries(TOKEN_MAP)) {
      expect(typeof resolver).toBe('function');
    }
  });
});
