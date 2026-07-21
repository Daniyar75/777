# ADR-0006: File storage

Status: proposed

## Context

SEC-010 requires files to be scanned, type/size validated, stored with private access, and served via short-lived links. FR-PRODUCT-001/FR-CONTENT-001 require versioned product documents and content media. QST-011 (temporary answer: photos of client results only under a separate explicit consent and restricted access) directly constrains this ADR.

## Decision

- All uploaded files (product documents, content media, task/order attachments, consent evidence, client-result photos) go to tenant-scoped object storage, private by default.
- Every download is served through a short-lived, signed URL minted per request after the same PDP check (ADR-0004) used for the owning object — never a permanently public URL.
- Uploads are scanned (malware/type sniffing) and validated against an allow-list of MIME types and a size cap before being marked usable; rejected files are never linked from a domain object.
- Sensitive categories (client-result photos, health-adjacent attachments) are tagged with a `sensitivity_class` and require the specific consent purpose from QST-011's temporary rule before they can be attached; access is logged (SEC-007).
- Versioned documents (`ProductDocument`, `ContentItem`) keep prior versions retrievable for audit/compliance even after a new version is approved (BRULE-CONTENT-001), but only the current approved version is served to non-privileged use (FR-PRODUCT-003, FR-CONTENT-002).

## Consequences

- No module stores files on local/ephemeral disk; the file-storage adapter is shared via `packages/contracts` interface, implemented once.
- Signed-URL minting adds one extra call per file view but is required for SEC-010 compliance and keeps authorization centralized in the PDP rather than duplicated as bucket ACLs.

## Alternatives considered

- Public CDN URLs with obscure (unguessable) paths: rejected — "security by obscurity" fails SEC-010's private-access requirement and cannot enforce per-request authorization or revocation.

## Open questions

- QST-011 remains open for the general policy; the interim rule above is a stub, not a final legal position — do not relax it without DPO sign-off.
