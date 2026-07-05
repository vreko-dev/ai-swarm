import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as readline from 'node:readline';
import { confirm, prompt, confirmDetection } from '../confirm.js';

vi.mock('node:readline', () => ({
  createInterface: vi.fn(),
  default: {
    createInterface: vi.fn(),
  },
}));

vi.mock('node:process', () => ({
  stdin: {},
  stdout: {},
}));

const mockCreateInterface = vi.mocked(readline.createInterface);

function mockReadline(answer: string) {
  mockCreateInterface.mockReturnValueOnce({
    question: (_prompt: string, cb: (answer: string) => void) => cb(answer),
    close: vi.fn(),
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('T14: confirm (swarm-cli)', () => {
  it('T14.1 — confirm() returns true for "y" input', async () => {
    mockReadline('y');
    const result = await confirm('Proceed?');
    expect(result).toBe(true);
  });

  it('T14.2 — confirm() returns true for "yes" input', async () => {
    mockReadline('yes');
    const result = await confirm('Proceed?');
    expect(result).toBe(true);
  });

  it('T14.3 — confirm() returns false for "n" input', async () => {
    mockReadline('n');
    const result = await confirm('Proceed?');
    expect(result).toBe(false);
  });

  it('T14.4 — confirm() returns defaultValue for empty input', async () => {
    mockReadline('');
    const result = await confirm('Proceed?', true);
    expect(result).toBe(true);
  });

  it('T14.5 — prompt() returns user input string', async () => {
    mockReadline('custom-value');
    const result = await prompt('Enter name:');
    expect(result).toBe('custom-value');
  });

  it('T14.6 — prompt() returns defaultValue for empty input', async () => {
    mockReadline('');
    const result = await prompt('Enter name:', 'default-name');
    expect(result).toBe('default-name');
  });

  it('T14.7 — confirmDetection() routes string values through prompt()', async () => {
    mockReadline('overridden-value');
    const result = await confirmDetection({ name: 'original-value' });
    expect(result.name).toBe('overridden-value');
  });

  it('T14.8 — confirmDetection() routes boolean values through confirm()', async () => {
    mockReadline('y');
    const result = await confirmDetection({ isMonorepo: true });
    expect(result.isMonorepo).toBe(true);
  });

  it('T14.9 — confirmDetection() passes through non-string/non-boolean values unchanged', async () => {
    const numValue = 42;
    const objValue = { key: 'value' };
    const result = await confirmDetection({ count: numValue, meta: objValue });
    expect(result.count).toBe(numValue);
    expect(result.meta).toBe(objValue);
  });
});
