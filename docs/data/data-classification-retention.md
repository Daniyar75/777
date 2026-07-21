# Data classification and retention matrix

Status: draft baseline. Concrete retention periods and legal bases are placeholders pending jurisdiction-specific legal review (`docs/requirements/security-requirements.md`, closing note: "Конкретные требования законодательства... должны оформляться отдельными legal profiles"). Do not hardcode a specific country's retention period from this document into production configuration without DPO/legal sign-off (QST-001).

## 1. Classification scheme

| Class | Definition | Examples (ENT) | Default access |
|---|---|---|---|
| `public` | Safe for unauthenticated or broad in-tenant display | approved `ContentItem`, published `Product` marketing fields | role-gated only, no PII risk |
| `internal` | Operational, tenant-confidential, not personal | `Funnel`, `FunnelStage`, `AutomationDefinition`, `MetricSnapshot` | tenant role scope |
| `pii_standard` | Identifies a person, no special category | `Contact` name/phone/email/address, `User` identity | RBAC+ABAC scope, masked below configured branch depth (BRULE-NETWORK-005) |
| `pii_sensitive` | Special-category or high-risk personal data | health/allergy/contraindication answers (`ProductRecommendation` questionnaire, FR-REC-001), client-result photos (QST-011), `Case` (complaint/adverse reaction, ENT-052), documents (ID/contracts) | separate explicit consent purpose + restricted role + audited access (SEC-010, SEC-011) |
| `financial_transactional` | Money-moving or legally evidentiary commerce data | `Order`, `OrderItem`, `Payment`, `Return`, price snapshots | cannot be hard-deleted while legally required (BRULE-ORDER-001, ASM-005) |
| `audit_evidence` | Proof of consent, authorization changes, AI decisions | `Consent`, `AuditLog`, `AIRecommendation` audit fields | append-only, protected from ordinary admin edit (SEC-008) |
| `secret` | Credentials, tokens, integration secrets | session/refresh tokens, `Integration` credentials | never logged (SEC-015), stored outside ordinary entity fields (data-dictionary.md ENT-049), rotated (SEC-005) |

Every entity in `docs/requirements/data-dictionary.md` must be tagged with exactly one primary class at the entity level and may carry field-level overrides (e.g., `Contact.notes` may reach `pii_sensitive` if it contains health information — enforced by the field-sensitivity check in ADR-0004, not by reclassifying the whole entity).

## 2. Retention pattern by class

| Class | Active retention | Post-relationship default | Legal hold | Deletion mechanism |
|---|---|---|---|---|
| `public`, `internal` | Life of the active version | Deactivate/retire, keep for historical reference integrity (domain-model.md §4) | N/A | Policy job after configured age, no PII risk |
| `pii_standard` | While `Contact`/`User` is active or has active relationships | On erasure request: anonymize PII fields, keep de-identified relational shell if referenced by retained records (SEC-012, BRULE-DELETE-001) | Blocks anonymization/deletion until released (SEC-013) | Anonymization job, not physical row delete, unless no legal/relational dependency remains |
| `pii_sensitive` | Only for the duration the specific consent purpose is active (QST-011 interim rule) | Deleted or anonymized promptly on consent withdrawal unless a countervailing legal basis exists | Highest priority hold check | Restricted-role deletion workflow with mandatory audit entry |
| `financial_transactional` | Full legally required bookkeeping/tax period (jurisdiction-specific, QST-001/QST-009) | Never physically deleted while required; `Order` in `paid`+ status is never hard-deleted (BRULE-ORDER-001) | Always applies | Archival only; physical delete requires policy job past legal period + hold check |
| `audit_evidence` | Matches the retention of the record it evidences, minimum a configurable compliance floor (SEC-008) | Retained even if the subject record is anonymized (evidence of the anonymization event itself becomes the audit trail) | Always applies | Never user-deletable; platform-level retention job only |
| `secret` | Until rotated/revoked | Immediate invalidation on rotation/offboarding | N/A | Overwrite/revoke, never soft-delete |

## 3. Four distinct data-removal operations (BR-025)

`docs/requirements/business-requirements.md` BR-025 requires these to stay distinct — no operation silently implies another:

1. **Archive** — hides from active work views, fully reversible, no PII change (`archived_at` set).
2. **Soft delete** — reversible removal from normal queries, used for accidental/test data before any legal record exists.
3. **Anonymize** — irreversibly strips/pseudonymizes PII fields while preserving required relational/statistical shape (used to satisfy SEC-012 erasure requests against records under legal-hold-free retention).
4. **Physical (hard) delete** — irreversible row removal, restricted to a scheduled policy job that has verified retention period elapsed and no legal hold applies (SEC-013); never a direct user-facing action for `financial_transactional` or `audit_evidence` classes.

## 4. Open questions blocking final retention values

QST-001 (controller/operator per country), QST-002 (first market/language — sets which jurisdiction's legal profile ships first), QST-009 (fiscal document handling — affects `financial_transactional` retention floor), QST-010 (adverse-reaction escalation categories — affects `pii_sensitive` handling for `Case`), QST-011 (client photo storage policy), QST-019 (Contact deletion with financial records present — interim rule: anonymize PII, keep required transactional data, matches class table above).
