# ADR 0005 — Postgres with Prisma

Date: 2026-10-11
Status: Accepted

## Context

Agents write nearly all the code. The most common and most damaging class of agent error
in data access is inventing a column, a relation, or a status value that does not exist —
mistakes that a weakly-typed data layer discovers in production.

## Decision

Postgres 17 with Prisma 7 and the `pg` driver adapter. A generated, typed client, and
migrations checked into the repository.

## Alternatives rejected

**MongoDB.** Flexible documents suit a listing with per-vertical attributes. Rejected for
the same reason as JSONB in ADR 0004: constraints an agent cannot violate are worth more
than flexibility an agent will misuse, and filtered search is the product.

**Raw SQL with a query builder.** More control and no ORM semantics to learn. Rejected
because it widens the surface where an agent writes a subtly wrong query with no
compile-time feedback.

## Consequences

- A column that does not exist is a type error, not a runtime failure.
- Migrations are reviewable artifacts, and CI fails if the schema and migration history
  disagree.
- Invariants that must hold regardless of application code get CHECK constraints —
  `Batch_seats_invariant` for BR-010 — because the ORM only guards the paths that go
  through it.
- Repositories convert rows to plain types before returning them, so Prisma's shapes do
  not leak into services and Prisma stays replaceable.
- Prisma 7 removed `url` from the datasource block, requires a driver adapter, and no
  longer loads `.env` automatically. See `packages/db/CLAUDE.md`.
