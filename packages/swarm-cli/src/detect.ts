import { readdir, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface DetectionResult {
  packageManager: string | null;
  isMonorepo: boolean;
  workspacePackages: string[];
  hasTurbo: boolean;
  hasNx: boolean;
  hasMcpJson: boolean;
  hasLangfuse: boolean;
  hasOtel: boolean;
  hasAiSwarmDir: boolean;
  gitRoot: string | null;
}

export async function detectProject(projectRoot: string): Promise<DetectionResult> {
  const root = projectRoot;

  const packageManager = await detectPackageManager(root);
  const isMonorepo = await checkMonorepo(root, packageManager);
  const workspacePackages = isMonorepo ? await enumerateWorkspaces(root, packageManager) : [];
  const hasTurbo = existsSync(join(root, 'turbo.json'));
  const hasNx = existsSync(join(root, 'nx.json'));
  const hasMcpJson = existsSync(join(root, '.mcp.json'));
  const hasLangfuse = !!(process.env.LANGFUSE_PUBLIC_KEY || process.env.LANGFUSE_SECRET_KEY);
  const hasOtel = !!(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);
  const hasAiSwarmDir = existsSync(join(root, '.ai-swarm'));
  const gitRoot = await detectGitRoot(root);

  return {
    packageManager,
    isMonorepo,
    workspacePackages,
    hasTurbo,
    hasNx,
    hasMcpJson,
    hasLangfuse,
    hasOtel,
    hasAiSwarmDir,
    gitRoot,
  };
}

async function detectPackageManager(root: string): Promise<string | null> {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'bun.lockb'))) return 'bun';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'package-lock.json'))) return 'npm';
  return null;
}

async function checkMonorepo(root: string, pm: string | null): Promise<boolean> {
  if (pm === 'pnpm' && existsSync(join(root, 'pnpm-workspace.yaml'))) return true;
  if (existsSync(join(root, 'package.json'))) {
    try {
      const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      if (pkg.workspaces && Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function enumerateWorkspaces(root: string, pm: string | null): Promise<string[]> {
  if (pm === 'pnpm' && existsSync(join(root, 'pnpm-workspace.yaml'))) {
    try {
      const content = await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8');
      return content
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.startsWith('-'))
        .map((l: string) => l.replace(/^[-\s]+/, '').replace(/["']/g, ''));
    } catch {
      return [];
    }
  }
  return [];
}

async function detectGitRoot(root: string): Promise<string | null> {
  try {
    const { execSync } = await import('node:child_process');
    const result = execSync('git rev-parse --show-toplevel', { cwd: root, encoding: 'utf8' }).trim();
    return result;
  } catch {
    return null;
  }
}
