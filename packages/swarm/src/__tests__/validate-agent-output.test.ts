import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const scriptPath = join(__dirname, '..', '..', 'scripts', 'validate-agent-output.sh');

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'swarm-validate-'));
});

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

function runValidator(role: string, reportContent: string): { code: number; output: string } {
  const reportPath = join(tmpDir, 'report.md');
  writeFileSync(reportPath, reportContent, 'utf8');
  try {
    const output = execSync(`bash ${scriptPath} ${role} ${reportPath}`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { code: 0, output };
  } catch (err: any) {
    return { code: err.status ?? 1, output: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

describe('T11: validate-agent-output', () => {
  it('T11.1 — exits 0 for valid adversarial-reviewer report with all required sections', () => {
    const report = [
      '# Adversarial Review',
      '## Build',
      'Build passed.',
      '## Verdict',
      'No blocking issues found.',
      'Blocking Issues: none',
      'Ratchet Delta: -2',
    ].join('\n');
    const result = runValidator('adversarial-reviewer', report);
    expect(result.code).toBe(0);
  });

  it('T11.2 — exits 1 for adversarial-reviewer report missing Verdict', () => {
    const report = ['# Adversarial Review', '## Build', 'Build passed.', 'Blocking Issues: none', 'Ratchet Delta: -2'].join('\n');
    const result = runValidator('adversarial-reviewer', report);
    expect(result.code).toBe(1);
  });

  it('T11.3 — exits 1 for adversarial-reviewer report missing Blocking Issues', () => {
    const report = ['# Adversarial Review', '## Build', 'Build passed.', '## Verdict', 'No issues.', 'Ratchet Delta: -2'].join('\n');
    const result = runValidator('adversarial-reviewer', report);
    expect(result.code).toBe(1);
  });

  it('T11.4 — exits 1 for adversarial-reviewer report missing Ratchet Delta', () => {
    const report = ['# Adversarial Review', '## Build', 'Build passed.', '## Verdict', 'No issues.', 'Blocking Issues: none'].join('\n');
    const result = runValidator('adversarial-reviewer', report);
    expect(result.code).toBe(1);
  });

  it('T11.5 — exits 0 for valid auditor report', () => {
    const report = ['# Auditor Report', '## Findings', 'Found 3 issues.', '## Verdict', 'HEAD SHA: abc123', 'All clear.'].join('\n');
    const result = runValidator('auditor', report);
    expect(result.code).toBe(0);
  });

  it('T11.6 — exits 1 for auditor report missing HEAD SHA', () => {
    const report = ['# Auditor Report', '## Findings', 'Found 3 issues.', '## Verdict', 'All clear.'].join('\n');
    const result = runValidator('auditor', report);
    expect(result.code).toBe(1);
  });

  it('T11.7 — exits 0 for valid spec-writer report', () => {
    const report = [
      '# Spec',
      '## Owned Files',
      '- src/index.ts',
      '## Exclusion Fence',
      '- none',
      '## Verification',
      '```bash',
      'pnpm test',
      '```',
    ].join('\n');
    const result = runValidator('spec-writer', report);
    expect(result.code).toBe(0);
  });

  it('T11.8 — exits 1 for spec-writer report missing Owned Files', () => {
    const report = ['# Spec', '## Exclusion Fence', '- none', '## Verification', '```bash', 'pnpm test', '```'].join('\n');
    const result = runValidator('spec-writer', report);
    expect(result.code).toBe(1);
  });

  it('T11.9 — exits 1 for unknown role', () => {
    const report = '# Some Report\n## Anything';
    const result = runValidator('unknown-role', report);
    expect(result.code).toBe(1);
  });
});
