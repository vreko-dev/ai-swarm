export type { SwarmObservability, PhaseEvent, RatchetScore, GateTiming, RetrospectiveEvidence } from '../types.js';
export { NoopObservability } from './noop.js';
export { LangfuseObservability } from './langfuse.js';

import type { SwarmContext, SwarmObservability } from '../types.js';
import { NoopObservability } from './noop.js';

export async function createObservability(context: Pick<SwarmContext, 'observabilityBackend'>): Promise<SwarmObservability> {
  switch (context.observabilityBackend) {
    case 'langfuse': {
      const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
      const secretKey = process.env.LANGFUSE_SECRET_KEY;
      if (!publicKey || !secretKey) {
        return new NoopObservability();
      }
      try {
        const { LangfuseObservability } = await import('./langfuse.js');
        return await LangfuseObservability.create({
          publicKey,
          secretKey,
          baseUrl: process.env.LANGFUSE_BASEURL,
        });
      } catch {
        return new NoopObservability();
      }
    }
    case 'otel':
      return new NoopObservability();
    case 'none':
    default:
      return new NoopObservability();
  }
}
