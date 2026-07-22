import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@network-crm/database";

/**
 * Resource/action catalog for Stage 1 (Platform Foundation). This is the global,
 * tenant-independent vocabulary SEC-004 authorization checks are built from
 * (roles-and-permissions.md §1). Extending it for later stages (contacts, orders, ...)
 * means adding entries here, never inventing an ad hoc string in a route handler.
 */
export const PERMISSION_CATALOG: ReadonlyArray<{ resource: string; action: string }> = [
  { resource: "tenant", action: "read" },
  { resource: "tenant", action: "create" }, // platform-owner only
  { resource: "membership", action: "create" },
  { resource: "membership", action: "read" },
  { resource: "role", action: "create" },
  { resource: "role", action: "read" },
  { resource: "role", action: "permissions.update" },
  { resource: "audit", action: "read" },
  { resource: "session", action: "read" },
  { resource: "session", action: "revoke" },
  // Stage 2 (CRM Workbench, relationship-crm module)
  { resource: "contact", action: "create" },
  { resource: "contact", action: "read" },
  { resource: "contact", action: "update" },
  { resource: "contact", action: "archive" },
  { resource: "contact", action: "merge" },
  { resource: "consent", action: "create" },
  { resource: "consent", action: "read" },
  { resource: "activity", action: "create" },
  { resource: "activity", action: "read" },
  // Stage 2 (BL-207, work-management module)
  { resource: "task", action: "create" },
  { resource: "task", action: "read" },
  { resource: "task", action: "update" },
  { resource: "task", action: "delegate" },
];

function key(resource: string, action: string): string {
  return `${resource}:${action}`;
}

/** Idempotently ensures every catalog entry exists, returns a resource:action -> id map. */
export async function ensurePermissionCatalog(tx: Database): Promise<Map<string, string>> {
  for (const { resource, action } of PERMISSION_CATALOG) {
    await tx
      .insert(schema.permissions)
      .values({ id: randomUUID(), resource, action })
      .onConflictDoNothing({ target: [schema.permissions.resource, schema.permissions.action] });
  }
  const rows = await tx.select().from(schema.permissions);
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(key(row.resource, row.action), row.id);
  }
  return map;
}

/** Default grants for the bootstrap "Company Admin" role created by tenant provisioning. */
export const COMPANY_ADMIN_GRANTS: ReadonlyArray<{ resource: string; action: string }> = [
  { resource: "tenant", action: "read" },
  { resource: "membership", action: "create" },
  { resource: "membership", action: "read" },
  { resource: "role", action: "create" },
  { resource: "role", action: "read" },
  { resource: "role", action: "permissions.update" },
  { resource: "audit", action: "read" },
  { resource: "session", action: "read" },
  { resource: "session", action: "revoke" },
  { resource: "contact", action: "create" },
  { resource: "contact", action: "read" },
  { resource: "contact", action: "update" },
  { resource: "contact", action: "archive" },
  { resource: "contact", action: "merge" },
  { resource: "consent", action: "create" },
  { resource: "consent", action: "read" },
  { resource: "activity", action: "create" },
  { resource: "activity", action: "read" },
  { resource: "task", action: "create" },
  { resource: "task", action: "read" },
  { resource: "task", action: "update" },
  { resource: "task", action: "delegate" },
];

export async function findPermissionId(
  tx: Database,
  resource: string,
  action: string,
): Promise<string | undefined> {
  const [row] = await tx
    .select({ id: schema.permissions.id })
    .from(schema.permissions)
    .where(and(eq(schema.permissions.resource, resource), eq(schema.permissions.action, action)))
    .limit(1);
  return row?.id;
}
