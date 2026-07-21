import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema for Stage 1 (Platform Foundation, docs/mvp-backlog.md BL-101..107).
 * Tenant isolation (ADR-0002): tables that hold tenant business/config data carry
 * tenant_id and are protected by Postgres RLS (see migrations/0001_init.sql).
 * Identity tables (users, sessions, refresh_tokens, mfa_challenges) are intentionally
 * NOT tenant-scoped — a User can hold memberships in multiple tenants (QST-017) — and
 * rely on application-layer authorization only.
 */

export const tenantStatus = pgEnum("tenant_status", ["trial", "active", "suspended", "closed"]);
export const userStatus = pgEnum("user_status", ["active", "suspended", "deactivated"]);
export const membershipStatus = pgEnum("membership_status", ["active", "suspended"]);
export const roleScope = pgEnum("role_scope", [
  "self",
  "owned",
  "assigned",
  "mentored",
  "branch",
  "tenant",
  "platform",
]);
export const permissionEffect = pgEnum("permission_effect", ["allow", "deny"]);
export const fieldSensitivity = pgEnum("field_sensitivity", ["none", "pii_standard", "pii_sensitive"]);
export const sessionKind = pgEnum("session_kind", ["identity", "tenant"]);

// ---- ENT-001 Tenant ----
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: tenantStatus("status").notNull().default("trial"),
    defaultLocale: text("default_locale").notNull().default("ru"),
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(0),
  },
  (t) => [uniqueIndex("tenants_slug_unique").on(t.slug)],
);

// ---- ENT-003 User (tenant-independent identity, QST-017) ----
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    loginIdentity: text("login_identity").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    status: userStatus("status").notNull().default("active"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecret: text("mfa_secret"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(0),
  },
  (t) => [uniqueIndex("users_login_identity_unique").on(t.loginIdentity)],
);

// ---- Membership: User x Tenant ----
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: membershipStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(0),
  },
  (t) => [
    uniqueIndex("memberships_tenant_user_unique").on(t.tenantId, t.userId),
    index("memberships_tenant_idx").on(t.tenantId),
  ],
);

// ---- ENT-004 Role (tenant-scoped) ----
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    scope: roleScope("scope").notNull(),
    branchDepth: integer("branch_depth"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(0),
  },
  (t) => [uniqueIndex("roles_tenant_code_unique").on(t.tenantId, t.code)],
);

// ---- ENT-005 Permission (global resource/action catalog) ----
export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey(),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
  },
  (t) => [uniqueIndex("permissions_resource_action_unique").on(t.resource, t.action)],
);

// ---- Role -> Permission bindings (tenant-scoped, drives packages/authz) ----
export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id),
    effect: permissionEffect("effect").notNull().default("allow"),
    scope: roleScope("scope").notNull(),
    branchDepth: integer("branch_depth"),
    allowedFieldSensitivity: jsonb("allowed_field_sensitivity").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("role_permissions_tenant_idx").on(t.tenantId),
    index("role_permissions_role_idx").on(t.roleId),
    uniqueIndex("role_permissions_unique").on(t.roleId, t.permissionId),
  ],
);

// ---- Membership -> Role assignment ----
export const membershipRoles = pgTable(
  "membership_roles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("membership_roles_unique").on(t.membershipId, t.roleId),
    index("membership_roles_tenant_idx").on(t.tenantId),
  ],
);

// ---- Auth: MFA challenge, session, refresh token (ADR-0003) ----
// TOTP verification is stateless (derived from users.mfa_secret + current time, RFC 6238);
// this table only tracks which pending login is awaiting a code and prevents replay of a
// consumed challenge — it does not store the code itself.
export const mfaChallenges = pgTable("mfa_challenges", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  membershipId: uuid("membership_id").references(() => memberships.id),
  kind: sessionKind("kind").notNull().default("identity"),
  mfaVerified: boolean("mfa_verified").notNull().default(false),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    tokenHash: text("token_hash").notNull(),
    familyId: uuid("family_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedById: uuid("replaced_by_id"),
  },
  (t) => [uniqueIndex("refresh_tokens_token_hash_unique").on(t.tokenHash)],
);

// ---- ENT-050 AuditLog (append-only, SEC-007/SEC-008) ----
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    correlationId: uuid("correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_tenant_idx").on(t.tenantId),
    index("audit_log_correlation_idx").on(t.correlationId),
  ],
);

// ---- Transactional outbox / inbox (ADR-0005) ----
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    eventId: uuid("event_id").notNull(),
    eventType: text("event_type").notNull(),
    schemaVersion: text("schema_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    aggregateVersion: integer("aggregate_version").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    causationId: uuid("causation_id"),
    producer: text("producer").notNull(),
    payload: jsonb("payload").notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("outbox_events_event_id_unique").on(t.eventId),
    index("outbox_events_tenant_idx").on(t.tenantId),
    index("outbox_events_dispatched_idx").on(t.dispatchedAt),
  ],
);

export const inboxConsumed = pgTable(
  "inbox_consumed",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    eventId: uuid("event_id").notNull(),
    consumerName: text("consumer_name").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inbox_consumed_event_consumer_unique").on(t.eventId, t.consumerName)],
);
