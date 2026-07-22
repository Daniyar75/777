# ADR-0009: AI provider boundary

Status: proposed

## Context

`docs/requirements/ai-requirements.md` (AI-001..015) requires a registered use-case model, scope inheritance, full audit of rationale/sources/model version, human confirmation before any external-facing or state-changing action, refusal on insufficient data, no medical claims, protected-fragment locking, prompt-injection defense, PII minimization, provider/region policy, quota/kill-switch, and no hidden chain-of-thought. QST-014 (AI provider/region) is explicitly open. Handoff §2 states AI never touches the database bypassing application authorization.

## Decision

- All AI use cases go through a single **AI Policy Gateway** (`aiGateway` container in system-context.md, backed by `services-or-modules/intelligence`) with four internal stages every call must pass through in order: (1) **use-case registry** validates the caller is invoking a registered, risk-classified use case (AI-001); (2) **context builder** assembles only data the invoking user is already authorized to see via the same PDP as ADR-0004 (AI-002, BRULE-AI-002), minimizing/pseudonymizing PII before it leaves the boundary (AI-011); (3) **provider adapter** calls the configured model behind an interface that can be swapped per tenant/region once QST-014 is resolved — no module calls a model provider SDK directly; (4) **policy filter + audit** checks the response against protected-fragment locks (AI-009), medical/diagnostic red lines (AI-007, BRULE-PRODUCT-002), and citation requirements (AI-008) before returning it, and persists the full audit record (AI-003) — use case, subject, rationale, sources, data categories used, confidence, model/prompt/policy versions, and the user's accept/edit/reject decision (AI-005, BR-029).
- No AI use case is permitted to directly execute a state-changing side effect (send message, register partner, place/pay an order, change structure); it may only produce a draft/recommendation that a human confirms through the normal authorized API path (AI-004, BRULE-AI-001) — the one exception is a pre-approved deterministic automation rule that itself is not a generative decision.
- Ingested external text (uploaded documents, inbound messages, scraped/knowledge-base content) is never treated as a system instruction; the gateway applies prompt-injection detection/sanitization before including such content in a model context (AI-010).
- Confidence is shown only if calibrated for that specific use case; otherwise a qualitative label with explanation is used instead (AI-014). No hidden chain-of-thought is exposed — only business-fact explanations and citations (AI-015).
- Quotas, rate limits, timeouts, retry policy, cost telemetry, and a per-tenant/per-use-case kill switch are mandatory before a use case goes live (AI-012).
- Provider contracts must confirm training data is never derived from tenant data without a separate explicit agreement (SEC-020).

## Consequences

- Every new AI feature is additive registry configuration + eval set (`ai-requirements.md` §4), not a new bespoke integration path — this is what makes AI-012's kill switch and AI-003's audit uniform across use cases.
- MVP ships only the six use cases explicitly allowed in `ai-requirements.md` §2 (day plan, contact summary, message draft, KB Q&A, follow-up suggestion, weekly report); predictive/ML use cases (repeat-order forecast, disengagement risk, potential-leader scoring) stay rule-based and transparent until target-label/bias/drift governance exists (`ai-requirements.md` §3).

## Alternatives considered

- Direct model SDK calls from individual modules (e.g., recruitment calls the LLM directly for a message draft): rejected — makes AI-002 scope inheritance, AI-003 audit, and AI-012 kill switch impossible to guarantee uniformly, and risks a module bypassing the PDP entirely.

## Open questions

- QST-014 (permitted providers/regions) blocks selecting or contracting a concrete provider; the adapter interface above is provider-agnostic specifically so this can be resolved without an architecture change.
