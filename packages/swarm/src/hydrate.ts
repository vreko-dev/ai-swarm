import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import type {
  SwarmContext,
  PackageManager,
  OwnedPackage,
  McpTool,
  ArchFenceRule,
  AntiPattern,
  RatchetEntry,
  GateConfig,
  ModelTierConfig,
  ObservabilityBackend,
} from './types.js';
import { MODEL_TIERS } from './model-tiers.js';

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager(projectRoot: string): Promise<PackageManager> {
  if (await fileExists(join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(join(projectRoot, 'bun.lockb'))) return 'bun';
  if (await fileExists(join(projectRoot, 'yarn.lock'))) return 'yarn';
  if (await fileExists(join(projectRoot, 'package-lock.json'))) return 'npm';
  return 'pnpm';
}

async function detectWorkspaces(projectRoot: string, pm: PackageManager): Promise<OwnedPackage[]> {
  const packages: OwnedPackage[] = [];

  if (pm === 'pnpm') {
    const wsPath = join(projectRoot, 'pnpm-workspace.yaml');
    if (await fileExists(wsPath)) {
      const content = await readFile(wsPath, 'utf8');
      const globs = content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('-'))
        .map((l) => l.replace(/^[-\s]+/, '').replace(/["']/g, ''));

      for (const glob of globs) {
        if (glob.includes('*')) {
          const baseDir = glob.replace(/\*.*$/, '');
          const dir = join(projectRoot, baseDir);
          if (existsSync(dir)) {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const pkgJsonPath = join(dir, entry.name, 'package.json');
                if (existsSync(pkgJsonPath)) {
                  const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
                  packages.push({
                    name: pkg.name || entry.name,
                    path: join(baseDir, entry.name),
                    private: pkg.private ?? false,
                  });
                }
              }
            }
          }
        } else {
          const pkgJsonPath = join(projectRoot, glob, 'package.json');
          if (existsSync(pkgJsonPath)) {
            const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
            packages.push({
              name: pkg.name || glob,
              path: glob,
              private: pkg.private ?? false,
            });
          }
        }
      }
    }
  }

  if (pm === 'npm' || pm === 'yarn') {
    const rootPkgPath = join(projectRoot, 'package.json');
    if (existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(await readFile(rootPkgPath, 'utf8'));
      const workspaces: string[] = rootPkg.workspaces || [];
      for (const ws of workspaces) {
        if (ws.includes('*')) {
          const baseDir = ws.replace(/\*.*$/, '');
          const dir = join(projectRoot, baseDir);
          if (existsSync(dir)) {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const pkgJsonPath = join(dir, entry.name, 'package.json');
                if (existsSync(pkgJsonPath)) {
                  const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
                  packages.push({
                    name: pkg.name || entry.name,
                    path: join(baseDir, entry.name),
                    private: pkg.private ?? false,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return packages;
}

function detectBuildCommands(
  projectRoot: string,
  pm: PackageManager,
  ownedPackages: OwnedPackage[],
): { build: string; lint: string; test: string; typecheck: string } {
  const hasTurbo = existsSync(join(projectRoot, 'turbo.json'));
  const hasNx = existsSync(join(projectRoot, 'nx.json'));
  const pmCmd = pm === 'pnpm' ? 'pnpm' : pm === 'yarn' ? 'yarn' : pm === 'bun' ? 'bun' : 'npm';

  if (hasTurbo) {
    return {
      build: `${pmCmd} turbo run build`,
      lint: `${pmCmd} turbo run lint`,
      test: `${pmCmd} turbo run test`,
      typecheck: `${pmCmd} turbo run typecheck`,
    };
  }

  if (hasNx) {
    return {
      build: `${pmCmd} nx run-many --target=build`,
      lint: `${pmCmd} nx run-many --target=lint`,
      test: `${pmCmd} nx run-many --target=test`,
      typecheck: `${pmCmd} nx run-many --target=typecheck`,
    };
  }

  const filterPrefix = ownedPackages.length > 0 ? `--filter=${ownedPackages.map((p) => p.name).join(' ')}` : '';
  return {
    build: `${pmCmd} run build ${filterPrefix}`.trim(),
    lint: `${pmCmd} run lint ${filterPrefix}`.trim(),
    test: `${pmCmd} run test ${filterPrefix}`.trim(),
    typecheck: `${pmCmd} run typecheck ${filterPrefix}`.trim(),
  };
}

async function detectMcpTools(projectRoot: string): Promise<McpTool[]> {
  const mcpPath = join(projectRoot, '.mcp.json');
  if (!existsSync(mcpPath)) return [];

  try {
    const content = await readFile(mcpPath, 'utf8');
    const config = JSON.parse(content);
    const tools: McpTool[] = [];

    if (config.mcpServers) {
      for (const [name, server] of Object.entries(config.mcpServers)) {
        const s = server as { command?: string; args?: string[]; env?: Record<string, string> };
        tools.push({ name, command: s.command, args: s.args, env: s.env });
      }
    }

    return tools;
  } catch {
    return [];
  }
}

function detectObservabilityBackend(): ObservabilityBackend {
  if (process.env.LANGFUSE_PUBLIC_KEY || process.env.LANGFUSE_SECRET_KEY) return 'langfuse';
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return 'otel';
  return 'none';
}

async function loadArchFenceRules(swarmDir: string): Promise<ArchFenceRule[]> {
  const fencePath = join(swarmDir, 'docs', 'reference', 'architecture-fence.txt');
  if (!existsSync(fencePath)) return [];

  const content = await readFile(fencePath, 'utf8');
  const rules: ArchFenceRule[] = [];
  let current: ArchFenceRule | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('PATTERN:')) {
      if (current) rules.push(current);
      current = { pattern: trimmed.replace('PATTERN:', '').trim(), allowedImports: [], forbiddenImports: [] };
    } else if (trimmed.startsWith('ALLOW:')) {
      current?.allowedImports.push(trimmed.replace('ALLOW:', '').trim());
    } else if (trimmed.startsWith('FORBID:')) {
      current?.forbiddenImports.push(trimmed.replace('FORBID:', '').trim());
    } else if (trimmed.startsWith('CANONICAL:')) {
      if (current) current.canonicalLocation = trimmed.replace('CANONICAL:', '').trim();
    }
  }
  if (current) rules.push(current);

  return rules;
}

async function loadAntiPatterns(swarmDir: string): Promise<AntiPattern[]> {
  const path = join(swarmDir, 'docs', 'reference', 'anti-patterns.md');
  if (!existsSync(path)) return [];

  const content = await readFile(path, 'utf8');
  const patterns: AntiPattern[] = [];
  const lines = content.split('\n');
  let current: AntiPattern | null = null;

  for (const line of lines) {
    const apMatch = line.match(/^##\s+(AP-\d+):\s+(.+)/);
    if (apMatch) {
      if (current) patterns.push(current);
      current = {
        id: apMatch[1],
        name: apMatch[2].trim(),
        description: '',
        rootCause: '',
        avoidanceRule: '',
        detectionCommand: '',
        mitigation: '',
      };
      continue;
    }
    if (current) {
      if (line.startsWith('**Root cause:**')) current.rootCause = line.replace(/\*\*Root cause:\*\*/, '').trim();
      else if (line.startsWith('**Rule:**')) current.avoidanceRule = line.replace(/\*\*Rule:\*\*/, '').trim();
      else if (line.startsWith('**Detection:**')) current.detectionCommand = line.replace(/\*\*Detection:\*\*/, '').trim();
      else if (line.startsWith('**Mitigation:**')) current.mitigation = line.replace(/\*\*Mitigation:\*\*/, '').trim();
      else if (line.trim() && !line.startsWith('#') && !line.startsWith('**')) {
        if (!current.description) current.description = line.trim();
      }
    }
  }
  if (current) patterns.push(current);

  return patterns;
}

async function loadRatchetBaselines(swarmDir: string): Promise<RatchetEntry[]> {
  const path = join(swarmDir, 'ratchet.json');
  if (!existsSync(path)) return [];

  try {
    const content = await readFile(path, 'utf8');
    const data = JSON.parse(content);
    return (data.ratchets || []).map((r: { metric: string; baseline: number; ci_check: string; description?: string }) => ({
      metric: r.metric,
      baseline: r.baseline,
      ciCheck: r.ci_check,
      description: r.description || '',
    }));
  } catch {
    return [];
  }
}

async function loadConfigOverride(projectRoot: string): Promise<Partial<SwarmContext> | null> {
  const configPaths = [
    join(projectRoot, 'ai-swarm.config.ts'),
    join(projectRoot, 'ai-swarm.config.js'),
    join(projectRoot, 'ai-swarm.config.json'),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        if (configPath.endsWith('.json')) {
          return JSON.parse(await readFile(configPath, 'utf8'));
        }
        const content = await readFile(configPath, 'utf8');
        const match = content.match(/export\s+default\s+({[\s\S]*})/);
        if (match) {
          return eval(`(${match[1]})`);
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

const DEFAULT_GATE_CONFIG: GateConfig[] = [
  { type: 'human-review', blocking: true, timeoutMinutes: 1440 },
  { type: 'build', blocking: true, timeoutMinutes: 30 },
  { type: 'test', blocking: true, timeoutMinutes: 60 },
  { type: 'adversarial-review', blocking: true, timeoutMinutes: 120 },
];

const DEFAULT_AUDIT_TEMPLATES = [
  'internal-ground-truth',
  'architecture-fence-check',
  'ratchet-baseline-capture',
  'caller-callee-impact',
  'test-inventory',
  'external-dependency-enumeration',
];

export async function hydrateContext(projectRoot: string): Promise<SwarmContext> {
  const root = resolve(projectRoot);
  const swarmDir = join(root, '.ai-swarm');

  const packageManager = await detectPackageManager(root);
  const ownedPackages = await detectWorkspaces(root, packageManager);
  const commands = detectBuildCommands(root, packageManager, ownedPackages);
  const mcpTools = await detectMcpTools(root);
  const observabilityBackend = detectObservabilityBackend();

  const archFenceRules = await loadArchFenceRules(swarmDir);
  const antiPatterns = await loadAntiPatterns(swarmDir);
  const ratchetBaselines = await loadRatchetBaselines(swarmDir);

  const auditTemplatePaths = DEFAULT_AUDIT_TEMPLATES.map((t) => `.ai-swarm/audit-templates/${t}.md`);
  const deferredWorkPath = '.ai-swarm/docs/reference/deferred-work.md';

  const modelTiers: ModelTierConfig[] = [...MODEL_TIERS];

  const baseContext: SwarmContext = {
    packageManager,
    buildCommand: commands.build,
    lintCommand: commands.lint,
    testCommand: commands.test,
    typecheckCommand: commands.typecheck,
    archFenceRules,
    ownedPackages,
    mcpTools,
    antiPatterns,
    ratchetBaselines,
    branchModel: { main: 'main', dev: 'dev', prefix: 'task/' },
    gateConfig: DEFAULT_GATE_CONFIG,
    auditTemplatePaths,
    deferredWorkPath,
    observabilityBackend,
    modelTiers,
  };

  const override = await loadConfigOverride(root);
  if (override) {
    Object.assign(baseContext, override);
  }

  return baseContext satisfies SwarmContext;
}
