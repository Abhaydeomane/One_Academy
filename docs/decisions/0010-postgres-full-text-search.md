# ADR 0010 — Postgres full-text search, not a search engine

Date: 2026-10-12
Status: Accepted

## Context

Search is the core of this product: comparison, SEO landing pages and reviews all sit on
top of it. P0 shipped exact-match filters only — city, exam, mode — with no free-text
query of any kind.

The catalogue is expected to reach 500–5,000 institutes within a year.

## Decision

Postgres full-text search: a `tsvector` column on `Listing` with a GIN index, matched with
`websearch_to_tsquery` and ranked with `ts_rank`.

## Alternatives rejected

**Typesense or Meilisearch.** Typo tolerance, instant-search latency and real faceting out
of the box — all genuinely better than what Postgres gives. Rejected for now because it
means a second datastore to run, deploy, monitor and keep in sync with Postgres, and that
sync is a correctness problem we would own forever. At 500–5,000 documents the quality gap
does not yet justify the operational surface.

## Consequences

- No new infrastructure. Search ships with a migration.
- Weighted ranking (name > exams > locality/city > description) gives sensible ordering
  without tuning.
- **No typo tolerance.** "Alen" will not find "Allen", because Postgres matches lexemes
  rather than approximate strings. This is the single biggest limitation and it is stated
  plainly in the spec and in `apps/web/CLAUDE.md`.
- The contained next step, if typos become a real problem, is a `pg_trgm` similarity
  fallback when the `tsquery` returns nothing. The uncontained one is adopting a search
  engine after all.
- **The trigger for revisiting is evidence, not anticipation:** real queries that returned
  nothing. Do not pre-emptively adopt an engine because the catalogue grew.
- `english` stemming is used, which helps ("coaching" → "coach") and leaves proper nouns
  like "Allen" and "Kothrud" untouched.
