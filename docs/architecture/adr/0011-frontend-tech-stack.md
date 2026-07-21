# ADR-0011: Frontend tech stack for apps/web

Status: accepted (implementation started)

## Context

ADR-0010 fixed the backend stack and explicitly deferred `apps/web`'s framework choice to "the first UI-bearing stage." Stage 2's backend (identity/tenant, contacts, tasks) now has enough surface area — login, MFA, tenant switch, Contact CRUD/roles/consents/timeline, Task create/complete/delegate — to build the first real screens against (`docs/ui/information-architecture.md`, `docs/ui/critical-flows.md`).

## Decision

- **Framework**: React 18 + TypeScript, built with Vite (fast dev server, minimal config, no SSR complexity this API-driven SPA doesn't need).
- **Routing**: `react-router` (data-router API) — matches the screen-per-route structure in `docs/ui/information-architecture.md` directly.
- **Server state**: `@tanstack/react-query` for all API calls — gives loading/error/retry states almost for free, which the platform-wide UI contract in `docs/requirements/functional-requirements.md` §13 requires on every screen (loading, empty, permission-denied, validation-error, transient-error, retry).
- **Client state**: React context for the auth session only (access/refresh tokens, active tenant, membership list); no global state library — there is nothing else global yet at this stage.
- **Types**: `apps/web` imports request/response shapes from `@network-crm/contracts` directly (the same Zod schemas `apps/api` validates against), so the frontend and backend can never silently drift on a field name or shape.
- **Styling**: plain CSS (one small shared stylesheet + co-located component styles), no UI kit dependency yet. `packages/ui` stays a placeholder until a second app or a real design system need justifies it (handoff §5: no premature abstraction).
- **Auth token storage**: access token in memory (React context), refresh token in `localStorage`. A short-lived access token limits the exposure window of `localStorage`'s XSS-readability; this is a pragmatic MVP tradeoff, not a final security decision — revisit alongside a real CSP/XSS review before industrial rollout (`docs/architecture/threat-model.md`).
- **API client**: a thin `fetch` wrapper (`src/api/client.ts`) that attaches the bearer token, retries exactly once on a 401 by calling `/sessions/refresh`, and otherwise surfaces `docs/api/error-catalog.md`'s `ApiError` shape to the UI layer unchanged — no bespoke per-call error handling.

## Consequences

- First runnable frontend code is `apps/web`, covering Login/MFA/tenant-switch (UI-001), a minimal Home/nav shell (UI-003), Contacts (UI-004/005), and Tasks (UI-013) — the screens Stage 1–2's backend actually supports today. Screens for modules that don't exist yet (funnels, network, orders, ...) are not stubbed ahead of their backend.
- Server-side rendering, a component library, and a design system are explicitly out of scope until a concrete need forces the question — adding them later is additive, not a rewrite, because React Query already isolates server state from rendering.
- `packages/ui`'s README claim of "not yet implemented" stays accurate a little longer; this ADR does not change that.

## Alternatives considered

- Next.js (or another SSR framework): rejected for now — this product has no public/SEO-sensitive pages, and SSR adds a second runtime/deployment concern (`docs/architecture/environment-deployment.md`) with no offsetting benefit at this stage.
- Redux/Zustand for global state: rejected — there is exactly one piece of cross-cutting client state (the auth session), which a single context handles without extra dependency weight.
