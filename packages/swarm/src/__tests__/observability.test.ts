import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NoopObservability } from '../observability/noop.js';
import { LangfuseObservability } from '../observability/langfuse.js';
import type { PhaseEvent, RatchetScore, GateTiming, RetrospectiveEvidence } from '../types.js';

const mockTrace = { event: vi.fn(), score: vi.fn() };
const mockFlushAsync = vi.fn().mockResolvedValue(undefined);
const mockClient = {
  trace: vi.fn().mockReturnValue(mockTrace),
  flushAsync: mockFlushAsync,
};

vi.mock('langfuse', () => ({
  Langfuse: vi.fn().mockImplementation(function () { return mockClient; }),
}));

const { createObservability } = await import('../observability/index.js');

const ENV_BACKUP: Record<string, string | undefined> = {};
const ENV_KEYS = ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASEURL'];

beforeEach(() => {
  for (const key of ENV_KEYS) {
    ENV_BACKUP[key] = process.env[key];
    delete process.env[key];
  }
  vi.clearAllMocks();
  mockTrace.event.mockClear();
  mockTrace.score.mockClear();
  mockFlushAsync.mockClear();
  mockClient.trace.mockClear();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ENV_BACKUP[key] === undefined) delete process.env[key];
    else process.env[key] = ENV_BACKUP[key];
  }
});

function makePhaseEvent(): PhaseEvent {
  return {
    phase: 'implementation',
    role: 'implementer',
    timestamp: new Date().toISOString(),
    status: 'started',
  };
}

function makeRatchetScore(): RatchetScore {
  return { metric: 'console_log', count: 3, baseline: 5, delta: -2, status: 'pass' };
}

function makeGateTiming(): GateTiming {
  return { gateId: 'gate-1', openedAt: '2025-01-01T00:00:00Z', closedAt: null, durationHours: null };
}

function makeRetrospective(): RetrospectiveEvidence {
  return {
    specId: 'SPEC-001',
    auditGaps: [],
    ratchetDeltas: { increased: [], decreased: ['console_log'] },
    specOutcome: 'followed',
    gateEvents: [],
    externalResearchCitations: 2,
    unresolvedResearch: 0,
  };
}

describe('T6: observability', () => {
  it('T6.1 — NoopObservability implements all 5 SwarmObservability methods', () => {
    const noop = new NoopObservability();
    expect(typeof noop.emitPhaseEvent).toBe('function');
    expect(typeof noop.emitRatchetScores).toBe('function');
    expect(typeof noop.emitGateTiming).toBe('function');
    expect(typeof noop.emitRetrospective).toBe('function');
    expect(typeof noop.flush).toBe('function');
  });

  it('T6.2 — NoopObservability.emitPhaseEvent() does not throw', () => {
    const noop = new NoopObservability();
    expect(() => noop.emitPhaseEvent(makePhaseEvent())).not.toThrow();
  });

  it('T6.3 — NoopObservability.flush() resolves without error', async () => {
    const noop = new NoopObservability();
    await expect(noop.flush()).resolves.toBeUndefined();
  });

  it('T6.4 — createObservability({observabilityBackend:"none"}) returns NoopObservability', async () => {
    const obs = await createObservability({ observabilityBackend: 'none' });
    expect(obs).toBeInstanceOf(NoopObservability);
  });

  it('T6.5 — createObservability({observabilityBackend:"otel"}) returns NoopObservability', async () => {
    const obs = await createObservability({ observabilityBackend: 'otel' });
    expect(obs).toBeInstanceOf(NoopObservability);
  });

  it('T6.6 — createObservability({observabilityBackend:"langfuse"}) without env vars returns NoopObservability', async () => {
    const obs = await createObservability({ observabilityBackend: 'langfuse' });
    expect(obs).toBeInstanceOf(NoopObservability);
  });

  it('T6.7 — createObservability({observabilityBackend:"langfuse"}) with env vars returns LangfuseObservability', async () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    const obs = await createObservability({ observabilityBackend: 'langfuse' });
    expect(obs).toBeInstanceOf(LangfuseObservability);
  });

  it('T6.8 — LangfuseObservability.create() instantiates langfuse client with config', async () => {
    const obs = await LangfuseObservability.create({
      publicKey: 'pk-test',
      secretKey: 'sk-test',
      baseUrl: 'https://cloud.langfuse.com',
    });
    expect(obs).toBeInstanceOf(LangfuseObservability);
  });

  it('T6.9 — emitPhaseEvent() pushes to internal events array and calls trace.event()', () => {
    const obs = new LangfuseObservability(mockClient as any);
    obs.emitPhaseEvent(makePhaseEvent());
    expect(mockTrace.event).toHaveBeenCalled();
  });

  it('T6.10 — emitRatchetScores() calls trace.score() per score', () => {
    const obs = new LangfuseObservability(mockClient as any);
    const scores = [makeRatchetScore(), makeRatchetScore(), makeRatchetScore()];
    obs.emitRatchetScores(scores);
    expect(mockTrace.score).toHaveBeenCalledTimes(3);
  });

  it('T6.11 — emitGateTiming() calls trace.event() with gate metadata', () => {
    const obs = new LangfuseObservability(mockClient as any);
    obs.emitGateTiming(makeGateTiming());
    expect(mockTrace.event).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('gate:'),
      }),
    );
  });

  it('T6.12 — flush() calls client.flushAsync()', async () => {
    const obs = new LangfuseObservability(mockClient as any);
    await obs.flush();
    expect(mockFlushAsync).toHaveBeenCalled();
  });
});
