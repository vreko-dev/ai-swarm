import { readFileSync } from 'node:fs';
import type { AgentFrontmatter } from './types.js';

const FRONTMATTER_DELIMITER = '---';

export function parseFrontmatter(content: string): { frontmatter: AgentFrontmatter | null; body: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
    return { frontmatter: null, body: content };
  }

  const endDelimiterIndex = trimmed.indexOf(FRONTMATTER_DELIMITER, FRONTMATTER_DELIMITER.length);
  if (endDelimiterIndex === -1) {
    return { frontmatter: null, body: content };
  }

  const yamlBlock = trimmed.slice(FRONTMATTER_DELIMITER.length, endDelimiterIndex).trim();
  const body = trimmed.slice(endDelimiterIndex + FRONTMATTER_DELIMITER.length).trim();

  const frontmatter = parseYamlFrontmatter(yamlBlock);
  return { frontmatter, body };
}

function parseYamlFrontmatter(yaml: string): AgentFrontmatter | null {
  const fields = parseSimpleYaml(yaml);

  if (!fields.name || !fields.description) {
    return null;
  }

  const tools = fields.tools
    ? String(fields.tools)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  return {
    name: String(fields.name),
    description: String(fields.description),
    tools,
    model: fields.model ? String(fields.model) : undefined,
  };
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

export function parseAgentTemplate(templatePath: string): { frontmatter: AgentFrontmatter | null; body: string } {
  const content = readFileSync(templatePath, 'utf8');
  return parseFrontmatter(content);
}

export function parseAgentTemplateString(content: string): { frontmatter: AgentFrontmatter | null; body: string } {
  return parseFrontmatter(content);
}
