import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';

export async function confirm(message: string, defaultValue: boolean = false): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const suffix = defaultValue ? ' [Y/n] ' : ' [y/N] ';

  return new Promise((resolve) => {
    rl.question(message + suffix, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') return resolve(defaultValue);
      return resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

export async function prompt(message: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const suffix = defaultValue ? ` [${defaultValue}] ` : ' ';

  return new Promise((resolve) => {
    rl.question(message + suffix, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed === '' && defaultValue) return resolve(defaultValue);
      return resolve(trimmed);
    });
  });
}

export async function confirmDetection(detections: Record<string, unknown>): Promise<Record<string, unknown>> {
  const confirmed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(detections)) {
    if (typeof value === 'boolean') {
      const result = await confirm(`  ${key}: ${value}?`, value);
      confirmed[key] = result;
    } else if (typeof value === 'string') {
      const result = await prompt(`  ${key}:`, value);
      confirmed[key] = result;
    } else {
      confirmed[key] = value;
    }
  }

  return confirmed;
}
