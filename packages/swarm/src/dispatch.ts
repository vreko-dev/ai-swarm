import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DispatchOptions, Role, SwarmContext } from './types.js';
import { getModelForRole } from './model-tiers.js';
import { renderTemplate } from './render-template.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROLE_TOOLS: Record<Role, string[]> = {
  conductor: ['Read', 'Grep', 'Glob', 'Bash', 'Task'],
  auditor: ['Read', 'Grep', 'Glob', 'Bash'],
  'spec-writer': ['Read', 'Grep', 'Glob', 'Bash'],
  implementer: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  'drift-detector': ['Read', 'Grep', 'Glob', 'Bash'],
  'adversarial-reviewer': ['Read', 'Grep', 'Glob', 'Bash'],
  reviewer: ['Read', 'Grep', 'Glob', 'Bash'],
  gatekeeper: ['Read', 'Grep', 'Glob', 'Bash'],
  integrator: ['Read', 'Write', 'Grep', 'Glob', 'Bash'],
  researcher: ['Read', 'Grep', 'Glob', 'Bash'],
  devsecops: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  'technical-writer': ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  'release-manager': ['Read', 'Grep', 'Glob', 'Bash'],
  'master-coordinator': ['Read', 'Grep', 'Glob', 'Bash', 'Task'],
};

function loadAgentTemplate(role: Role): string {
  const templatePath = join(__dirname, '..', 'templates', 'agents', `${role}.md`);
  return readFileSync(templatePath, 'utf8');
}

export async function dispatchRole(options: DispatchOptions): Promise<string> {
  const { role, taskPrompt, context, tools, excludeDynamicSections = true, workingDirectory, agents, hooks } = options;

  const modelConfig = getModelForRole(role);
  const roleTools = tools || ROLE_TOOLS[role];

  const agentTemplate = loadAgentTemplate(role);
  const renderedPrompt = renderTemplate(agentTemplate, context);

  let sdk: any;
  try {
    sdk = await import('@anthropic-ai/claude-agent-sdk');
  } catch {
    throw new Error(
      `@anthropic-ai/claude-agent-sdk is not installed. ` +
        `This is an optional peer dependency — install it with: npm install @anthropic-ai/claude-agent-sdk\n` +
        `The harness works in shell-only mode without the SDK. ` +
        `Use the shell scripts in packages/swarm/scripts/ for dispatch without the SDK.`,
    );
  }

  const hasAgents = agents && Object.keys(agents).length > 0;
  const allowedTools = hasAgents
    ? [...roleTools.map((t) => t), 'Agent']
    : roleTools.map((t) => t);

  const dispatchConfig: Record<string, unknown> = {
    model: modelConfig.model,
    systemPrompt: {
      append: renderedPrompt,
      preset: 'claude_code' as const,
    },
    excludeDynamicSections,
    settingSources: ['project'] as const,
    allowedTools,
    cwd: workingDirectory || process.cwd(),
    prompt: taskPrompt,
  };

  if (agents && Object.keys(agents).length > 0) {
    dispatchConfig.agents = agents;
  }

  if (hooks) {
    dispatchConfig.hooks = hooks;
  }

  const result = await sdk.query(dispatchConfig);

  if (result && typeof result.text === 'string') {
    return result.text;
  }

  return String(result);
}

export { ROLE_TOOLS };
