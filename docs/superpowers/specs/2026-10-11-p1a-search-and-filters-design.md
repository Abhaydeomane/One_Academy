# One Academy — P1a: Search and filter depth

**Date:** 2026-10-11
**Status:** Approved design, pending implementation plan
**Phase:** P1a. P1b–P1d are scoped in §12 and each gets its own spec.
**Builds on:** `2026-10-11-one-academy-foundation-design.md` (P0)

---

## 1. Context

P0 shipped discovery with exact-match filters only: city, exam and mode, with pagination
and three sort orders. There is no free-text search of any kind — no `tsvector`, no index,
no query parameter. A student who types "Allen Pune" or "JEE coaching Kothrud" has nowhere
to type it.

Search is the core of this product. Comparison, SEO landing pages and reviews all sit on
top of it, which is why it is first.

### What "P1" originally bundled, and why it was split

The P0 spec sketched P1 as "search, filters, city/exam landing pages, comparison, reviews,
SEO depth". That is four independent subsystems. One of them is far larger than it looks:

**Reviews require student identity, which does not exist.** P0's Clerk integration covers
partners and organisations; students are entirely anonymous. Reviews would drag in a second
auth surface, a new authorization path and moderation tooling. It is its own phase, placed
after P2.

A second finding from the same survey: **`sort=rating` is currently inert.** `ratingAvg`
and `ratingCount` default to 0 and nothing ever writes them, so the UI offers a sort that
does nothing. P1a removes the option; it returns with reviews.

## 2. Goals

1. A student can find an institute by typing its name, locality, city or exam.
2. Results are ranked so that a name match outranks a description match.
3. Filters narrow by exam (multi-select), mode and fee range.
4. Filter chips show result counts, so a phone user does not tap into empty result sets.
5. Every result set is a shareable, indexable URL.
6. The search index cannot silently fall out of sync with the data.

## 3. Non-goals

- **Geo and "near me".** `Listing.lat`/`lng` exist but nothing populates them — the partner
  UI has no address or map input. Geo needs that capture pipeline first; it is its own slice.
- **Typo tolerance.** See §10.
- Saved searches, search history, autocomplete suggestions.
- Comparison (P1c), reviews (P1d), landing pages (P1b).
- A dedicated search engine. Postgres full-text, per §4.

## 4. Decisions

Each becomes an ADR.

| #    | Decision                                       | Rationale                                                                                                                                                                                                            | Rejected                                                                                                                                                                                                                                                                                      |
| ---- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0010 | Postgres full-text search, not a search engine | 500–5,000 listings is comfortably within Postgres' range; no new service to run, deploy or keep in sync                                                                                                              | Typesense/Meilisearch (typo tolerance and instant-search, at the cost of a second datastore and a sync pipeline we would have to keep correct)                                                                                                                                                |
| 0011 | Trigger-maintained `tsvector`                  | Correct regardless of which code path writes the row — a migration, a backfill or psql — matching the `Batch_seats_invariant` precedent in ADR 0005. Lets exam and city terms match, which a generated column cannot | Application-maintained in the repository (drifts silently the moment anything writes outside that path, and the symptom is a listing that quietly stops appearing); generated column over `Listing` fields only (always in sync but cannot see exam or city, so "JEE coaching Kothrud" fails) |
| 0012 | Submit-based, URL-driven search                | Every result set is a shareable, indexable URL rendered on the server; minimal JavaScript, which matters when 80–90% of traffic is mobile                                                                            | Instant search as you type (feels faster, but needs a client component, an API call per keystroke, and produces no indexable URL)                                                                                                                                                             |

### Expected scale

500–5,000 listings within a year. The design is sized for that band; §10 names where it
breaks.

## 5. Data layer

### The column

```sql
ALTER TABLE "Listing" ADD COLUMN "searchVector" tsvector;
CREATE INDEX "Listing_searchVector_idx" ON "Listing" USING GIN ("searchVector");
```

In `schema.prisma`, declared but not managed by Prisma:

```prisma
searchVector Unsupported("tsvector")?
```

Prisma cannot read or write an `Unsupported` field, which is correct here — it is written
by triggers and read by one raw query.

### The vector

Weighting is what makes relevance sensible: a name match must outrank a description match.

| Weight | Content                                    | Why                                          |
| ------ | ------------------------------------------ | -------------------------------------------- |
| A      | `Listing.name`                             | What people actually type: "Allen", "Aakash" |
| B      | Exam labels via `ListingTag` → `Tag.label` | "JEE coaching", "NEET classes"               |
| C      | `Listing.locality` + `City.name`           | "Kothrud", "Pune"                            |
| D      | `Listing.shortDescription`                 | Weakest signal, but should still match       |

```sql
CREATE OR REPLACE FUNCTION listing_search_vector(
  p_name text,
  p_locality text,
  p_description text,
  p_city_id text,
  p_listing_id text
) RETURNS tsvector LANGUAGE sql STABLE AS $$
  SELECT
    setweight(to_tsvector('english', coalesce(p_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce((
      SELECT string_agg(t.label, ' ')
      FROM "ListingTag" lt
      JOIN "Tag" t ON t.id = lt."tagId"
      WHERE lt."listingId" = p_listing_id
    ), '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(p_locality, '') || ' ' ||
      coalesce((SELECT name FROM "City" WHERE id = p_city_id), '')
    ), 'C') ||
    setweight(to_tsvector('english', coalesce(p_description, '')), 'D')
$$;
```

### The triggers

Three, and the split between them is what avoids infinite recursion.

**1. On `Listing` — assigns the field, issues no statement.**

```sql
CREATE OR REPLACE FUNCTION listing_search_vector_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" := listing_search_vector(
    NEW.name, NEW.locality, NEW."shortDescription", NEW."cityId", NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_search_vector_biu
BEFORE INSERT OR UPDATE OF name, locality, "shortDescription", "cityId"
ON "Listing" FOR EACH ROW EXECUTE FUNCTION listing_search_vector_sync();
```

Because it is `BEFORE` and only assigns `NEW`, it terminates immediately. Because it is
scoped `UPDATE OF` those four columns, an update that touches only `searchVector` does not
re-fire it — which is what makes trigger 2 safe.

**2. On `ListingTag` — a listing's exams changed.**

```sql
CREATE OR REPLACE FUNCTION listing_tag_search_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE target text;
BEGIN
  target := COALESCE(NEW."listingId", OLD."listingId");
  UPDATE "Listing" l
  SET "searchVector" = listing_search_vector(
    l.name, l.locality, l."shortDescription", l."cityId", l.id
  )
  WHERE l.id = target;
  RETURN NULL;
END;
$$;

CREATE TRIGGER listing_tag_search_aid
AFTER INSERT OR DELETE ON "ListingTag"
FOR EACH ROW EXECUTE FUNCTION listing_tag_search_sync();
```

On `INSERT` into `Listing`, tags do not exist yet — Prisma creates them in a second
statement. This trigger is what fills in weight B afterwards.

**3. On `Tag` — a label was renamed.**

```sql
CREATE OR REPLACE FUNCTION tag_label_search_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Listing" l
  SET "searchVector" = listing_search_vector(
    l.name, l.locality, l."shortDescription", l."cityId", l.id
  )
  WHERE l.id IN (SELECT "listingId" FROM "ListingTag" WHERE "tagId" = NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER tag_label_search_au
AFTER UPDATE OF label ON "Tag"
FOR EACH ROW EXECUTE FUNCTION tag_label_search_sync();
```

### Backfill

Same migration, after the triggers exist:

```sql
UPDATE "Listing" l SET "searchVector" = listing_search_vector(
  l.name, l.locality, l."shortDescription", l."cityId", l.id
);
```

## 6. The search query

`tsvector` cannot be expressed through Prisma's query API, so one raw query is unavoidable.
It is scoped as tightly as possible: **the raw query returns ids, rank, total and fee
aggregates; Prisma then fetches the rows by id using the existing typed `select`,
re-ordered to the rank order.**

That keeps exactly one hand-written query in the codebase, leaves the response projection
fully typed, and means the repository still returns plain row types rather than Prisma
models, as R3 requires.

```sql
WITH q AS (SELECT websearch_to_tsquery('english', $1) AS tsq)
SELECT
  l.id,
  CASE WHEN $1 = '' THEN 0 ELSE ts_rank(l."searchVector", q.tsq) END AS rank,
  f.min_fee,
  f.max_fee,
  f.published_batches,
  count(*) OVER () AS total
FROM "Listing" l
CROSS JOIN q
JOIN "City" c ON c.id = l."cityId"
LEFT JOIN "InstituteProfile" p ON p."listingId" = l.id
LEFT JOIN LATERAL (
  SELECT
    min(b."feeAmount") AS min_fee,
    max(b."feeAmount") AS max_fee,
    count(*) AS published_batches
  FROM "Batch" b
  WHERE b."listingId" = l.id AND b.status = 'PUBLISHED'
) f ON true
WHERE l.vertical = 'INSTITUTE'
  AND l.status = 'PUBLISHED'
  AND ($1 = '' OR l."searchVector" @@ q.tsq)
  -- plus city, exams, mode and fee predicates
ORDER BY /* per sort */
LIMIT $n OFFSET $m;
```

`City` is an inner join because every listing has a city; `InstituteProfile` is a left join
because the profile row is nominally optional, so a listing missing one must still appear
rather than vanishing from search.

Notes on specific choices:

- **`websearch_to_tsquery`**, not `to_tsquery`: it parses arbitrary user input without
  throwing on punctuation, and supports quoted phrases and `OR`.
- **`count(*) OVER ()`** returns the total in the same query, replacing the separate
  `count` that the current implementation runs.
- **The lateral aggregate** supplies the fee range for display _and_ makes `fee_asc`
  sortable — you cannot order by a value fetched afterwards. It also replaces the separate
  grouped `batchCount` query. It does **not** do the fee filtering; see the warning below.
- **Every parameter goes through `Prisma.sql` parameterised templates.** User input is
  never interpolated into SQL text. This is the single most security-sensitive file P1a
  adds, and the integration tests include a query containing SQL metacharacters.

### A documented boundary exception

This query reads the `Batch` table from `institutes.repository.ts`. `Batch` belongs to the
batches module, and today `institutes.service` respects that by calling
`batches.service.countPublishedByListingIds`.

Filtering and sorting on a joined aggregate cannot be composed across two services — the
aggregate has to exist inside the query that orders and paginates. So this is a deliberate,
reviewed exception, recorded in the ADR and in `apps/api/CLAUDE.md`.

**If a second query needs the same thing, the answer is not more exceptions**: it is
trigger-maintained `minFeeAmount` / `maxFeeAmount` / `publishedBatchCount` columns on
`Listing`, using the same mechanism as §5. That was considered now and rejected as
premature — it adds three more triggers and a second denormalisation to keep correct, for
a query shape that currently appears once.

### Filter predicates

| Filter              | Predicate                                                                                                                                                                 | Semantics                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `city`              | `c.slug = $city`                                                                                                                                                          | Single value                                                          |
| `exams`             | `EXISTS (… t.kind = 'EXAM' AND t.slug = ANY($exams))`                                                                                                                     | **OR within exams** — matches any selected exam                       |
| `mode`              | `p.modes @> ARRAY[$mode]::"Mode"[]`                                                                                                                                       | Single value                                                          |
| `feeMin` / `feeMax` | `EXISTS (SELECT 1 FROM "Batch" b WHERE b."listingId" = l.id AND b.status = 'PUBLISHED' AND b."feeAmount" BETWEEN coalesce($feeMin, 0) AND coalesce($feeMax, 2147483647))` | A listing matches when **some single published batch** falls in range |

### Why fee filtering is an `EXISTS`, not a comparison on the lateral aggregate

Comparing against `f.min_fee` and `f.max_fee` tests whether the listing's fee _interval_
overlaps the requested range, which is not the same question. A listing with batches at
₹10,000 and ₹1,00,000 has `min_fee = 10000`, `max_fee = 100000`; a student filtering for
₹40,000–₹50,000 would see it, even though no batch is anywhere near that price.

So the filter is an `EXISTS` over individual batch rows — exact — while the lateral
aggregate serves display and sorting. Both appear in the query, doing different jobs. An
integration test covers precisely this case, because it is the kind of error that looks
correct in casual testing.

### Sort orders

| Value       | Ordering                      | Notes                                      |
| ----------- | ----------------------------- | ------------------------------------------ |
| `relevance` | `rank DESC, publishedAt DESC` | Default **when `q` is present**            |
| `recent`    | `publishedAt DESC`            | Default when `q` is absent                 |
| `fee_asc`   | `f.min_fee ASC NULLS LAST`    | Listings with no published batch sort last |
| `name`      | `name ASC`                    |                                            |

`rating` is removed (§1).

## 7. Facet counts

Two aggregates per search, each applying every filter **except its own** — so selecting JEE
still shows NEET's count rather than zero. Without that exclusion, counts are useless for
navigation, which is the whole point of showing them.

- **Exam facets:** group over `ListingTag` → `Tag` where `kind = 'EXAM'`, applying the
  city, mode and fee filters but not `exams`.
- **Mode facets:** `unnest(p.modes)` grouped, applying city, exams and fee but not `mode`.

Both are cached by the page's ISR window, so a repeated search does not re-run them.

## 8. Contract changes

In `packages/shared/src/contracts/institutes.ts`:

```ts
export const listInstitutesQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  city: z.string().min(1).optional(),
  exams: z.preprocess(
    (value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]),
    z.array(z.string().min(1)).max(10).optional(),
  ),
  mode: modeSchema.optional(),
  feeMin: z.coerce.number().int().min(0).optional(),
  feeMax: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['relevance', 'recent', 'fee_asc', 'name']).optional(),
})
```

The `exams` preprocessor exists because a single `?exam=jee` arrives as a string while
`?exams=jee&exams=neet` arrives as an array.

`sort` becomes optional rather than defaulting, so the service can pick `relevance` when
`q` is present and `recent` when it is not.

Additions:

- `instituteSummary` gains `minFeeAmount: z.number().int().nullable()` and `maxFeeAmount`
  likewise, for the "₹50,000 – ₹1,25,000" line. Deliberately **not** named `feeMin`/`feeMax`:
  those are the request filter, and reusing the names for a response field would make it
  easy to wire the wrong one into the card.
- `facetCounts`: `{ exams: { slug, label, count }[], modes: { mode, count }[] }`.
- `instituteListResponse` gains `facets: facetCounts`.

**This is a breaking contract change** — `sort=rating` disappears and `exams` replaces the
single `exam`. Both consumers are ours and change in the same commit, which is the whole
reason the monorepo exists (ADR 0001). `gen-openapi.ts` is updated in the same change or
CI fails on a stale spec.

## 9. Mobile UI

Extends `apps/web/src/app/institutes/`.

**Search input.** A `GET` form directly below the sticky header, so submitting produces a
real URL. `type="search"`, `enterKeyHint="search"`, 16px text so iOS does not zoom. It
preserves the active filters as hidden inputs, so searching does not silently clear them.

**Filter chips.** The existing `FilterRail` gains counts inline — "JEE (12)" — and exam
chips become multi-select (tapping toggles rather than replaces). An active chip gets a
clear affordance, since multi-select is otherwise hard to undo on a phone.

**Fee uses preset buckets, not a dual slider:** under ₹25k, ₹25k–50k, ₹50k–1L, over ₹1L.
Dual-handle sliders are genuinely bad with a thumb, and buckets fit the chip pattern that
is already there. Each bucket maps to `feeMin`/`feeMax` query parameters.

**Results.** Unchanged card layout plus the fee-range line. A relevance-sorted result set
shows no sort control by default; changing sort is a chip like any other filter.

**Empty state.** Names which filter is narrowing the result and offers to clear just that
one — "No institutes match. Clear the fee filter?" — rather than a generic "no results".
With facet counts present, this should be rare, which is the point.

**Sort and filter state live entirely in the URL.** No client state, no hydration mismatch,
and the back button works.

## 10. Known limitations

**No typo tolerance.** Postgres full-text matches lexemes, so "Alen" will not find "Allen".
At 500–5,000 listings this is acceptable. The contained fix is a `pg_trgm` similarity
fallback when the `tsquery` returns nothing; the uncontained fix is Typesense. This is the
first thing that will push you off Postgres, and it should be driven by real queries that
returned nothing, not by anticipation.

**English stemming on Indian proper nouns.** The `english` configuration stems
"coaching" → "coach", which helps, and leaves names like "Allen" and localities like
"Kothrud" untouched, which is harmless. Worth revisiting only if real queries misbehave.

**Facet counts cost two extra aggregates per search.** Mitigated by the ISR window. If they
become the bottleneck before the search itself does, that is the signal to denormalise.

## 11. Testing

| Layer       | Coverage                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integration | Match by name, exam label, locality and city; rank ordering (name beats description); multi-select exams as OR; combined filters; pagination with a query; a query containing SQL metacharacters |
| Integration | **Fee filtering is per-batch, not interval overlap**: a listing with batches at ₹10,000 and ₹1,00,000 must **not** appear when filtering ₹40,000–₹50,000                                         |
| Integration | A listing with no `InstituteProfile` row still appears in results                                                                                                                                |
| Integration | Facets exclude their own filter; counts respect the other filters                                                                                                                                |
| **Trigger** | Insert a listing → vector populated. Add a tag → vector updated. Rename a tag → updated. **Write a row with raw SQL that bypasses the repository entirely → vector still updated.**              |
| Unit        | Query-to-sort defaulting: `relevance` with `q`, `recent` without                                                                                                                                 |
| E2E         | Search a name, then narrow with an exam chip, at phone viewport                                                                                                                                  |

The raw-SQL trigger test is the one that justifies ADR 0011 over the application-maintained
alternative. Without it, the choice is just an assertion.

## 12. What this leaves for the rest of P1

| Phase | Scope                                                                                                            | Depends on                                |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| P1b   | Programmatic SEO landing pages: `/jee-coaching-in-pune`, canonical structure, internal linking, sitemap at scale | P1a result sets                           |
| P1c   | Comparison: select 2–4, project comparable attributes (BR-008)                                                   | A rich enough result set to select from   |
| P1d   | Reviews, ratings and **student accounts**; restores `sort=rating` (BR-006)                                       | A second auth surface; sequenced after P2 |

Geo and "near me" need partner address capture, which belongs with the partner portal work
in P2 rather than with search.

## 13. Open items

- Whether `pg_trgm` fallback is needed — decide from real queries that returned nothing,
  not in advance.
- Fee bucket boundaries (₹25k / ₹50k / ₹1L) are a guess at the Indian coaching market and
  should be revisited once there is real fee data in the catalogue.
