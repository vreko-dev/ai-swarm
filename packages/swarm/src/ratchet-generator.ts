import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RatchetEntry } from './types.js';

interface RatchetMetric {
  metric: string;
  description: string;
  command: string;
}

const STANDARD_RATCHETS: RatchetMetric[] = [
  {
    metric: 'console_log',
    description: 'console.log statements in non-test source files',
    command:
      "grep -r 'console\\.log' --include='*.ts' --include='*.js' packages/ apps/ src/ lib/ 2>/dev/null | grep -v 'node_modules\\|dist\\|__tests__\\|\\.test\\.\\|\\.spec\\.' | wc -l | tr -d ' '",
  },
  {
    metric: 'as_any',
    description: 'TypeScript "as any" type assertions',
    command:
      "grep -r 'as any' --include='*.ts' packages/ apps/ src/ lib/ 2>/dev/null | grep -v 'node_modules\\|dist\\|__tests__\\|\\.test\\.\\|\\.spec\\.' | wc -l | tr -d ' '",
  },
  {
    metric: 'ts_ignore',
    description: '@ts-ignore and @ts-expect-error directives',
    command:
      "grep -r '@ts-ignore\\|@ts-expect-error' --include='*.ts' packages/ apps/ src/ lib/ 2>/dev/null | grep -v 'node_modules\\|dist' | wc -l | tr -d ' '",
  },
  {
    metric: 'skipped_tests',
    description: 'Skipped or todo test cases',
    command:
      "grep -r 'it\\.skip\\|it\\.todo\\|test\\.skip\\|test\\.todo\\|xit\\|xdescribe' --include='*.ts' --include='*.js' packages/ apps/ src/ lib/ 2>/dev/null | grep -v 'node_modules\\|dist' | wc -l | tr -d ' '",
  },
  {
    metric: 'empty_catches',
    description: 'Silent empty catch blocks that swallow errors',
    command:
      "grep -rn 'catch\\s*(.*)\\s*{\\s*}' --include='*.ts' packages/ apps/ src/ lib/ 2>/dev/null | grep -v 'node_modules\\|dist' | wc -l | tr -d ' '",
  },
];

function runCountCommand(command: string, projectRoot: string): number {
  try {
    const output = execSync(command, { cwd: projectRoot, encoding: 'utf8', timeout: 30000 }).trim();
    const count = parseInt(output, 10);
    return isNaN(count) ? 0 : count;
  } catch {
    return 0;
  }
}

export async function ratchetGenerator(
  projectRoot: string,
  outputPath?: string,
): Promise<{ ratchets: RatchetEntry[]; path: string }> {
  const root = resolve(projectRoot);
  const ratchets: RatchetEntry[] = [];

  for (const metric of STANDARD_RATCHETS) {
    const baseline = runCountCommand(metric.command, root);
    ratchets.push({
      metric: metric.metric,
      baseline,
      ciCheck: metric.command,
      description: metric.description,
    });
  }

  const output = {
    _meta: {
      generated_at: new Date().toISOString(),
      generator: 'ratchetGenerator()',
      project_root: root,
    },
    ratchets: ratchets.map((r) => ({
      metric: r.metric,
      baseline: r.baseline,
      ci_check: r.ciCheck,
      description: r.description,
    })),
  };

  const finalPath = outputPath || join(root, '.ai-swarm', 'ratchet.json');
  const dir = join(finalPath, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(finalPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

  return { ratchets, path: finalPath };
}
