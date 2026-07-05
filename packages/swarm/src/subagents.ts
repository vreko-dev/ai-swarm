import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentDefinition, AgentFrontmatter, Role, SwarmContext } from './types.js';
import { getModelForRole } from './model-tiers.js';
import { renderTemplate } from './render-template.js';
import { parseFrontmatter } from './frontmatter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEMPLATE_DIR = join(__dirname, '..', 'templates', 'agents');

export function buildAgentDefinition(
  role: Role,
  frontmatter: AgentFrontmatter,
  renderedPrompt: string,
): AgentDefinition {
  const modelConfig = getModelForRole(role);
  const modelAlias = modelConfig.tier;

  return {
    description: frontmatter.description,
    tools: frontmatter.tools.length > 0 ? frontmatter.tools : undefined,
    prompt: renderedPrompt,
    model: frontmatter.model || modelAlias,
  };
}

export function buildSubagentMap(
  context: SwarmContext,
  roles?: Role[],
): Record<string, AgentDefinition> {
  const agents: Record<string, AgentDefinition> = {};

  if (!existsSync(TEMPLATE_DIR)) {
    return agents;
  }

  const files = readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith('.md'));
  const targetRoles = roles || files.map((f) => f.replace('.md', '') as Role);

  for (const file of files) {
    const role = file.replace('.md', '') as Role;
    if (!targetRoles.includes(role)) continue;

    const templatePath = join(TEMPLATE_DIR, file);
    const content = readFileSync(templatePath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(content);

    if (!frontmatter) continue;

    const renderedPrompt = renderTemplate(body, context);
    agents[role] = buildAgentDefinition(role, frontmatter, renderedPrompt);
  }

  return agents;
}

export function buildSubagentMapFromDir(
  agentsDir: string,
  context: SwarmContext,
  roles?: Role[],
): Record<string, AgentDefinition> {
  const agents: Record<string, AgentDefinition> = {};

  if (!existsSync(agentsDir)) {
    return agents;
  }

  const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const role = file.replace('.md', '') as Role;
    if (roles && !roles.includes(role)) continue;

    const templatePath = join(agentsDir, file);
    const content = readFileSync(templatePath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(content);

    if (!frontmatter) continue;

    const renderedPrompt = renderTemplate(body, context);
    agents[role] = buildAgentDefinition(role, frontmatter, renderedPrompt);
  }

  return agents;
}
