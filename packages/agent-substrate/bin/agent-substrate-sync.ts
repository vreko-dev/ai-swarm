#!/usr/bin/env node
/**
 * agent-substrate sync
 *
 * Renders per-tool agent config from canonical source into a consumer repo.
 *
 * Design constraints (SOLO-FOUNDER-AGENT-OPS-01 §2.3):
 *   - No symlinks. Real files are written so they survive `git clone` and work
 *     on platforms without symlink support.
 *   - No dependency on the Claude Code settings `extends` field (not a stable
 *     API). Each per-tool config is rendered in full.
 *   - Every generated file carries the header:
 *         # Generated from @marcelle-labs/agent-substrate@{version}
 *     plus a content checksum, so drift / hand-edits are detectable.
 *   - `--dry-run` prints the file list and writes nothing.
 *
 * Canonical sources, in increasing precedence:
 *   1. <package>/templates/**      (shipped defaults)
 *   2. <cwd>/.agents/**            (consumer override; wins on path collision)
 * Each canonical file is rendered to the consumer repo at the same relative path.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const PACKAGE_NAME = '@marcelle-labs/agent-substrate';

export interface SyncTarget {
  /** Path relative to the consumer repo root, e.g. ".claude/settings.json". */
  relPath: string;
  /** Absolute path of the canonical source file. */
  sourceAbs: string;
  /** Which canonical layer the source came from. */
  origin: 'templates' | '.agents';
}

export interface SyncResult {
  version: string;
  packageRoot: string;
  cwd: string;
  dryRun: boolean;
  sources: { dir: string; present: boolean }[];
  targets: SyncTarget[];
  written: string[];
}

/** Walk up from `start` to find this package's root (folder with the matching package.json). */
function findPackageRoot(start: string): string {
  let dir = start;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pkgJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        if (pkg.name === PACKAGE_NAME) return dir;
      } catch {
        // ignore unparsable package.json and keep walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate ${PACKAGE_NAME} package root above ${start}`);
    }
    dir = parent;
  }
}

function readVersion(packageRoot: string): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  return pkg.version as string;
}

/** Recursively list files under `dir`, returning paths relative to `dir`. */
function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (abs: string, rel: string) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childAbs = path.join(abs, entry.name);
      const childRel = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(childAbs, childRel);
      } else if (entry.isFile()) {
        out.push(childRel);
      }
    }
  };
  walk(dir, '');
  return out;
}

/** A canonical file is rendered unless it is repo documentation (README.md). */
function isRenderable(relPath: string): boolean {
  return path.basename(relPath).toLowerCase() !== 'readme.md';
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Render a canonical file's body into the final managed file content, embedding
 * the generation header + checksum in a format the file type can carry.
 */
export function render(relPath: string, body: string, version: string): string {
  const stamp = `Generated from ${PACKAGE_NAME}@${version}`;
  const checksum = `sha256:${sha256(body)}`;
  const ext = path.extname(relPath).toLowerCase();

  if (ext === '.json') {
    // JSON cannot carry a `#` comment, so embed the header as keys at the top.
    const parsed = JSON.parse(body);
    const stamped = {
      _generated: stamp,
      _checksum: checksum,
      ...parsed,
    };
    return JSON.stringify(stamped, null, 2) + '\n';
  }

  // Hash-comment formats (Markdown, YAML, TOML, shell, plain text): prepend header lines.
  const header = [
    `# ${stamp}`,
    `# checksum: ${checksum}`,
    `# DO NOT EDIT — managed by \`agent-substrate sync\`. Edit the canonical source`,
    `# in the substrate (templates/) or this repo's .agents/ override.`,
    '',
    '',
  ].join('\n');
  return header + body;
}

interface ParsedArgs {
  dryRun: boolean;
  help: boolean;
  cwd: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  // Tolerate a leading `sync` subcommand (e.g. `agent-substrate sync --dry-run`).
  const args = argv[0] === 'sync' ? argv.slice(1) : argv.slice();
  const parsed: ParsedArgs = { dryRun: false, help: false, cwd: process.cwd() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run' || a === '-n') parsed.dryRun = true;
    else if (a === '--help' || a === '-h') parsed.help = true;
    else if (a === '--cwd') parsed.cwd = path.resolve(args[++i] ?? '.');
    else throw new Error(`Unknown argument: ${a}`);
  }
  return parsed;
}

const HELP = `agent-substrate sync — render canonical agent config into this repo

Usage:
  agent-substrate sync [--dry-run] [--cwd <dir>]

Options:
  -n, --dry-run   Print the file list that would be written; write nothing.
      --cwd <dir> Treat <dir> as the consumer repo root (default: cwd).
  -h, --help      Show this help.

Generated files carry:  # Generated from ${PACKAGE_NAME}@{version}`;

/** Core sync routine. Returns a structured result; prints a human report. */
export function sync(opts: { dryRun: boolean; cwd: string }): SyncResult {
  const packageRoot = findPackageRoot(__dirname);
  const version = readVersion(packageRoot);

  const templatesDir = path.join(packageRoot, 'templates');
  const agentsDir = path.join(opts.cwd, '.agents');

  const sources = [
    { dir: templatesDir, present: fs.existsSync(templatesDir), origin: 'templates' as const },
    { dir: agentsDir, present: fs.existsSync(agentsDir), origin: '.agents' as const },
  ];

  // Collect targets, with .agents overriding templates on identical relPath.
  const byRel = new Map<string, SyncTarget>();
  for (const src of sources) {
    if (!src.present) continue;
    for (const rel of listFiles(src.dir)) {
      if (!isRenderable(rel)) continue;
      byRel.set(rel, {
        relPath: rel,
        sourceAbs: path.join(src.dir, rel),
        origin: src.origin,
      });
    }
  }
  const targets = [...byRel.values()].sort((a, b) => a.relPath.localeCompare(b.relPath));

  const written: string[] = [];
  if (!opts.dryRun) {
    for (const t of targets) {
      const body = fs.readFileSync(t.sourceAbs, 'utf8');
      const content = render(t.relPath, body, version);
      const destAbs = path.join(opts.cwd, t.relPath);
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      fs.writeFileSync(destAbs, content, 'utf8'); // real file, never a symlink
      written.push(t.relPath);
    }
  }

  // Human-readable report.
  const mode = opts.dryRun ? ' (dry-run)' : '';
  process.stdout.write(`${PACKAGE_NAME}@${version} sync${mode}\n`);
  process.stdout.write(`consumer root: ${opts.cwd}\n`);
  process.stdout.write('canonical sources:\n');
  for (const s of sources) {
    process.stdout.write(`  - ${s.dir} ${s.present ? '' : '(not present)'}\n`);
  }
  const verb = opts.dryRun ? 'Would write' : 'Wrote';
  process.stdout.write(`${verb} ${targets.length} file(s):\n`);
  for (const t of targets) {
    process.stdout.write(`  ${t.relPath}  (from ${t.origin}/${t.relPath})\n`);
  }
  if (opts.dryRun) process.stdout.write('No files written (--dry-run).\n');

  return { version, packageRoot, cwd: opts.cwd, dryRun: opts.dryRun, sources, targets, written };
}

/** CLI entry. Parses argv and runs sync; sets process.exitCode on error. */
export function runSync(argv: string[]): void {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP}\n`);
    process.exitCode = 2;
    return;
  }
  if (parsed.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  try {
    sync({ dryRun: parsed.dryRun, cwd: parsed.cwd });
  } catch (err) {
    process.stderr.write(`agent-substrate sync failed: ${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runSync(process.argv.slice(2));
}
