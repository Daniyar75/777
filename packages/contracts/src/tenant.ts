import { z } from "zod";
import { systemFields } from "./common.js";

/** ENT-001 Tenant. slug is globally unique (data-dictionary.md ENT-001). */
export const TenantStatus = z.enum(["trial", "active", "suspended", "closed"]);
export type TenantStatus = z.infer<typeof TenantStatus>;

export const Tenant = z.object({
  id: systemFields.id,
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "lowercase alphanumeric and hyphens only"),
  status: TenantStatus,
  default_locale: z.string().min(2).max(10),
  timezone: z.string().min(1), // IANA zone, ASM-015
  created_at: systemFields.created_at,
  updated_at: systemFields.updated_at,
  version: systemFields.version,
});
export type Tenant = z.infer<typeof Tenant>;

export const ProvisionTenantRequest = z.object({
  name: z.string().min(1).max(200),
  slug: Tenant.shape.slug,
  default_locale: z.string().min(2).max(10).default("ru"),
  timezone: z.string().min(1).default("UTC"),
  admin_email: z.string().email(),
});
export type ProvisionTenantRequest = z.infer<typeof ProvisionTenantRequest>;
