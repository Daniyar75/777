import type { schema } from "@network-crm/database";
import type { Tenant } from "@network-crm/contracts";

type TenantRow = typeof schema.tenants.$inferSelect;

export function mapTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    default_locale: row.defaultLocale,
    timezone: row.timezone,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    version: row.version,
  };
}
