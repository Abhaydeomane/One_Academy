# ADR 0011 — Maintain the search vector with database triggers

Date: 2026-10-12
Status: Accepted

## Context

Free-text queries include terms that do not live on the `Listing` row. A student types
"JEE coaching Kothrud" or "Allen Pune": `name`, `locality` and `shortDescription` are on
`Listing`, but **exam labels live in `Tag` via `ListingTag`, and the city name lives in
`City`**.

A Postgres generated column cannot reference another table, so the index has to be
maintained some other way.

The failure mode to design against is specific: if the index falls out of sync, the symptom
is a listing that quietly stops appearing in search. Nothing errors. Nobody notices until
a partner asks why they are invisible.

## Decision

A `searchVector tsvector` column on `Listing`, maintained by three triggers:

1. `BEFORE INSERT OR UPDATE OF name, locality, shortDescription, cityId ON "Listing"` —
   assigns `NEW."searchVector"` directly. Because it assigns rather than issuing an
   `UPDATE`, it cannot recurse; because it is scoped to those four columns, trigger 2's
   update of `searchVector` alone does not re-fire it.
2. `AFTER INSERT OR DELETE ON "ListingTag"` — exam terms. Prisma writes tags in a second
   statement after the listing, so this is what fills in weight B on creation.
3. `AFTER UPDATE OF label ON "Tag"` — recomputes every listing carrying a renamed tag.

Weighted: name **A**, exam labels **B**, locality and city **C**, description **D**.

This follows the precedent set in ADR 0005 and the `Batch_seats_invariant` CHECK
constraint: an invariant that must hold regardless of which code path writes the row
belongs in the database.

## Alternatives rejected

**Application-maintained, recomputed in the repository on write.** Plainer SQL and no
trigger to understand. Rejected because it drifts the moment anything writes outside that
path — a migration, a backfill, a manual `psql` fix — and in a codebase where agents write
the migrations, that is not a hypothetical.

**A generated column over `Listing` fields only.** Simplest possible and always in sync,
with no triggers at all. Rejected because the search box would match names and localities
but not exam or city terms, so "JEE coaching Kothrud" would fail. That is most of the value.

## Consequences

- The index is correct by construction, whatever writes the row.
- Three triggers and a backfill to understand, all in one migration. The recursion
  argument above is the part worth reading before editing them.
- **The decision is verifiable, not merely asserted:**
  `apps/api/test/search-triggers.test.ts` writes a row with raw SQL that bypasses the
  repository entirely and asserts the vector still updated. That test is the whole reason
  to prefer this over the application-maintained alternative; do not delete it.
- Two Postgres details that cost time to rediscover: **weight D is the default and is not
  printed** in `tsvector` output, and **the GIN index must be declared in
  `schema.prisma`** (`@@index([searchVector(ops: raw("tsvector_ops"))], type: Gin)`) or
  `prisma migrate diff` reports drift and CI fails.
- `searchVector` is `Unsupported("tsvector")`, so Prisma can neither read nor write it.
  Only the raw search queries read it.
