# apps/api

Backend composition root for the modular monolith: wires `services-or-modules/*` behind a single deployable, owns the HTTP/API layer, cross-cutting middleware (auth, tenant context, idempotency, audit). Not yet implemented — see `docs/architecture/adr/0001-architecture-style.md`.
