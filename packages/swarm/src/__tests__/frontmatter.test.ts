import { describe, it, expect } from 'vitest';
import { parseFrontmatter, parseAgentTemplateString } from '../frontmatter.js';

describe('T5: frontmatter parsing', () => {
  it('T5.1 — parses valid frontmatter with name, description, and tools', () => {
    const content = `---
name: conductor
description: Orchestrates the swarm pipeline, manages worktrees, enforces gate discipline.
tools: Read, Grep, Glob, Bash, Task
---

# Role: Conductor

You are the conductor.`;

    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter!.name).toBe('conductor');
    expect(frontmatter!.description).toContain('Orchestrates');
    expect(frontmatter!.tools).toEqual(['Read', 'Grep', 'Glob', 'Bash', 'Task']);
    expect(body).toContain('# Role: Conductor');
    expect(body).not.toContain('---');
  });

  it('T5.2 — returns null frontmatter when no frontmatter block exists', () => {
    const content = `# Role: Conductor

You are the conductor.`;

    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter).toBeNull();
    expect(body).toBe(content);
  });

  it('T5.3 — returns null frontmatter when required fields are missing', () => {
    const content = `---
name: conductor
---

# Role: Conductor`;

    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter).toBeNull();
  });

  it('T5.4 — handles empty tools field', () => {
    const content = `---
name: auditor
description: Auditor role.
tools:
---

# Role: Auditor`;

    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter!.tools).toEqual([]);
  });

  it('T5.5 — parses frontmatter with model field', () => {
    const content = `---
name: adversarial-reviewer
description: Adversarial code reviewer.
tools: Read, Grep, Glob, Bash
model: opus
---

# Role: Adversarial Reviewer`;

    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter!.model).toBe('opus');
  });

  it('T5.6 — trims whitespace in tool list', () => {
    const content = `---
name: implementer
description: Spec executor.
tools:  Read ,  Write ,  Edit , Grep , Glob , Bash
---

# Role: Implementer`;

    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter!.tools).toEqual(['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash']);
  });

  it('T5.7 — handles leading whitespace before frontmatter delimiter', () => {
    const content = `
---
name: gatekeeper
description: Gatekeeper role.
tools: Read, Grep, Glob, Bash
---

# Role: Gatekeeper`;

    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter!.name).toBe('gatekeeper');
  });

  it('T5.8 — parseAgentTemplateString is alias for parseFrontmatter', () => {
    const content = `---
name: researcher
description: Researcher role.
tools: Read, Grep, Glob, Bash
---

# Role: Researcher`;

    const result1 = parseFrontmatter(content);
    const result2 = parseAgentTemplateString(content);

    expect(result2.frontmatter).toEqual(result1.frontmatter);
    expect(result2.body).toEqual(result1.body);
  });

  it('T5.9 — handles unclosed frontmatter delimiter', () => {
    const content = `---
name: conductor
description: Orchestrates.

# Role: Conductor`;

    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter).toBeNull();
    expect(body).toBe(content);
  });

  it('T5.10 — ignores YAML comments', () => {
    const content = `---
# This is a comment
name: conductor
description: Orchestrates.
tools: Read, Grep, Glob, Bash
---

# Role: Conductor`;

    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter!.name).toBe('conductor');
  });
});
