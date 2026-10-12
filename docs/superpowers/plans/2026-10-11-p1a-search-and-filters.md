# P1a Search and Filter Depth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student can find an institute by typing its name, locality, city or exam, then narrow by exam, mode and fee with result counts on every filter chip.

**Architecture:** Postgres full-text search over a trigger-maintained `tsvector` on `Listing`, weighted name > exams > locality/city > description. One raw SQL query does the matching, ranking, fee aggregation and total count; Prisma then projects the rows by id using the existing typed `select`. Two further aggregates produce facet counts, each omitting its own filter. The web UI stays submit-based and URL-driven so every result set is a shareable, indexable, server-rendered page.

**Tech Stack:** Postgres 17 (`tsvector`, GIN, `websearch_to_tsquery`, `ts_rank`, plpgsql triggers), Prisma 7.10.0 with `Unsupported("tsvector")` and `Prisma.sql`, Zod 4.6.5, Express 5.3.0, Next.js 16.4.0, Vitest 5.0.3, Playwright 1.64.0.

**Spec:** `docs/superpowers/specs/2026-10-11-p1a-search-and-filters-design.md`

## Global Constraints

Everything in the root `CLAUDE.md` applies. The ones this work can violate most easily:

- **R1 / R3** Only `*.repository.ts` may import `@one/db`. The raw SQL lives in
  `institutes.repository.ts` and nowhere else.
- **R4** A route may only call its own module's service. Cross-module access goes through
  the other module's service.
- **R5** Every route input is validated by a Zod schema from `@one/shared`, read with
  `validated<T>(req, 'query')`.
- **R6** Throw `AppError` subclasses; only `errorHandler` maps to HTTP.
- **Money is integer minor units (paise)** with an explicit currency. Never a float.
  `feeAmount` comparisons and `feeMin`/`feeMax` parameters are all paise.
- **Never mock the database.** Integration tests run against real Postgres.
- **Mobile first.** Single column is the base case; `sm:`/`lg:` add columns. 44px touch
  targets via `tap-target`; inputs at `text-base` so iOS does not zoom.
- **Pinned versions.** Do not upgrade Prisma, TypeScript or Express. See ADR 0009.
- **`pnpm verify` green is the definition of done.** `pnpm e2e` is a separate gate.

### Constraints specific to this work

- **Every SQL parameter goes through `Prisma.sql` interpolation.** User input is never
  concatenated into SQL text. This plan adds the most security-sensitive file in the
  codebase; Task 3 includes a test that submits SQL metacharacters.
- **`count()` and `count(*) OVER ()` return `bigint`**, which Prisma surfaces as `BigInt`.
  Every such value must be passed through `Number()` before it reaches a Zod schema, or
  validation fails with a type error that looks unrelated.
- **`searchVector` is `Unsupported("tsvector")`** — Prisma cannot select, filter or write
  it. Only raw SQL touches it, and only the triggers write it.
- **Fee filtering is an `EXISTS` over individual batch rows**, never a comparison against
  the min/max aggregate. Those answer different questions; see Task 3 Step 1.

### After this plan, these spec statements must hold

| Spec § | Statement                                                        |
| ------ | ---------------------------------------------------------------- |
| §5     | The vector stays correct even when a row is written by raw SQL   |
| §6     | One raw query; the response projection stays typed               |
| §6     | Fee filter matches a single batch in range, not interval overlap |
| §7     | A facet's own filter is excluded from its counts                 |
| §8     | `sort=rating` no longer exists                                   |
| §9     | Results, filters and sort live entirely in the URL               |

---

## File Structure

### `packages/db`

| File                                                          | Responsibility                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `prisma/schema.prisma`                                        | Declare `searchVector Unsupported("tsvector")?` on `Listing` |
| `prisma/migrations/*_add_listing_search_vector/migration.sql` | Column, GIN index, vector function, three triggers, backfill |

### `packages/shared`

| File                          | Responsibility                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/contracts/institutes.ts` | `q`, `exams`, `feeMin`/`feeMax`, new `sort` enum, `minFeeAmount`/`maxFeeAmount`, `facetCounts`, `instituteListResponse` |
| `scripts/gen-openapi.ts`      | Register the changed query and response                                                                                 |

### `apps/api`

| File                                              | Responsibility                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/modules/institutes/institutes.search.sql.ts` | **New.** The only hand-written SQL: shared FROM/WHERE fragments, the search query, the two facet queries |
| `src/modules/institutes/institutes.repository.ts` | Calls the SQL module; adds `findSummariesByIds`                                                          |
| `src/modules/institutes/institutes.service.ts`    | Sort defaulting, id-order preservation, merging fee aggregates and facets                                |
| `src/modules/institutes/institutes.routes.ts`     | Unchanged shape; picks up the new query schema                                                           |
| `test/search-triggers.test.ts`                    | **New.** Trigger correctness, including a raw-SQL write that bypasses the repository                     |

Splitting the SQL into its own module is deliberate: it keeps every hand-written query in
one reviewable file, and keeps `institutes.repository.ts` focused on typed projections.

### `apps/web`

| File                                | Responsibility                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `src/app/institutes/SearchForm.tsx` | **New.** GET form, server component                                            |
| `src/app/institutes/FilterRail.tsx` | Multi-select exam chips with counts, mode chips with counts, fee buckets, sort |
| `src/app/institutes/page.tsx`       | Query parsing, facets, empty state naming the narrowing filter                 |
| `src/lib/format.ts`                 | `formatFeeRange(min, max)`                                                     |

### Docs

| File                                                      | Responsibility                                 |
| --------------------------------------------------------- | ---------------------------------------------- |
| `docs/decisions/0010-postgres-full-text-search.md`        |                                                |
| `docs/decisions/0011-trigger-maintained-search-vector.md` |                                                |
| `docs/decisions/0012-url-driven-submit-search.md`         |                                                |
| `docs/flows/institute-discovery.md`                       | Add the search path; bump the verified commit  |
| `apps/api/CLAUDE.md`                                      | Record the `Batch` boundary exception          |
| `apps/web/CLAUDE.md`                                      | Search and filter UX rules                     |
| `e2e/tests/search.spec.ts`                                | **New.** Search then narrow, at phone viewport |

---

## Task Sequence

| Task | Deliverable                                                               |
| ---- | ------------------------------------------------------------------------- |
| 1    | Trigger-maintained `searchVector`, proven correct against a raw-SQL write |
| 2    | Contracts for search, filters and facets                                  |
| 3    | The SQL module: matching, ranking, fee aggregation, facets                |
| 4    | The endpoint, integration-tested, with OpenAPI regenerated                |
| 5    | The mobile search and filter UI                                           |
| 6    | End-to-end coverage, ADRs and flow-doc updates                            |

---

### Task 1: Trigger-maintained search vector

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (the `Listing` model)
- Create: `packages/db/prisma/migrations/<timestamp>_add_listing_search_vector/migration.sql`
- Test: `apps/api/test/search-triggers.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: a `Listing."searchVector"` column of type `tsvector`, maintained by triggers,
  with a GIN index named `Listing_searchVector_idx`. A SQL function
  `listing_search_vector(p_name text, p_locality text, p_description text, p_city_id text, p_listing_id text) RETURNS tsvector`.
  Nothing in TypeScript reads it until Task 3.

- [ ] **Step 1: Declare the column in the Prisma schema**

In `packages/db/prisma/schema.prisma`, inside `model Listing`, add after `updatedAt`:

```prisma
  /// Maintained by database triggers (see the add_listing_search_vector migration).
  /// Prisma cannot read or write an Unsupported column; only raw SQL queries it.
  searchVector Unsupported("tsvector")?
```

- [ ] **Step 2: Generate the migration skeleton**

Run:

```bash
cd packages/db && pnpm exec prisma migrate dev --create-only --name add_listing_search_vector
```

Expected: a new directory under `prisma/migrations/` whose `migration.sql` contains only
`ALTER TABLE "Listing" ADD COLUMN "searchVector" tsvector;`.

- [ ] **Step 3: Write the full migration**

Replace the generated `migration.sql` with the following. Keep the generated `ALTER TABLE`
line as the first statement.

```sql
-- Free-text search over Listing, maintained by triggers so the index cannot
-- drift from the data regardless of what writes the row. See ADR 0011.
ALTER TABLE "Listing" ADD COLUMN "searchVector" tsvector;

CREATE INDEX "Listing_searchVector_idx" ON "Listing" USING GIN ("searchVector");

-- Weighted so a name match outranks a description match:
--   A name   B exam labels   C locality + city   D description
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

-- 1. The listing's own fields changed. BEFORE, and assigns NEW rather than
--    issuing an UPDATE, so it cannot recurse. Scoped to these four columns so
--    that trigger 2's UPDATE of searchVector alone does not re-fire it.
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

-- 2. A listing's exam tags changed. On INSERT into Listing the tags do not
--    exist yet (Prisma writes them in a second statement), so this is what
--    fills in weight B.
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

-- 3. A tag was renamed; every listing carrying it needs recomputing.
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

-- Backfill existing rows now that the machinery exists.
UPDATE "Listing" l SET "searchVector" = listing_search_vector(
  l.name, l.locality, l."shortDescription", l."cityId", l.id
);
```

- [ ] **Step 4: Apply the migration to all three databases**

Run:

```bash
cd packages/db
pnpm exec prisma migrate dev
DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" pnpm exec prisma migrate deploy
DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_e2e" pnpm exec prisma migrate deploy
cd ../..
pnpm --filter @one/db db:generate
```

Expected: all three report the migration applied; `db:generate` succeeds.

- [ ] **Step 5: Write the failing trigger test**

Create `apps/api/test/search-triggers.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb } from './helpers/db.js'

// The vector is cast to text so assertions can look for weighted lexemes,
// which print as 'allen':1A — lexeme, position, weight.
async function vectorFor(listingId: string): Promise<string> {
  const rows = await prisma.$queryRaw<{ v: string | null }[]>`
    SELECT "searchVector"::text AS v FROM "Listing" WHERE id = ${listingId}
  `
  return rows[0]?.v ?? ''
}

async function seedListing(overrides: { name?: string; locality?: string } = {}) {
  const city = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })

  const listing = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'allen-career-institute',
      name: overrides.name ?? 'Allen Career Institute',
      status: 'PUBLISHED',
      organizationId: org.id,
      cityId: city.id,
      locality: overrides.locality ?? 'Kothrud',
      shortDescription: 'Residential coaching programme',
    },
  })

  return { listing, city, org }
}

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('listing search vector triggers', () => {
  it('populates the vector on insert, weighting name A and locality/city C', async () => {
    const { listing } = await seedListing()
    const vector = await vectorFor(listing.id)

    expect(vector).toMatch(/'allen':\d+A/)
    expect(vector).toMatch(/'kothrud':\d+C/)
    expect(vector).toMatch(/'pune':\d+C/)
    // "programme" is stemmed to "programm" and carries the weakest weight.
    expect(vector).toMatch(/'programm':\d+D/)
  })

  it('folds exam labels in at weight B when a tag is attached', async () => {
    const { listing } = await seedListing()
    const tag = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })

    expect(await vectorFor(listing.id)).not.toMatch(/'jee'/)

    await prisma.listingTag.create({ data: { listingId: listing.id, tagId: tag.id } })

    expect(await vectorFor(listing.id)).toMatch(/'jee':\d+B/)
  })

  it('drops an exam term when the tag is detached', async () => {
    const { listing } = await seedListing()
    const tag = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })
    await prisma.listingTag.create({ data: { listingId: listing.id, tagId: tag.id } })

    await prisma.listingTag.delete({
      where: { listingId_tagId: { listingId: listing.id, tagId: tag.id } },
    })

    expect(await vectorFor(listing.id)).not.toMatch(/'jee'/)
  })

  it('recomputes every affected listing when a tag label is renamed', async () => {
    const { listing } = await seedListing()
    const tag = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })
    await prisma.listingTag.create({ data: { listingId: listing.id, tagId: tag.id } })

    await prisma.tag.update({ where: { id: tag.id }, data: { label: 'Olympiad' } })

    const vector = await vectorFor(listing.id)
    expect(vector).toMatch(/'olympiad':\d+B/)
    expect(vector).not.toMatch(/'jee'/)
  })

  it('updates the vector for a write that bypasses the repository entirely', async () => {
    // This is the test that justifies triggers over application-maintained
    // indexing (ADR 0011). A migration, a backfill or a manual psql fix must
    // not be able to leave a listing invisible to search.
    const { listing } = await seedListing()

    await prisma.$executeRaw`
      UPDATE "Listing" SET name = 'Aakash Institute' WHERE id = ${listing.id}
    `

    const vector = await vectorFor(listing.id)
    expect(vector).toMatch(/'aakash':\d+A/)
    expect(vector).not.toMatch(/'allen'/)
  })

  it('tolerates a listing with no locality or description', async () => {
    const city = await prisma.city.create({
      data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
    })
    const org = await prisma.organization.create({ data: { name: 'Beta', slug: 'beta' } })
    const listing = await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'sparse-institute',
        name: 'Sparse Institute',
        status: 'DRAFT',
        organizationId: org.id,
        cityId: city.id,
      },
    })

    const vector = await vectorFor(listing.id)
    expect(vector).toMatch(/'spars':\d+A/)
    expect(vector).toMatch(/'mumbai':\d+C/)
  })
})
```

- [ ] **Step 6: Run the test**

Run:

```bash
pnpm --filter @one/api test search-triggers
```

Expected: 6 passing. The triggers already exist from Step 4, so this test passes on first
run — it is a characterisation test of the migration, not a red-green cycle.

Two things that will trip you up here, both confirmed during implementation:

- **Weight D is not printed.** Postgres treats D as the default weight and omits the suffix,
  so a description term appears as `'programm':8`, never `'programm':8D`. Asserting a
  literal `D` always fails. Assert the position with no `[ABC]` suffix instead.
- **Stems, not words.** `to_tsvector('english', 'programme')` yields `programm`, and
  `'Sparse'` yields `spars`. Adjust the expected stem, never the weight — the weights are
  what make ranking work.

A real vector for the seeded listing looks like this, which is worth reading once:

```
'allen':1A 'career':2A 'institut':3A 'kothrud':4C 'pune':5C 'residenti':6 'coach':7 'programm':8
```

- [ ] **Step 7: Verify the whole suite and the schema-drift gate**

Run:

```bash
pnpm --filter @one/api test
cd packages/db && pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code ; cd ../..
```

Expected: the API suite stays green (104 tests), and `migrate diff` exits 0 — the
`Unsupported` column is declared in the schema, so the migration history matches.

- [ ] **Step 8: Commit**

```bash
git add packages/db apps/api/test/search-triggers.test.ts
git commit -m "feat(db): add trigger-maintained search vector to Listing"
```

---

### Task 2: Contracts for search, filters and facets

**Files:**

- Modify: `packages/shared/src/contracts/institutes.ts`
- Test: `packages/shared/src/contracts/contracts.test.ts`

**Interfaces:**

- Consumes: `paginationQuery`, `paginated` from `../pagination.js`; `modeSchema` from this file.
- Produces:
  - `SORT_OPTIONS = ['relevance', 'recent', 'fee_asc', 'name']`, `sortSchema`, `type InstituteSort`
  - `listInstitutesQuery` with `q?`, `city?`, `exams?: string[]`, `mode?`, `feeMin?`, `feeMax?`, `sort?`, plus `page`/`limit`
  - `instituteSummary` gaining `minFeeAmount: number | null`, `maxFeeAmount: number | null`
  - `facetCounts` = `{ exams: { slug, label, count }[], modes: { mode, count }[] }`, `type FacetCounts`
  - `instituteListResponse` = paginated summary **plus** `facets: FacetCounts`
  - `FEE_BUCKETS`: the four presets the UI renders, each `{ id, label, feeMin?, feeMax? }`

- [ ] **Step 1: Write the failing contract tests**

Append to `packages/shared/src/contracts/contracts.test.ts`:

```ts
import { FEE_BUCKETS, facetCounts, instituteListResponse, instituteSummary } from './index.js'

describe('listInstitutesQuery — search', () => {
  it('leaves sort undefined so the service can default it from q', () => {
    expect(listInstitutesQuery.parse({}).sort).toBeUndefined()
  })

  it('accepts a free-text query and trims it', () => {
    expect(listInstitutesQuery.parse({ q: '  allen pune  ' }).q).toBe('allen pune')
  })

  it('rejects a query longer than 100 characters', () => {
    expect(listInstitutesQuery.safeParse({ q: 'a'.repeat(101) }).success).toBe(false)
  })

  it('wraps a single repeated parameter into an array', () => {
    expect(listInstitutesQuery.parse({ exams: 'jee' }).exams).toEqual(['jee'])
  })

  it('keeps multiple repeated parameters as an array', () => {
    expect(listInstitutesQuery.parse({ exams: ['jee', 'neet'] }).exams).toEqual(['jee', 'neet'])
  })

  it('rejects more than ten exams', () => {
    const exams = Array.from({ length: 11 }, (_, i) => `exam-${i}`)
    expect(listInstitutesQuery.safeParse({ exams }).success).toBe(false)
  })

  it('coerces fee bounds from query strings', () => {
    const parsed = listInstitutesQuery.parse({ feeMin: '2500000', feeMax: '5000000' })
    expect(parsed.feeMin).toBe(2500000)
    expect(parsed.feeMax).toBe(5000000)
  })

  it('rejects a fee range whose minimum exceeds its maximum', () => {
    expect(listInstitutesQuery.safeParse({ feeMin: '5000000', feeMax: '1000' }).success).toBe(false)
  })

  it('rejects a non-integer fee bound, because fees are minor units (BR-005)', () => {
    expect(listInstitutesQuery.safeParse({ feeMin: '100.5' }).success).toBe(false)
  })

  it('accepts every supported sort value', () => {
    for (const sort of ['relevance', 'recent', 'fee_asc', 'name']) {
      expect(listInstitutesQuery.safeParse({ sort }).success).toBe(true)
    }
  })

  it('no longer accepts sort=rating, which was inert', () => {
    expect(listInstitutesQuery.safeParse({ sort: 'rating' }).success).toBe(false)
  })
})

describe('facetCounts', () => {
  it('validates exam and mode counts', () => {
    const value = {
      exams: [{ slug: 'jee', label: 'JEE', count: 12 }],
      modes: [{ mode: 'OFFLINE' as const, count: 7 }],
    }
    expect(facetCounts.parse(value)).toEqual(value)
  })

  it('rejects an unknown mode in a facet', () => {
    expect(
      facetCounts.safeParse({ exams: [], modes: [{ mode: 'REMOTE', count: 1 }] }).success,
    ).toBe(false)
  })
})

describe('instituteSummary — fee range', () => {
  const base = {
    id: 'l1',
    slug: 'alpha',
    name: 'Alpha',
    city: { slug: 'pune', name: 'Pune' },
    locality: null,
    shortDescription: null,
    ratingAvg: 0,
    ratingCount: 0,
    modes: [],
    exams: [],
    batchCount: 0,
  }

  it('accepts a null fee range for a listing with no published batches', () => {
    const parsed = instituteSummary.parse({ ...base, minFeeAmount: null, maxFeeAmount: null })
    expect(parsed.minFeeAmount).toBeNull()
  })

  it('requires integer minor units for the fee range (BR-005)', () => {
    expect(
      instituteSummary.safeParse({ ...base, minFeeAmount: 1000.5, maxFeeAmount: 2000 }).success,
    ).toBe(false)
  })
})

describe('instituteListResponse', () => {
  it('carries facets alongside the paginated items', () => {
    const value = {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      facets: { exams: [], modes: [] },
    }
    expect(instituteListResponse.parse(value)).toEqual(value)
  })

  it('rejects a response with no facets', () => {
    expect(
      instituteListResponse.safeParse({ items: [], total: 0, page: 1, limit: 20 }).success,
    ).toBe(false)
  })
})

describe('FEE_BUCKETS', () => {
  it('covers the range without gaps, in paise', () => {
    expect(FEE_BUCKETS.map((bucket) => bucket.id)).toEqual([
      'under-25k',
      '25k-50k',
      '50k-1l',
      'over-1l',
    ])
    expect(FEE_BUCKETS[0]?.feeMax).toBe(2_500_000)
    expect(FEE_BUCKETS[1]?.feeMin).toBe(2_500_000)
    expect(FEE_BUCKETS[3]?.feeMin).toBe(10_000_000)
    expect(FEE_BUCKETS[3]?.feeMax).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @one/shared test
```

Expected: FAIL — `FEE_BUCKETS` and `facetCounts` are not exported, and `sort=rating` still
parses.

- [ ] **Step 3: Rewrite the institute contracts**

Replace the whole of `packages/shared/src/contracts/institutes.ts`:

```ts
import { z } from 'zod'
import { paginated, paginationQuery } from '../pagination.js'

export const MODES = ['ONLINE', 'OFFLINE', 'HYBRID'] as const
export const modeSchema = z.enum(MODES)
export type Mode = (typeof MODES)[number]

// `rating` was removed in P1a: nothing writes ratingAvg, so the option was
// inert. It returns with reviews (P1d).
export const SORT_OPTIONS = ['relevance', 'recent', 'fee_asc', 'name'] as const
export const sortSchema = z.enum(SORT_OPTIONS)
export type InstituteSort = (typeof SORT_OPTIONS)[number]

// A repeated query parameter arrives as a string when given once and an array
// when given more than once.
const toArray = (value: unknown) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value]

export const listInstitutesQuery = paginationQuery
  .extend({
    q: z.string().trim().max(100).optional(),
    city: z.string().min(1).optional(),
    exams: z.preprocess(toArray, z.array(z.string().min(1)).max(10).optional()),
    mode: modeSchema.optional(),
    // Fee bounds are integer minor units (paise), like every other amount.
    feeMin: z.coerce.number().int().min(0).optional(),
    feeMax: z.coerce.number().int().min(0).optional(),
    // Left undefined so the service can default to relevance when q is
    // present and recent when it is not.
    sort: sortSchema.optional(),
  })
  .refine(
    (value) =>
      value.feeMin === undefined || value.feeMax === undefined || value.feeMin <= value.feeMax,
    { error: 'feeMin must not exceed feeMax' },
  )

export type ListInstitutesQuery = z.infer<typeof listInstitutesQuery>

export const instituteSlugParam = z.object({ slug: z.string().min(1) })
export type InstituteSlugParam = z.infer<typeof instituteSlugParam>

/// Named minFeeAmount rather than feeMin so a response field can never be
/// confused with the request filter of the same concept.
export const instituteSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  city: z.object({ slug: z.string(), name: z.string() }),
  locality: z.string().nullable(),
  shortDescription: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  modes: z.array(modeSchema),
  exams: z.array(z.string()),
  batchCount: z.number().int(),
  minFeeAmount: z.number().int().nullable(),
  maxFeeAmount: z.number().int().nullable(),
})
export type InstituteSummary = z.infer<typeof instituteSummary>

export const facetCounts = z.object({
  exams: z.array(
    z.object({ slug: z.string(), label: z.string(), count: z.number().int().nonnegative() }),
  ),
  modes: z.array(z.object({ mode: modeSchema, count: z.number().int().nonnegative() })),
})
export type FacetCounts = z.infer<typeof facetCounts>

export const instituteListResponse = paginated(instituteSummary).extend({
  facets: facetCounts,
})
export type InstituteListResponse = z.infer<typeof instituteListResponse>

export const instituteDetail = instituteSummary.extend({
  about: z.string().nullable(),
  website: z.string().nullable(),
  establishedYear: z.number().int().nullable(),
  facultyCount: z.number().int().nullable(),
  media: z.array(z.object({ url: z.string(), alt: z.string().nullable() })),
  publishedAt: z.iso.datetime().nullable(),
})
export type InstituteDetail = z.infer<typeof instituteDetail>

/// Preset fee bands, in paise. Buckets rather than a dual-handle slider:
/// sliders are unusable with a thumb, and these fit the existing chip rail.
/// The boundaries are a first guess at the Indian coaching market and should
/// be revisited against real fee data.
export const FEE_BUCKETS = [
  { id: 'under-25k', label: 'Under ₹25,000', feeMax: 2_500_000 },
  { id: '25k-50k', label: '₹25,000 – ₹50,000', feeMin: 2_500_000, feeMax: 5_000_000 },
  { id: '50k-1l', label: '₹50,000 – ₹1,00,000', feeMin: 5_000_000, feeMax: 10_000_000 },
  { id: 'over-1l', label: 'Over ₹1,00,000', feeMin: 10_000_000 },
] as const satisfies readonly {
  id: string
  label: string
  feeMin?: number
  feeMax?: number
}[]

export type FeeBucketId = (typeof FEE_BUCKETS)[number]['id']
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @one/shared test
```

Expected: all passing. If `z.preprocess` complains that the inner schema is optional,
confirm the order is `z.array(...).max(10).optional()` — the `optional()` must be outermost
inside the preprocess.

- [ ] **Step 5: Confirm the breaking change surfaces as type errors, not silence**

```bash
pnpm --filter @one/shared build
pnpm --filter @one/api typecheck
pnpm --filter @one/web typecheck
```

Expected: `@one/shared` builds; the API and web **fail** to typecheck. That is correct and
is the monorepo earning its keep — `exam` became `exams`, `sort` lost `rating`, and
`instituteSummary` gained two required fields, so every consumer is flagged now rather than
at runtime. Tasks 3–5 fix them.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add search, fee and facet contracts; drop inert rating sort"
```

---

### Task 3: The SQL module — matching, ranking, fee aggregation, facets

**Files:**

- Create: `apps/api/src/modules/institutes/institutes.search.sql.ts`
- Modify: `apps/api/src/modules/institutes/institutes.repository.ts`
- Test: `apps/api/src/modules/institutes/institutes.search.test.ts`

**Interfaces:**

- Consumes: `@one/db` (`prisma`, `Prisma`); `InstituteSort`, `Mode` from `@one/shared`.
- Produces, from `institutes.search.sql.ts`:
  - `type SearchFilters = { q?: string; citySlug?: string; examSlugs?: string[]; mode?: Mode; feeMin?: number; feeMax?: number; sort: InstituteSort; skip: number; take: number }`
  - `type SearchHit = { id: string; minFeeAmount: number | null; maxFeeAmount: number | null; publishedBatchCount: number }`
  - `searchPublished(filters: SearchFilters): Promise<{ hits: SearchHit[]; total: number }>`
  - `examFacets(filters: SearchFilters): Promise<{ slug: string; label: string; count: number }[]>`
  - `modeFacets(filters: SearchFilters): Promise<{ mode: Mode; count: number }[]>`
- Produces, from `institutes.repository.ts`:
  - `findSummariesByIds(ids: string[]): Promise<InstituteRow[]>` — reuses the existing
    `SELECT`, so the projection stays typed

- [ ] **Step 1: Write the failing search tests**

Create `apps/api/src/modules/institutes/institutes.search.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb } from '../../../test/helpers/db.js'
import {
  examFacets,
  modeFacets,
  searchPublished,
  type SearchFilters,
} from './institutes.search.sql.js'

const base: SearchFilters = { sort: 'relevance', skip: 0, take: 20 }

async function seedCatalogue() {
  const pune = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const mumbai = await prisma.city.create({
    data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })
  const jee = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })
  const neet = await prisma.tag.create({ data: { slug: 'neet', label: 'NEET', kind: 'EXAM' } })

  // Name match. Two batches, ₹25,000 and ₹1,00,000 — the pair that exposes
  // interval-overlap fee filtering as wrong.
  const allen = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'allen-career-institute',
      name: 'Allen Career Institute',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-03-01T00:00:00Z'),
      organizationId: org.id,
      cityId: pune.id,
      locality: 'Kothrud',
      shortDescription: 'Residential programme',
      instituteProfile: { create: { modes: ['OFFLINE'] } },
      tags: { create: [{ tagId: jee.id }] },
      batches: {
        create: [
          {
            title: 'JEE Main',
            exam: 'JEE',
            mode: 'OFFLINE',
            startDate: new Date('2027-04-01T00:00:00Z'),
            seatsTotal: 10,
            seatsAvailable: 10,
            feeAmount: 2_500_000,
            status: 'PUBLISHED',
          },
          {
            title: 'JEE Advanced',
            exam: 'JEE',
            mode: 'OFFLINE',
            startDate: new Date('2027-05-01T00:00:00Z'),
            seatsTotal: 10,
            seatsAvailable: 10,
            feeAmount: 10_000_000,
            status: 'PUBLISHED',
          },
        ],
      },
    },
  })

  // Description-only match for "allen", to prove weighting.
  const mentor = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'mentor-classes',
      name: 'Mentor Classes',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-04-01T00:00:00Z'),
      organizationId: org.id,
      cityId: mumbai.id,
      locality: 'Andheri',
      shortDescription: 'Faculty formerly of Allen',
      instituteProfile: { create: { modes: ['ONLINE', 'HYBRID'] } },
      tags: { create: [{ tagId: neet.id }] },
      batches: {
        create: {
          title: 'NEET Foundation',
          exam: 'NEET',
          mode: 'ONLINE',
          startDate: new Date('2027-06-01T00:00:00Z'),
          seatsTotal: 10,
          seatsAvailable: 10,
          feeAmount: 4_000_000,
          status: 'PUBLISHED',
        },
      },
    },
  })

  // Must never appear: unpublished (BR-009).
  await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'allen-draft',
      name: 'Allen Draft Institute',
      status: 'DRAFT',
      organizationId: org.id,
      cityId: pune.id,
      instituteProfile: { create: { modes: ['OFFLINE'] } },
    },
  })

  // No InstituteProfile row at all — must still be findable.
  const sparse = await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'sparse-academy',
      name: 'Sparse Academy',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-05-01T00:00:00Z'),
      organizationId: org.id,
      cityId: pune.id,
    },
  })

  return { allen, mentor, sparse, pune, mumbai, org }
}

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('searchPublished — matching', () => {
  it('returns every published listing when there is no query', async () => {
    await seedCatalogue()
    const { hits, total } = await searchPublished({ ...base, sort: 'recent' })
    expect(total).toBe(3)
    expect(hits).toHaveLength(3)
  })

  it('excludes unpublished listings (BR-009)', async () => {
    await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'allen' })
    const ids = hits.map((hit) => hit.id)
    const draft = await prisma.listing.findUniqueOrThrow({ where: { slug: 'allen-draft' } })
    expect(ids).not.toContain(draft.id)
  })

  it('matches on name', async () => {
    const { allen } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'allen' })
    expect(hits[0]?.id).toBe(allen.id)
  })

  it('ranks a name match above a description match', async () => {
    const { allen, mentor } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'allen' })
    const ids = hits.map((hit) => hit.id)
    expect(ids.indexOf(allen.id)).toBeLessThan(ids.indexOf(mentor.id))
  })

  it('matches on locality', async () => {
    const { allen } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'kothrud' })
    expect(hits.map((hit) => hit.id)).toEqual([allen.id])
  })

  it('matches on city name', async () => {
    await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'mumbai' })
    expect(hits).toHaveLength(1)
  })

  it('matches on exam label', async () => {
    const { mentor } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'neet' })
    expect(hits.map((hit) => hit.id)).toEqual([mentor.id])
  })

  it('returns nothing for a term that appears nowhere', async () => {
    await seedCatalogue()
    const { hits, total } = await searchPublished({ ...base, q: 'kathmandu' })
    expect(hits).toEqual([])
    expect(total).toBe(0)
  })

  it('treats SQL metacharacters as search text, not syntax', async () => {
    await seedCatalogue()
    const malicious = '\'; DROP TABLE "Listing"; --'
    const { hits } = await searchPublished({ ...base, q: malicious })
    expect(hits).toEqual([])
    // The table is still there.
    expect(await prisma.listing.count()).toBe(4)
  })

  it('finds a listing that has no InstituteProfile row', async () => {
    const { sparse } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'sparse' })
    expect(hits.map((hit) => hit.id)).toEqual([sparse.id])
  })
})

describe('searchPublished — fee aggregates and filtering', () => {
  it('reports the fee range from published batches', async () => {
    const { allen } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'allen career' })
    const hit = hits.find((candidate) => candidate.id === allen.id)
    expect(hit?.minFeeAmount).toBe(2_500_000)
    expect(hit?.maxFeeAmount).toBe(10_000_000)
    expect(hit?.publishedBatchCount).toBe(2)
  })

  it('reports nulls for a listing with no published batches', async () => {
    const { sparse } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, q: 'sparse' })
    expect(hits[0]?.id).toBe(sparse.id)
    expect(hits[0]?.minFeeAmount).toBeNull()
    expect(hits[0]?.publishedBatchCount).toBe(0)
  })

  it('matches a listing with a batch inside the range', async () => {
    const { allen } = await seedCatalogue()
    const { hits } = await searchPublished({
      ...base,
      sort: 'recent',
      feeMin: 2_000_000,
      feeMax: 3_000_000,
    })
    expect(hits.map((hit) => hit.id)).toContain(allen.id)
  })

  it('does NOT match on interval overlap when no single batch is in range', async () => {
    // Allen has batches at ₹25,000 and ₹1,00,000. Its min/max interval spans
    // ₹40,000–₹50,000, but no actual batch is in that band, so it must not
    // appear. This is the bug the spec calls out in §6.
    const { allen } = await seedCatalogue()
    const { hits } = await searchPublished({
      ...base,
      sort: 'recent',
      feeMin: 4_000_000,
      feeMax: 5_000_000,
    })
    expect(hits.map((hit) => hit.id)).not.toContain(allen.id)
  })

  it('excludes draft batches from the fee filter', async () => {
    const { sparse } = await seedCatalogue()
    await prisma.batch.create({
      data: {
        listingId: sparse.id,
        title: 'Unpublished',
        exam: 'JEE',
        startDate: new Date('2027-04-01T00:00:00Z'),
        seatsTotal: 5,
        seatsAvailable: 5,
        feeAmount: 3_000_000,
        status: 'DRAFT',
      },
    })

    const { hits } = await searchPublished({
      ...base,
      sort: 'recent',
      feeMin: 2_900_000,
      feeMax: 3_100_000,
    })
    expect(hits.map((hit) => hit.id)).not.toContain(sparse.id)
  })
})

describe('searchPublished — filters and sorting', () => {
  it('filters by city slug', async () => {
    await seedCatalogue()
    const { total } = await searchPublished({ ...base, sort: 'recent', citySlug: 'mumbai' })
    expect(total).toBe(1)
  })

  it('treats multiple exams as OR', async () => {
    await seedCatalogue()
    const { total } = await searchPublished({
      ...base,
      sort: 'recent',
      examSlugs: ['jee', 'neet'],
    })
    expect(total).toBe(2)
  })

  it('filters by mode', async () => {
    const { mentor } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, sort: 'recent', mode: 'HYBRID' })
    expect(hits.map((hit) => hit.id)).toEqual([mentor.id])
  })

  it('sorts by ascending minimum fee, listings without batches last', async () => {
    const { allen, mentor, sparse } = await seedCatalogue()
    const { hits } = await searchPublished({ ...base, sort: 'fee_asc' })
    expect(hits.map((hit) => hit.id)).toEqual([allen.id, mentor.id, sparse.id])
  })

  it('sorts by name', async () => {
    await seedCatalogue()
    const { hits } = await searchPublished({ ...base, sort: 'name', take: 3 })
    expect(hits).toHaveLength(3)
  })

  it('paginates while reporting the full total', async () => {
    await seedCatalogue()
    const { hits, total } = await searchPublished({ ...base, sort: 'recent', skip: 1, take: 1 })
    expect(hits).toHaveLength(1)
    expect(total).toBe(3)
  })
})

describe('facets', () => {
  it('counts exams over the filtered set', async () => {
    await seedCatalogue()
    const facets = await examFacets({ ...base, sort: 'recent' })
    expect(facets).toEqual(
      expect.arrayContaining([
        { slug: 'jee', label: 'JEE', count: 1 },
        { slug: 'neet', label: 'NEET', count: 1 },
      ]),
    )
  })

  it('excludes the exam filter from its own counts', async () => {
    // Selecting JEE must still report NEET's count, or the counts are useless
    // for navigation.
    await seedCatalogue()
    const facets = await examFacets({ ...base, sort: 'recent', examSlugs: ['jee'] })
    const neet = facets.find((facet) => facet.slug === 'neet')
    expect(neet?.count).toBe(1)
  })

  it('applies other filters to exam counts', async () => {
    await seedCatalogue()
    const facets = await examFacets({ ...base, sort: 'recent', citySlug: 'mumbai' })
    expect(facets.map((facet) => facet.slug)).toEqual(['neet'])
  })

  it('counts modes, excluding the mode filter from its own counts', async () => {
    await seedCatalogue()
    const facets = await modeFacets({ ...base, sort: 'recent', mode: 'OFFLINE' })
    const byMode = Object.fromEntries(facets.map((facet) => [facet.mode, facet.count]))
    expect(byMode.OFFLINE).toBe(1)
    expect(byMode.ONLINE).toBe(1)
    expect(byMode.HYBRID).toBe(1)
  })

  it('respects the free-text query in facet counts', async () => {
    await seedCatalogue()
    const facets = await examFacets({ ...base, q: 'kothrud' })
    expect(facets).toEqual([{ slug: 'jee', label: 'JEE', count: 1 }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @one/api test institutes.search
```

Expected: FAIL — `./institutes.search.sql.js` cannot be resolved.

- [ ] **Step 3: Write the SQL module**

Create `apps/api/src/modules/institutes/institutes.search.sql.ts`:

```ts
import { Prisma, prisma } from '@one/db'
import type { InstituteSort, Mode } from '@one/shared'

// The only hand-written SQL in the codebase. Full-text search cannot be
// expressed through Prisma's query API, so it is isolated here and kept to
// three queries: matching, exam facets, mode facets.
//
// Every value is interpolated through Prisma.sql, which parameterises it.
// Never build a fragment by concatenating a string that came from a request.

export type SearchFilters = {
  q?: string
  citySlug?: string
  examSlugs?: string[]
  mode?: Mode
  feeMin?: number
  feeMax?: number
  sort: InstituteSort
  skip: number
  take: number
}

export type SearchHit = {
  id: string
  minFeeAmount: number | null
  maxFeeAmount: number | null
  publishedBatchCount: number
}

/// Highest value Postgres `integer` holds; stands in for "no upper bound".
const INT4_MAX = 2_147_483_647

type Omitted = 'exams' | 'mode' | null

function wherePredicates(filters: SearchFilters, omit: Omitted = null): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [
    Prisma.sql`l.vertical = 'INSTITUTE'`,
    // BR-009 applied at the data boundary, so no caller can forget it.
    Prisma.sql`l.status = 'PUBLISHED'`,
  ]

  if (filters.q) parts.push(Prisma.sql`l."searchVector" @@ q.tsq`)

  if (filters.citySlug) parts.push(Prisma.sql`c.slug = ${filters.citySlug}`)

  if (omit !== 'exams' && filters.examSlugs?.length) {
    parts.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "ListingTag" lt
      JOIN "Tag" t ON t.id = lt."tagId"
      WHERE lt."listingId" = l.id
        AND t.kind = 'EXAM'
        AND t.slug IN (${Prisma.join(filters.examSlugs)})
    )`)
  }

  if (omit !== 'mode' && filters.mode) {
    // Compared as text[] to avoid casting a parameter to the Mode enum.
    parts.push(Prisma.sql`p.modes::text[] @> ARRAY[${filters.mode}]`)
  }

  if (filters.feeMin !== undefined || filters.feeMax !== undefined) {
    // EXISTS over individual batches, NOT a comparison against the min/max
    // aggregate. The aggregate would test whether the listing's fee interval
    // overlaps the range, which is a different and wrong question: a listing
    // with batches at 25,00,000 and 1,00,00,000 paise would match a filter for
    // 40,00,000-50,00,000 despite having nothing in that band.
    parts.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "Batch" b
      WHERE b."listingId" = l.id
        AND b.status = 'PUBLISHED'
        AND b."feeAmount" BETWEEN ${filters.feeMin ?? 0} AND ${filters.feeMax ?? INT4_MAX}
    )`)
  }

  return parts
}

/// The shared FROM and WHERE. City is an inner join because every listing has
/// one; InstituteProfile is a left join so a listing missing its profile row
/// still appears rather than vanishing from search.
function fromAndWhere(filters: SearchFilters, omit: Omitted = null): Prisma.Sql {
  return Prisma.sql`
    FROM "Listing" l
    CROSS JOIN q
    JOIN "City" c ON c.id = l."cityId"
    LEFT JOIN "InstituteProfile" p ON p."listingId" = l.id
    WHERE ${Prisma.join(wherePredicates(filters, omit), ' AND ')}
  `
}

function queryCte(filters: SearchFilters): Prisma.Sql {
  return Prisma.sql`WITH q AS (
    SELECT websearch_to_tsquery('english', ${filters.q ?? ''}) AS tsq
  )`
}

const ORDER_BY: Record<InstituteSort, Prisma.Sql> = {
  relevance: Prisma.sql`rank DESC, l."publishedAt" DESC NULLS LAST`,
  recent: Prisma.sql`l."publishedAt" DESC NULLS LAST`,
  fee_asc: Prisma.sql`f.min_fee ASC NULLS LAST`,
  name: Prisma.sql`l.name ASC`,
}

type SearchRow = {
  id: string
  rank: number
  min_fee: number | null
  max_fee: number | null
  published_batches: bigint
  total: bigint
}

export async function searchPublished(
  filters: SearchFilters,
): Promise<{ hits: SearchHit[]; total: number }> {
  const feeAggregate = Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT
        min(b."feeAmount") AS min_fee,
        max(b."feeAmount") AS max_fee,
        count(*) AS published_batches
      FROM "Batch" b
      WHERE b."listingId" = l.id AND b.status = 'PUBLISHED'
    ) f ON true
  `

  // The lateral has to sit between the joins and the WHERE clause, so the
  // FROM is assembled here rather than reusing fromAndWhere().
  const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    ${queryCte(filters)}
    SELECT
      l.id,
      CASE WHEN ${filters.q ?? ''} = '' THEN 0 ELSE ts_rank(l."searchVector", q.tsq) END AS rank,
      f.min_fee,
      f.max_fee,
      f.published_batches,
      count(*) OVER () AS total
    FROM "Listing" l
    CROSS JOIN q
    JOIN "City" c ON c.id = l."cityId"
    LEFT JOIN "InstituteProfile" p ON p."listingId" = l.id
    ${feeAggregate}
    WHERE ${Prisma.join(wherePredicates(filters), ' AND ')}
    ORDER BY ${ORDER_BY[filters.sort]}
    LIMIT ${filters.take} OFFSET ${filters.skip}
  `)

  return {
    // count() returns bigint; Number() before these values meet a Zod schema.
    total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    hits: rows.map((row) => ({
      id: row.id,
      minFeeAmount: row.min_fee,
      maxFeeAmount: row.max_fee,
      publishedBatchCount: Number(row.published_batches),
    })),
  }
}

export async function examFacets(
  filters: SearchFilters,
): Promise<{ slug: string; label: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ slug: string; label: string; count: bigint }[]>(
    Prisma.sql`
      ${queryCte(filters)}
      SELECT t.slug, t.label, count(DISTINCT l.id) AS count
      FROM "Listing" l
      CROSS JOIN q
      JOIN "City" c ON c.id = l."cityId"
      LEFT JOIN "InstituteProfile" p ON p."listingId" = l.id
      JOIN "ListingTag" lt ON lt."listingId" = l.id
      JOIN "Tag" t ON t.id = lt."tagId" AND t.kind = 'EXAM'
      WHERE ${Prisma.join(wherePredicates(filters, 'exams'), ' AND ')}
      GROUP BY t.slug, t.label
      ORDER BY count DESC, t.label ASC
    `,
  )

  return rows.map((row) => ({ slug: row.slug, label: row.label, count: Number(row.count) }))
}

export async function modeFacets(filters: SearchFilters): Promise<{ mode: Mode; count: number }[]> {
  const rows = await prisma.$queryRaw<{ mode: Mode; count: bigint }[]>(
    Prisma.sql`
      ${queryCte(filters)}
      SELECT m::text AS mode, count(DISTINCT l.id) AS count
      FROM "Listing" l
      CROSS JOIN q
      JOIN "City" c ON c.id = l."cityId"
      LEFT JOIN "InstituteProfile" p ON p."listingId" = l.id
      CROSS JOIN LATERAL unnest(coalesce(p.modes, ARRAY[]::"Mode"[])) AS m
      WHERE ${Prisma.join(wherePredicates(filters, 'mode'), ' AND ')}
      GROUP BY m
      ORDER BY count DESC, mode ASC
    `,
  )

  return rows.map((row) => ({ mode: row.mode, count: Number(row.count) }))
}
```

Note the unused `fromAndWhere` helper: delete it if the three queries end up not sharing
it. Do not leave dead code behind — `pnpm lint` will flag it.

- [ ] **Step 4: Add the id-ordered projection to the repository**

In `apps/api/src/modules/institutes/institutes.repository.ts`, append:

```ts
/// Projects rows for ids the search query already selected and ordered. Keeps
/// the typed SELECT, so the raw query never has to hand-map every column.
export async function findSummariesByIds(ids: string[]): Promise<InstituteRow[]> {
  if (ids.length === 0) return []
  return prisma.listing.findMany({ where: { id: { in: ids } }, select: SELECT })
}
```

Re-export the search module from the repository so the service has one import surface:

```ts
export {
  examFacets,
  modeFacets,
  searchPublished,
  type SearchFilters,
  type SearchHit,
} from './institutes.search.sql.js'
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @one/api test institutes.search
```

Expected: 26 passing.

Two failures to expect and how to read them:

- **`operator does not exist: text[] @> text[]`** — the mode comparison needs
  `ARRAY[${filters.mode}]::text[]`. Add the cast.
- **`column "rank" does not exist` in ORDER BY** — Postgres allows ordering by an output
  alias, so this means the alias was dropped. Confirm the `CASE … AS rank` survived.

- [ ] **Step 6: Verify lint still enforces the boundaries**

```bash
pnpm --filter @one/api lint
```

Expected: exit 0. The new file is `institutes.search.sql.ts`, which is **not** a
`*.repository.ts`, so the R1/R3 rule would normally reject its `@one/db` import.

If lint fails on that import, the fix is **not** to weaken the rule. Rename the file to
`institutes.search.repository.ts` so it matches the repository glob and the rule keeps
holding for everything else.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/institutes
git commit -m "feat(api): add full-text search, fee aggregation and facet queries"
```

---

### Task 4: The endpoint

**Files:**

- Modify: `apps/api/src/modules/institutes/institutes.service.ts`
- Modify: `apps/api/src/modules/institutes/institutes.routes.ts`
- Modify: `packages/shared/scripts/gen-openapi.ts`
- Test: `apps/api/src/modules/institutes/institutes.routes.test.ts`

**Interfaces:**

- Consumes: `searchPublished`, `examFacets`, `modeFacets`, `findSummariesByIds` from Task 3;
  `listInstitutesQuery`, `instituteListResponse`, `FacetCounts` from Task 2.
- Produces: `institutes.service.listPublished(query: ListInstitutesQuery): Promise<InstituteListResponse>`
  — resolves the default sort, preserves the search result order, and merges fee aggregates
  and facets. `GET /api/v1/institutes` accepting the new query and returning `facets`.

- [ ] **Step 1: Write the failing endpoint tests**

Replace the `GET /api/v1/institutes` block in
`apps/api/src/modules/institutes/institutes.routes.test.ts` with:

```ts
describe('GET /api/v1/institutes', () => {
  it('returns only published listings (BR-009)', async () => {
    const res = await testApp().get('/api/v1/institutes')
    expect(res.status).toBe(200)
    const body = instituteListResponse.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.items[0]?.slug).toBe(seed.publishedSlug)
  })

  it('applies pagination defaults', async () => {
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(20)
  })

  it('rejects a limit above 50 with VALIDATION_FAILED', async () => {
    const res = await testApp().get('/api/v1/institutes?limit=51')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects the removed rating sort', async () => {
    const res = await testApp().get('/api/v1/institutes?sort=rating')
    expect(res.status).toBe(400)
  })

  it('rejects a fee range whose minimum exceeds its maximum', async () => {
    const res = await testApp().get('/api/v1/institutes?feeMin=900000&feeMax=1000')
    expect(res.status).toBe(400)
  })

  it('matches a free-text query against the name', async () => {
    const res = await testApp().get('/api/v1/institutes?q=alpha')
    const body = instituteListResponse.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.items[0]?.slug).toBe(seed.publishedSlug)
  })

  it('returns an empty, well-formed response for a query that matches nothing', async () => {
    const res = await testApp().get('/api/v1/institutes?q=kathmandu')
    expect(res.status).toBe(200)
    const body = instituteListResponse.parse(res.body)
    expect(body.total).toBe(0)
    expect(body.items).toEqual([])
    expect(body.facets).toEqual({ exams: [], modes: [] })
  })

  it('accepts a repeated exams parameter', async () => {
    const res = await testApp().get('/api/v1/institutes?exams=jee&exams=neet')
    expect(res.status).toBe(200)
    expect(instituteListResponse.parse(res.body).total).toBe(1)
  })

  it('filters by city slug', async () => {
    const hit = await testApp().get('/api/v1/institutes?city=pune')
    expect(instituteListResponse.parse(hit.body).total).toBe(1)

    const miss = await testApp().get('/api/v1/institutes?city=delhi')
    expect(instituteListResponse.parse(miss.body).total).toBe(0)
  })

  it('filters by mode', async () => {
    const hit = await testApp().get('/api/v1/institutes?mode=OFFLINE')
    expect(instituteListResponse.parse(hit.body).total).toBe(1)

    const miss = await testApp().get('/api/v1/institutes?mode=ONLINE')
    expect(instituteListResponse.parse(miss.body).total).toBe(0)
  })

  it('reports the fee range in integer minor units (BR-005)', async () => {
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.items[0]?.minFeeAmount).toBe(12500000)
    expect(body.items[0]?.maxFeeAmount).toBe(12500000)
  })

  it('counts only published batches in batchCount', async () => {
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.items[0]?.batchCount).toBe(1)
  })

  it('returns facet counts for exam and mode', async () => {
    const body = instituteListResponse.parse((await testApp().get('/api/v1/institutes')).body)
    expect(body.facets.exams).toEqual([{ slug: 'jee', label: 'JEE', count: 1 }])
    expect(body.facets.modes).toEqual([{ mode: 'OFFLINE', count: 1 }])
  })

  it('preserves relevance order across the Prisma projection', async () => {
    // The raw query orders the ids; the projection fetches them with `IN`,
    // which does not preserve order. The service must restore it.
    await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'zeta-alpha-mention',
        name: 'Zeta Classes',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-06-01T00:00:00Z'),
        organizationId: seed.orgId,
        cityId: seed.cityId,
        shortDescription: 'Alpha Academy alumni teach here',
        instituteProfile: { create: { modes: ['ONLINE'] } },
      },
    })

    const res = await testApp().get('/api/v1/institutes?q=alpha')
    const body = instituteListResponse.parse(res.body)
    expect(body.total).toBe(2)
    // Name match (weight A) must come before a description match (weight D).
    expect(body.items[0]?.slug).toBe(seed.publishedSlug)
  })
})
```

Add `instituteListResponse` to the imports at the top of the file if it is not already
there, and keep the existing `GET /:slug` and `GET /:slug/batches` blocks untouched.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @one/api test institutes.routes
```

Expected: FAIL — the response has no `facets`, and `instituteSummary` has no
`minFeeAmount`.

- [ ] **Step 3: Rewrite the list path in the service**

In `apps/api/src/modules/institutes/institutes.service.ts`, replace `toSummary`,
`toDetail` and `listPublished` with:

```ts
function toSummary(
  row: repo.InstituteRow,
  fees: { minFeeAmount: number | null; maxFeeAmount: number | null; publishedBatchCount: number },
): InstituteSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    locality: row.locality,
    shortDescription: row.shortDescription,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    modes: row.instituteProfile?.modes ?? [],
    exams: row.tags.filter((entry) => entry.tag.kind === 'EXAM').map((entry) => entry.tag.slug),
    batchCount: fees.publishedBatchCount,
    minFeeAmount: fees.minFeeAmount,
    maxFeeAmount: fees.maxFeeAmount,
  }
}

function toDetail(
  row: repo.InstituteRow,
  fees: { minFeeAmount: number | null; maxFeeAmount: number | null; publishedBatchCount: number },
): InstituteDetail {
  return {
    ...toSummary(row, fees),
    about: row.instituteProfile?.about ?? null,
    website: row.instituteProfile?.website ?? null,
    establishedYear: row.instituteProfile?.establishedYear ?? null,
    facultyCount: row.instituteProfile?.facultyCount ?? null,
    media: row.media,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  }
}

/// Relevance is meaningless without a query, so the default depends on it.
function resolveSort(query: ListInstitutesQuery): InstituteSort {
  if (query.sort) return query.sort
  return query.q ? 'relevance' : 'recent'
}

export async function listPublished(query: ListInstitutesQuery): Promise<InstituteListResponse> {
  const filters: repo.SearchFilters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.city ? { citySlug: query.city } : {}),
    ...(query.exams?.length ? { examSlugs: query.exams } : {}),
    ...(query.mode ? { mode: query.mode } : {}),
    ...(query.feeMin === undefined ? {} : { feeMin: query.feeMin }),
    ...(query.feeMax === undefined ? {} : { feeMax: query.feeMax }),
    sort: resolveSort(query),
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  }

  const [matched, exams, modes] = await Promise.all([
    repo.searchPublished(filters),
    repo.examFacets(filters),
    repo.modeFacets(filters),
  ])

  const rows = await repo.findSummariesByIds(matched.hits.map((hit) => hit.id))
  const byId = new Map(rows.map((row) => [row.id, row]))

  // `IN` does not preserve order, so the hit order is authoritative.
  const items = matched.hits.flatMap((hit) => {
    const row = byId.get(hit.id)
    return row ? [toSummary(row, hit)] : []
  })

  return {
    items,
    total: matched.total,
    page: query.page,
    limit: query.limit,
    facets: { exams, modes },
  }
}
```

Update the imports at the top of the file to add `InstituteSort` and
`InstituteListResponse`, and remove `Paginated` if it is now unused.

- [ ] **Step 4: Fix the two other callers of `toSummary` and `toDetail`**

`getPublishedBySlug` and `getForOrg` previously passed a bare `batchCount`. In
`getPublishedBySlug`, replace the `batches.countPublishedByListingIds` call with:

```ts
export async function getPublishedBySlug(slug: string) {
  const resolved = await resolvePublishedSlug(slug)
  const row = await repo.findPublishedById(resolved.listingId)
  if (!row) throw new NotFoundError('Institute not found')

  const fees = await batches.feeSummaryForListing(row.id)

  return {
    detail: toDetail(row, fees),
    canonicalSlug: resolved.canonicalSlug,
    redirected: resolved.redirected,
  }
}
```

Then add to `apps/api/src/modules/batches/batches.service.ts`:

```ts
/// The detail page needs the same fee summary the search query computes, but
/// for one listing. R4 keeps institutes out of the batches repository, so the
/// batches service exposes it.
export async function feeSummaryForListing(listingId: string): Promise<{
  minFeeAmount: number | null
  maxFeeAmount: number | null
  publishedBatchCount: number
}> {
  const rows = await repo.listPublishedByListing(listingId)
  if (rows.length === 0) {
    return { minFeeAmount: null, maxFeeAmount: null, publishedBatchCount: 0 }
  }
  const fees = rows.map((row) => row.feeAmount)
  return {
    minFeeAmount: Math.min(...fees),
    maxFeeAmount: Math.max(...fees),
    publishedBatchCount: rows.length,
  }
}
```

- [ ] **Step 5: Register the changed contract in the OpenAPI generator**

In `packages/shared/scripts/gen-openapi.ts`, the `/api/v1/institutes` path already
references `listInstitutesQuery` and `instituteListResponse`, so it picks up the new shape
automatically. Confirm the import list still compiles, then regenerate:

```bash
pnpm --filter @one/shared gen:openapi
python3 -c "
import json
spec = json.load(open('docs/api/openapi.json'))
params = {p['name'] for p in spec['paths']['/api/v1/institutes']['get']['parameters']}
assert {'q', 'exams', 'feeMin', 'feeMax', 'sort'} <= params, sorted(params)
print('query parameters registered:', sorted(params))
"
```

Expected: the assertion passes and the new parameters are listed.

- [ ] **Step 6: Run the API suite**

```bash
pnpm --filter @one/api test
```

Expected: everything green, including the previously-passing detail and batches tests.

If `instituteListResponse.parse` fails with `expected number, received bigint`, a `count()`
value reached the schema without `Number()`. Find it in `institutes.search.sql.ts`.

- [ ] **Step 7: Verify and commit**

```bash
pnpm --filter @one/api lint
pnpm --filter @one/api typecheck
git add apps/api packages/shared docs/api/openapi.json
git commit -m "feat(api): serve search, fee range and facet counts from the institutes endpoint"
```

---

### Task 5: The mobile search and filter UI

**Files:**

- Create: `apps/web/src/app/institutes/SearchForm.tsx`
- Modify: `apps/web/src/app/institutes/FilterRail.tsx`
- Modify: `apps/web/src/app/institutes/page.tsx`
- Modify: `apps/web/src/lib/format.ts`
- Test: `apps/web/src/lib/format.test.ts`

**Interfaces:**

- Consumes: `listInstitutesQuery`, `instituteListResponse`, `FEE_BUCKETS`, `FacetCounts`,
  `SORT_OPTIONS` from `@one/shared`; `apiGet` from `@/lib/api`.
- Produces: `formatFeeRange(min: number | null, max: number | null): string | null`;
  `SearchForm({ query })`; `FilterRail({ query, facets })` where `query` is the parsed
  `ListInstitutesQuery`.

- [ ] **Step 1: Write the failing formatter test**

Append to `apps/web/src/lib/format.test.ts`:

```ts
import { formatFeeRange } from './format.js'

describe('formatFeeRange', () => {
  it('renders a single value when both bounds match', () => {
    expect(formatFeeRange(12500000, 12500000)).toBe('₹1,25,000')
  })

  it('renders a range when the bounds differ', () => {
    expect(formatFeeRange(2500000, 10000000)).toBe('₹25,000 – ₹1,00,000')
  })

  it('returns null when there are no published batches', () => {
    expect(formatFeeRange(null, null)).toBeNull()
  })

  it('returns null when only one bound is present, rather than half a range', () => {
    expect(formatFeeRange(2500000, null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @one/web test
```

Expected: FAIL — `formatFeeRange` is not exported.

- [ ] **Step 3: Implement the formatter**

Append to `apps/web/src/lib/format.ts`:

```ts
/// Fees arrive as integer minor units (BR-005). Returns null rather than a
/// half-range so the caller can omit the line entirely.
export function formatFeeRange(min: number | null, max: number | null): string | null {
  if (min === null || max === null) return null
  if (min === max) return formatFee(min, 'INR')
  return `${formatFee(min, 'INR')} – ${formatFee(max, 'INR')}`
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter @one/web test
```

Expected: 12 passing.

- [ ] **Step 5: Build the search form**

Create `apps/web/src/app/institutes/SearchForm.tsx`:

```tsx
import type { ListInstitutesQuery } from '@one/shared'

/// A plain GET form, so every result set is a shareable, indexable URL and the
/// page needs no client JavaScript. Active filters ride along as hidden inputs
/// so searching narrows rather than silently resetting them.
export function SearchForm({ query }: { query: ListInstitutesQuery }) {
  return (
    <form action="/institutes" method="get" className="flex gap-2">
      {query.city ? <input type="hidden" name="city" value={query.city} /> : null}
      {query.mode ? <input type="hidden" name="mode" value={query.mode} /> : null}
      {query.exams?.map((exam) => (
        <input key={exam} type="hidden" name="exams" value={exam} />
      ))}
      {query.feeMin === undefined ? null : (
        <input type="hidden" name="feeMin" value={query.feeMin} />
      )}
      {query.feeMax === undefined ? null : (
        <input type="hidden" name="feeMax" value={query.feeMax} />
      )}

      <input
        type="search"
        name="q"
        defaultValue={query.q ?? ''}
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Institute, locality or exam"
        aria-label="Search institutes"
        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      <button
        type="submit"
        className="tap-target shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white"
      >
        Search
      </button>
    </form>
  )
}
```

- [ ] **Step 6: Rewrite the filter rail with counts, multi-select and fee buckets**

Replace `apps/web/src/app/institutes/FilterRail.tsx`:

```tsx
import Link from 'next/link'
import { FEE_BUCKETS, SORT_OPTIONS, type FacetCounts, type ListInstitutesQuery } from '@one/shared'

const SORT_LABELS: Record<(typeof SORT_OPTIONS)[number], string> = {
  relevance: 'Best match',
  recent: 'Newest',
  fee_asc: 'Lowest fee',
  name: 'A–Z',
}

/// Builds a URL from the current query plus a patch. Paging always resets,
/// because page 3 of a different filter set is meaningless.
function hrefWith(
  query: ListInstitutesQuery,
  patch: Partial<Record<string, string | string[] | undefined>>,
): string {
  const params = new URLSearchParams()

  const merged: Record<string, string | string[] | undefined> = {
    q: query.q,
    city: query.city,
    exams: query.exams,
    mode: query.mode,
    feeMin: query.feeMin === undefined ? undefined : String(query.feeMin),
    feeMax: query.feeMax === undefined ? undefined : String(query.feeMax),
    sort: query.sort,
    ...patch,
  }

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry)
    } else if (value !== '') {
      params.set(key, value)
    }
  }

  const search = params.toString()
  return search ? `/institutes?${search}` : '/institutes'
}

function Chip({
  active,
  href,
  label,
  count,
}: {
  active: boolean
  href: string
  label: string
  count?: number
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={[
        'tap-target inline-flex shrink-0 snap-start items-center gap-1 rounded-full border px-4 text-sm font-medium',
        active
          ? 'border-brand-500 bg-brand-500 text-white'
          : 'border-gray-300 bg-white text-gray-700',
      ].join(' ')}
    >
      <span>{label}</span>
      {count === undefined ? null : (
        <span className={active ? 'text-brand-50' : 'text-gray-500'}>({count})</span>
      )}
      {active ? <span aria-hidden="true">×</span> : null}
    </Link>
  )
}

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div className="scroll-rail scroll-rail-hide-bar -mx-4 flex gap-2 px-4 pb-1">{children}</div>
  )
}

export function FilterRail({ query, facets }: { query: ListInstitutesQuery; facets: FacetCounts }) {
  const activeExams = query.exams ?? []
  const activeBucket = FEE_BUCKETS.find(
    (bucket) => bucket.feeMin === query.feeMin && bucket.feeMax === query.feeMax,
  )

  return (
    <div className="space-y-2">
      {facets.exams.length > 0 ? (
        <Rail>
          {facets.exams.map((facet) => {
            const active = activeExams.includes(facet.slug)
            // Tapping toggles rather than replaces, so multi-select works.
            const next = active
              ? activeExams.filter((slug) => slug !== facet.slug)
              : [...activeExams, facet.slug]

            return (
              <Chip
                key={facet.slug}
                label={facet.label}
                count={facet.count}
                active={active}
                href={hrefWith(query, {
                  exams: next.length > 0 ? next : undefined,
                  page: undefined,
                })}
              />
            )
          })}
        </Rail>
      ) : null}

      {facets.modes.length > 0 ? (
        <Rail>
          {facets.modes.map((facet) => (
            <Chip
              key={facet.mode}
              label={facet.mode.charAt(0) + facet.mode.slice(1).toLowerCase()}
              count={facet.count}
              active={query.mode === facet.mode}
              href={hrefWith(query, {
                mode: query.mode === facet.mode ? undefined : facet.mode,
                page: undefined,
              })}
            />
          ))}
        </Rail>
      ) : null}

      <Rail>
        {FEE_BUCKETS.map((bucket) => {
          const active = activeBucket?.id === bucket.id
          return (
            <Chip
              key={bucket.id}
              label={bucket.label}
              active={active}
              href={hrefWith(query, {
                feeMin: active || bucket.feeMin === undefined ? undefined : String(bucket.feeMin),
                feeMax: active || bucket.feeMax === undefined ? undefined : String(bucket.feeMax),
                page: undefined,
              })}
            />
          )
        })}
      </Rail>

      <Rail>
        {SORT_OPTIONS.filter((option) => option !== 'relevance' || Boolean(query.q)).map(
          (option) => (
            <Chip
              key={option}
              label={SORT_LABELS[option]}
              active={(query.sort ?? (query.q ? 'relevance' : 'recent')) === option}
              href={hrefWith(query, { sort: option, page: undefined })}
            />
          ),
        )}
      </Rail>
    </div>
  )
}
```

- [ ] **Step 7: Rewrite the results page**

Replace `apps/web/src/app/institutes/page.tsx`:

```tsx
import Link from 'next/link'
import { Badge } from '@one/ui'
import { instituteListResponse, listInstitutesQuery, type ListInstitutesQuery } from '@one/shared'
import { apiGet } from '@/lib/api'
import { formatFeeRange } from '@/lib/format'
import { FilterRail } from './FilterRail'
import { SearchForm } from './SearchForm'

export const revalidate = 300

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const q = typeof raw.q === 'string' ? raw.q : undefined

  // A search result page must not compete with the landing pages for the same
  // terms, and an infinite query space must not be indexed.
  return q
    ? {
        title: `Search: ${q}`,
        description: `Coaching institutes matching ${q}.`,
        robots: { index: false, follow: true },
      }
    : {
        title: 'Coaching institutes',
        description: 'Browse coaching institutes with upcoming batches, fees and schedules.',
      }
}

function queryString(query: ListInstitutesQuery, page: number): string {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.city) params.set('city', query.city)
  for (const exam of query.exams ?? []) params.append('exams', exam)
  if (query.mode) params.set('mode', query.mode)
  if (query.feeMin !== undefined) params.set('feeMin', String(query.feeMin))
  if (query.feeMax !== undefined) params.set('feeMax', String(query.feeMax))
  if (query.sort) params.set('sort', query.sort)
  params.set('page', String(page))
  return params.toString()
}

/// Names the filter most likely to be responsible for an empty result, so the
/// empty state can offer to clear exactly that one.
function narrowingFilter(query: ListInstitutesQuery): { label: string; cleared: string } | null {
  if (query.feeMin !== undefined || query.feeMax !== undefined) {
    const params = new URLSearchParams(queryString(query, 1))
    params.delete('feeMin')
    params.delete('feeMax')
    return { label: 'the fee filter', cleared: `/institutes?${params.toString()}` }
  }
  if (query.exams?.length) {
    const params = new URLSearchParams(queryString(query, 1))
    params.delete('exams')
    return { label: 'the exam filter', cleared: `/institutes?${params.toString()}` }
  }
  if (query.mode) {
    const params = new URLSearchParams(queryString(query, 1))
    params.delete('mode')
    return { label: 'the mode filter', cleared: `/institutes?${params.toString()}` }
  }
  if (query.city) {
    const params = new URLSearchParams(queryString(query, 1))
    params.delete('city')
    return { label: 'the city filter', cleared: `/institutes?${params.toString()}` }
  }
  return null
}

export default async function InstitutesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const parsed = listInstitutesQuery.safeParse(raw)
  const query = parsed.success ? parsed.data : listInstitutesQuery.parse({})

  const data = await apiGet(
    `/api/v1/institutes?${queryString(query, query.page)}`,
    instituteListResponse,
  )

  const pageCount = Math.max(1, Math.ceil(data.total / data.limit))
  const narrowing = narrowingFilter(query)

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">
          {query.q ? `Results for "${query.q}"` : 'Coaching institutes'}
        </h1>
        <p className="text-sm text-gray-600">
          {data.total} {data.total === 1 ? 'institute' : 'institutes'}
        </p>
      </div>

      <SearchForm query={query} />

      <FilterRail query={query} facets={data.facets} />

      {data.items.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-700">
            {query.q
              ? `No institutes match "${query.q}".`
              : 'No institutes match these filters yet.'}
          </p>
          {narrowing ? (
            <Link
              href={narrowing.cleared}
              className="tap-target inline-flex items-center rounded-lg border border-brand-500 px-4 text-sm font-medium text-brand-700"
            >
              Clear {narrowing.label}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((institute) => {
            const fees = formatFeeRange(institute.minFeeAmount, institute.maxFeeAmount)

            return (
              <li key={institute.id}>
                <Link
                  href={`/institutes/${institute.slug}`}
                  className="block h-full rounded-lg border border-gray-200 bg-white p-4 active:bg-gray-50"
                >
                  <h2 className="text-base font-semibold leading-snug text-brand-700">
                    {institute.name}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {institute.locality ? `${institute.locality}, ` : ''}
                    {institute.city.name}
                  </p>

                  {institute.shortDescription ? (
                    <p className="mt-2 line-clamp-2 text-sm text-gray-700">
                      {institute.shortDescription}
                    </p>
                  ) : null}

                  {institute.exams.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {institute.exams.map((exam) => (
                        <Badge key={exam}>{exam.toUpperCase()}</Badge>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      {institute.batchCount} upcoming{' '}
                      {institute.batchCount === 1 ? 'batch' : 'batches'}
                    </p>
                    {fees ? <p className="text-sm font-semibold text-brand-700">{fees}</p> : null}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav className="flex items-center justify-between gap-3 pt-2">
          {query.page > 1 ? (
            <Link
              href={`/institutes?${queryString(query, query.page - 1)}`}
              className="tap-target inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium"
            >
              Previous
            </Link>
          ) : (
            <span />
          )}

          <span className="text-sm text-gray-600">
            Page {query.page} of {pageCount}
          </span>

          {query.page < pageCount ? (
            <Link
              href={`/institutes?${queryString(query, query.page + 1)}`}
              className="tap-target inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium"
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  )
}
```

The `robots: { index: false, follow: true }` on query pages is deliberate: a search result
page would otherwise compete with the P1b landing pages for the same terms, and the query
space is unbounded.

- [ ] **Step 8: Verify the web app**

```bash
pnpm --filter @one/web lint
pnpm --filter @one/web typecheck
pnpm --filter @one/web build
```

Expected: all exit 0. `page.tsx` is already dynamic because it reads `searchParams`, so
the build does not need the API running.

- [ ] **Step 9: Verify against the running API by hand**

```bash
pnpm --filter @one/db db:seed
pnpm --filter @one/api dev &
pnpm --filter @one/web dev &
sleep 10
echo "--- free text ---"
curl -s "http://localhost:3000/institutes?q=alpha" | grep -c "Alpha Academy"
echo "--- facet counts rendered ---"
curl -s "http://localhost:3000/institutes" | grep -oE "JEE</span><span[^>]*>\([0-9]+\)" | head -2
echo "--- fee range on the card ---"
curl -s "http://localhost:3000/institutes" | grep -oE "₹[0-9,]+( – ₹[0-9,]+)?" | head -3
echo "--- empty state offers to clear the fee filter ---"
curl -s "http://localhost:3000/institutes?feeMin=1&feeMax=2" | grep -c "Clear the fee filter"
kill %1 %2
```

Expected: the free-text grep is at least 1; a facet count appears; a fee range renders; the
empty state grep is 1.

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "feat(web): add mobile search, multi-select filters with counts and fee buckets"
```

---

### Task 6: End-to-end coverage and documentation

**Files:**

- Create: `e2e/tests/search.spec.ts`
- Create: `docs/decisions/0010-postgres-full-text-search.md`
- Create: `docs/decisions/0011-trigger-maintained-search-vector.md`
- Create: `docs/decisions/0012-url-driven-submit-search.md`
- Modify: `docs/flows/institute-discovery.md`
- Modify: `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`
- Modify: `docs/work/requests/` — archive nothing; P1a had no REQ

**Interfaces:**

- Consumes: the running API and web app from `playwright.config.ts`; `prisma` from
  `../helpers/db.js`.
- Produces: no code interfaces. The flow document's verified commit is bumped so
  `check-docs-freshness` passes.

- [ ] **Step 1: Write the end-to-end search spec**

Create `e2e/tests/search.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { prisma, truncateAll } from '../helpers/db.js'

test.beforeAll(async () => {
  await truncateAll()

  const pune = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })
  const jee = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })
  const neet = await prisma.tag.create({ data: { slug: 'neet', label: 'NEET', kind: 'EXAM' } })

  await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'allen-career-institute',
      name: 'Allen Career Institute',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-03-01T00:00:00Z'),
      organizationId: org.id,
      cityId: pune.id,
      locality: 'Kothrud',
      shortDescription: 'JEE coaching since 1988',
      instituteProfile: { create: { modes: ['OFFLINE'] } },
      tags: { create: [{ tagId: jee.id }] },
      batches: {
        create: {
          title: 'JEE Advanced 2028',
          exam: 'JEE',
          mode: 'OFFLINE',
          startDate: new Date('2028-04-01T00:00:00Z'),
          seatsTotal: 40,
          seatsAvailable: 12,
          feeAmount: 2_500_000,
          status: 'PUBLISHED',
        },
      },
    },
  })

  await prisma.listing.create({
    data: {
      vertical: 'INSTITUTE',
      slug: 'medico-classes',
      name: 'Medico Classes',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-04-01T00:00:00Z'),
      organizationId: org.id,
      cityId: pune.id,
      locality: 'Baner',
      shortDescription: 'NEET preparation',
      instituteProfile: { create: { modes: ['ONLINE'] } },
      tags: { create: [{ tagId: neet.id }] },
      batches: {
        create: {
          title: 'NEET 2028',
          exam: 'NEET',
          mode: 'ONLINE',
          startDate: new Date('2028-05-01T00:00:00Z'),
          seatsTotal: 30,
          seatsAvailable: 30,
          feeAmount: 9_000_000,
          status: 'PUBLISHED',
        },
      },
    },
  })
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('a student searches by name and lands on the institute', async ({ page }) => {
  await page.goto('/institutes')
  await expect(page.getByRole('heading', { name: 'Coaching institutes' })).toBeVisible()

  await page.getByLabel('Search institutes').fill('allen')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page).toHaveURL(/q=allen/)
  await expect(page.getByRole('heading', { name: /Results for/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Allen Career Institute/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Medico Classes/ })).toHaveCount(0)
})

test('searching by locality finds the institute', async ({ page }) => {
  await page.goto('/institutes?q=kothrud')
  await expect(page.getByRole('link', { name: /Allen Career Institute/ })).toBeVisible()
})

test('filter chips show counts and narrow the results', async ({ page }) => {
  await page.goto('/institutes')

  // Counts come from the facet aggregates, not from the page size.
  await expect(page.getByRole('link', { name: /JEE \(1\)/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /NEET \(1\)/ })).toBeVisible()

  await page.getByRole('link', { name: /NEET \(1\)/ }).click()

  await expect(page).toHaveURL(/exams=neet/)
  await expect(page.getByRole('link', { name: /Medico Classes/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Allen Career Institute/ })).toHaveCount(0)

  // The selected facet still reports the other option's count, so the user is
  // not stranded.
  await expect(page.getByRole('link', { name: /JEE \(1\)/ })).toBeVisible()
})

test('the fee bucket filters and the empty state offers to clear it', async ({ page }) => {
  await page.goto('/institutes')

  await page.getByRole('link', { name: 'Under ₹25,000' }).click()

  await expect(page.getByText('No institutes match these filters yet.')).toBeVisible()
  await page.getByRole('link', { name: 'Clear the fee filter' }).click()

  await expect(page.getByRole('link', { name: /Allen Career Institute/ })).toBeVisible()
})

test('a fee range shows on the card', async ({ page }) => {
  await page.goto('/institutes?q=allen')
  await expect(page.getByText('₹25,000')).toBeVisible()
})
```

- [ ] **Step 2: Run the end-to-end gate**

```bash
pnpm e2e
```

Expected: 9 passing — the 4 existing specs plus these 5.

If the fee-bucket test finds results, the seeded `feeAmount` of `2_500_000` paise is
₹25,000 and the `under-25k` bucket is `feeMax: 2_500_000` inclusive, so it **does** match.
Change the assertion to expect the Allen card, and use `over-1l` for the empty case
instead. Fix the test to match the boundary semantics; do not change the bucket.

- [ ] **Step 3: Write the three ADRs**

Create each file using the project's established ADR shape — Context, Decision,
Alternatives rejected, Consequences — drawing the content from §4 of the spec.

`docs/decisions/0010-postgres-full-text-search.md`: Postgres full-text over a dedicated
engine. Context is 500–5,000 listings within a year and no appetite for a second datastore.
Consequences must state the limitation plainly: no typo tolerance, "Alen" will not find
"Allen", and the trigger for revisiting is real queries that returned nothing — not
anticipation.

`docs/decisions/0011-trigger-maintained-search-vector.md`: triggers over
application-maintained or generated-column indexing. The consequence worth recording is
that the raw-SQL test in `apps/api/test/search-triggers.test.ts` is what makes this
decision verifiable rather than merely asserted.

`docs/decisions/0012-url-driven-submit-search.md`: submit-based URL-driven search over
instant search. Record that query result pages carry `robots: { index: false, follow: true }`
so they do not compete with the P1b landing pages.

- [ ] **Step 4: Record the boundary exception in the API contract**

Append to `apps/api/CLAUDE.md`, under the "Routes group by resource" section:

```markdown
## One documented exception: the search query reads Batch

`institutes.search.sql.ts` reads the `Batch` table directly, which `Batch`'s owning module
would normally forbid. Filtering and sorting on a joined aggregate cannot be composed
across two services — the aggregate has to exist inside the query that orders and
paginates.

This is the only such exception. **If a second query needs the same thing, do not add
another one**: denormalise `minFeeAmount` / `maxFeeAmount` / `publishedBatchCount` onto
`Listing` with triggers, the same mechanism `searchVector` uses. That was considered during
P1a and rejected as premature for a query shape appearing once.

The single-listing case goes through `batches.service.feeSummaryForListing` and respects
the boundary normally.
```

- [ ] **Step 5: Record the search UX rules for the web app**

Append to `apps/web/CLAUDE.md`, under "Mobile first":

```markdown
## Search and filters

- The search box is a plain `GET` form. Results, filters and sort live entirely in the
  URL — no client state, no hydration mismatch, and the back button works.
- Active filters ride along as hidden inputs in the form, so searching narrows rather than
  silently resetting them.
- Exam chips are multi-select and toggle; mode, fee and sort chips are single-select and
  toggle off when tapped again. Every chip carries `aria-pressed`.
- Fee uses the `FEE_BUCKETS` presets from `@one/shared`, never a dual-handle slider.
- Facet counts come from the API's `facets` object, not from the current page of results.
- A query result page sets `robots: { index: false, follow: true }`: the query space is
  unbounded, and these pages must not compete with the landing pages for the same terms.
```

- [ ] **Step 6: Update the discovery flow document**

In `docs/flows/institute-discovery.md`, replace the **List** sequence block with:

```
apps/web/src/app/institutes/page.tsx
  → apps/web/src/app/institutes/SearchForm.tsx     GET form; URL is the state
  → apps/web/src/app/institutes/FilterRail.tsx     chips carry facet counts
  → apps/web/src/lib/api.ts                        apiGet(listInstitutesQuery → instituteListResponse)
  → GET /api/v1/institutes
  → apps/api/src/modules/institutes/institutes.routes.ts
  → apps/api/src/modules/institutes/institutes.service.ts        resolveSort, order preservation
  → apps/api/src/modules/institutes/institutes.search.sql.ts     tsvector match, rank, fee aggregate, facets
  → apps/api/src/modules/institutes/institutes.repository.ts     typed projection by id
```

Add to the **Failure modes** table:

```
| Free-text query matches nothing | 200 with an empty list and empty facets | "No institutes match …" plus an offer to clear the narrowing filter |
| Query is a near-miss spelling   | 200 with an empty list | Nothing — Postgres full-text has no typo tolerance (ADR 0010) |
| feeMin greater than feeMax      | 400 `VALIDATION_FAILED` | Should be unreachable from the UI, which only emits preset buckets |
```

Add `BR-005` to the "Business rules invoked" line, since the fee range is now rendered.

- [ ] **Step 7: Run every gate**

```bash
pnpm verify
./scripts/verify-lint-guardrails.sh
pnpm --filter @one/shared gen:openapi && git diff --quiet -- docs/api/openapi.json && echo "openapi: no drift"
pnpm e2e
```

Expected: all green.

- [ ] **Step 8: Commit, then re-stamp the flow document**

The verified commit has to be the commit that contains the code, so the stamp is a second
commit:

```bash
git add -A
git commit -m "docs: record search ADRs, boundary exception and the discovery flow"

HEAD_SHA=$(git rev-parse HEAD)
sed -i '' "s/^Last verified against commit: .*/Last verified against commit: $HEAD_SHA/" \
  docs/flows/institute-discovery.md
git add docs/flows/institute-discovery.md
git commit -m "docs: re-stamp the discovery flow at current HEAD"

pnpm exec tsx scripts/check-docs-freshness.ts
```

Expected: `All flow documents are current.`

---

## Self-Review Record

Run against the spec on 2026-10-12.

**Spec coverage.** Every section maps to a task: §5 data layer → Task 1; §6 search query →
Task 3; §7 facets → Task 3; §8 contracts → Task 2; §9 mobile UI → Task 5; §10 limitations →
Task 6 ADR 0010; §11 testing → Tasks 1, 3, 4, 6; §12 what P1a leaves → unchanged in the
spec; §13 open items → carried forward, not resolved here.

**Deviations from the spec, deliberate:**

1. **`institutes.search.sql.ts` is a new file**, where the spec implied the query would live
   in `institutes.repository.ts`. Keeping every hand-written query in one reviewable file
   is worth more than matching the spec's file list. Task 3 Step 6 notes that if the R1/R3
   lint rule rejects its `@one/db` import, the fix is to rename it to match the repository
   glob — never to weaken the rule.
2. **`batches.service.feeSummaryForListing` is added** (Task 4 Step 4). The spec covers the
   list path but not the detail page, which also needs a fee range now that
   `instituteSummary` requires one. Routing it through the batches service keeps R4 intact
   for the single-listing case.
3. **Query result pages are `noindex, follow`** (Task 5 Step 7). The spec says result sets
   are "indexable"; on reflection an unbounded query space should not be indexed, and
   these pages would compete with P1b's landing pages. `follow` keeps the link equity.
4. **`generateMetadata` is added to the list page.** Not in the spec, but required to set
   the per-query title and the robots directive above.

**Type consistency checks performed.** `SearchFilters` is constructed only in
`institutes.service.listPublished` and consumed by all three query functions with the same
shape. `SearchHit` is the exact object passed as the `fees` argument to `toSummary` and
`toDetail`, which is why `feeSummaryForListing` returns those same three field names.
`FacetCounts` is produced by `examFacets`/`modeFacets` and consumed by `FilterRail`.
`FEE_BUCKETS` entries use `feeMin`/`feeMax` to match the query parameter names exactly, so
the chip hrefs need no translation layer.

**Known risks accepted:**

- The `p.modes::text[] @> ARRAY[...]` comparison and the `unnest(coalesce(p.modes, …))`
  facet query are the two fragments most likely to need a cast adjustment on first run.
  Task 3 Step 5 names both symptoms and their fixes.
- `count()` returning `bigint` will break Zod validation if any conversion is missed. The
  Global Constraints section calls it out, and Task 4 Step 6 names the error text.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-11-p1a-search-and-filters.md`.
