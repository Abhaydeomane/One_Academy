# P1c Institute Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student compare 2–4 published institutes side by side on a phone, where every fee cell names a specific upcoming batch, with selection and batch pinning carried entirely in the URL.

**Architecture:** A pure URL grammar in `@one/shared` parses `slug` and `batch=slug:batchId` params. A new `GET /api/v1/compare` endpoint resolves slugs through the existing `resolvePublishedSlug`, reaches batch data through `batches.service` (R4), pins one upcoming batch per column, and returns drops and pin fallbacks as data rather than failing. The web app renders a real `<table>` with a sticky attribute column and horizontally snap-scrolling institute columns.

**Tech Stack:** Zod 4.6.5, Express 5.3.0, Prisma 7.10.0, Next.js 16.4.0 App Router, React 19.3.0, Tailwind 4, Vitest 5.0.3, Playwright 1.64.0.

**Spec:** `docs/superpowers/specs/2026-10-14-p1c-comparison-design.md`

## Global Constraints

- **Money is integer minor units (paise)** with an explicit currency (BR-005). Convert for display only, at the boundary, via `apps/web/src/lib/format.ts`.
- **BR-008** — comparison accepts **2–4** listings, one vertical. Below 2 or above 4 is a 400.
- **BR-009** — only `PUBLISHED` listings appear. Enforced at the repository boundary.
- **BR-002** — a published slug is immutable; former names resolve through `ListingRedirect`.
- **R1/R3** — only `*.repository.ts` may import `@one/db`.
- **R2** — services and repositories must not import `express`.
- **R4** — cross-module access goes through the other module's **service**. Compare reaches batches via `batches.service`, never `batches.repository`.
- **R5** — every route input is validated by a Zod schema from `@one/shared`, read with `validated<T>(req, 'query')`.
- **R6** — throw `AppError` subclasses from `apps/api/src/lib/errors.ts`. Only `middleware/errorHandler.ts` maps to HTTP.
- **Mobile first** — 390px is the design target. `tap-target` (44px) on anything interactive, `text-base` on inputs.
- **`noindex, follow`** on the compare page. Never in the sitemap.
- **Never mock the database.** Integration tests run against real Postgres.
- **Upcoming means `startDate >= now()`** — in this phase only, and only for comparison. See the note below.

### Standing note on BUG-002

Nothing else in the app filters batches by start date: search cards, landing cards and the detail page all say "upcoming batches" while counting every `PUBLISHED` batch. That is filed as `docs/work/bugs/BUG-002-upcoming-batches-counts-every-published-batch.md` and is **not** fixed here, because the predicate change moves P1a and P1b fee expectations and can drop landing pages below `LANDING_MIN_INDEXABLE`.

Comparison introduces `listUpcomingPublishedByListing` and uses it for its own columns, because a comparison defaulting to a batch that already started would break the only promise the feature makes. **A search card may therefore say "4 upcoming batches" where the comparison says 2. Comparison is correct. Do not make comparison count past batches to match.**

---

## File Structure

**Create — shared**

- `packages/shared/src/compare.ts` — pure grammar: `COMPARE_MIN`, `COMPARE_MAX`, `parseBatchPins`, `buildComparePath`, `dedupeSlugs`. No Zod, no I/O. Mirrors how `landing.ts` sits beside the contracts.
- `packages/shared/src/compare.test.ts` — grammar unit tests, no fixtures.
- `packages/shared/src/contracts/compare.ts` — `compareQuery`, `compareColumn`, `compareResponse`.

**Create — API**

- `apps/api/src/modules/institutes/institutes.compare.repository.ts` — `findPublishedBySlugs`, projecting the institute fields comparison needs.
- `apps/api/src/modules/institutes/institutes.compare.service.ts` — slug resolution, drops, pin resolution and fallback, column assembly.
- `apps/api/src/modules/institutes/institutes.compare.routes.ts` — the route.
- `apps/api/src/modules/institutes/institutes.compare.routes.test.ts` — integration tests.

**Create — web**

- `apps/web/src/app/compare/page.tsx` — the page; owns metadata and the canonical redirect.
- `apps/web/src/app/compare/CompareTable.tsx` — the sticky-column table.
- `apps/web/src/app/compare/BatchPicker.tsx` — per-column batch selector (client).
- `apps/web/src/app/compare/superlatives.ts` — pure: which column holds the lowest fee and soonest start.
- `apps/web/src/app/compare/superlatives.test.ts`
- `apps/web/src/app/CompareBar.tsx` — sticky bottom bar (client), shared by results and landing pages.
- `apps/web/src/app/CompareCheckbox.tsx` — the per-card checkbox (server-rendered).

**Modify**

- `packages/shared/src/index.ts` — export `./compare.js`.
- `packages/shared/src/contracts/index.ts` — export `./compare.js`.
- `packages/shared/scripts/gen-openapi.ts` — register `/api/v1/compare`.
- `apps/api/src/modules/batches/batches.repository.ts` — add `listUpcomingPublishedByListing`.
- `apps/api/src/modules/batches/batches.service.ts` — add `listUpcomingPublishedForListing`.
- `apps/api/src/server.ts` — mount `compareRouter` at `/api/v1/compare`.
- `apps/web/src/app/institutes/page.tsx` — checkbox per card, `CompareBar`, compare form.
- `apps/web/src/app/[landing]/page.tsx` — same.
- `e2e/tests/compare.spec.ts` — new.
- Docs: ADR 0015, `docs/flows/comparison.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `docs/README.md`, `docs/domain/business-rules.md` (BR-008 is no longer "not implemented").

---

## Task 1: The pin grammar in `@one/shared`

**Files:**

- Create: `packages/shared/src/compare.ts`
- Create: `packages/shared/src/compare.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `COMPARE_MIN = 2`, `COMPARE_MAX = 4`
  - `type BatchPin = { slug: string; batchId: string }`
  - `parseBatchPins(raw: string[] | undefined): { pins: BatchPin[]; invalid: string[] }`
  - `dedupeSlugs(raw: string[]): string[]`
  - `buildComparePath(slugs: string[], pins: BatchPin[]): string`

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/compare.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildComparePath,
  COMPARE_MAX,
  COMPARE_MIN,
  dedupeSlugs,
  parseBatchPins,
} from './compare.js'

describe('parseBatchPins', () => {
  it('parses slug:batchId pairs', () => {
    expect(parseBatchPins(['allen:b1', 'aakash:b2'])).toEqual({
      pins: [
        { slug: 'allen', batchId: 'b1' },
        { slug: 'aakash', batchId: 'b2' },
      ],
      invalid: [],
    })
  })

  it('returns nothing for undefined', () => {
    expect(parseBatchPins(undefined)).toEqual({ pins: [], invalid: [] })
  })

  it('reports a pin with no separator as invalid', () => {
    expect(parseBatchPins(['allen'])).toEqual({ pins: [], invalid: ['allen'] })
  })

  it('reports an empty side as invalid', () => {
    expect(parseBatchPins([':b1', 'allen:'])).toEqual({ pins: [], invalid: [':b1', 'allen:'] })
  })

  // Slugs cannot contain a colon, batch ids are opaque, so splitting on the
  // FIRST colon is the only reading that cannot corrupt an id.
  it('splits on the first colon only', () => {
    expect(parseBatchPins(['allen:b1:extra'])).toEqual({
      pins: [{ slug: 'allen', batchId: 'b1:extra' }],
      invalid: [],
    })
  })

  // Last pin wins: the selector appends, and re-picking must not accumulate.
  it('keeps the last pin for a repeated slug', () => {
    expect(parseBatchPins(['allen:b1', 'allen:b2']).pins).toEqual([
      { slug: 'allen', batchId: 'b2' },
    ])
  })
})

describe('dedupeSlugs', () => {
  it('removes duplicates and preserves first-seen order', () => {
    expect(dedupeSlugs(['b', 'a', 'b'])).toEqual(['b', 'a'])
  })

  it('drops empty strings', () => {
    expect(dedupeSlugs(['a', '', 'b'])).toEqual(['a', 'b'])
  })
})

describe('buildComparePath', () => {
  it('emits repeated slug params', () => {
    expect(buildComparePath(['allen', 'aakash'], [])).toBe('/compare?slug=allen&slug=aakash')
  })

  it('appends pins as slug:batchId', () => {
    expect(buildComparePath(['allen'], [{ slug: 'allen', batchId: 'b1' }])).toBe(
      '/compare?slug=allen&batch=allen%3Ab1',
    )
  })

  // A pin whose slug is not being compared is meaningless and must not ride
  // along: otherwise changing the selection leaks pins for dropped columns.
  it('drops a pin for a slug that is not in the selection', () => {
    expect(buildComparePath(['allen'], [{ slug: 'ghost', batchId: 'b9' }])).toBe(
      '/compare?slug=allen',
    )
  })

  it('round-trips through parseBatchPins', () => {
    const pins = [{ slug: 'allen', batchId: 'b1' }]
    const url = new URL(`http://x${buildComparePath(['allen'], pins)}`)
    expect(parseBatchPins(url.searchParams.getAll('batch')).pins).toEqual(pins)
  })
})

describe('bounds', () => {
  it('are the BR-008 bounds', () => {
    expect([COMPARE_MIN, COMPARE_MAX]).toEqual([2, 4])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @one/shared test`
Expected: FAIL — `Failed to resolve import "./compare.js"`.

- [ ] **Step 3: Write the grammar**

`packages/shared/src/compare.ts`:

```ts
/// BR-008: comparison accepts 2-4 listings of one vertical. Two columns fit a
/// phone; four is the point past which the table stops being readable.
export const COMPARE_MIN = 2
export const COMPARE_MAX = 4

export type BatchPin = { slug: string; batchId: string }

/// A pin names which batch a column shows: `slug:batchId`. Explicit pairs
/// rather than a positional `batches=b1,b2` list, because positional alignment
/// corrupts silently the moment slug order changes or one pin is absent, and
/// produces a page that is confidently wrong.
export function parseBatchPins(raw: string[] | undefined): {
  pins: BatchPin[]
  invalid: string[]
} {
  const bySlug = new Map<string, BatchPin>()
  const invalid: string[] = []

  for (const entry of raw ?? []) {
    const separator = entry.indexOf(':')
    // Slugs cannot contain a colon and batch ids are opaque, so the first
    // colon is the only safe split point.
    const slug = separator === -1 ? '' : entry.slice(0, separator)
    const batchId = separator === -1 ? '' : entry.slice(separator + 1)

    if (!slug || !batchId) {
      invalid.push(entry)
      continue
    }
    // Last pin wins: the column selector appends rather than replaces, so a
    // student re-picking a batch must not accumulate two pins for one column.
    bySlug.set(slug, { slug, batchId })
  }

  return { pins: [...bySlug.values()], invalid }
}

export function dedupeSlugs(raw: string[]): string[] {
  return [...new Set(raw.filter((slug) => slug.length > 0))]
}

/// Repeated `slug` params, because that is exactly what a checkbox named
/// `slug` emits — stage one of selection needs no JavaScript.
export function buildComparePath(slugs: string[], pins: BatchPin[]): string {
  const params = new URLSearchParams()
  const selected = dedupeSlugs(slugs)

  for (const slug of selected) params.append('slug', slug)
  for (const pin of pins) {
    // A pin for a slug that is no longer selected is meaningless, and carrying
    // it would leak pins for columns the student just removed.
    if (selected.includes(pin.slug)) params.append('batch', `${pin.slug}:${pin.batchId}`)
  }

  return `/compare?${params.toString()}`
}
```

- [ ] **Step 4: Export it**

In `packages/shared/src/index.ts`, add after the `landing.js` line:

```ts
export * from './compare.js'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @one/shared test`
Expected: PASS, 52 existing + 13 new.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/compare.ts packages/shared/src/compare.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add comparison URL grammar"
```

---

## Task 2: The comparison contracts

**Files:**

- Create: `packages/shared/src/contracts/compare.ts`
- Modify: `packages/shared/src/contracts/index.ts`
- Test: `packages/shared/src/contracts/contracts.test.ts`

**Interfaces:**

- Consumes: `COMPARE_MIN`, `COMPARE_MAX` from Task 1; `batchSummary` from `./batches.js`; `modeSchema` from `./institutes.js`.
- Produces:
  - `compareQuery` / `CompareQuery` — `{ slug: string[]; batch?: string[] }`
  - `compareResponse` / `CompareResponse` — `{ columns, dropped, canonicalSlugs }`
  - `compareColumn` / `CompareColumn`

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/src/contracts/contracts.test.ts`:

```ts
describe('compareQuery', () => {
  it('coerces a single slug into an array', () => {
    expect(compareQuery.parse({ slug: 'allen' }).slug).toEqual(['allen'])
  })

  it('accepts repeated slugs', () => {
    expect(compareQuery.parse({ slug: ['allen', 'aakash'] }).slug).toEqual(['allen', 'aakash'])
  })

  // De-duplication happens before the count check, so a doubled checkbox
  // value cannot push a legitimate pair over the limit.
  it('rejects fewer than two distinct slugs', () => {
    expect(compareQuery.safeParse({ slug: ['allen', 'allen'] }).success).toBe(false)
  })

  it('rejects more than four', () => {
    expect(compareQuery.safeParse({ slug: ['a', 'b', 'c', 'd', 'e'] }).success).toBe(false)
  })

  it('accepts exactly two and exactly four', () => {
    expect(compareQuery.safeParse({ slug: ['a', 'b'] }).success).toBe(true)
    expect(compareQuery.safeParse({ slug: ['a', 'b', 'c', 'd'] }).success).toBe(true)
  })

  it('coerces a single batch pin into an array', () => {
    expect(compareQuery.parse({ slug: ['a', 'b'], batch: 'a:b1' }).batch).toEqual(['a:b1'])
  })
})
```

Add `compareQuery` to that file's import from `./index.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @one/shared test`
Expected: FAIL — `compareQuery` is not exported.

- [ ] **Step 3: Write the contracts**

`packages/shared/src/contracts/compare.ts`:

```ts
import { z } from 'zod'
import { COMPARE_MAX, COMPARE_MIN, dedupeSlugs } from '../compare.js'
import { batchSummary } from './batches.js'

// A repeated query parameter arrives as a string when given once and an array
// when given more than once — the same shape `exams` handles in institutes.ts.
const toArray = (value: unknown) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value]

export const compareQuery = z.object({
  // De-duplicated inside the transform so the BR-008 count is checked against
  // distinct institutes: a doubled value must not consume a slot.
  slug: z
    .preprocess(toArray, z.array(z.string().min(1)))
    .transform(dedupeSlugs)
    .refine((slugs) => slugs.length >= COMPARE_MIN && slugs.length <= COMPARE_MAX, {
      error: `Compare requires between ${COMPARE_MIN} and ${COMPARE_MAX} institutes`,
    }),
  batch: z.preprocess(toArray, z.array(z.string().min(1)).max(COMPARE_MAX).optional()),
})
export type CompareQuery = z.infer<typeof compareQuery>

export const compareColumn = z.object({
  institute: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    city: z.object({ slug: z.string(), name: z.string() }),
    locality: z.string().nullable(),
    establishedYear: z.number().int().nullable(),
    facultyCount: z.number().int().nullable(),
    // Upcoming only, unlike the search card's count. See BUG-002.
    batchCount: z.number().int().nonnegative(),
  }),
  /// Null when the institute has no upcoming published batch. The column still
  /// renders: the institute rows are still worth comparing.
  pinned: batchSummary.nullable(),
  /// True when the requested pin no longer qualified and the default was used.
  /// Rot, not an error — the expected fate of a shared link.
  pinFellBack: z.boolean(),
  batches: z.array(batchSummary),
})
export type CompareColumn = z.infer<typeof compareColumn>

export const compareResponse = z.object({
  columns: z.array(compareColumn),
  /// Requested slugs that could not be shown. Returned rather than silently
  /// omitted so the UI can say what happened to a link the student was sent,
  /// instead of diffing the request against the response to find out.
  dropped: z.array(z.object({ slug: z.string(), reason: z.enum(['NOT_FOUND', 'UNPUBLISHED']) })),
  /// Former names resolved to canonical ones, in request order. The page
  /// redirects when this differs from what was asked for — see the spec's §7
  /// on why this is data and not a 301.
  canonicalSlugs: z.array(z.string()),
})
export type CompareResponse = z.infer<typeof compareResponse>
```

- [ ] **Step 4: Export it**

In `packages/shared/src/contracts/index.ts`, add:

```ts
export * from './compare.js'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @one/shared test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/contracts/compare.ts packages/shared/src/contracts/index.ts packages/shared/src/contracts/contracts.test.ts
git commit -m "feat(shared): add comparison contracts"
```

---

## Task 3: Upcoming batches in the batches module

**Files:**

- Modify: `apps/api/src/modules/batches/batches.repository.ts`
- Modify: `apps/api/src/modules/batches/batches.service.ts`
- Test: `apps/api/src/modules/batches/batches.service.test.ts`

**Interfaces:**

- Consumes: existing `BatchRow`, `SELECT`, `toSummary`.
- Produces:
  - `repo.listUpcomingPublishedByListing(listingId: string): Promise<BatchRow[]>`
  - `service.listUpcomingPublishedForListing(listingId: string): Promise<BatchSummary[]>`

Ordered by `feeAmount` ascending then `startDate` ascending, so the first element **is** the default pin and no caller has to re-sort.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/modules/batches/batches.service.test.ts`, inside the existing describe block (reuse that file's existing fixture helpers for creating a listing; follow the pattern already there):

```ts
describe('listUpcomingPublishedForListing', () => {
  it('excludes batches that have already started, and cheapest comes first', async () => {
    const listingId = await createPublishedListing()

    await createBatch(listingId, {
      title: 'Past cheap',
      startDate: new Date('2020-01-01T00:00:00Z'),
      feeAmount: 1_000_000,
      status: 'PUBLISHED',
    })
    await createBatch(listingId, {
      title: 'Future expensive',
      startDate: new Date('2030-01-01T00:00:00Z'),
      feeAmount: 9_000_000,
      status: 'PUBLISHED',
    })
    await createBatch(listingId, {
      title: 'Future cheap',
      startDate: new Date('2030-06-01T00:00:00Z'),
      feeAmount: 3_000_000,
      status: 'PUBLISHED',
    })
    await createBatch(listingId, {
      title: 'Future draft',
      startDate: new Date('2030-01-01T00:00:00Z'),
      feeAmount: 100,
      status: 'DRAFT',
    })

    const rows = await service.listUpcomingPublishedForListing(listingId)

    // Past is gone, DRAFT is gone, and the cheapest upcoming batch leads so
    // the caller can take [0] as the default pin.
    expect(rows.map((row) => row.title)).toEqual(['Future cheap', 'Future expensive'])
  })
})
```

> If `createPublishedListing` / `createBatch` do not already exist in that file, add them there as small local helpers that insert through `prisma` directly — do not mock the database.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @one/api test batches`
Expected: FAIL — `service.listUpcomingPublishedForListing is not a function`.

- [ ] **Step 3: Add the repository function**

In `apps/api/src/modules/batches/batches.repository.ts`, after `listPublishedByListing`:

```ts
/// Upcoming means startDate >= now. Comparison needs this and the rest of the
/// app does not have it: search cards, landing cards and the detail page all
/// say "upcoming" while counting every published batch (BUG-002). Fixing that
/// moves P1a/P1b fee expectations and landing indexability, so it is not done
/// here — but a comparison that defaults to a batch which already started
/// would break the one promise the feature makes.
///
/// Ordered cheapest-first so the caller can take [0] as the default pin.
export async function listUpcomingPublishedByListing(listingId: string): Promise<BatchRow[]> {
  return prisma.batch.findMany({
    where: { listingId, status: 'PUBLISHED', startDate: { gte: new Date() } },
    orderBy: [{ feeAmount: 'asc' }, { startDate: 'asc' }],
    select: SELECT,
  })
}
```

- [ ] **Step 4: Add the service function**

In `apps/api/src/modules/batches/batches.service.ts`, after `listPublishedForListing`:

```ts
/// R4: comparison lives in the institutes module and reaches batch data only
/// through this service.
export async function listUpcomingPublishedForListing(listingId: string): Promise<BatchSummary[]> {
  const rows = await repo.listUpcomingPublishedByListing(listingId)
  return rows.map(toSummary)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @one/api test batches`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/batches/
git commit -m "feat(api): add upcoming-only batch listing for comparison"
```

---

## Task 4: The comparison repository and service

**Files:**

- Create: `apps/api/src/modules/institutes/institutes.compare.repository.ts`
- Create: `apps/api/src/modules/institutes/institutes.compare.service.ts`

**Interfaces:**

- Consumes: `listings.service.resolvePublishedSlug(slug)` → `{ listingId, canonicalSlug, redirected }`, throws `NotFoundError`; `batches.service.listUpcomingPublishedForListing(listingId)`; `parseBatchPins`, `COMPARE_MIN` from `@one/shared`.
- Produces:
  - `repo.findCompareRowsByIds(ids: string[]): Promise<CompareRow[]>`
  - `service.compare(query: CompareQuery): Promise<CompareResponse>`

```ts
export type CompareRow = {
  id: string
  slug: string
  name: string
  locality: string | null
  city: { slug: string; name: string }
  instituteProfile: { establishedYear: number | null; facultyCount: number | null } | null
}
```

- [ ] **Step 1: Write the repository**

`apps/api/src/modules/institutes/institutes.compare.repository.ts`:

```ts
import { prisma } from '@one/db'

/// Comparison needs fewer fields than the detail page and more than the search
/// summary, so it projects its own row rather than widening either.
export type CompareRow = {
  id: string
  slug: string
  name: string
  locality: string | null
  city: { slug: string; name: string }
  instituteProfile: { establishedYear: number | null; facultyCount: number | null } | null
}

export async function findCompareRowsByIds(ids: string[]): Promise<CompareRow[]> {
  if (ids.length === 0) return []

  return prisma.listing.findMany({
    // BR-009 at the data boundary, so no caller can forget it. The vertical
    // filter is BR-008's single-vertical rule.
    where: { id: { in: ids }, status: 'PUBLISHED', vertical: 'INSTITUTE' },
    select: {
      id: true,
      slug: true,
      name: true,
      locality: true,
      city: { select: { slug: true, name: true } },
      instituteProfile: { select: { establishedYear: true, facultyCount: true } },
    },
  })
}
```

- [ ] **Step 2: Write the service**

`apps/api/src/modules/institutes/institutes.compare.service.ts`:

```ts
import {
  COMPARE_MIN,
  parseBatchPins,
  type BatchSummary,
  type CompareQuery,
  type CompareResponse,
} from '@one/shared'
import { BadRequestError, NotFoundError } from '../../lib/errors.js'
import * as batches from '../batches/batches.service.js'
import * as listings from '../listings/listings.service.js'
import * as repo from './institutes.compare.repository.js'

type Resolved = { requested: string; canonicalSlug: string; listingId: string }

/// Resolves each requested slug, keeping the ones that survive and recording
/// why the others did not. A single stale slug in a shared four-way link must
/// not take the whole page down.
async function resolveSlugs(slugs: string[]) {
  const resolved: Resolved[] = []
  const dropped: CompareResponse['dropped'] = []

  for (const requested of slugs) {
    try {
      const hit = await listings.resolvePublishedSlug(requested)
      resolved.push({ requested, canonicalSlug: hit.canonicalSlug, listingId: hit.listingId })
    } catch (error) {
      // resolvePublishedSlug throws NotFoundError both for an unknown slug and
      // for one whose listing is not published; the distinction is not
      // recoverable from here, so report the honest union.
      if (error instanceof NotFoundError) {
        dropped.push({ slug: requested, reason: 'NOT_FOUND' })
        continue
      }
      throw error
    }
  }

  return { resolved, dropped }
}

/// The default pin is the cheapest upcoming batch, which is what
/// listUpcomingPublishedForListing already returns first. Fee is the dominant
/// axis in this market; revisit against behaviour, not argument.
function defaultPin(options: BatchSummary[]): BatchSummary | null {
  return options[0] ?? null
}

export async function compare(query: CompareQuery): Promise<CompareResponse> {
  const { pins, invalid } = parseBatchPins(query.batch)

  // An unparseable pin cannot come from the UI or from the passage of time, so
  // it is rejected rather than ignored. Contrast with a pin that has merely
  // gone stale, which falls back below.
  if (invalid.length > 0) {
    throw new BadRequestError('Malformed batch pin', { invalid })
  }

  const { resolved, dropped } = await resolveSlugs(query.slug)

  // Below two there is no comparison left to render.
  if (resolved.length < COMPARE_MIN) {
    throw new NotFoundError('Not enough institutes left to compare')
  }

  const rows = await repo.findCompareRowsByIds(resolved.map((hit) => hit.listingId))
  const byId = new Map(rows.map((row) => [row.id, row]))

  const columns: CompareResponse['columns'] = []

  for (const hit of resolved) {
    const row = byId.get(hit.listingId)
    // resolvePublishedSlug already asserted PUBLISHED, so a miss here means
    // the listing is not an INSTITUTE — BR-008's single-vertical rule.
    if (!row) {
      dropped.push({ slug: hit.requested, reason: 'UNPUBLISHED' })
      continue
    }

    const options = await batches.listUpcomingPublishedForListing(row.id)
    // A pin may be written against either the requested or the canonical slug:
    // a link shared before a rename carries the old one.
    const pin = pins.find((entry) => entry.slug === row.slug || entry.slug === hit.requested)
    const requestedBatch = pin ? options.find((batch) => batch.id === pin.batchId) : undefined

    if (pin && !requestedBatch) {
      // Tampering is a 400; rot is not. A pin naming a batch that exists but
      // belongs elsewhere could never come from this UI.
      const belongsElsewhere = await batches.belongsToListing(pin.batchId, row.id)
      if (!belongsElsewhere) {
        const exists = await batches.findPublishedById(pin.batchId)
        if (exists) throw new BadRequestError('Pinned batch belongs to another institute')
      }
    }

    columns.push({
      institute: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        city: row.city,
        locality: row.locality,
        establishedYear: row.instituteProfile?.establishedYear ?? null,
        facultyCount: row.instituteProfile?.facultyCount ?? null,
        batchCount: options.length,
      },
      pinned: requestedBatch ?? defaultPin(options),
      pinFellBack: Boolean(pin && !requestedBatch),
      batches: options,
    })
  }

  if (columns.length < COMPARE_MIN) {
    throw new NotFoundError('Not enough institutes left to compare')
  }

  return {
    columns,
    dropped,
    canonicalSlugs: columns.map((column) => column.institute.slug),
  }
}
```

- [ ] **Step 3: Add the batch lookup the service needs**

The service calls `batches.findPublishedById`, which does not exist yet. In `apps/api/src/modules/batches/batches.service.ts`:

```ts
/// Comparison needs to tell a pin that has gone stale (fall back) from one
/// naming a batch that belongs to a different institute (reject).
export async function findPublishedById(batchId: string): Promise<BatchSummary | null> {
  const row = await repo.findById(batchId)
  if (!row || row.status !== 'PUBLISHED') return null
  return toSummary(row)
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @one/api typecheck`
Expected: clean. Integration tests arrive in Task 5 with the route.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/institutes/institutes.compare.repository.ts apps/api/src/modules/institutes/institutes.compare.service.ts apps/api/src/modules/batches/batches.service.ts
git commit -m "feat(api): add comparison repository and service"
```

---

## Task 5: The comparison route, mounted and tested

**Files:**

- Create: `apps/api/src/modules/institutes/institutes.compare.routes.ts`
- Create: `apps/api/src/modules/institutes/institutes.compare.routes.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `packages/shared/scripts/gen-openapi.ts`

**Interfaces:**

- Consumes: `compare(query)` from Task 4; `compareQuery` from Task 2.
- Produces: `compareRouter`, mounted at `/api/v1/compare`.

- [ ] **Step 1: Write the failing integration tests**

`apps/api/src/modules/institutes/institutes.compare.routes.test.ts`. Follow the fixture style already in `institutes.routes.test.ts` (real Postgres, truncate between describes):

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '@one/db'
import { createApp } from '../../server.js'
import { truncateAll } from '../../../test/helpers.js'

const app = createApp()
const FUTURE = new Date('2030-04-01T00:00:00Z')
const PAST = new Date('2020-04-01T00:00:00Z')

let alphaId = ''
let betaBatchId = ''
let alphaCheapId = ''
let alphaDearId = ''

beforeAll(async () => {
  await truncateAll()

  const city = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Org', slug: 'org' } })

  const make = async (slug: string, name: string, status: 'PUBLISHED' | 'DRAFT') =>
    prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug,
        name,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date('2026-01-01T00:00:00Z') : null,
        organizationId: org.id,
        cityId: city.id,
        locality: 'Kothrud',
        instituteProfile: {
          create: { establishedYear: 2011, facultyCount: 24, modes: ['OFFLINE'] },
        },
      },
    })

  const alpha = await make('alpha', 'Alpha Academy', 'PUBLISHED')
  const beta = await make('beta', 'Beta Academy', 'PUBLISHED')
  await make('draft-academy', 'Draft Academy', 'DRAFT')
  alphaId = alpha.id

  const batch = (listingId: string, title: string, fee: number, startDate: Date) =>
    prisma.batch.create({
      data: {
        listingId,
        title,
        exam: 'JEE',
        mode: 'OFFLINE',
        startDate,
        seatsTotal: 30,
        seatsAvailable: 10,
        feeAmount: fee,
        status: 'PUBLISHED',
      },
    })

  alphaCheapId = (await batch(alpha.id, 'Alpha cheap', 3_000_000, FUTURE)).id
  alphaDearId = (await batch(alpha.id, 'Alpha dear', 8_000_000, FUTURE)).id
  await batch(alpha.id, 'Alpha past', 100_000, PAST)
  betaBatchId = (await batch(beta.id, 'Beta only', 5_000_000, FUTURE)).id

  // A former name for alpha, so the canonical-slug path is exercised.
  await prisma.listingRedirect.create({ data: { fromSlug: 'alpha-old', listingId: alpha.id } })
})

const get = (qs: string) => request(app).get(`/api/v1/compare?${qs}`)

describe('GET /api/v1/compare', () => {
  it('returns one column per slug, pinning the cheapest upcoming batch', async () => {
    const res = await get('slug=alpha&slug=beta')

    expect(res.status).toBe(200)
    expect(res.body.columns).toHaveLength(2)
    expect(res.body.columns[0].pinned.title).toBe('Alpha cheap')
    expect(res.body.columns[0].pinFellBack).toBe(false)
    // The past batch is excluded from both the options and the count.
    expect(res.body.columns[0].institute.batchCount).toBe(2)
    expect(res.body.columns[0].batches.map((b: { title: string }) => b.title)).toEqual([
      'Alpha cheap',
      'Alpha dear',
    ])
  })

  it('honours an explicit pin', async () => {
    const res = await get(`slug=alpha&slug=beta&batch=alpha:${alphaDearId}`)
    expect(res.body.columns[0].pinned.title).toBe('Alpha dear')
    expect(res.body.columns[0].pinFellBack).toBe(false)
  })

  it('falls back and reports it when a pin no longer qualifies', async () => {
    const res = await get('slug=alpha&slug=beta&batch=alpha:nonexistent-id')
    expect(res.status).toBe(200)
    expect(res.body.columns[0].pinned.title).toBe('Alpha cheap')
    expect(res.body.columns[0].pinFellBack).toBe(true)
  })

  it('rejects a pin naming another institute batch', async () => {
    const res = await get(`slug=alpha&slug=beta&batch=alpha:${betaBatchId}`)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects a malformed pin', async () => {
    expect((await get('slug=alpha&slug=beta&batch=garbage')).status).toBe(400)
  })

  it('drops an unknown slug but still renders', async () => {
    const res = await get('slug=alpha&slug=beta&slug=ghost')
    expect(res.status).toBe(200)
    expect(res.body.columns).toHaveLength(2)
    expect(res.body.dropped).toEqual([{ slug: 'ghost', reason: 'NOT_FOUND' }])
  })

  it('never shows a DRAFT listing (BR-009)', async () => {
    const res = await get('slug=alpha&slug=beta&slug=draft-academy')
    expect(res.body.columns).toHaveLength(2)
    expect(res.body.dropped).toEqual([{ slug: 'draft-academy', reason: 'NOT_FOUND' }])
  })

  it('404s when fewer than two slugs survive', async () => {
    const res = await get('slug=alpha&slug=ghost-one&slug=ghost-two')
    expect(res.status).toBe(404)
  })

  it('resolves a former slug into canonicalSlugs without redirecting', async () => {
    const res = await get('slug=alpha-old&slug=beta')
    expect(res.status).toBe(200)
    expect(res.body.canonicalSlugs).toEqual(['alpha', 'beta'])
  })

  it('keeps a pin attached when its slug was a former name', async () => {
    const res = await get(`slug=alpha-old&slug=beta&batch=alpha-old:${alphaDearId}`)
    expect(res.body.columns[0].pinned.title).toBe('Alpha dear')
  })

  it('rejects fewer than two and more than four slugs (BR-008)', async () => {
    expect((await get('slug=alpha')).status).toBe(400)
    expect((await get('slug=a&slug=b&slug=c&slug=d&slug=e')).status).toBe(400)
  })

  it('de-duplicates before counting', async () => {
    expect((await get('slug=alpha&slug=alpha')).status).toBe(400)
  })

  it('returns pinned: null for an institute with no upcoming batch', async () => {
    const city = await prisma.city.findFirstOrThrow()
    const org = await prisma.organization.findFirstOrThrow()
    await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'batchless',
        name: 'Batchless Academy',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        organizationId: org.id,
        cityId: city.id,
        instituteProfile: { create: { modes: ['ONLINE'] } },
      },
    })

    const res = await get('slug=alpha&slug=batchless')
    const column = res.body.columns.find(
      (c: { institute: { slug: string } }) => c.institute.slug === 'batchless',
    )
    expect(column.pinned).toBeNull()
    expect(column.batches).toEqual([])
    expect(column.institute.batchCount).toBe(0)
  })
})
```

> `alphaId` and `alphaCheapId` are assigned for symmetry with the fixture style; if lint flags them as unused after you finish, delete those two bindings rather than adding an eslint-disable.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @one/api test compare`
Expected: FAIL — every request 404s, because nothing is mounted at `/api/v1/compare`.

- [ ] **Step 3: Write the route**

`apps/api/src/modules/institutes/institutes.compare.routes.ts`:

```ts
import { Router } from 'express'
import { compareQuery, type CompareQuery } from '@one/shared'
import { validate, validated } from '../../middleware/validate.js'
import * as compare from './institutes.compare.service.js'

export const compareRouter = Router()

/// Mounted at /api/v1/compare rather than under /api/v1/institutes, where
/// institutesRouter's GET /:slug would shadow it the moment a listing is
/// slugged "compare". ADR 0004 governs where the code lives, not the URL.
compareRouter.get('/', validate({ query: compareQuery }), async (req, res) => {
  res.json(await compare.compare(validated<CompareQuery>(req, 'query')))
})
```

- [ ] **Step 4: Mount it**

In `apps/api/src/server.ts`, add the import alongside the others:

```ts
import { compareRouter } from './modules/institutes/institutes.compare.routes.js'
```

and the mount next to the institutes one:

```ts
app.use('/api/v1/compare', compareRouter)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @one/api test compare`
Expected: PASS, 13 tests.

- [ ] **Step 6: Register the path in OpenAPI**

In `packages/shared/scripts/gen-openapi.ts`, import `compareQuery` and `compareResponse`, then add before the generator call:

```ts
registry.registerPath({
  method: 'get',
  path: '/api/v1/compare',
  summary: 'Compare 2-4 published institutes',
  description:
    'Columns are institutes; each pins one upcoming published batch, defaulting to the ' +
    'cheapest. A stale slug is dropped and reported rather than failing the request; a ' +
    'stale pin falls back to the default. A pin naming another institute’s batch is a 400.',
  request: { query: compareQuery },
  responses: {
    200: { description: 'Comparison columns', ...json(named('Compare', compareResponse)) },
    400: BAD_REQUEST,
    404: NOT_FOUND,
  },
})
```

- [ ] **Step 7: Regenerate and verify no drift**

```bash
pnpm --filter @one/shared gen:openapi
git diff --stat -- docs/api/openapi.json   # should show the new path
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/institutes/institutes.compare.routes.ts apps/api/src/modules/institutes/institutes.compare.routes.test.ts apps/api/src/server.ts packages/shared/scripts/gen-openapi.ts docs/api/openapi.json
git commit -m "feat(api): add GET /api/v1/compare"
```

---

## Task 6: The comparison page

**Files:**

- Create: `apps/web/src/app/compare/page.tsx`
- Create: `apps/web/src/app/compare/CompareTable.tsx`
- Create: `apps/web/src/app/compare/BatchPicker.tsx`
- Create: `apps/web/src/app/compare/superlatives.ts`
- Create: `apps/web/src/app/compare/superlatives.test.ts`

**Interfaces:**

- Consumes: `compareResponse`, `buildComparePath`, `parseBatchPins`, `COMPARE_MIN`, `COMPARE_MAX` from `@one/shared`; `apiGetOptional` from `@/lib/api`; `formatFee`, `formatDate`, `formatSeats` from `@/lib/format`.
- Produces: `superlatives(columns): { lowestFeeSlug: string | null; soonestStartSlug: string | null }`.

- [ ] **Step 1: Write the failing superlative tests**

`apps/web/src/app/compare/superlatives.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { superlatives } from './superlatives'

const column = (slug: string, feeAmount: number | null, startDate: string | null) => ({
  institute: { slug },
  pinned: feeAmount === null ? null : { feeAmount, startDate },
})

describe('superlatives', () => {
  it('finds the lowest fee and the soonest start', () => {
    const result = superlatives([
      column('a', 5_000_000, '2030-06-01T00:00:00Z'),
      column('b', 3_000_000, '2030-09-01T00:00:00Z'),
      column('c', 8_000_000, '2030-02-01T00:00:00Z'),
    ] as never)

    expect(result).toEqual({ lowestFeeSlug: 'b', soonestStartSlug: 'c' })
  })

  // A tie has no winner: tagging the first column would invent a distinction
  // the data does not contain.
  it('awards nothing when every value ties', () => {
    const result = superlatives([
      column('a', 5_000_000, '2030-06-01T00:00:00Z'),
      column('b', 5_000_000, '2030-06-01T00:00:00Z'),
    ] as never)

    expect(result).toEqual({ lowestFeeSlug: null, soonestStartSlug: null })
  })

  it('ignores columns with no pinned batch', () => {
    const result = superlatives([
      column('a', null, null),
      column('b', 7_000_000, '2030-06-01T00:00:00Z'),
      column('c', 9_000_000, '2030-07-01T00:00:00Z'),
    ] as never)

    expect(result).toEqual({ lowestFeeSlug: 'b', soonestStartSlug: 'b' })
  })

  it('awards nothing when only one column has a batch', () => {
    const result = superlatives([
      column('a', null, null),
      column('b', 7_000_000, '2030-06-01T00:00:00Z'),
    ] as never)
    expect(result).toEqual({ lowestFeeSlug: null, soonestStartSlug: null })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @one/web test`
Expected: FAIL — cannot resolve `./superlatives`.

- [ ] **Step 3: Write the superlative helper**

`apps/web/src/app/compare/superlatives.ts`:

```ts
import type { CompareColumn } from '@one/shared'

/// Which column holds the lowest fee and which starts soonest. Scanning six
/// numbers across a horizontally scrolling table is exactly what a phone is
/// bad at, so these get a label.
///
/// They are labelled "lowest" and "soonest" — descriptions of the number —
/// never "best". The lowest fee is objectively the lowest and is not
/// objectively the best: a cheap batch may be cheap because it is large,
/// remote, or taught by juniors. Implying otherwise misinforms a student about
/// a decision that costs them a year.
export function superlatives(columns: CompareColumn[]): {
  lowestFeeSlug: string | null
  soonestStartSlug: string | null
} {
  const pinned = columns.filter(
    (column): column is CompareColumn & { pinned: NonNullable<CompareColumn['pinned']> } =>
      column.pinned !== null,
  )

  // Nothing to be superlative about with fewer than two candidates.
  if (pinned.length < 2) return { lowestFeeSlug: null, soonestStartSlug: null }

  const winner = <T>(pick: (column: (typeof pinned)[number]) => T): string | null => {
    const values = pinned.map(pick)
    const best = values.reduce((a, b) => (b < a ? b : a))
    const holders = pinned.filter((column) => pick(column) === best)
    // A tie has no winner: tagging one of them would invent a distinction the
    // data does not contain.
    return holders.length === 1 ? (holders[0]?.institute.slug ?? null) : null
  }

  return {
    lowestFeeSlug: winner((column) => column.pinned.feeAmount),
    soonestStartSlug: winner((column) => column.pinned.startDate),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @one/web test`
Expected: PASS.

- [ ] **Step 5: Write the batch picker**

`apps/web/src/app/compare/BatchPicker.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import type { BatchSummary } from '@one/shared'

/// A `<select>` that navigates on change. Stage two of selection stays in the
/// URL (ADR 0012), so this component holds no state — it only rewrites the
/// address. Without JavaScript the select still renders and the page still
/// shows the default pin, which is the useful default.
export function BatchPicker({
  slug,
  batches,
  pinnedId,
  hrefFor,
}: {
  slug: string
  batches: BatchSummary[]
  pinnedId: string | null
  hrefFor: (batchId: string) => string
}) {
  const router = useRouter()
  if (batches.length < 2) return null

  return (
    <label className="mt-2 block">
      <span className="sr-only">Batch for {slug}</span>
      <select
        value={pinnedId ?? ''}
        onChange={(event) => router.push(hrefFor(event.target.value))}
        // 16px, or iOS zooms the viewport on focus.
        className="tap-target w-full rounded-lg border border-gray-300 bg-white px-2 text-base"
      >
        {batches.map((batch) => (
          <option key={batch.id} value={batch.id}>
            {batch.title}
          </option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 6: Write the table**

`apps/web/src/app/compare/CompareTable.tsx`:

```tsx
import Link from 'next/link'
import type { CompareColumn } from '@one/shared'
import { formatDate, formatDateRange, formatFee, formatSeats } from '@/lib/format'
import { BatchPicker } from './BatchPicker'
import { superlatives } from './superlatives'

function Tag({ children }: { children: string }) {
  return (
    <span className="mt-1 inline-block rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
      {children}
    </span>
  )
}

/// A real <table> with <th scope="row">, not a div grid. The two look
/// identical and only one tells a screen reader which attribute a cell
/// belongs to.
///
/// The attribute column is sticky and the institute columns snap-scroll, so
/// two institutes are visible at 390px — comparison is a pairwise act, and a
/// layout showing one column at a time is a list with extra steps.
export function CompareTable({
  columns,
  hrefFor,
}: {
  columns: CompareColumn[]
  hrefFor: (slug: string, batchId: string) => string
}) {
  const { lowestFeeSlug, soonestStartSlug } = superlatives(columns)

  const rows: { label: string; cell: (column: CompareColumn) => React.ReactNode }[] = [
    {
      label: 'Fee',
      cell: (column) =>
        column.pinned ? (
          <>
            <span className="font-semibold">
              {formatFee(column.pinned.feeAmount, column.pinned.feeCurrency)}
            </span>
            {column.institute.slug === lowestFeeSlug ? <Tag>lowest</Tag> : null}
          </>
        ) : (
          <span className="text-gray-500">No upcoming batches</span>
        ),
    },
    { label: 'Exam', cell: (column) => column.pinned?.exam ?? '—' },
    {
      label: 'Mode',
      cell: (column) =>
        column.pinned
          ? column.pinned.mode.charAt(0) + column.pinned.mode.slice(1).toLowerCase()
          : '—',
    },
    {
      label: 'Starts',
      cell: (column) =>
        column.pinned ? (
          <>
            {formatDateRange(column.pinned.startDate, column.pinned.endDate)}
            {column.institute.slug === soonestStartSlug ? <Tag>soonest</Tag> : null}
          </>
        ) : (
          '—'
        ),
    },
    { label: 'Schedule', cell: (column) => column.pinned?.scheduleText ?? '—' },
    {
      label: 'Seats',
      cell: (column) =>
        column.pinned ? formatSeats(column.pinned.seatsAvailable, column.pinned.seatsTotal) : '—',
    },
    {
      label: 'Locality',
      cell: (column) =>
        [column.institute.locality, column.institute.city.name].filter(Boolean).join(', '),
    },
    {
      label: 'Established',
      cell: (column) => column.institute.establishedYear?.toString() ?? '—',
    },
    { label: 'Faculty', cell: (column) => column.institute.facultyCount?.toString() ?? '—' },
    { label: 'Upcoming batches', cell: (column) => column.institute.batchCount.toString() },
  ]

  return (
    <div className="scroll-rail -mx-4 overflow-x-auto px-4">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Comparison of {columns.length} coaching institutes</caption>
        <thead>
          <tr>
            <td className="sticky left-0 z-10 bg-gray-50" />
            {columns.map((column) => (
              <th
                key={column.institute.id}
                scope="col"
                className="min-w-36 snap-start border-b border-gray-200 p-2 text-left align-top"
              >
                <Link
                  href={`/institutes/${column.institute.slug}`}
                  className="font-semibold text-brand-700"
                >
                  {column.institute.name}
                </Link>
                <BatchPicker
                  slug={column.institute.slug}
                  batches={column.batches}
                  pinnedId={column.pinned?.id ?? null}
                  hrefFor={(batchId) => hrefFor(column.institute.slug, batchId)}
                />
                {column.pinFellBack ? (
                  <p className="mt-1 text-xs text-amber-700">
                    That batch is no longer available — showing the cheapest instead.
                  </p>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-gray-100">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-gray-50 p-2 text-left align-top text-xs font-medium text-gray-600"
              >
                {row.label}
              </th>
              {columns.map((column) => (
                <td key={column.institute.id} className="min-w-36 snap-start p-2 align-top">
                  {row.cell(column)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row" className="sticky left-0 z-10 bg-gray-50" />
            {columns.map((column) => (
              <td key={column.institute.id} className="p-2 align-top">
                {/* The enquiry contract already accepts and validates batchId,
                    so the pinned batch rides through to the lead instead of
                    being discarded at the last step. */}
                <Link
                  href={
                    column.pinned
                      ? `/institutes/${column.institute.slug}?batchId=${column.pinned.id}#enquire`
                      : `/institutes/${column.institute.slug}#enquire`
                  }
                  className="tap-target inline-flex items-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white"
                >
                  Enquire
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 7: Write the page**

`apps/web/src/app/compare/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  buildComparePath,
  compareResponse,
  parseBatchPins,
  type CompareResponse,
} from '@one/shared'
import { apiGetOptional } from '@/lib/api'

export const revalidate = 300

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const asArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

function queryString(slugs: string[], pins: string[]): string {
  const params = new URLSearchParams()
  for (const slug of slugs) params.append('slug', slug)
  for (const pin of pins) params.append('batch', pin)
  return params.toString()
}

async function load(slugs: string[], pins: string[]): Promise<CompareResponse | null> {
  if (slugs.length === 0) return null
  return apiGetOptional(`/api/v1/compare?${queryString(slugs, pins)}`, compareResponse)
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams
}): Promise<Metadata> {
  const raw = await searchParams
  const data = await load(asArray(raw.slug), asArray(raw.batch))
  if (!data) return { title: 'Compare institutes' }

  const names = data.columns.map((column) => column.institute.name)

  return {
    title: `${names.join(' vs ')} | One Academy`,
    description: `Compare fees, batches, schedules and seats across ${names.join(', ')}.`,
    // The combination space is binomial and nearly every page would be a thin
    // near-duplicate of its neighbours and of the P1b landing page for the
    // same city and exam. `follow` keeps equity flowing to the institutes.
    robots: { index: false, follow: true },
  }
}

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const slugs = asArray(raw.slug)
  const rawPins = asArray(raw.batch)

  const data = await load(slugs, rawPins)
  if (!data) notFound()

  // The API returns the canonical set as data rather than a 301, because fetch
  // follows redirects transparently and the browser would keep the stale URL
  // (BUG-001). Correcting the address bar is the whole point for a URL that
  // exists to be shared.
  const canonical = data.canonicalSlugs
  if (canonical.length !== slugs.length || canonical.some((slug, i) => slug !== slugs[i])) {
    const { pins } = parseBatchPins(rawPins)
    const rewritten = pins.map((pin) => {
      const index = slugs.indexOf(pin.slug)
      return index === -1 ? pin : { slug: canonical[index] ?? pin.slug, batchId: pin.batchId }
    })
    redirect(buildComparePath(canonical, rewritten))
  }

  const { pins } = parseBatchPins(rawPins)
  const hrefFor = (slug: string, batchId: string) =>
    buildComparePath(canonical, [...pins.filter((pin) => pin.slug !== slug), { slug, batchId }])

  const { CompareTable } = await import('./CompareTable')

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">Compare institutes</h1>
        <p className="text-sm text-gray-600">
          {data.columns.length} institutes · swipe the table sideways
        </p>
      </header>

      {data.dropped.length > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {data.dropped.map((drop) => drop.slug).join(', ')}{' '}
          {data.dropped.length === 1 ? 'is' : 'are'} no longer listed and{' '}
          {data.dropped.length === 1 ? 'was' : 'were'} left out.
        </p>
      ) : null}

      <CompareTable columns={data.columns} hrefFor={hrefFor} />

      <p className="pt-2 text-sm">
        <Link href="/institutes" className="text-brand-700 underline">
          Back to all institutes
        </Link>
      </p>
    </div>
  )
}
```

> Replace the dynamic `await import('./CompareTable')` with a normal top-level import if lint objects; it is written this way only to keep the import list short, and a static import is preferable.

- [ ] **Step 8: Verify by hand against the running stack**

```bash
pnpm --filter @one/db db:seed
# in another shell: pnpm dev
curl -s "http://localhost:4000/api/v1/compare?slug=alpha-academy&slug=filler-institute-1" | head -40
curl -s "http://localhost:3000/compare?slug=alpha-academy&slug=filler-institute-1" | grep -o 'robots[^>]*'
```

Expected: two columns with a pinned batch each, and `noindex, follow` in the page head.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/compare/
git commit -m "feat(web): add the comparison page"
```

---

## Task 7: Selection entry points

**Files:**

- Create: `apps/web/src/app/CompareCheckbox.tsx`
- Create: `apps/web/src/app/CompareBar.tsx`
- Modify: `apps/web/src/app/institutes/page.tsx`
- Modify: `apps/web/src/app/[landing]/page.tsx`

**Interfaces:**

- Consumes: `COMPARE_MIN`, `COMPARE_MAX` from `@one/shared`.
- Produces: `<CompareCheckbox slug name />`, `<CompareBar />`. Both rely on a `<form id="compare" action="/compare" method="get">` existing on the page.

- [ ] **Step 1: Write the checkbox**

`apps/web/src/app/CompareCheckbox.tsx`:

```tsx
/// Sits OUTSIDE the card's <Link> — a checkbox inside an anchor navigates
/// instead of toggling — and associates with the compare form by id, because
/// the results page already contains a search form and nesting forms is
/// invalid HTML.
///
/// `name="slug"` is load-bearing: repeated `slug` params are exactly what a
/// checkbox group emits, so stage one of selection needs no JavaScript.
export function CompareCheckbox({ slug, name }: { slug: string; name: string }) {
  return (
    <label className="tap-target absolute right-1 top-1 inline-flex items-center justify-center p-2">
      <span className="sr-only">Add {name} to comparison</span>
      <input
        type="checkbox"
        name="slug"
        value={slug}
        form="compare"
        className="h-5 w-5 rounded border-gray-400 accent-brand-600"
      />
    </label>
  )
}
```

- [ ] **Step 2: Write the bar**

`apps/web/src/app/CompareBar.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { COMPARE_MAX, COMPARE_MIN } from '@one/shared'

/// The one new piece of client state in the app, and it buys something
/// specific: without a live count the UI can submit a selection that is
/// guaranteed to 400. The checkboxes themselves are server-rendered and work
/// without this bar.
export function CompareBar() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const form = document.getElementById('compare')
    if (!(form instanceof HTMLFormElement)) return

    const recount = () =>
      setCount(form.querySelectorAll<HTMLInputElement>('input[name="slug"]:checked').length)

    // The inputs live outside the form element, so listen on the document and
    // let the form's own elements collection do the counting.
    document.addEventListener('change', recount)
    recount()
    return () => document.removeEventListener('change', recount)
  }, [])

  if (count === 0) return null

  const ready = count >= COMPARE_MIN && count <= COMPARE_MAX

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <p className="text-sm text-gray-700">
          {count} selected
          {ready ? '' : ` · pick ${COMPARE_MIN}–${COMPARE_MAX}`}
        </p>
        <button
          type="submit"
          form="compare"
          disabled={!ready}
          className="tap-target inline-flex items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white disabled:bg-gray-300"
        >
          Compare
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire up the results page**

In `apps/web/src/app/institutes/page.tsx`:

1. Import both components and add the form plus the bar inside the returned `<section>`, after `<FilterRail />`:

```tsx
{
  /* Empty on purpose: the checkboxes live in the cards below and associate
    by id, because nesting them inside the search form would be invalid. */
}
;<form id="compare" action="/compare" method="get" />
```

and before the closing `</section>`:

```tsx
<CompareBar />
```

2. Make each `<li>` a positioning context, give the card room for the checkbox, and add it as a sibling of the `<Link>`:

```tsx
<li key={institute.id} className="relative">
  <Link
    href={`/institutes/${institute.slug}`}
    className="block h-full rounded-lg border border-gray-200 bg-white p-4 pr-12 active:bg-gray-50"
  >
    …unchanged…
  </Link>
  <CompareCheckbox slug={institute.slug} name={institute.name} />
</li>
```

3. Add bottom padding to the page so the fixed bar cannot cover the last card:

```tsx
<section className="space-y-4 pb-20">
```

- [ ] **Step 4: Wire up the landing page the same way**

Apply the identical three changes to `apps/web/src/app/[landing]/page.tsx`: the empty `<form id="compare">` after the header, `pb-20` on the outer `<div>`, `relative` + `pr-12` + `<CompareCheckbox>` on each `<li>`, and `<CompareBar />` before the close. These are the pages high-intent traffic lands on (P1b), so omitting comparison here would waste the phase.

- [ ] **Step 5: Verify both pages build and behave**

```bash
pnpm --filter @one/web typecheck && pnpm --filter @one/web lint
```

Then with `pnpm dev` running, confirm by hand at 390px that checking two cards reveals the bar and submitting lands on `/compare?slug=…&slug=…`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/CompareCheckbox.tsx apps/web/src/app/CompareBar.tsx apps/web/src/app/institutes/page.tsx "apps/web/src/app/[landing]/page.tsx"
git commit -m "feat(web): add comparison selection to results and landing pages"
```

---

## Task 8: End-to-end coverage and documentation

**Files:**

- Create: `e2e/tests/compare.spec.ts`
- Create: `docs/decisions/0015-comparison-pins-one-batch-per-column.md`
- Create: `docs/flows/comparison.md`
- Modify: `docs/domain/business-rules.md` (BR-008)
- Modify: `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `docs/README.md`

- [ ] **Step 1: Write the e2e spec**

`e2e/tests/compare.spec.ts`. Seed three institutes in Pune, each with two future batches at different fees, plus one with a past batch; follow the fixture style of `e2e/tests/landing.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { prisma, truncateAll } from '../helpers/db.js'

// Fees are paise (BR-005). Alpha is cheapest, Gamma starts soonest.
test.beforeAll(async () => {
  await truncateAll()
  // … create city Pune, an org, the JEE tag, and three PUBLISHED listings
  // 'alpha-academy', 'beta-academy', 'gamma-academy', each with two
  // PUBLISHED batches dated 2030, plus one past batch on alpha.
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('selecting two institutes on results leads to a comparison', async ({ page }) => {
  await page.goto('/institutes')

  await page.getByRole('checkbox', { name: /Add ALPHA ACADEMY to comparison/i }).check()
  await page.getByRole('checkbox', { name: /Add BETA ACADEMY to comparison/i }).check()

  await expect(page.getByText('2 selected')).toBeVisible()
  await page.getByRole('button', { name: 'Compare' }).click()

  await expect(page).toHaveURL(/\/compare\?slug=/)
  await expect(page.getByRole('rowheader', { name: 'Fee' })).toBeVisible()
})

test('the compare button is disabled below two selections', async ({ page }) => {
  await page.goto('/institutes')
  await page.getByRole('checkbox', { name: /Add ALPHA ACADEMY to comparison/i }).check()
  await expect(page.getByRole('button', { name: 'Compare' })).toBeDisabled()
})

test('the table has a sticky attribute column inside a scroll container', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy&slug=gamma-academy')

  const feeHeader = page.getByRole('rowheader', { name: 'Fee' })
  await expect(feeHeader).toHaveCSS('position', 'sticky')
  await expect(feeHeader).toHaveCSS('left', '0px')

  // The container actually overflows at this viewport, which is what makes the
  // sticky column meaningful rather than decorative.
  const overflows = await page.evaluate(() => {
    const table = document.querySelector('table')
    const scroller = table?.parentElement
    return scroller ? scroller.scrollWidth > scroller.clientWidth : false
  })
  expect(overflows).toBe(true)
})

test('the lowest fee is tagged and no tag appears twice', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy&slug=gamma-academy')
  await expect(page.getByText('lowest', { exact: true })).toHaveCount(1)
  await expect(page.getByText('soonest', { exact: true })).toHaveCount(1)
})

test('changing a batch pins it in the URL', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy')

  await page.getByLabel('Batch for alpha-academy').selectOption({ index: 1 })
  await expect(page).toHaveURL(/batch=alpha-academy%3A/)
})

test('the enquiry CTA carries the pinned batch', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy')

  await page
    .getByRole('row', { name: /Enquire/ })
    .getByRole('link', { name: 'Enquire' })
    .first()
    .click()

  await expect(page).toHaveURL(/\/institutes\/alpha-academy\?batchId=/)
})

test('a dropped institute is reported rather than hidden', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy&slug=ghost-academy')
  await expect(page.getByText(/ghost-academy.*no longer listed/)).toBeVisible()
  await expect(page.getByRole('columnheader')).toHaveCount(2)
})

test('fewer than two surviving institutes is a 404', async ({ page }) => {
  const response = await page.goto('/compare?slug=alpha-academy&slug=ghost-one&slug=ghost-two')
  expect(response?.status()).toBe(404)
})

test('a comparison page is never indexable', async ({ page }) => {
  await page.goto('/compare?slug=alpha-academy&slug=beta-academy')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
})

test('the sitemap never lists a comparison', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text()
  expect(xml).not.toContain('/compare')
})
```

- [ ] **Step 2: Run the suite**

Run: `pnpm e2e`
Expected: PASS — 19 existing plus 10 new.

- [ ] **Step 3: Update BR-008**

In `docs/domain/business-rules.md`, replace BR-008's body:

```markdown
## BR-008 — Comparison accepts 2–4 listings of a single vertical

Implemented in P1c. `COMPARE_MIN`/`COMPARE_MAX` in `@one/shared` are the single source;
the API rejects anything outside the range with 400 after de-duplicating slugs, and the
`CompareBar` disables submission so the UI cannot produce that request.

Each column may additionally pin **one** published upcoming batch. Comparing two batches of
the same institute is deliberately out of scope — that is a detail-page question.
```

- [ ] **Step 4: Write ADR 0015**

`docs/decisions/0015-comparison-pins-one-batch-per-column.md`, covering: the decision to compare batches rather than institutes (a range is not an actionable fact); the two-stage URL-carried selection that pays for it; why pins are `slug:batchId` pairs rather than positional; the rot-versus-tampering split; and why the endpoint is mounted at `/api/v1/compare` rather than under `/api/v1/institutes`. Record the rejected alternatives: institute-level comparison, pre-selecting a batch before showing anything, and a `localStorage` tray.

- [ ] **Step 5: Write the flow document**

`docs/flows/comparison.md` with `Last verified against commit: REPLACE_AFTER_COMMIT`, code anchors for every file in the File Structure section, and a Failure modes table copied from the spec's §8. Add a "Related flows" pointer to `institute-discovery.md` and `seo-landing-pages.md`, and add the reciprocal pointers in those two files.

- [ ] **Step 6: Update the agent contracts and the docs map**

- `apps/api/CLAUDE.md` — a "Comparison" section: the `/api/v1/compare` mount and why; R4 delegation through `batches.service`; the rot/tampering split; the BUG-002 standing note with its "do not make comparison count past batches" warning.
- `apps/web/CLAUDE.md` — a "Comparison" section: `noindex, follow`; the checkbox-outside-the-Link constraint; the `form="compare"` association; the superlative labelling rule; that the page redirects on non-canonical slugs because the API deliberately does not 301.
- `docs/README.md` — add `flows/comparison.md` to the flows table and update "Where the project is" to include P1c.

- [ ] **Step 7: Run every gate**

```bash
pnpm verify
./scripts/verify-lint-guardrails.sh
pnpm --filter @one/shared gen:openapi && git diff --stat -- docs/api/openapi.json
pnpm e2e
```

All must be green, and the OpenAPI diff must be empty.

- [ ] **Step 8: Commit, then stamp the flow document**

Commit everything, then replace `REPLACE_AFTER_COMMIT` with that commit's sha and run:

```bash
pnpm exec tsx scripts/check-docs-freshness.ts
```

Expected: `All flow documents are current.` If `institute-discovery.md` or
`seo-landing-pages.md` is flagged, that is real — Task 7 edits both pages they anchor.
**Verify before bumping**: confirm the behaviour each doc describes still holds, add the
comparison entry point to its sequence, and only then re-stamp. Commit the stamp separately.

---

## Self-Review

**Spec coverage.** §5 selection → Tasks 1, 7. §6 rows and superlatives → Task 6. §7 API and the `/api/v1/compare` mount → Tasks 2, 4, 5. §8 degradation → Task 5's tests, every row. §9 mobile layout → Task 6 plus Task 8's sticky/overflow assertions. §10 entry points → Task 7. §11 SEO → Task 6's metadata, Task 8's sitemap assertion. §12 caching → `revalidate = 300` in Task 6. §13 testing → Tasks 1, 5, 6, 8.

**Gaps found and closed.** The spec says a pin may be written against a former slug; Task 4's pin lookup matches `row.slug` **or** `hit.requested`, and Task 5 tests it. The spec's `dropped` reason `UNPUBLISHED` was otherwise unreachable, since `resolvePublishedSlug` throws `NotFoundError` for both unknown and unpublished — it is now used for the single case the service can actually distinguish, a resolved listing that is not an `INSTITUTE`.

**Type consistency.** `BatchPin`, `CompareColumn`, `CompareResponse`, `CompareRow` are each defined once and referenced by the same name throughout. `listUpcomingPublishedForListing` (service) and `listUpcomingPublishedByListing` (repository) follow the module's existing `For`/`By` convention. `buildComparePath(slugs, pins)` has one signature, used in Tasks 1, 6 and 7.

**Known risk carried forward.** Task 8 asserts the sticky column's computed CSS and that its container really overflows, which is the most Playwright can do. It cannot prove the column does not shear on a real iPhone. That verification remains manual and is the spec's first open item.
