import { z } from "zod";

/**
 * Mandatory envelope for every domain event, per docs/requirements/event-catalog.md preamble
 * and docs/events/asyncapi-skeleton.yaml components.schemas.EventEnvelope.
 */
export const EventEnvelope = z.object({
  event_id: z.string().uuid(),
  event_type: z.string().min(1),
  schema_version: z.string().min(1),
  occurred_at: z.string().datetime(),
  tenant_id: z.string().uuid(),
  aggregate_type: z.string().min(1),
  aggregate_id: z.string().uuid(),
  aggregate_version: z.number().int().nonnegative(),
  correlation_id: z.string().uuid(),
  causation_id: z.string().uuid().nullable(),
  producer: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;
