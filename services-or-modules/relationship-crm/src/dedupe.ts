import { eq, or } from "drizzle-orm";
import { schema, type Database } from "@network-crm/database";
import type { DuplicateCandidate } from "@network-crm/contracts";

export interface DuplicateProbe {
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  externalId: string | null;
}

/** BRULE-CONTACT-003: surfaces candidates for merge, never silently blocks or auto-merges. */
export async function findDuplicateCandidates(tx: Database, probe: DuplicateProbe): Promise<DuplicateCandidate[]> {
  const conditions = [
    probe.normalizedPhone ? eq(schema.contacts.normalizedPhone, probe.normalizedPhone) : undefined,
    probe.normalizedEmail ? eq(schema.contacts.normalizedEmail, probe.normalizedEmail) : undefined,
    probe.externalId ? eq(schema.contacts.externalId, probe.externalId) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  if (conditions.length === 0) return [];

  const rows = await tx
    .select()
    .from(schema.contacts)
    .where(or(...conditions));

  return rows.map((row) => {
    const matchedOn: DuplicateCandidate["matched_on"] = [];
    if (probe.normalizedPhone && row.normalizedPhone === probe.normalizedPhone) matchedOn.push("phone");
    if (probe.normalizedEmail && row.normalizedEmail === probe.normalizedEmail) matchedOn.push("email");
    if (probe.externalId && row.externalId === probe.externalId) matchedOn.push("external_id");
    return { contact_id: row.id, display_name: row.displayName, matched_on: matchedOn };
  });
}
