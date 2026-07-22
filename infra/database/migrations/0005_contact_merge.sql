-- Stage 2 tail (BL-206, contact merge resolution). Mirrors infra/database/src/schema.ts.

-- BR-024/FR-CONTACT-005: set when this contact lost a merge, pointing at the survivor — the
-- "alias/map" a reversible merge is required to keep. Always set together with archived_at,
-- never independently (enforced in services-or-modules/relationship-crm, not by a DB check
-- constraint, to keep the merge's audit-log write and this column update in one statement
-- group without fighting a constraint mid-transaction).
alter table contacts add column merged_into_id uuid references contacts (id);
create index contacts_tenant_merged_into_idx on contacts (tenant_id, merged_into_id);
