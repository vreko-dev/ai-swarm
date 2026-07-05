import { readFileSync } from 'node:fs';
import type { SwarmContext } from './types.js';

const TOKEN_MAP: Record<string, (ctx: SwarmContext) => string> = {
  PACKAGE_MANAGER: (ctx) => ctx.packageManager,
  BUILD_COMMAND: (ctx) => ctx.buildCommand,
  LINT_COMMAND: (ctx) => ctx.lintCommand,
  TEST_COMMAND: (ctx) => ctx.testCommand,
  TYPECHECK_COMMAND: (ctx) => ctx.typecheckCommand,
  ARCH_FENCE: (ctx) =>
    ctx.archFenceRules
      .map((r) => `PATTERN: ${r.pattern}\n  ALLOW: ${r.allowedImports.join(', ')}\n  FORBID: ${r.forbiddenImports.join(', ')}`)
      .join('\n'),
  OWNED_PACKAGES: (ctx) => ctx.ownedPackages.map((p) => p.name).join(', '),
  MCP_TOOLS: (ctx) => ctx.mcpTools.map((t) => t.name).join(', '),
  BRANCH_MAIN: (ctx) => ctx.branchModel.main,
  BRANCH_DEV: (ctx) => ctx.branchModel.dev,
  BRANCH_PREFIX: (ctx) => ctx.branchModel.prefix,
  OBSERVABILITY_BACKEND: (ctx) => ctx.observabilityBackend,
  SWARM_DIR: () => '.ai-swarm',
};

export function renderTemplate(template: string, context: SwarmContext): string {
  let rendered = template;

  for (const [token, resolver] of Object.entries(TOKEN_MAP)) {
    const placeholder = `{{${token}}}`;
    rendered = rendered.replaceAll(placeholder, resolver(context));
  }

  const unresolved = rendered.match(/\{\{[A-Z_]+\}\}/g);
  if (unresolved) {
    throw new Error(
      `Unresolved template tokens: ${unresolved.join(', ')}. ` +
        'Ensure all tokens are defined in TOKEN_MAP and the SwarmContext is fully hydrated.',
    );
  }

  return rendered;
}

export function renderTemplateFile(templatePath: string, context: SwarmContext): string {
  const template = readFileSync(templatePath, 'utf8');
  return renderTemplate(template, context);
}

export { TOKEN_MAP };
