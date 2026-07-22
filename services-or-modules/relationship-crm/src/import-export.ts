import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema, withTenantContext, type Database } from "@network-crm/database";
import { recordAuditEntry } from "@network-crm/governance";
import type { ActingIdentity } from "@network-crm/identity-tenant";
import { DomainError, type Contact, type ImportContactRow, type ImportContactsResult, type ImportRowOutcome } from "@network-crm/contracts";
import { requireObjectAccess, resolveBestScope } from "@network-crm/access";
import { findDuplicateCandidates } from "./dedupe.js";
import { mapContact } from "./mappers.js";
import { insertNewContact } from "./contacts.js";
import { normalizeEmail, normalizePhone } from "./normalize.js";

export interface ImportContactsInput {
  mode: "dry_run" | "commit";
  onDuplicate?: "skip" | "create_anyway";
  rows: ImportContactRow[];
}

/**
 * FR-CORE-006: column mapping happens client-side (the caller already maps CSV headers onto
 * ImportContactRow's fixed fields before calling this) — dry-run leaves the database
 * completely unchanged (ACC-003), and commit processes each row as its own atomic unit so one
 * bad row cannot roll back the rows around it (partial success). Safe to re-run: a row that
 * matches an existing contact defaults to "skipped_duplicate" rather than creating a second
 * record (ACC-MVP-005's "повторный безопасный запуск").
 */
export async function importContacts(
  db: Database,
  identity: ActingIdentity,
  input: ImportContactsInput,
  correlationId: string,
): Promise<ImportContactsResult> {
  await requireObjectAccess(db, identity, "contact", "create", { ownerUserId: identity.actorUserId });

  const onDuplicate = input.onDuplicate ?? "skip";
  const rows: ImportContactsResult["rows"] = [];
  let created = 0;
  let skippedDuplicate = 0;
  let failed = 0;

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index]!;
    try {
      // Not just the transport-layer Zod schema's job (FR-CORE-001: every layer validates) —
      // a row can reach this service directly from another module later, so display_name
      // being required is enforced here too, not only in apps/api's request schema.
      if (!row.display_name?.trim()) {
        throw new Error("display_name is required");
      }
      const normalizedPhone = row.phone ? normalizePhone(row.phone) : null;
      const normalizedEmail = row.email ? normalizeEmail(row.email) : null;

      const outcome = await withTenantContext(db, identity.tenantId, async (tx) => {
        const duplicates = await findDuplicateCandidates(tx, {
          normalizedPhone,
          normalizedEmail,
          externalId: row.external_id ?? null,
        });

        if (duplicates.length > 0 && onDuplicate === "skip") {
          return { outcome: "skipped_duplicate" as ImportRowOutcome };
        }
        if (input.mode === "dry_run") {
          return { outcome: "would_create" as ImportRowOutcome };
        }

        const contact = await insertNewContact(tx, identity, row, normalizedPhone, normalizedEmail, correlationId);
        return { outcome: "created" as ImportRowOutcome, contactId: contact.id };
      });

      rows.push({ row_index: index, outcome: outcome.outcome, contact_id: outcome.contactId });
      if (outcome.outcome === "created") created += 1;
      else if (outcome.outcome === "skipped_duplicate") skippedDuplicate += 1;
    } catch (err) {
      failed += 1;
      rows.push({ row_index: index, outcome: "failed", error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  const batchId = randomUUID();
  await withTenantContext(db, identity.tenantId, (tx) =>
    recordAuditEntry(tx, {
      tenant_id: identity.tenantId,
      actor_user_id: identity.actorUserId,
      action: input.mode === "commit" ? "contact.import.committed" : "contact.import.dry_run",
      resource_type: "contact_import_batch",
      resource_id: batchId,
      before: null,
      after: { total: input.rows.length, created, skipped_duplicate: skippedDuplicate, failed },
      reason: null,
      correlation_id: correlationId,
    }),
  );

  return {
    mode: input.mode,
    total: input.rows.length,
    created,
    skipped_duplicate: skippedDuplicate,
    failed,
    rows,
  };
}

/**
 * FR-CORE-007: honors the same scope filter as listContacts (no separate, wider "export"
 * scope), returns only the DTO's already-public fields (no extra columns), and is audited
 * (SEC-014) — a distinct, separately-permissioned action would be a future refinement once a
 * tenant actually needs export restricted more tightly than ordinary read.
 */
export async function exportContactsCsv(db: Database, identity: ActingIdentity, correlationId: string): Promise<string> {
  const scope = await resolveBestScope(db, identity, "contact", "read");
  if (!scope) {
    throw new DomainError("PERMISSION_DENIED", "Not permitted: contact.read");
  }

  return withTenantContext(db, identity.tenantId, async (tx) => {
    let contacts: Contact[] = [];
    if (scope === "tenant" || scope === "platform" || scope === "owned") {
      const ownerFilter = scope === "owned" ? eq(schema.contacts.ownerUserId, identity.actorUserId) : undefined;
      const dbRows = await tx.select().from(schema.contacts).where(ownerFilter).orderBy(schema.contacts.createdAt);
      contacts = dbRows.map(mapContact);
    }

    const batchId = randomUUID();
    await recordAuditEntry(tx, {
      tenant_id: identity.tenantId,
      actor_user_id: identity.actorUserId,
      action: "contact.exported",
      resource_type: "contact_export_batch",
      resource_id: batchId,
      before: null,
      after: { count: contacts.length },
      reason: null,
      correlation_id: correlationId,
    });

    return toCsv(contacts);
  });
}

const CSV_COLUMNS = ["display_name", "full_name", "source", "phone", "email", "external_id", "status"] as const;

function csvEscape(value: string | null): string {
  const v = value ?? "";
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function toCsv(contacts: Contact[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const c of contacts) {
    lines.push(
      [
        csvEscape(c.display_name),
        csvEscape(c.full_name),
        csvEscape(c.source),
        csvEscape(c.normalized_phone),
        csvEscape(c.normalized_email),
        csvEscape(c.external_id),
        csvEscape(c.status),
      ].join(","),
    );
  }
  return lines.join("\n");
}
