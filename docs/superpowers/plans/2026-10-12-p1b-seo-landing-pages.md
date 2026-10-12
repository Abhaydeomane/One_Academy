# P1b Programmatic SEO Landing Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated indexable page for every exam × city combination with real substance, plus mode variants where they add genuine choice, wired into an internal link graph and the sitemap.

**Architecture:** Root-level URLs (`/jee-coaching-in-pune`) parsed from a grammar whose only unambiguous delimiter is the `-coaching-in-` infix. A single API endpoint takes the raw path, resolves it against the database, and returns everything one page needs in one round trip: listings, the parent total that decides the canonical, set-wide fee statistics, and sibling links. Eligibility is one constant: a page exists at 1 listing, is indexable at 3.

**Tech Stack:** Next.js 16.4.0 App Router, Express 5.3.0, Postgres 17 (reusing P1a's search repository and `tsvector`), Prisma 7.10.0 with `Prisma.sql`, Zod 4.6.5, Vitest 5.0.3, Playwright 1.64.0.

**Spec:** `docs/superpowers/specs/2026-10-12-p1b-seo-landing-pages-design.md`

## Global Constraints

Everything in the root `CLAUDE.md` applies. The ones this work can violate most easily:

- **R1 / R3** Only `*.repository.ts` may import `@one/db`. Both new data-access files are
  named to match that glob for exactly this reason.
- **R4** Cross-module access goes through the other module's service. All of this work is
  inside the `institutes` module, so same-directory imports are fine; nothing may reach
  into `batches` or `listings` repositories.
- **R5** Every route input is validated by a Zod schema from `@one/shared`, read with
  `validated<T>(req, 'query')`.
- **R6** Throw `AppError` subclasses; only `errorHandler` maps to HTTP.
- **Money is integer minor units (paise).** `feeStats` values are paise; the UI converts.
- **Never mock the database.** Integration tests run against real Postgres.
- **Mobile first.** Single column base case; 44px `tap-target`; sibling link rails reuse
  the `scroll-rail` utilities from P1a.
- **`pnpm verify` green is the definition of done.** `pnpm e2e` is a separate gate.
- **`count()` returns `bigint`.** Convert with `Number()` before a value reaches a Zod
  schema, or validation fails with a type error that reads as unrelated.
- **Every SQL value goes through `Prisma.sql`** interpolation. Never concatenate request
  input into SQL text.

### Constraints specific to this work

- **`LANDING_MIN_INDEXABLE = 3`** is a single exported constant. Both the page's robots
  directive and the sitemap's contents derive from it; neither may hardcode 3.
- **A page exists at 1 listing and is indexable at 3.** Thin pages render with
  `noindex, follow` and are absent from the sitemap. A `noindex` URL must never appear in
  a sitemap — that tells Google two contradictory things.
- **Mode canonicalisation is an integer equality, not a judgement.** A mode-filtered set is
  a subset of the unfiltered set, so `total === parentTotal` proves the sets are identical
  and the variant must canonicalise to its parent.
- **Siblings exclude the current page and ignore mode.** `examFacets` _includes_ the
  current exam, so the service must filter it out or every page links to itself.
- **`searchPublished` derives its total from the first returned row.** A count-only call
  must therefore use `take: 1`, never `take: 0`, or the total comes back as 0.

### After this plan, these spec statements must hold

| Spec § | Statement                                                                              |
| ------ | -------------------------------------------------------------------------------------- |
| §5     | `/jee-advanced-coaching-in-new-delhi` resolves correctly despite hyphens on both sides |
| §5     | An exam slug beginning `online-` is not mistaken for a mode variant                    |
| §6     | 0 listings 404s; 1–2 renders `noindex`; 3+ is indexable and in the sitemap             |
| §6     | A mode variant whose set equals its parent's canonicalises to the parent               |
| §7     | `feeStats` spans the whole matching set, not the visible page                          |
| §7     | Siblings never link a page to itself                                                   |
| §8     | Institute detail pages link to their city × exam landing pages                         |
| §9     | The sitemap excludes thin pages                                                        |

---

## File Structure

### `packages/shared`

| File                       | Responsibility                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/landing.ts`           | **New.** The URL grammar — `parseLandingPath`, `buildLandingPath`, `LANDING_INFIX`, `LANDING_MODE_PREFIXES`, `LANDING_MIN_INDEXABLE`. Pure; no database knowledge |
| `src/contracts/landing.ts` | **New.** `landingQuery`, `landingPageResponse`, `landingIndexableResponse`                                                                                        |
| `src/index.ts`             | Export both                                                                                                                                                       |
| `scripts/gen-openapi.ts`   | Register the two new paths                                                                                                                                        |

The grammar is separate from the contracts because the web app needs `buildLandingPath`
for links without touching request schemas, and keeping it pure makes its edge cases
unit-testable with no fixtures.

### `apps/api`

| File                                                      | Responsibility                                                                                                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/institutes/institutes.landing.repository.ts` | **New.** Four aggregates: fee stats over a filtered set, cities for an exam, mode counts for one combination, and indexable combinations for the sitemap. Plus exam and city lookups by slug |
| `src/modules/institutes/institutes.landing.service.ts`    | **New.** Candidate resolution, eligibility, canonical choice, sibling assembly with exclusions                                                                                               |
| `src/modules/institutes/institutes.landing.routes.ts`     | **New.** `GET /` and `GET /indexable`                                                                                                                                                        |
| `src/modules/institutes/institutes.search.repository.ts`  | Export `wherePredicates`, `queryCte` and `baseJoins` so the landing aggregates reuse the same filter semantics                                                                               |
| `src/modules/institutes/institutes.service.ts`            | Extract `summariesForFilters` so both the list endpoint and the landing endpoint share one projection                                                                                        |
| `src/server.ts`                                           | Mount the landing router                                                                                                                                                                     |

### `apps/web`

| File                                 | Responsibility                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `src/app/[landing]/page.tsx`         | **New.** The landing page: metadata, robots, canonical, JSON-LD, listings, sibling rails |
| `src/app/[landing]/SiblingRail.tsx`  | **New.** The lateral link rail, reused three times                                       |
| `src/app/institutes/[slug]/page.tsx` | Add the block linking an institute to its landing pages                                  |
| `src/app/sitemap.ts`                 | Add indexable landing paths                                                              |

### Docs

| File                                                         | Responsibility                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `docs/decisions/0013-root-level-landing-url-grammar.md`      |                                                                                  |
| `docs/decisions/0014-landing-page-eligibility-thresholds.md` |                                                                                  |
| `docs/flows/seo-landing-pages.md`                            | **New flow doc** — this is a distinct user journey from `institute-discovery.md` |
| `apps/web/CLAUDE.md`, `apps/api/CLAUDE.md`                   | Landing rules                                                                    |
| `e2e/tests/landing.spec.ts`                                  | **New**                                                                          |

---

## Task Sequence

| Task | Deliverable                                                             |
| ---- | ----------------------------------------------------------------------- |
| 1    | The URL grammar and contracts, with the parser's edge cases pinned down |
| 2    | The four landing aggregates, integration tested                         |
| 3    | The endpoint: resolution, eligibility, canonical, siblings              |
| 4    | The landing page itself                                                 |
| 5    | Internal links from institute pages, and the sitemap                    |
| 6    | End-to-end coverage, ADRs and a new flow document                       |

---

### Task 1: The URL grammar and contracts

**Files:**

- Create: `packages/shared/src/landing.ts`
- Create: `packages/shared/src/landing.test.ts`
- Create: `packages/shared/src/contracts/landing.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/contracts/index.ts`

**Interfaces:**

- Consumes: `modeSchema`, `type Mode`, `instituteSummary`, `paginated`, `paginationQuery`
  from the existing contracts.
- Produces:
  - `LANDING_INFIX = '-coaching-in-'`
  - `LANDING_MODE_PREFIXES = ['online', 'offline', 'hybrid'] as const`
  - `LANDING_MIN_INDEXABLE = 3`
  - `type LandingCandidate = { examSlug: string; citySlug: string; mode?: Mode }`
  - `parseLandingPath(path: string): LandingCandidate[]` — most specific first, `[]` if not
    a landing path
  - `buildLandingPath(parts: { examSlug: string; citySlug: string; mode?: Mode | null }): string`
  - `landingQuery`, `landingPageResponse`, `landingIndexableResponse` and their inferred
    types

- [ ] **Step 1: Write the failing grammar tests**

Create `packages/shared/src/landing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildLandingPath, LANDING_MIN_INDEXABLE, parseLandingPath } from './landing.js'

describe('buildLandingPath', () => {
  it('builds an exam and city path', () => {
    expect(buildLandingPath({ examSlug: 'jee', citySlug: 'pune' })).toBe('/jee-coaching-in-pune')
  })

  it('prefixes the mode in lower case', () => {
    expect(buildLandingPath({ examSlug: 'jee', citySlug: 'pune', mode: 'ONLINE' })).toBe(
      '/online-jee-coaching-in-pune',
    )
  })

  it('treats a null mode as absent', () => {
    expect(buildLandingPath({ examSlug: 'neet', citySlug: 'mumbai', mode: null })).toBe(
      '/neet-coaching-in-mumbai',
    )
  })
})

describe('parseLandingPath', () => {
  it('parses a simple exam and city', () => {
    expect(parseLandingPath('/jee-coaching-in-pune')).toEqual([
      { examSlug: 'jee', citySlug: 'pune' },
    ])
  })

  it('accepts a path with no leading slash', () => {
    expect(parseLandingPath('jee-coaching-in-pune')).toEqual([
      { examSlug: 'jee', citySlug: 'pune' },
    ])
  })

  it('handles a hyphenated exam slug', () => {
    expect(parseLandingPath('/jee-advanced-coaching-in-pune')).toEqual([
      { examSlug: 'jee-advanced', citySlug: 'pune' },
    ])
  })

  it('handles a hyphenated city slug', () => {
    expect(parseLandingPath('/jee-coaching-in-new-delhi')).toEqual([
      { examSlug: 'jee', citySlug: 'new-delhi' },
    ])
  })

  it('handles hyphens on both sides at once', () => {
    expect(parseLandingPath('/jee-advanced-coaching-in-new-delhi')).toEqual([
      { examSlug: 'jee-advanced', citySlug: 'new-delhi' },
    ])
  })

  it('offers the mode reading first, then the literal reading', () => {
    // "online-jee" is probably mode ONLINE + exam "jee", but it could be an
    // exam literally slugged "online-jee". The caller resolves against real
    // data; the parser only ranks the possibilities.
    expect(parseLandingPath('/online-jee-coaching-in-pune')).toEqual([
      { examSlug: 'jee', citySlug: 'pune', mode: 'ONLINE' },
      { examSlug: 'online-jee', citySlug: 'pune' },
    ])
  })

  it('offers both readings for every mode prefix', () => {
    expect(parseLandingPath('/offline-neet-coaching-in-pune')[0]).toEqual({
      examSlug: 'neet',
      citySlug: 'pune',
      mode: 'OFFLINE',
    })
    expect(parseLandingPath('/hybrid-neet-coaching-in-pune')[0]).toEqual({
      examSlug: 'neet',
      citySlug: 'pune',
      mode: 'HYBRID',
    })
  })

  it('rejects a path with no infix', () => {
    expect(parseLandingPath('/jee-pune')).toEqual([])
  })

  it('rejects a path with the infix twice', () => {
    expect(parseLandingPath('/a-coaching-in-b-coaching-in-c')).toEqual([])
  })

  it('rejects an empty exam or city segment', () => {
    expect(parseLandingPath('/-coaching-in-pune')).toEqual([])
    expect(parseLandingPath('/jee-coaching-in-')).toEqual([])
  })

  it('rejects slugs that are not lower-case kebab case', () => {
    expect(parseLandingPath('/JEE-coaching-in-pune')).toEqual([])
    expect(parseLandingPath('/jee_main-coaching-in-pune')).toEqual([])
    expect(parseLandingPath('/jee--coaching-in-pune')).toEqual([])
  })

  it('rejects the bare infix', () => {
    expect(parseLandingPath('/-coaching-in-')).toEqual([])
  })

  it('round-trips everything it parses', () => {
    for (const path of [
      '/jee-coaching-in-pune',
      '/jee-advanced-coaching-in-new-delhi',
      '/online-jee-coaching-in-pune',
    ]) {
      const first = parseLandingPath(path)[0]
      expect(first).toBeDefined()
      expect(buildLandingPath(first!)).toBe(path)
    }
  })
})

describe('LANDING_MIN_INDEXABLE', () => {
  it('is the single source of the indexability threshold', () => {
    expect(LANDING_MIN_INDEXABLE).toBe(3)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @one/shared test landing
```

Expected: FAIL — `./landing.js` cannot be resolved.

- [ ] **Step 3: Implement the grammar**

Create `packages/shared/src/landing.ts`:

```ts
import type { Mode } from './contracts/institutes.js'

/// The one unambiguous delimiter in a landing URL. Both exam and city slugs
/// may contain hyphens, so nothing else can reliably split them.
export const LANDING_INFIX = '-coaching-in-'

export const LANDING_MODE_PREFIXES = ['online', 'offline', 'hybrid'] as const

/// Below this many published listings a landing page renders but is not
/// indexed, and stays out of the sitemap. One constant, because the page's
/// robots directive and the sitemap's contents must never disagree.
export const LANDING_MIN_INDEXABLE = 3

export type LandingCandidate = {
  examSlug: string
  citySlug: string
  mode?: Mode
}

/// Lower-case kebab case, no leading, trailing or doubled hyphens.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/// Syntactic parse only — it does not know which exams or cities exist.
///
/// Returns every reading of the path, most specific first. "online-jee" is
/// probably mode ONLINE plus exam "jee", but it could be an exam literally
/// slugged "online-jee", and only the database can say which. The caller
/// resolves the candidates in order and takes the first that exists.
///
/// Returns an empty array when the path is not a landing URL at all.
export function parseLandingPath(path: string): LandingCandidate[] {
  const slug = path.startsWith('/') ? path.slice(1) : path
  const parts = slug.split(LANDING_INFIX)

  // Exactly one infix. Zero means it is not a landing path; two or more is
  // malformed rather than ambiguous.
  if (parts.length !== 2) return []

  const [left, citySlug] = parts
  if (!left || !citySlug) return []
  if (!SLUG.test(left) || !SLUG.test(citySlug)) return []

  const candidates: LandingCandidate[] = []

  for (const prefix of LANDING_MODE_PREFIXES) {
    if (!left.startsWith(`${prefix}-`)) continue
    const rest = left.slice(prefix.length + 1)
    if (rest && SLUG.test(rest)) {
      candidates.push({
        examSlug: rest,
        citySlug,
        mode: prefix.toUpperCase() as Mode,
      })
    }
  }

  candidates.push({ examSlug: left, citySlug })
  return candidates
}

export function buildLandingPath(parts: {
  examSlug: string
  citySlug: string
  mode?: Mode | null
}): string {
  const prefix = parts.mode ? `${parts.mode.toLowerCase()}-` : ''
  return `/${prefix}${parts.examSlug}${LANDING_INFIX}${parts.citySlug}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @one/shared test landing
```

Expected: 16 passing.

- [ ] **Step 5: Write the contracts**

Create `packages/shared/src/contracts/landing.ts`:

```ts
import { z } from 'zod'
import { paginated, paginationQuery } from '../pagination.js'
import { instituteSummary, modeSchema } from './institutes.js'

/// Takes the raw path rather than exam/city/mode, so resolution happens once,
/// server-side, where the exam list lives. The alternative is the web app
/// trying each candidate in turn, which is two round trips for a guess.
export const landingQuery = paginationQuery.extend({
  path: z.string().min(1).max(200),
})
export type LandingQuery = z.infer<typeof landingQuery>

export const landingExamSibling = z.object({
  slug: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
  path: z.string(),
})

export const landingCitySibling = z.object({
  slug: z.string(),
  name: z.string(),
  count: z.number().int().nonnegative(),
  path: z.string(),
})

export const landingModeSibling = z.object({
  mode: modeSchema,
  count: z.number().int().nonnegative(),
  path: z.string(),
})

export const landingPageResponse = z.object({
  exam: z.object({ slug: z.string(), label: z.string() }),
  city: z.object({ slug: z.string(), name: z.string(), state: z.string() }),
  mode: modeSchema.nullable(),
  listings: paginated(instituteSummary),
  /// The same query without the mode filter. Equal totals prove the sets are
  /// identical, which is what makes the canonical decision mechanical.
  parentTotal: z.number().int().nonnegative(),
  indexable: z.boolean(),
  canonicalPath: z.string(),
  /// Across the whole matching set, not the visible page.
  feeStats: z.object({
    minFeeAmount: z.number().int().nullable(),
    maxFeeAmount: z.number().int().nullable(),
  }),
  siblings: z.object({
    examsInCity: z.array(landingExamSibling),
    citiesForExam: z.array(landingCitySibling),
    modeVariants: z.array(landingModeSibling),
  }),
})
export type LandingPageResponse = z.infer<typeof landingPageResponse>

export const landingIndexableResponse = z.object({ paths: z.array(z.string()) })
export type LandingIndexableResponse = z.infer<typeof landingIndexableResponse>
```

- [ ] **Step 6: Export both from the package barrels**

Add to `packages/shared/src/contracts/index.ts`:

```ts
export * from './landing.js'
```

Add to `packages/shared/src/index.ts`:

```ts
export * from './landing.js'
```

Note the two different `landing.js` files — `src/landing.ts` holds the grammar,
`src/contracts/landing.ts` the schemas. Both are exported from the package root.

- [ ] **Step 7: Verify the package**

```bash
pnpm --filter @one/shared test
pnpm --filter @one/shared lint
pnpm --filter @one/shared typecheck
pnpm --filter @one/shared build
```

Expected: all pass; the test count rises to 51.

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add landing URL grammar and contracts"
```

---

### Task 2: The landing aggregates

**Files:**

- Modify: `apps/api/src/modules/institutes/institutes.search.repository.ts` (export three fragments)
- Create: `apps/api/src/modules/institutes/institutes.landing.repository.ts`
- Test: `apps/api/src/modules/institutes/institutes.landing.repository.test.ts`

**Interfaces:**

- Consumes: `SearchFilters`, and the newly exported `wherePredicates`, `queryCte`,
  `baseJoins` from `institutes.search.repository.ts`.
- Produces:
  - `findExamBySlug(slug: string): Promise<{ slug: string; label: string } | null>`
  - `findCityBySlug(slug: string): Promise<{ slug: string; name: string; state: string } | null>`
  - `feeStatsForFilters(filters: SearchFilters): Promise<{ minFeeAmount: number | null; maxFeeAmount: number | null }>`
  - `citiesForExam(examSlug: string): Promise<{ slug: string; name: string; count: number }[]>`
  - `modeCountsFor(examSlug: string, citySlug: string): Promise<{ mode: Mode; count: number }[]>`
  - `indexableCombinations(minCount: number): Promise<{ examSlug: string; citySlug: string; count: number }[]>`

- [ ] **Step 1: Export the reusable SQL fragments**

In `institutes.search.repository.ts`, change three declarations from private to exported,
and nothing else:

```ts
export function wherePredicates(filters: SearchFilters, omit: Omitted = null): Prisma.Sql[]
export function queryCte(filters: SearchFilters): Prisma.Sql
export function baseJoins(): Prisma.Sql
```

Also export the `Omitted` type. The landing aggregates must filter with exactly the same
semantics as search — duplicating the predicates is how the two drift apart.

- [ ] **Step 2: Write the failing aggregate tests**

Create `apps/api/src/modules/institutes/institutes.landing.repository.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb } from '../../../test/helpers/db.js'
import type { SearchFilters } from './institutes.search.repository.js'
import {
  citiesForExam,
  feeStatsForFilters,
  findCityBySlug,
  findExamBySlug,
  indexableCombinations,
  modeCountsFor,
} from './institutes.landing.repository.js'

const base: SearchFilters = { sort: 'recent', skip: 0, take: 20 }

/// Pune gets three JEE institutes (so it is indexable) with fees spanning
/// ₹25,000 to ₹1,50,000; Mumbai gets one. One Pune listing is also NEET.
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

  const make = async (options: {
    slug: string
    cityId: string
    modes: ('ONLINE' | 'OFFLINE' | 'HYBRID')[]
    tagIds: string[]
    fee: number
    status?: 'PUBLISHED' | 'DRAFT'
  }) =>
    prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: options.slug,
        name: options.slug,
        status: options.status ?? 'PUBLISHED',
        publishedAt: new Date('2026-03-01T00:00:00Z'),
        organizationId: org.id,
        cityId: options.cityId,
        instituteProfile: { create: { modes: options.modes } },
        tags: { create: options.tagIds.map((tagId) => ({ tagId })) },
        batches: {
          create: {
            title: `${options.slug} batch`,
            exam: 'JEE',
            mode: options.modes[0] ?? 'OFFLINE',
            startDate: new Date('2028-04-01T00:00:00Z'),
            seatsTotal: 10,
            seatsAvailable: 10,
            feeAmount: options.fee,
            status: 'PUBLISHED',
          },
        },
      },
    })

  await make({
    slug: 'pune-a',
    cityId: pune.id,
    modes: ['OFFLINE'],
    tagIds: [jee.id],
    fee: 2_500_000,
  })
  await make({
    slug: 'pune-b',
    cityId: pune.id,
    modes: ['OFFLINE'],
    tagIds: [jee.id],
    fee: 7_000_000,
  })
  await make({
    slug: 'pune-c',
    cityId: pune.id,
    modes: ['ONLINE'],
    tagIds: [jee.id, neet.id],
    fee: 15_000_000,
  })
  await make({
    slug: 'mumbai-a',
    cityId: mumbai.id,
    modes: ['ONLINE'],
    tagIds: [jee.id],
    fee: 5_000_000,
  })
  // Unpublished: must never be counted anywhere (BR-009).
  await make({
    slug: 'pune-draft',
    cityId: pune.id,
    modes: ['OFFLINE'],
    tagIds: [jee.id],
    fee: 1_000,
    status: 'DRAFT',
  })

  return { pune, mumbai, jee, neet }
}

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('slug lookups', () => {
  it('finds an exam by slug', async () => {
    await seedCatalogue()
    expect(await findExamBySlug('jee')).toEqual({ slug: 'jee', label: 'JEE' })
  })

  it('returns null for an unknown exam', async () => {
    await seedCatalogue()
    expect(await findExamBySlug('gate')).toBeNull()
  })

  it('does not treat a non-exam tag as an exam', async () => {
    await seedCatalogue()
    await prisma.tag.create({ data: { slug: 'hostel', label: 'Hostel', kind: 'AMENITY' } })
    expect(await findExamBySlug('hostel')).toBeNull()
  })

  it('finds a city by slug with its state', async () => {
    await seedCatalogue()
    expect(await findCityBySlug('pune')).toEqual({
      slug: 'pune',
      name: 'Pune',
      state: 'Maharashtra',
    })
  })

  it('returns null for an unknown city', async () => {
    await seedCatalogue()
    expect(await findCityBySlug('jaipur')).toBeNull()
  })
})

describe('feeStatsForFilters', () => {
  it('spans the whole matching set rather than one page', async () => {
    await seedCatalogue()
    // take: 1 proves the aggregate ignores pagination entirely.
    const stats = await feeStatsForFilters({
      ...base,
      take: 1,
      citySlug: 'pune',
      examSlugs: ['jee'],
    })
    expect(stats.minFeeAmount).toBe(2_500_000)
    expect(stats.maxFeeAmount).toBe(15_000_000)
  })

  it('excludes unpublished listings', async () => {
    await seedCatalogue()
    const stats = await feeStatsForFilters({ ...base, citySlug: 'pune', examSlugs: ['jee'] })
    // The draft listing's ₹10 fee must not become the minimum.
    expect(stats.minFeeAmount).toBe(2_500_000)
  })

  it('respects the mode filter', async () => {
    await seedCatalogue()
    const stats = await feeStatsForFilters({
      ...base,
      citySlug: 'pune',
      examSlugs: ['jee'],
      mode: 'ONLINE',
    })
    expect(stats.minFeeAmount).toBe(15_000_000)
    expect(stats.maxFeeAmount).toBe(15_000_000)
  })

  it('returns nulls when nothing matches', async () => {
    await seedCatalogue()
    const stats = await feeStatsForFilters({ ...base, citySlug: 'pune', examSlugs: ['gate'] })
    expect(stats).toEqual({ minFeeAmount: null, maxFeeAmount: null })
  })
})

describe('citiesForExam', () => {
  it('lists cities with counts, busiest first', async () => {
    await seedCatalogue()
    expect(await citiesForExam('jee')).toEqual([
      { slug: 'pune', name: 'Pune', count: 3 },
      { slug: 'mumbai', name: 'Mumbai', count: 1 },
    ])
  })

  it('counts only published listings', async () => {
    await seedCatalogue()
    const cities = await citiesForExam('jee')
    expect(cities.find((city) => city.slug === 'pune')?.count).toBe(3)
  })

  it('returns an empty list for an exam nobody teaches', async () => {
    await seedCatalogue()
    expect(await citiesForExam('gate')).toEqual([])
  })
})

describe('modeCountsFor', () => {
  it('counts listings per mode for one combination', async () => {
    await seedCatalogue()
    const byMode = Object.fromEntries(
      (await modeCountsFor('jee', 'pune')).map((row) => [row.mode, row.count]),
    )
    expect(byMode.OFFLINE).toBe(2)
    expect(byMode.ONLINE).toBe(1)
    expect(byMode.HYBRID).toBeUndefined()
  })

  it('is scoped to the city', async () => {
    await seedCatalogue()
    const byMode = Object.fromEntries(
      (await modeCountsFor('jee', 'mumbai')).map((row) => [row.mode, row.count]),
    )
    expect(byMode.ONLINE).toBe(1)
    expect(byMode.OFFLINE).toBeUndefined()
  })
})

describe('indexableCombinations', () => {
  it('returns only combinations at or above the threshold', async () => {
    await seedCatalogue()
    const combos = await indexableCombinations(3)
    expect(combos).toEqual([{ examSlug: 'jee', citySlug: 'pune', count: 3 }])
  })

  it('includes thinner combinations when the threshold is lowered', async () => {
    await seedCatalogue()
    const combos = await indexableCombinations(1)
    expect(combos).toEqual(
      expect.arrayContaining([
        { examSlug: 'jee', citySlug: 'pune', count: 3 },
        { examSlug: 'jee', citySlug: 'mumbai', count: 1 },
        { examSlug: 'neet', citySlug: 'pune', count: 1 },
      ]),
    )
  })

  it('never counts unpublished listings toward the threshold', async () => {
    await seedCatalogue()
    // Pune/JEE has 3 published plus 1 draft. If drafts counted it would be 4.
    expect((await indexableCombinations(4)).length).toBe(0)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
pnpm --filter @one/api test institutes.landing.repository
```

Expected: FAIL — `./institutes.landing.repository.js` cannot be resolved.

- [ ] **Step 4: Implement the aggregates**

Create `apps/api/src/modules/institutes/institutes.landing.repository.ts`:

```ts
import { Prisma, prisma } from '@one/db'
import type { Mode } from '@one/shared'
import {
  baseJoins,
  queryCte,
  wherePredicates,
  type SearchFilters,
} from './institutes.search.repository.js'

// Aggregates that landing pages need and search does not. Named
// *.repository.ts so the R1/R3 lint rule permits the @one/db import here.
//
// These reuse search's own predicate builder rather than restating the
// filters, so the two cannot drift apart.

const PUBLISHED_INSTITUTE = Prisma.sql`
  l.vertical = 'INSTITUTE' AND l.status = 'PUBLISHED'
`

export async function findExamBySlug(
  slug: string,
): Promise<{ slug: string; label: string } | null> {
  const tag = await prisma.tag.findFirst({
    where: { slug, kind: 'EXAM' },
    select: { slug: true, label: true },
  })
  return tag
}

export async function findCityBySlug(
  slug: string,
): Promise<{ slug: string; name: string; state: string } | null> {
  return prisma.city.findUnique({
    where: { slug },
    select: { slug: true, name: true, state: true },
  })
}

/// Fee range across every listing the filters match, independent of
/// pagination — a page showing 20 of 60 must still report the true floor.
export async function feeStatsForFilters(
  filters: SearchFilters,
): Promise<{ minFeeAmount: number | null; maxFeeAmount: number | null }> {
  const rows = await prisma.$queryRaw<{ min_fee: number | null; max_fee: number | null }[]>(
    Prisma.sql`
      ${queryCte(filters)}
      SELECT min(b."feeAmount") AS min_fee, max(b."feeAmount") AS max_fee
      FROM "Batch" b
      WHERE b.status = 'PUBLISHED'
        AND b."listingId" IN (
          SELECT l.id
          ${baseJoins()}
          AND ${Prisma.join(wherePredicates(filters), ' AND ')}
        )
    `,
  )

  const row = rows[0]
  return {
    minFeeAmount: row?.min_fee ?? null,
    maxFeeAmount: row?.max_fee ?? null,
  }
}

export async function citiesForExam(
  examSlug: string,
): Promise<{ slug: string; name: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ slug: string; name: string; count: bigint }[]>(
    Prisma.sql`
      SELECT c.slug, c.name, count(DISTINCT l.id) AS count
      FROM "Listing" l
      JOIN "City" c ON c.id = l."cityId"
      JOIN "ListingTag" lt ON lt."listingId" = l.id
      JOIN "Tag" t ON t.id = lt."tagId" AND t.kind = 'EXAM' AND t.slug = ${examSlug}
      WHERE ${PUBLISHED_INSTITUTE}
      GROUP BY c.slug, c.name
      ORDER BY count DESC, c.name ASC
    `,
  )

  return rows.map((row) => ({ slug: row.slug, name: row.name, count: Number(row.count) }))
}

export async function modeCountsFor(
  examSlug: string,
  citySlug: string,
): Promise<{ mode: Mode; count: number }[]> {
  const rows = await prisma.$queryRaw<{ mode: Mode; count: bigint }[]>(
    Prisma.sql`
      SELECT m::text AS mode, count(DISTINCT l.id) AS count
      FROM "Listing" l
      JOIN "City" c ON c.id = l."cityId" AND c.slug = ${citySlug}
      JOIN "InstituteProfile" p ON p."listingId" = l.id
      CROSS JOIN LATERAL unnest(p.modes) AS m
      JOIN "ListingTag" lt ON lt."listingId" = l.id
      JOIN "Tag" t ON t.id = lt."tagId" AND t.kind = 'EXAM' AND t.slug = ${examSlug}
      WHERE ${PUBLISHED_INSTITUTE}
      GROUP BY m
      ORDER BY count DESC, mode ASC
    `,
  )

  return rows.map((row) => ({ mode: row.mode, count: Number(row.count) }))
}

/// Every exam × city group with at least `minCount` published listings. Feeds
/// the sitemap, which must contain only pages we actually want indexed.
export async function indexableCombinations(
  minCount: number,
): Promise<{ examSlug: string; citySlug: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ exam_slug: string; city_slug: string; count: bigint }[]>(
    Prisma.sql`
      SELECT t.slug AS exam_slug, c.slug AS city_slug, count(DISTINCT l.id) AS count
      FROM "Listing" l
      JOIN "City" c ON c.id = l."cityId"
      JOIN "ListingTag" lt ON lt."listingId" = l.id
      JOIN "Tag" t ON t.id = lt."tagId" AND t.kind = 'EXAM'
      WHERE ${PUBLISHED_INSTITUTE}
      GROUP BY t.slug, c.slug
      HAVING count(DISTINCT l.id) >= ${minCount}
      ORDER BY count DESC, t.slug ASC, c.slug ASC
    `,
  )

  return rows.map((row) => ({
    examSlug: row.exam_slug,
    citySlug: row.city_slug,
    count: Number(row.count),
  }))
}
```

**`baseJoins()` emits only `FROM` and the `JOIN`s — no `WHERE`.** The fee-stats subquery
must therefore write its own `WHERE`, not `AND`.

This was wrong in an earlier draft of this plan and the mistake is worth understanding,
because it fails silently: an `AND` after the joins attaches to the trailing
`LEFT JOIN "InstituteProfile" … ON …` clause. That is valid SQL which Postgres accepts
happily, but the predicates become join conditions rather than row filters, so nothing is
filtered at all — unpublished listings included. The integration test caught it only
because it asserts on a draft listing's fee and on an exam nobody teaches.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @one/api test institutes.landing.repository
```

Expected: 17 passing.

If `feeStatsForFilters` returns wrong numbers rather than erroring — a draft listing's fee
as the minimum, or results for an exam nobody teaches — the subquery is using `AND` where
it needs `WHERE`. See the note in Step 4.

- [ ] **Step 6: Verify lint and commit**

```bash
pnpm --filter @one/api lint
pnpm --filter @one/api typecheck
git add apps/api/src/modules/institutes
git commit -m "feat(api): add landing page aggregates"
```

---

### Task 3: The landing endpoint

**Files:**

- Modify: `apps/api/src/modules/institutes/institutes.service.ts` (extract `summariesForFilters`)
- Create: `apps/api/src/modules/institutes/institutes.landing.service.ts`
- Create: `apps/api/src/modules/institutes/institutes.landing.routes.ts`
- Modify: `apps/api/src/server.ts`, `packages/shared/scripts/gen-openapi.ts`
- Test: `apps/api/src/modules/institutes/institutes.landing.routes.test.ts`

**Interfaces:**

- Consumes: everything from Task 2; `parseLandingPath`, `buildLandingPath`,
  `LANDING_MIN_INDEXABLE`, `landingQuery`, `landingPageResponse` from Task 1.
- Produces:
  - `institutes.service.summariesForFilters(filters: SearchFilters): Promise<Paginated<InstituteSummary>>`
  - `institutes.landing.service.landingPage(query: LandingQuery): Promise<LandingPageResponse>`
  - `institutes.landing.service.indexablePaths(): Promise<string[]>`
  - `GET /api/v1/landing`, `GET /api/v1/landing/indexable`

- [ ] **Step 1: Extract the shared projection**

In `institutes.service.ts`, add this export and rewrite `listPublished` to use it, so the
list endpoint and the landing endpoint share one projection rather than two copies:

```ts
/// Runs the search and projects the matched rows through the typed SELECT,
/// restoring the rank order that `IN` does not preserve. Shared by the list
/// endpoint and the landing endpoint.
export async function summariesForFilters(
  filters: repo.SearchFilters,
): Promise<Paginated<InstituteSummary>> {
  const matched = await repo.searchPublished(filters)
  const rows = await repo.findSummariesByIds(matched.hits.map((hit) => hit.id))
  const byId = new Map(rows.map((row) => [row.id, row]))

  const items = matched.hits.flatMap((hit) => {
    const row = byId.get(hit.id)
    return row ? [toSummary(row, hit)] : []
  })

  return {
    items,
    total: matched.total,
    page: Math.floor(filters.skip / filters.take) + 1,
    limit: filters.take,
  }
}
```

Then `listPublished` becomes:

```ts
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

  const [listings, exams, modes] = await Promise.all([
    summariesForFilters(filters),
    repo.examFacets(filters),
    repo.modeFacets(filters),
  ])

  return { ...listings, facets: { exams, modes } }
}
```

Re-add `Paginated` to the type imports.

- [ ] **Step 2: Write the failing endpoint tests**

Create `apps/api/src/modules/institutes/institutes.landing.routes.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { landingIndexableResponse, landingPageResponse } from '@one/shared'
import { resetDb } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'

/// Pune: three JEE institutes, two offline and one online, one of which is
/// also NEET. Mumbai: one JEE institute, online.
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

  const make = async (
    slug: string,
    cityId: string,
    modes: ('ONLINE' | 'OFFLINE' | 'HYBRID')[],
    tagIds: string[],
    fee: number,
  ) =>
    prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug,
        name: slug.toUpperCase(),
        status: 'PUBLISHED',
        publishedAt: new Date('2026-03-01T00:00:00Z'),
        organizationId: org.id,
        cityId,
        instituteProfile: { create: { modes } },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        batches: {
          create: {
            title: `${slug} batch`,
            exam: 'JEE',
            mode: modes[0] ?? 'OFFLINE',
            startDate: new Date('2028-04-01T00:00:00Z'),
            seatsTotal: 10,
            seatsAvailable: 10,
            feeAmount: fee,
            status: 'PUBLISHED',
          },
        },
      },
    })

  await make('pune-a', pune.id, ['OFFLINE'], [jee.id], 2_500_000)
  await make('pune-b', pune.id, ['OFFLINE'], [jee.id], 7_000_000)
  await make('pune-c', pune.id, ['ONLINE'], [jee.id, neet.id], 15_000_000)
  await make('mumbai-a', mumbai.id, ['ONLINE'], [jee.id], 5_000_000)
}

beforeEach(async () => {
  await resetDb()
  await seedCatalogue()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const get = (path: string) => testApp().get(`/api/v1/landing?path=${encodeURIComponent(path)}`)

describe('GET /api/v1/landing — resolution', () => {
  it('resolves an exam and city path', async () => {
    const res = await get('/jee-coaching-in-pune')
    expect(res.status).toBe(200)
    const body = landingPageResponse.parse(res.body)
    expect(body.exam).toEqual({ slug: 'jee', label: 'JEE' })
    expect(body.city).toEqual({ slug: 'pune', name: 'Pune', state: 'Maharashtra' })
    expect(body.mode).toBeNull()
    expect(body.listings.total).toBe(3)
  })

  it('resolves a mode variant', async () => {
    const res = await get('/offline-jee-coaching-in-pune')
    expect(res.status).toBe(200)
    const body = landingPageResponse.parse(res.body)
    expect(body.mode).toBe('OFFLINE')
    expect(body.listings.total).toBe(2)
    expect(body.parentTotal).toBe(3)
  })

  it('404s an unknown exam', async () => {
    expect((await get('/gate-coaching-in-pune')).status).toBe(404)
  })

  it('404s an unknown city', async () => {
    expect((await get('/jee-coaching-in-jaipur')).status).toBe(404)
  })

  it('404s a combination with no listings', async () => {
    // NEET exists and Mumbai exists, but no NEET institute is in Mumbai.
    expect((await get('/neet-coaching-in-mumbai')).status).toBe(404)
  })

  it('404s a path that is not a landing URL at all', async () => {
    expect((await get('/not-a-landing-page')).status).toBe(404)
  })

  it('rejects a missing path parameter with VALIDATION_FAILED', async () => {
    const res = await testApp().get('/api/v1/landing')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })
})

describe('GET /api/v1/landing — eligibility', () => {
  it('is indexable at three listings', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    expect(body.listings.total).toBe(3)
    expect(body.indexable).toBe(true)
  })

  it('is not indexable at two listings', async () => {
    const body = landingPageResponse.parse((await get('/offline-jee-coaching-in-pune')).body)
    expect(body.listings.total).toBe(2)
    expect(body.indexable).toBe(false)
  })

  it('is not indexable at one listing', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-mumbai')).body)
    expect(body.listings.total).toBe(1)
    expect(body.indexable).toBe(false)
  })
})

describe('GET /api/v1/landing — canonical', () => {
  it('self-canonicalises an exam and city page', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    expect(body.canonicalPath).toBe('/jee-coaching-in-pune')
  })

  it('self-canonicalises a mode variant that genuinely narrows', async () => {
    const body = landingPageResponse.parse((await get('/offline-jee-coaching-in-pune')).body)
    expect(body.listings.total).toBe(2)
    expect(body.parentTotal).toBe(3)
    expect(body.canonicalPath).toBe('/offline-jee-coaching-in-pune')
  })

  it('canonicalises a mode variant whose set equals its parent', async () => {
    // Every Mumbai JEE institute is online, so the variant is a duplicate.
    const body = landingPageResponse.parse((await get('/online-jee-coaching-in-mumbai')).body)
    expect(body.listings.total).toBe(1)
    expect(body.parentTotal).toBe(1)
    expect(body.canonicalPath).toBe('/jee-coaching-in-mumbai')
  })
})

describe('GET /api/v1/landing — fee stats', () => {
  it('spans the whole set, not the requested page', async () => {
    const res = await testApp().get(
      `/api/v1/landing?path=${encodeURIComponent('/jee-coaching-in-pune')}&limit=1`,
    )
    const body = landingPageResponse.parse(res.body)
    expect(body.listings.items).toHaveLength(1)
    expect(body.feeStats.minFeeAmount).toBe(2_500_000)
    expect(body.feeStats.maxFeeAmount).toBe(15_000_000)
  })

  it('respects the mode filter', async () => {
    const body = landingPageResponse.parse((await get('/online-jee-coaching-in-pune')).body)
    expect(body.feeStats.minFeeAmount).toBe(15_000_000)
  })
})

describe('GET /api/v1/landing — siblings', () => {
  it('lists other exams in the city, excluding the current exam', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    expect(body.siblings.examsInCity).toEqual([
      { slug: 'neet', label: 'NEET', count: 1, path: '/neet-coaching-in-pune' },
    ])
  })

  it('lists other cities for the exam, excluding the current city', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    expect(body.siblings.citiesForExam).toEqual([
      { slug: 'mumbai', name: 'Mumbai', count: 1, path: '/jee-coaching-in-mumbai' },
    ])
  })

  it('offers mode variants that narrow, excluding the current mode', async () => {
    const body = landingPageResponse.parse((await get('/jee-coaching-in-pune')).body)
    const modes = body.siblings.modeVariants.map((variant) => variant.mode).sort()
    expect(modes).toEqual(['OFFLINE', 'ONLINE'])
    expect(body.siblings.modeVariants[0]?.path).toMatch(/-jee-coaching-in-pune$/)
  })

  it('omits a mode variant that would canonicalise away', async () => {
    // Mumbai's only JEE institute is online, so /online-... duplicates the
    // parent and must not be linked from it.
    const body = landingPageResponse.parse((await get('/jee-coaching-in-mumbai')).body)
    expect(body.siblings.modeVariants).toEqual([])
  })

  it('ignores mode when building lateral links', async () => {
    // From the offline variant, siblings still point at parent-level pages.
    const body = landingPageResponse.parse((await get('/offline-jee-coaching-in-pune')).body)
    expect(body.siblings.examsInCity[0]?.path).toBe('/neet-coaching-in-pune')
    expect(body.siblings.citiesForExam[0]?.path).toBe('/jee-coaching-in-mumbai')
  })
})

describe('GET /api/v1/landing/indexable', () => {
  it('returns only paths at or above the threshold', async () => {
    const res = await testApp().get('/api/v1/landing/indexable')
    expect(res.status).toBe(200)
    const body = landingIndexableResponse.parse(res.body)
    expect(body.paths).toEqual(['/jee-coaching-in-pune'])
  })

  it('excludes thin combinations that still have pages', async () => {
    const body = landingIndexableResponse.parse(
      (await testApp().get('/api/v1/landing/indexable')).body,
    )
    expect(body.paths).not.toContain('/jee-coaching-in-mumbai')
    expect(body.paths).not.toContain('/neet-coaching-in-pune')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
pnpm --filter @one/api test institutes.landing.routes
```

Expected: FAIL — every request 404s because no router is mounted.

- [ ] **Step 4: Implement the landing service**

Create `apps/api/src/modules/institutes/institutes.landing.service.ts`:

```ts
import {
  buildLandingPath,
  LANDING_MIN_INDEXABLE,
  parseLandingPath,
  type LandingCandidate,
  type LandingPageResponse,
  type LandingQuery,
  type Mode,
} from '@one/shared'
import { NotFoundError } from '../../lib/errors.js'
import * as landingRepo from './institutes.landing.repository.js'
import { examFacets, type SearchFilters } from './institutes.search.repository.js'
import { summariesForFilters } from './institutes.service.js'

type Resolved = {
  exam: { slug: string; label: string }
  city: { slug: string; name: string; state: string }
  mode: Mode | null
}

/// Takes the parser's candidates in order and returns the first whose slugs
/// both exist. This is why resolution lives server-side: only the database can
/// say whether "online-jee" is a mode plus an exam, or an exam on its own.
async function resolve(candidates: LandingCandidate[]): Promise<Resolved | null> {
  for (const candidate of candidates) {
    const [exam, city] = await Promise.all([
      landingRepo.findExamBySlug(candidate.examSlug),
      landingRepo.findCityBySlug(candidate.citySlug),
    ])
    if (exam && city) return { exam, city, mode: candidate.mode ?? null }
  }
  return null
}

function filtersFor(resolved: Resolved, page: number, limit: number): SearchFilters {
  return {
    citySlug: resolved.city.slug,
    examSlugs: [resolved.exam.slug],
    ...(resolved.mode ? { mode: resolved.mode } : {}),
    sort: 'recent',
    skip: (page - 1) * limit,
    take: limit,
  }
}

export async function landingPage(query: LandingQuery): Promise<LandingPageResponse> {
  const resolved = await resolve(parseLandingPath(query.path))
  if (!resolved) throw new NotFoundError('Landing page not found')

  const filters = filtersFor(resolved, query.page, query.limit)

  const [listings, feeStats, examsInCityRaw, citiesRaw, modeCounts] = await Promise.all([
    summariesForFilters(filters),
    landingRepo.feeStatsForFilters(filters),
    // examFacets omits its own filter, so this returns every exam in the city.
    examFacets({ ...filters, examSlugs: [resolved.exam.slug] }),
    landingRepo.citiesForExam(resolved.exam.slug),
    landingRepo.modeCountsFor(resolved.exam.slug, resolved.city.slug),
  ])

  if (listings.total === 0) throw new NotFoundError('Landing page not found')

  // The unfiltered total for this exam and city. Without a mode the page is
  // already unfiltered; with one, re-run the count. take must be 1, not 0 —
  // searchPublished reads the total off the first returned row.
  const parentTotal = resolved.mode
    ? (await summariesForFilters({ ...filters, mode: undefined, skip: 0, take: 1 })).total
    : listings.total

  const selfPath = buildLandingPath({
    examSlug: resolved.exam.slug,
    citySlug: resolved.city.slug,
    mode: resolved.mode,
  })
  const parentPath = buildLandingPath({
    examSlug: resolved.exam.slug,
    citySlug: resolved.city.slug,
  })

  // A mode-filtered set is a subset of the unfiltered one, so equal totals
  // prove equal membership — the variant is a duplicate of its parent.
  const canonicalPath = resolved.mode && listings.total === parentTotal ? parentPath : selfPath

  return {
    exam: resolved.exam,
    city: resolved.city,
    mode: resolved.mode,
    listings,
    parentTotal,
    indexable: listings.total >= LANDING_MIN_INDEXABLE,
    canonicalPath,
    feeStats,
    siblings: {
      // Exclude self, or every page links to itself.
      examsInCity: examsInCityRaw
        .filter((facet) => facet.slug !== resolved.exam.slug)
        .map((facet) => ({
          slug: facet.slug,
          label: facet.label,
          count: facet.count,
          // Lateral links ignore mode: one taxonomy axis at a time.
          path: buildLandingPath({ examSlug: facet.slug, citySlug: resolved.city.slug }),
        })),
      citiesForExam: citiesRaw
        .filter((city) => city.slug !== resolved.city.slug)
        .map((city) => ({
          slug: city.slug,
          name: city.name,
          count: city.count,
          path: buildLandingPath({ examSlug: resolved.exam.slug, citySlug: city.slug }),
        })),
      modeVariants: modeCounts
        .filter((variant) => variant.mode !== resolved.mode)
        // A variant covering the whole set would canonicalise to this page.
        .filter((variant) => variant.count !== parentTotal)
        .map((variant) => ({
          mode: variant.mode,
          count: variant.count,
          path: buildLandingPath({
            examSlug: resolved.exam.slug,
            citySlug: resolved.city.slug,
            mode: variant.mode,
          }),
        })),
    },
  }
}

export async function indexablePaths(): Promise<string[]> {
  const combinations = await landingRepo.indexableCombinations(LANDING_MIN_INDEXABLE)
  return combinations.map((combination) =>
    buildLandingPath({
      examSlug: combination.examSlug,
      citySlug: combination.citySlug,
    }),
  )
}
```

- [ ] **Step 5: Implement the routes and mount them**

Create `apps/api/src/modules/institutes/institutes.landing.routes.ts`:

```ts
import { Router } from 'express'
import { landingQuery, type LandingQuery } from '@one/shared'
import { validate, validated } from '../../middleware/validate.js'
import * as landing from './institutes.landing.service.js'

export const landingRouter = Router()

landingRouter.get('/indexable', async (_req, res) => {
  res.json({ paths: await landing.indexablePaths() })
})

landingRouter.get('/', validate({ query: landingQuery }), async (req, res) => {
  const query = validated<LandingQuery>(req, 'query')
  res.json(await landing.landingPage(query))
})
```

In `apps/api/src/server.ts` add the import and the mount:

```ts
import { landingRouter } from './modules/institutes/institutes.landing.routes.js'
```

```ts
app.use('/api/v1/landing', landingRouter)
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --filter @one/api test institutes.landing.routes
```

Expected: 21 passing.

Two likely failures and their causes:

- **`parentTotal` comes back as 0 for a mode variant** — the count-only call used
  `take: 0`. `searchPublished` reads the total from the first row, so an empty result set
  reports 0. Use `take: 1`.
- **`examsInCity` includes the current exam** — the `.filter` on `facet.slug` is missing.
  That is the self-linking bug the spec calls out.

- [ ] **Step 7: Register both paths in the OpenAPI generator**

In `packages/shared/scripts/gen-openapi.ts`, add the imports and two registrations:

```ts
registry.registerPath({
  method: 'get',
  path: '/api/v1/landing',
  summary: 'Resolve a programmatic landing page by its path',
  description:
    'Returns listings, the parent total that decides the canonical, set-wide fee stats and sibling links. 404 when the path is not a landing URL, when the exam or city is unknown, or when no listings match.',
  request: { query: landingQuery },
  responses: {
    200: { description: 'Landing page data', ...json(named('LandingPage', landingPageResponse)) },
    400: BAD_REQUEST,
    404: NOT_FOUND,
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/landing/indexable',
  summary: 'List landing paths eligible for indexing',
  description: 'Only combinations at or above LANDING_MIN_INDEXABLE. Feeds the sitemap.',
  responses: {
    200: {
      description: 'Indexable paths',
      ...json(named('LandingIndexable', landingIndexableResponse)),
    },
  },
})
```

Then regenerate and confirm:

```bash
pnpm --filter @one/shared gen:openapi
python3 -c "
import json
spec = json.load(open('docs/api/openapi.json'))
assert '/api/v1/landing' in spec['paths'], sorted(spec['paths'])
assert '/api/v1/landing/indexable' in spec['paths'], sorted(spec['paths'])
print('landing paths registered')
"
```

- [ ] **Step 8: Run the whole API suite and commit**

```bash
pnpm --filter @one/api test
pnpm --filter @one/api lint
pnpm --filter @one/api typecheck
git add apps/api packages/shared docs/api/openapi.json
git commit -m "feat(api): add landing page endpoint with eligibility and canonicals"
```

---

### Task 4: The landing page

**Files:**

- Create: `apps/web/src/app/[landing]/page.tsx`
- Create: `apps/web/src/app/[landing]/SiblingRail.tsx`

**Interfaces:**

- Consumes: `landingPageResponse`, `LANDING_MIN_INDEXABLE`, `parseLandingPath` from
  `@one/shared`; `apiGetOptional` from `@/lib/api`; `formatFeeRange`, `formatFee` from
  `@/lib/format`; `Badge` from `@one/ui`.
- Produces: the route itself, and `SiblingRail({ title, links })` where
  `links: { label: string; count: number; path: string }[]`.

- [ ] **Step 1: Build the sibling rail**

Create `apps/web/src/app/[landing]/SiblingRail.tsx`:

```tsx
import Link from 'next/link'

/// Lateral links between landing pages. Reused for exams, cities and modes —
/// the three axes differ only in their labels, so they share one component.
export function SiblingRail({
  title,
  links,
}: {
  title: string
  links: { label: string; count: number; path: string }[]
}) {
  if (links.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="scroll-rail scroll-rail-hide-bar -mx-4 flex gap-2 px-4 pb-1">
        {links.map((link) => (
          <Link
            key={link.path}
            href={link.path}
            className="tap-target inline-flex shrink-0 snap-start items-center gap-1 rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700"
          >
            <span>{link.label}</span>
            <span className="text-gray-500">({link.count})</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Build the landing page**

Create `apps/web/src/app/[landing]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@one/ui'
import { landingPageResponse, parseLandingPath } from '@one/shared'
import { apiGetOptional } from '@/lib/api'
import { formatFee, formatFeeRange } from '@/lib/format'
import { SiblingRail } from './SiblingRail'

export const revalidate = 300

// This route owns the root namespace: any unmatched root path reaches it and
// 404s. Static segments (/institutes, /sitemap.xml, /robots.txt) win in Next's
// precedence, but a future *dynamic* root sibling would collide with this.
type Params = Promise<{ landing: string }>

async function loadLanding(slug: string, page: number) {
  // Cheap syntactic rejection before spending a request on obvious misses.
  if (parseLandingPath(slug).length === 0) return null

  const search = new URLSearchParams({ path: `/${slug}`, page: String(page) })
  return apiGetOptional(`/api/v1/landing?${search.toString()}`, landingPageResponse)
}

function headline(data: { exam: { label: string }; city: { name: string }; mode: string | null }) {
  const prefix = data.mode ? `${data.mode.charAt(0)}${data.mode.slice(1).toLowerCase()} ` : ''
  return `${prefix}${data.exam.label} Coaching in ${data.city.name}`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { landing } = await params
  const data = await loadLanding(landing, 1)
  if (!data) return { title: 'Page not found' }

  const title = headline(data)
  const floor = data.feeStats.minFeeAmount
  // Degrades rather than printing a null when the whole set has no batches.
  const fees = floor === null ? '' : ` Fees from ${formatFee(floor, 'INR')}.`
  const count = data.listings.total

  return {
    title,
    description:
      `Compare ${count} ${data.exam.label} coaching ${count === 1 ? 'institute' : 'institutes'}` +
      ` in ${data.city.name}.${fees} Upcoming batches, schedules and seats.`,
    alternates: { canonical: data.canonicalPath },
    // Thin pages stay reachable and keep passing equity downward, but are not
    // indexed. The threshold lives in @one/shared, not here.
    ...(data.indexable ? {} : { robots: { index: false, follow: true } }),
  }
}

export default async function LandingPage({ params }: { params: Params }) {
  const { landing } = await params
  const data = await loadLanding(landing, 1)
  if (!data) notFound()

  const fees = formatFeeRange(data.feeStats.minFeeAmount, data.feeStats.maxFeeAmount)

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Institutes', item: '/institutes' },
        { '@type': 'ListItem', position: 2, name: headline(data), item: data.canonicalPath },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: data.listings.items.map((institute, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: institute.name,
        url: `/institutes/${institute.slug}`,
      })),
    },
  ]

  return (
    <div className="space-y-7">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="space-y-2">
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{headline(data)}</h1>
        <p className="text-sm text-gray-600">
          {data.listings.total} {data.listings.total === 1 ? 'institute' : 'institutes'}
          {fees ? ` · ${fees}` : ''}
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.listings.items.map((institute) => {
          const instituteFees = formatFeeRange(institute.minFeeAmount, institute.maxFeeAmount)

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
                  {instituteFees ? (
                    <p className="text-sm font-semibold text-brand-700">{instituteFees}</p>
                  ) : null}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>

      <SiblingRail
        title={`Other exams in ${data.city.name}`}
        links={data.siblings.examsInCity.map((sibling) => ({
          label: sibling.label,
          count: sibling.count,
          path: sibling.path,
        }))}
      />

      <SiblingRail
        title={`${data.exam.label} coaching in other cities`}
        links={data.siblings.citiesForExam.map((sibling) => ({
          label: sibling.name,
          count: sibling.count,
          path: sibling.path,
        }))}
      />

      <SiblingRail
        title="Narrow by mode"
        links={data.siblings.modeVariants.map((sibling) => ({
          label: sibling.mode.charAt(0) + sibling.mode.slice(1).toLowerCase(),
          count: sibling.count,
          path: sibling.path,
        }))}
      />

      <p className="pt-2 text-sm">
        <Link href="/institutes" className="text-brand-700 underline">
          Browse all institutes
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Verify it builds and renders**

```bash
pnpm --filter @one/web lint
pnpm --filter @one/web typecheck
pnpm --filter @one/web build
```

Expected: all exit 0, and the build output lists `ƒ /[landing]` as server-rendered on
demand. If the build tries to prerender it, confirm no `generateStaticParams` was added —
dynamic rendering is deliberate (spec §11).

- [ ] **Step 4: Check it against the running stack**

```bash
pnpm --filter @one/db db:seed
pnpm --filter @one/api dev & pnpm --filter @one/web dev &
sleep 14
echo "--- indexable page ---"
curl -s http://localhost:3000/jee-coaching-in-pune | grep -c "Coaching in Pune"
echo "--- robots on a thin page ---"
curl -s http://localhost:3000/neet-coaching-in-pune | grep -oE '<meta name="robots" content="[^"]*"' | head -1
echo "--- unknown combination 404s ---"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/gate-coaching-in-pune
echo "--- not a landing path 404s ---"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/random-nonsense
kill %1 %2
```

Expected: the first grep is at least 1; the thin page carries `noindex, follow`; both
unknown URLs return 404.

The seed has 9 published institutes across 3 cities, so which combinations clear the
threshold of 3 depends on the seeded tags — read the actual counts from
`/api/v1/landing/indexable` rather than assuming.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add programmatic landing pages with canonicals and sibling links"
```

---

### Task 5: Internal links from institute pages, and the sitemap

**Files:**

- Modify: `apps/web/src/app/institutes/[slug]/page.tsx`
- Modify: `apps/web/src/app/sitemap.ts`

**Interfaces:**

- Consumes: `buildLandingPath` from `@one/shared`; `landingIndexableResponse`.
- Produces: no new exports. The institute detail page gains a landing-link block; the
  sitemap gains indexable landing paths.

- [ ] **Step 1: Link institute pages into the landing graph**

In `apps/web/src/app/institutes/[slug]/page.tsx`, add `buildLandingPath` to the
`@one/shared` import, then insert this section immediately before the enquiry section:

```tsx
{
  institute.exams.length > 0 ? (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Explore similar institutes</h2>
      {/* Every institute page is an entry point into the landing graph,
              which is the direction crawl budget should flow. These pages
              always exist: this institute is itself one of their listings. */}
      <div className="scroll-rail scroll-rail-hide-bar -mx-4 flex gap-2 px-4 pb-1">
        {institute.exams.map((exam) => (
          <Link
            key={exam}
            href={buildLandingPath({ examSlug: exam, citySlug: institute.city.slug })}
            className="tap-target inline-flex shrink-0 snap-start items-center rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700"
          >
            {exam.toUpperCase()} coaching in {institute.city.name}
          </Link>
        ))}
      </div>
    </section>
  ) : null
}
```

Add `import Link from 'next/link'` if the file does not already import it.

- [ ] **Step 2: Add indexable landing paths to the sitemap**

In `apps/web/src/app/sitemap.ts`, add the import and the landing block:

```ts
import { instituteListResponse, landingIndexableResponse } from '@one/shared'
```

After the institute loop, before `return entries`:

```ts
// Only indexable combinations. Listing a noindex URL in a sitemap tells
// Google two contradictory things, which is worse than omitting it.
const landing = await apiGet('/api/v1/landing/indexable', landingIndexableResponse, 3600)
for (const path of landing.paths) {
  entries.push({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  })
}
```

- [ ] **Step 3: Verify both**

```bash
pnpm --filter @one/web lint && pnpm --filter @one/web typecheck && pnpm --filter @one/web build
pnpm --filter @one/api dev & pnpm --filter @one/web dev &
sleep 14
echo "--- institute page links to its landing pages ---"
curl -s http://localhost:3000/institutes/alpha-academy | grep -oE 'coaching-in-pune' | head -2
echo "--- sitemap includes a landing path ---"
curl -s http://localhost:3000/sitemap.xml | grep -oE '<loc>[^<]*coaching-in-[^<]*</loc>' | head -3
echo "--- sitemap excludes thin pages ---"
curl -s http://localhost:4000/api/v1/landing/indexable
kill %1 %2
```

Expected: the institute page contains at least one landing link; the sitemap contains the
paths the API reports as indexable and no others.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): link institute pages into the landing graph and add landing paths to the sitemap"
```

---

### Task 6: End-to-end coverage and documentation

**Files:**

- Create: `e2e/tests/landing.spec.ts`
- Create: `docs/decisions/0013-root-level-landing-url-grammar.md`
- Create: `docs/decisions/0014-landing-page-eligibility-thresholds.md`
- Create: `docs/flows/seo-landing-pages.md`
- Modify: `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `docs/README.md`

**Interfaces:**

- Consumes: the running API and web app from `playwright.config.ts`.
- Produces: no code interfaces. The new flow document needs a verified commit stamp.

- [ ] **Step 1: Write the end-to-end spec**

Create `e2e/tests/landing.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { prisma, truncateAll } from '../helpers/db.js'

/// Pune gets three JEE institutes so it clears the indexing threshold;
/// Mumbai gets one so it does not. One Pune institute is also NEET.
test.beforeAll(async () => {
  await truncateAll()

  const pune = await prisma.city.create({
    data: { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  })
  const mumbai = await prisma.city.create({
    data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
  })
  const org = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } })
  const jee = await prisma.tag.create({ data: { slug: 'jee', label: 'JEE', kind: 'EXAM' } })
  const neet = await prisma.tag.create({ data: { slug: 'neet', label: 'NEET', kind: 'EXAM' } })

  const make = (
    slug: string,
    cityId: string,
    modes: ('ONLINE' | 'OFFLINE' | 'HYBRID')[],
    tagIds: string[],
    fee: number,
  ) =>
    prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug,
        name: slug.replace(/-/g, ' ').toUpperCase(),
        status: 'PUBLISHED',
        publishedAt: new Date('2026-03-01T00:00:00Z'),
        organizationId: org.id,
        cityId,
        instituteProfile: { create: { modes } },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        batches: {
          create: {
            title: `${slug} batch`,
            exam: 'JEE',
            mode: modes[0] ?? 'OFFLINE',
            startDate: new Date('2028-04-01T00:00:00Z'),
            seatsTotal: 20,
            seatsAvailable: 20,
            feeAmount: fee,
            status: 'PUBLISHED',
          },
        },
      },
    })

  await make('alpha-academy', pune.id, ['OFFLINE'], [jee.id], 2_500_000)
  await make('beta-academy', pune.id, ['OFFLINE'], [jee.id], 7_000_000)
  await make('gamma-academy', pune.id, ['ONLINE'], [jee.id, neet.id], 15_000_000)
  await make('delta-academy', mumbai.id, ['ONLINE'], [jee.id], 5_000_000)
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('an indexable landing page renders its listings and is indexable', async ({ page }) => {
  await page.goto('/jee-coaching-in-pune')

  await expect(page.getByRole('heading', { level: 1, name: 'JEE Coaching in Pune' })).toBeVisible()
  await expect(page.getByText('3 institutes')).toBeVisible()
  await expect(page.getByRole('link', { name: /ALPHA ACADEMY/ })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})

test('a thin landing page renders but is not indexed', async ({ page }) => {
  // Mumbai has one JEE institute, below the threshold of three.
  await page.goto('/jee-coaching-in-mumbai')

  await expect(
    page.getByRole('heading', { level: 1, name: 'JEE Coaching in Mumbai' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /DELTA ACADEMY/ })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
})

test('a mode variant that duplicates its parent canonicalises to it', async ({ page }) => {
  // Mumbai's only JEE institute is online, so this page is a duplicate.
  await page.goto('/online-jee-coaching-in-mumbai')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/jee-coaching-in-mumbai$/,
  )
})

test('a mode variant that genuinely narrows canonicalises to itself', async ({ page }) => {
  // Two of three Pune JEE institutes are offline.
  await page.goto('/offline-jee-coaching-in-pune')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/offline-jee-coaching-in-pune$/,
  )
})

test('sibling links point laterally and never at the page itself', async ({ page }) => {
  await page.goto('/jee-coaching-in-pune')

  await expect(page.getByRole('link', { name: /NEET \(1\)/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mumbai \(1\)/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /^JEE \(/ })).toHaveCount(0)

  await page.getByRole('link', { name: /Mumbai \(1\)/ }).click()
  await expect(page).toHaveURL(/\/jee-coaching-in-mumbai$/)
})

test('an unknown combination and a non-landing path both 404', async ({ page }) => {
  expect((await page.goto('/gate-coaching-in-pune'))?.status()).toBe(404)
  expect((await page.goto('/neet-coaching-in-mumbai'))?.status()).toBe(404)
  expect((await page.goto('/random-nonsense'))?.status()).toBe(404)
})

test('an institute page links into the landing graph', async ({ page }) => {
  await page.goto('/institutes/alpha-academy')

  const link = page.getByRole('link', { name: /JEE coaching in Pune/ })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(/\/jee-coaching-in-pune$/)
})

test('the sitemap contains indexable landing pages and excludes thin ones', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text()

  expect(xml).toContain('/jee-coaching-in-pune')
  // One listing each — below the threshold, so absent.
  expect(xml).not.toContain('/jee-coaching-in-mumbai')
  expect(xml).not.toContain('/neet-coaching-in-pune')
})
```

- [ ] **Step 2: Run the end-to-end gate**

```bash
pnpm e2e
```

Expected: 19 passing — the 11 existing specs plus these 8.

If the canonical assertions fail, check that Next emitted `<link rel="canonical">`: it does
so only when `alternates.canonical` is set, and a relative path is resolved against
`metadataBase`, which the root layout already sets.

- [ ] **Step 3: Write the two ADRs**

Create `docs/decisions/0013-root-level-landing-url-grammar.md` and
`docs/decisions/0014-landing-page-eligibility-thresholds.md`, following the project's
Context / Decision / Alternatives rejected / Consequences shape, drawing the content from
§4 of the spec.

0013 must record: why the `-coaching-in-` infix is the only reliable delimiter; that the
parser returns ranked candidates rather than one answer, because only the database can
decide whether `online-jee` is a mode plus an exam; and that this route owns the root
namespace, so a future dynamic root sibling would collide.

0014 must record: that a page exists at 1 but is indexable at 3; that `follow` on thin
pages keeps equity flowing to institute pages; that mode canonicalisation is an integer
equality rather than a judgement, with the subset argument spelled out; and that the
threshold is one exported constant, to be revisited from Search Console data rather than
by instinct.

- [ ] **Step 4: Write the new flow document**

Create `docs/flows/seo-landing-pages.md` with the project's flow shape: a
`Last verified against commit: REPLACE_WITH_HEAD_SHA` line, purpose, actors, the sequence
with code anchors, business rules invoked, and a failure-modes table.

The sequence must anchor these files, since the freshness detector reads them:

```
apps/web/src/app/[landing]/page.tsx
  → packages/shared/src/landing.ts                                parseLandingPath (syntactic)
  → apps/web/src/lib/api.ts                                       apiGetOptional
  → GET /api/v1/landing?path=…
  → apps/api/src/modules/institutes/institutes.landing.routes.ts
  → apps/api/src/modules/institutes/institutes.landing.service.ts resolve, eligibility, canonical
  → apps/api/src/modules/institutes/institutes.landing.repository.ts  fee stats, siblings
  → apps/api/src/modules/institutes/institutes.search.repository.ts   the matching query (P1a)
```

Failure modes to document: not a landing path → 404; unknown exam or city → 404; zero
listings → 404; one or two listings → renders `noindex, follow`; a mode variant equal to
its parent → canonical points at the parent.

- [ ] **Step 5: Update the two agent contracts and the docs map**

Append to `apps/api/CLAUDE.md`:

```markdown
## Landing pages

`GET /api/v1/landing` takes the **raw path** and resolves it, rather than taking exam and
city separately. Only the database can decide whether `online-jee` is mode ONLINE plus
exam `jee` or an exam literally slugged `online-jee`, so resolution belongs server-side —
the alternative is the web app trying each candidate in turn.

- `parseLandingPath` returns ranked candidates; `institutes.landing.service.resolve` takes
  the first whose exam and city both exist.
- Eligibility is `LANDING_MIN_INDEXABLE` from `@one/shared`. Never hardcode the number.
- A mode variant canonicalises to its parent when `total === parentTotal`. That is a proof,
  not a heuristic: a mode-filtered set is a subset, so equal size means equal membership.
- **The parent count must use `take: 1`, not `take: 0`.** `searchPublished` reads the total
  from the first returned row, so an empty page reports a total of zero.
- `examFacets` **includes** the current exam, because it omits its own filter. The service
  filters it out; without that, every page links to itself.
```

Append to `apps/web/CLAUDE.md`:

```markdown
## Landing pages

`/[landing]` owns the root namespace. Static segments win in Next's precedence, so
`/institutes`, `/sitemap.xml` and `/robots.txt` are safe — but **a future dynamic root
sibling would collide with it.**

- Titles, descriptions and headings come from data only. No generated prose: near-duplicate
  copy across hundreds of URLs is the doorway-page signal we are avoiding (ADR 0014).
- The fee sentence degrades to nothing when the set has no published batches. Never print
  "Fees from null".
- `robots` and `canonical` both come from the API's `indexable` and `canonicalPath`. The
  page makes no eligibility decision of its own.
- Sibling rails are lateral: one taxonomy axis at a time, mode ignored.
- Institute detail pages link to their city × exam landing pages. Those pages always exist,
  because the institute is itself one of their listings.
```

Add a row to the table in `docs/README.md` so the new flow is discoverable, and update the
"Where the project is" paragraph to note that P1a and P1b are complete.

- [ ] **Step 6: Run every gate**

```bash
pnpm verify
./scripts/verify-lint-guardrails.sh
pnpm --filter @one/shared gen:openapi && git diff --quiet -- docs/api/openapi.json && echo "openapi: no drift"
pnpm e2e
```

Expected: all green.

- [ ] **Step 7: Commit, then stamp the new flow document**

The verified commit must be the one containing the code, so stamping is a second commit:

```bash
git add -A
git commit -m "docs: add landing page ADRs, flow and agent contracts"

HEAD_SHA=$(git rev-parse HEAD)
sed -i '' "s/REPLACE_WITH_HEAD_SHA/$HEAD_SHA/" docs/flows/seo-landing-pages.md
git add docs/flows/seo-landing-pages.md
git commit -m "docs: stamp the landing page flow with its verified commit"

pnpm exec tsx scripts/check-docs-freshness.ts
```

Expected: `All flow documents are current.` If `institute-discovery.md` or
`listing-lifecycle.md` is flagged, **verify before bumping** — Task 3 edits
`institutes.service.ts`, which both anchor. Check that the functions they name still exist
and behave as described, then re-stamp.

---

## Self-Review Record

Run against the spec on 2026-10-12.

**Spec coverage.** §5 grammar → Task 1; §6 eligibility and canonicals → Tasks 1 and 3; §7
API → Tasks 2 and 3; §8 internal linking → Tasks 4 and 5; §9 sitemap → Task 5; §10 metadata
→ Task 4; §11 caching → Task 4 (`revalidate = 300`, no `generateStaticParams`); §12 testing
→ Tasks 1, 2, 3 and 6; §13 and §14 carry forward unchanged.

**Deviations from the spec, deliberate:**

1. **The endpoint takes `path`, not `exam`/`city`/`mode`.** §7 specified the latter. Taking
   the raw path means resolution happens once, server-side, where the exam list lives;
   otherwise the web app must try each candidate in turn, which is two round trips to guess
   at something the API can answer directly. Recorded in `apps/api/CLAUDE.md`.
2. **`summariesForFilters` is extracted from `institutes.service.ts`** (Task 3 Step 1). Not
   in the spec, but the landing endpoint needs the same projection the list endpoint
   already builds, and duplicating it would let the two drift.
3. **`wherePredicates`, `queryCte` and `baseJoins` become exported** from the search
   repository. The landing aggregates must filter identically to search; restating the
   predicates is how they diverge.
4. **A new flow document** rather than extending `institute-discovery.md`. Landing pages are
   a distinct entry path — arriving from Google on a term, not browsing — and the existing
   flow is already long.

**Type consistency checks performed.** `SearchFilters` is built only in
`institutes.service.listPublished` and `institutes.landing.service.filtersFor`, with the
same field names. `LandingCandidate.mode` is optional while `LandingPageResponse.mode` is
nullable — the service converts with `?? null`, which is why `buildLandingPath` accepts
`Mode | null | undefined`. Sibling path strings are produced only by `buildLandingPath`, so
no call site hand-builds a URL. `landingExamSibling` carries `label` while
`landingCitySibling` carries `name`, matching `Tag.label` and `City.name` respectively; the
rail component takes a uniform `label` and the page maps each.

**Known risks accepted:**

- `feeStatsForFilters` writes its own `WHERE` after `baseJoins()`. If that helper ever
  starts emitting a `WHERE`, this call site produces a syntax error — which is the good
  case. The bad case is the reverse, documented in Task 2 Step 4: an `AND` there attaches
  to a join condition and silently stops filtering.
- The seed's tag distribution determines which combinations clear the threshold, so Task 4
  Step 4 reads the real counts from `/api/v1/landing/indexable` rather than asserting
  hardcoded paths.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-12-p1b-seo-landing-pages.md`.
