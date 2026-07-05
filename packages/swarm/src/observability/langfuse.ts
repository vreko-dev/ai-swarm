import type { PhaseEvent, RatchetScore, GateTiming, RetrospectiveEvidence, SwarmObservability } from '../types.js';

interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}

export class LangfuseObservability implements SwarmObservability {
  private client: any;
  private trace: any;
  private events: PhaseEvent[] = [];

  constructor(client: any) {
    this.client = client;
    this.trace = this.client.trace({
      name: 'swarm-session',
      timestamp: new Date(),
    });
  }

  static async create(config: LangfuseConfig): Promise<LangfuseObservability> {
    const mod: any = await import('langfuse');
    const Langfuse = mod.Langfuse || mod.default?.Langfuse || mod.default;
    const client = new Langfuse({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
    });
    return new LangfuseObservability(client);
  }

  emitPhaseEvent(event: PhaseEvent): void {
    this.events.push(event);
    if (this.trace) {
      this.trace.event({
        name: `phase:${event.phase}`,
        metadata: {
          role: event.role,
          status: event.status,
          timestamp: event.timestamp,
          ...event.metadata,
        },
      });
    }
  }

  emitRatchetScores(scores: RatchetScore[]): void {
    if (this.trace) {
      for (const score of scores) {
        this.trace.score({
          name: `ratchet:${score.metric}`,
          value: score.count,
          comment: `baseline: ${score.baseline}, delta: ${score.delta}, status: ${score.status}`,
        });
      }
    }
  }

  emitGateTiming(timing: GateTiming): void {
    if (this.trace) {
      this.trace.event({
        name: `gate:${timing.gateId}`,
        metadata: {
          openedAt: timing.openedAt,
          closedAt: timing.closedAt,
          durationHours: timing.durationHours,
        },
      });
    }
  }

  emitRetrospective(evidence: RetrospectiveEvidence): void {
    if (this.trace) {
      this.trace.event({
        name: 'retrospective',
        metadata: {
          specId: evidence.specId,
          auditGaps: evidence.auditGaps,
          ratchetDeltas: evidence.ratchetDeltas,
          specOutcome: evidence.specOutcome,
          gateEvents: evidence.gateEvents,
          externalResearchCitations: evidence.externalResearchCitations,
          unresolvedResearch: evidence.unresolvedResearch,
        },
      });
    }
  }

  async flush(): Promise<void> {
    if (this.client) {
      await this.client.flushAsync();
    }
  }
}
