import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AddContactRoleRequest,
  Contact,
  CreateContactRequest,
  ImportContactsRequest,
  LogActivityRequest,
  MergeContactsRequest,
  RecordConsentRequest,
} from "@network-crm/contracts";
import {
  addContactRole,
  archiveContact,
  createContact,
  exportContactsCsv,
  getContact,
  getTimeline,
  importContacts,
  listActivities,
  listConsents,
  listContactDuplicates,
  listContactRoles,
  listContacts,
  logActivity,
  mergeContacts,
  recordConsent,
} from "@network-crm/relationship-crm";
import type { TokenService } from "@network-crm/identity-tenant";
import type { Database } from "@network-crm/database";
import { requireIdentity, requireTenantIdentity } from "../auth-context.js";

const IdParam = z.object({ id: z.string().uuid() });
const ListQuery = z.object({
  cursor: z.string().optional(),
  page_size: z.coerce.number().int().min(1).max(200).optional(),
});

export function registerContactRoutes(app: FastifyInstance, deps: { db: Database; tokenService: TokenService }) {
  app.post("/contacts", async (request, reply) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const input = CreateContactRequest.parse(request.body);
    const contact = await createContact(
      deps.db,
      identity,
      {
        display_name: input.display_name,
        full_name: input.full_name,
        source: input.source,
        phone: input.phone,
        email: input.email,
        external_id: input.external_id,
        confirm_despite_duplicates: input.confirm_despite_duplicates,
      },
      randomUUID(),
    );
    reply.code(201);
    return Contact.parse(contact);
  });

  app.get("/contacts", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const query = ListQuery.parse(request.query);
    const result = await listContacts(deps.db, identity, { cursor: query.cursor, pageSize: query.page_size });
    return { items: result.items, next_cursor: result.nextCursor };
  });

  app.get("/contacts/:id", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    return Contact.parse(await getContact(deps.db, identity, id));
  });

  app.post("/contacts/:id/archive", async (request, reply) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    await archiveContact(deps.db, identity, id, randomUUID());
    reply.code(204);
  });

  app.post("/contacts/:id/roles", async (request, reply) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    const input = AddContactRoleRequest.parse(request.body);
    const role = await addContactRole(deps.db, identity, id, input.role_type, randomUUID());
    reply.code(201);
    return role;
  });

  app.get("/contacts/:id/roles", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    return { items: await listContactRoles(deps.db, identity, id), next_cursor: null };
  });

  app.post("/contacts/:id/consents", async (request, reply) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    const input = RecordConsentRequest.parse(request.body);
    const consent = await recordConsent(deps.db, identity, id, input, randomUUID());
    reply.code(201);
    return consent;
  });

  app.get("/contacts/:id/consents", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    return { items: await listConsents(deps.db, identity, id), next_cursor: null };
  });

  app.post("/contacts/:id/activities", async (request, reply) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    const input = LogActivityRequest.parse(request.body);
    const activity = await logActivity(
      deps.db,
      identity,
      id,
      { type: input.type, summary: input.summary, occurredAt: input.occurred_at },
      randomUUID(),
    );
    reply.code(201);
    return activity;
  });

  app.get("/contacts/:id/activities", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    return { items: await listActivities(deps.db, identity, id), next_cursor: null };
  });

  app.get("/contacts/:id/timeline", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    return { items: await getTimeline(deps.db, identity, id) };
  });

  // BL-203 (FR-CORE-006): column mapping is a client-side step (apps/web maps CSV headers onto
  // ImportContactRow before calling this) — the API only ever sees already-mapped rows.
  app.post("/contacts/import", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const input = ImportContactsRequest.parse(request.body);
    return importContacts(deps.db, identity, { mode: input.mode, onDuplicate: input.on_duplicate, rows: input.rows }, randomUUID());
  });

  // BL-203 (FR-CORE-007): same scope filter as GET /contacts, no separate wider export scope.
  app.get("/contacts/export", async (request, reply) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const csv = await exportContactsCsv(deps.db, identity, randomUUID());
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="contacts.csv"');
    return csv;
  });

  // BL-206 (FR-CONTACT-005)
  app.get("/contacts/:id/duplicates", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    return { items: await listContactDuplicates(deps.db, identity, id) };
  });

  app.post("/contacts/:id/merge", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    const input = MergeContactsRequest.parse(request.body);
    return Contact.parse(await mergeContacts(deps.db, identity, id, input, randomUUID()));
  });
}
