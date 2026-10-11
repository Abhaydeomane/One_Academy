# ADR 0003 — Zod contracts in `packages/shared`, OpenAPI generated

Date: 2026-10-11
Status: Accepted

## Context

With the UI and API split across process boundaries, the request/response contract is the
single biggest source of breakage — and the one an agent is most likely to break silently,
because nothing fails until runtime.

## Decision

Each endpoint's query, body and response schemas are Zod objects in
`packages/shared/src/contracts/`. Express validates requests with them; both frontends
infer their types from the same objects; `pnpm --filter @one/shared gen:openapi` renders
them as OpenAPI 3.1 into `docs/api/openapi.json`, and CI fails if that file is stale.

## Alternatives rejected

**Hand-written OpenAPI plus a generated client.** Spec-first and language-agnostic, which
would matter if third parties consumed the API today. But the spec and the runtime
validator are two artifacts that can disagree, and the validator is what actually runs.

**tRPC.** The best developer ergonomics and no codegen at all. Rejected because it welds
the frontend to the backend's internal types, which forecloses institutes consuming the
API later, and because it provides no OpenAPI document for documentation.

## Consequences

- Drift is structurally impossible rather than merely discouraged: there is one definition.
- The frontend parses every response with the shared schema, so a contract violation fails
  loudly at the boundary instead of surfacing as `undefined` deep in a component.
- Adding an endpoint means touching `gen-openapi.ts`, or CI rejects the pull request. This
  is deliberate friction.
- Schema names come from Zod 4's native `.meta({ id })`. `extendZodWithOpenApi` does not
  take effect under `@asteasolutions/zod-to-openapi` 9 and must not be reintroduced.
