import { z } from 'zod';

export const eventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  source: z.string().min(1),
  timestamp: z.string().datetime(),
  correlationId: z.string().uuid(),
  payload: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export function createEventEnvelope(
  type: string,
  payload: Record<string, unknown>,
  correlationId: string,
): EventEnvelope {
  return {
    id: crypto.randomUUID(),
    type,
    source: 'marketplace-api',
    timestamp: new Date().toISOString(),
    correlationId,
    payload,
  };
}
