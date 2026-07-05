import type { PhaseEvent, RatchetScore, GateTiming, RetrospectiveEvidence, SwarmObservability } from '../types.js';

export class NoopObservability implements SwarmObservability {
  emitPhaseEvent(_event: PhaseEvent): void {}
  emitRatchetScores(_scores: RatchetScore[]): void {}
  emitGateTiming(_timing: GateTiming): void {}
  emitRetrospective(_evidence: RetrospectiveEvidence): void {}
  async flush(): Promise<void> {}
}
