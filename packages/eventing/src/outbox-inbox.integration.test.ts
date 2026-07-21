import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { withTenantContext } from "@network-crm/database";
import { createTestDb, insertTenant, truncateAll } from "@network-crm/test-support";
import { alreadyProcessed, claimUndispatched, makeEnvelope, markDispatched, publish, withIdempotentConsumer } from "./index.js";

const { db, close } = createTestDb();

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await close();
});

describe("transactional outbox (ADR-0005)", () => {
  it("publish() writes a row visible to claimUndispatched() in the same tenant", async () => {
    const tenant = await insertTenant(db);
    const envelope = makeEnvelope({
      eventType: "EVT-001-ContactCreated",
      tenantId: tenant.id,
      aggregateType: "Contact",
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      correlationId: randomUUID(),
      producer: "relationship-crm",
      payload: { contact_id: "x", source: "manual", owner: "y" },
    });

    await withTenantContext(db, tenant.id, async (tx) => {
      await publish(tx, envelope);
    });

    const claimed = await withTenantContext(db, tenant.id, (tx) => claimUndispatched(tx));
    expect(claimed.map((r) => r.eventId)).toContain(envelope.event_id);
  });

  it("markDispatched() removes the row from future claims", async () => {
    const tenant = await insertTenant(db);
    const envelope = makeEnvelope({
      eventType: "EVT-001-ContactCreated",
      tenantId: tenant.id,
      aggregateType: "Contact",
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      correlationId: randomUUID(),
      producer: "relationship-crm",
      payload: {},
    });
    await withTenantContext(db, tenant.id, (tx) => publish(tx, envelope));
    await withTenantContext(db, tenant.id, (tx) => markDispatched(tx, envelope.event_id));

    const claimed = await withTenantContext(db, tenant.id, (tx) => claimUndispatched(tx));
    expect(claimed.map((r) => r.eventId)).not.toContain(envelope.event_id);
  });

  it("a tenant never sees another tenant's outbox rows even via claimUndispatched", async () => {
    const tenantA = await insertTenant(db);
    const tenantB = await insertTenant(db);
    const envelope = makeEnvelope({
      eventType: "EVT-001-ContactCreated",
      tenantId: tenantA.id,
      aggregateType: "Contact",
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      correlationId: randomUUID(),
      producer: "relationship-crm",
      payload: {},
    });
    await withTenantContext(db, tenantA.id, (tx) => publish(tx, envelope));

    const claimedByB = await withTenantContext(db, tenantB.id, (tx) => claimUndispatched(tx));
    expect(claimedByB).toHaveLength(0);
  });
});

describe("inbox idempotent consumer (BRULE-AUTO-001)", () => {
  it("runs the handler exactly once for the same (eventId, consumerName)", async () => {
    const tenant = await insertTenant(db);
    const eventId = randomUUID();
    let calls = 0;

    for (let i = 0; i < 3; i += 1) {
      await withTenantContext(db, tenant.id, (tx) =>
        withIdempotentConsumer(tx, { tenantId: tenant.id, eventId }, "test-consumer", async () => {
          calls += 1;
        }),
      );
    }

    expect(calls).toBe(1);
    const seen = await withTenantContext(db, tenant.id, (tx) =>
      alreadyProcessed(tx, eventId, "test-consumer"),
    );
    expect(seen).toBe(true);
  });

  it("a failed handler leaves the event unprocessed for a safe retry", async () => {
    const tenant = await insertTenant(db);
    const eventId = randomUUID();

    await expect(
      withTenantContext(db, tenant.id, (tx) =>
        withIdempotentConsumer(tx, { tenantId: tenant.id, eventId }, "flaky-consumer", async () => {
          throw new Error("boom");
        }),
      ),
    ).rejects.toThrow("boom");

    const seen = await withTenantContext(db, tenant.id, (tx) =>
      alreadyProcessed(tx, eventId, "flaky-consumer"),
    );
    expect(seen).toBe(false);
  });
});
