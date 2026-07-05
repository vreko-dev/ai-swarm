#!/usr/bin/env node
/**
 * agent-substrate — top-level CLI dispatcher.
 *
 * This is the bin invoked by `pnpm dlx @marcelle-labs/agent-substrate <command>`.
 * It routes subcommands to their implementations.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runSync } from './agent-substrate-sync';

const PACKAGE_NAME = '@marcelle-labs/agent-substrate';

const HELP = `${PACKAGE_NAME} — shared agent operating substrate

Usage:
  agent-substrate <command> [options]

Commands:
  sync [--dry-run]   Render canonical agent config into this repo.

Run \`agent-substrate sync --help\` for command options.`;

function main(argv: string[]): void {
  const [command, ...rest] = argv;
  switch (command) {
    case 'sync':
      runSync(rest);
      break;
    case undefined:
    case '--help':
    case '-h':
      process.stdout.write(`${HELP}\n`);
      break;
    case '--version':
    case '-v': {
      const pkgPath = path.join(__dirname, '..', '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      process.stdout.write(`${pkg.version}\n`);
      break;
    }
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}\n`);
      process.exitCode = 2;
  }
}

main(process.argv.slice(2));
