# apps/api

Backend composition root for the modular monolith: wires `services-or-modules/*` behind a single deployable, owns the HTTP/API layer. See `docs/architecture/adr/0001-architecture-style.md`.

Stage 1: Fastify app (`app.ts`) with routes for tenant provisioning, auth/session/MFA, role/permission admin, and audit search (`src/routes/*.ts`), a shared error-to-`ApiError` mapper (`errors.ts`) matching `docs/api/error-catalog.md`, and bearer-token identity resolution (`auth-context.ts`). Run locally with `pnpm --filter @network-crm/api run dev` after copying `.env.example` to `.env`. Not yet wired: the async worker entrypoint for `packages/eventing`'s relay, and most route groups from `docs/api/openapi-skeleton.yaml` beyond Stage 1's identity/tenant/audit scope.
