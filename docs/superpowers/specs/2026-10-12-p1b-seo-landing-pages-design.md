# One Academy — P1b: Programmatic SEO landing pages

**Date:** 2026-10-12
**Status:** Approved design, pending implementation plan
**Phase:** P1b. P1c and P1d are scoped in §13 and each gets its own spec.
**Builds on:** `2026-10-12-p1a-search-and-filters-design.md`

---

## 1. Context

Google is One Academy's acquisition channel. People search "JEE coaching in Pune", not
"coaching marketplace" — and today there is no page to serve that query. The only
indexable public routes are `/institutes` and `/institutes/<slug>`.

P1a deliberately made `/institutes?city=pune&exams=jee` `noindex, follow` (ADR 0012),
precisely so a purpose-built landing page could own that term without competing against a
filter URL. This phase builds those pages.

### The real risk is building too many

Cities × exams generates mostly-empty combinations, and Google treats thin programmatic
pages as doorway pages — a judgement that can depress the whole domain, not just the thin
URLs. The eligibility policy therefore matters more than the page template, and §6 is the
most important section of this document.

## 2. Goals

1. A dedicated, indexable page for each exam × city combination with real substance.
2. Mode variants (`/online-jee-coaching-in-pune`) where they add genuine choice, and
   canonicalised away where they do not.
3. Each page unique because its _data_ is unique — no generated prose.
4. An internal link graph that routes crawl budget from landing pages to institute pages
   and laterally between related landing pages.
5. The sitemap lists exactly the pages we want indexed, and nothing else.

## 3. Non-goals

- **Locality pages** (`/jee-coaching-in-kothrud`). `Listing.locality` is free text with no
  slug and no canonical list; doing this properly needs a `Locality` entity, a migration of
  existing values, and a change to the partner form. Its own slice.
- **City-only and exam-only hubs** (`/coaching-classes-in-pune`, `/jee-coaching`).
  Deliberately excluded. **Consequence worth stating plainly:** without a city hub there is
  no page consolidating a city's authority, so internal linking is lateral (sibling pages)
  and upward from institute pages only. If exam × city pages rank but plateau, a city hub
  is the first thing to add.
- Hand-written editorial copy for top cities. The structure supports it; nobody is writing
  it in this phase.
- Comparison (P1c), reviews (P1d).
- Static prerendering of landing pages. See §11.

## 4. Decisions

| #    | Decision                                                                                                                 | Rationale                                                                                                                                                           | Rejected                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0013 | Root-level flat URLs parsed from a grammar                                                                               | `/jee-coaching-in-pune` is the phrasing people search and competitors use; the `-coaching-in-` infix makes parsing unambiguous even with hyphenated slugs           | `/coaching/jee-coaching-in-pune` (no collision risk, weaker keyword signal, less natural to share); `/pune/jee` (cleanest to reason about, loses the searched phrasing entirely)                |
| 0014 | A page exists at 1 listing but is indexable only at 3; mode variants canonicalise to their parent when result sets match | Keeps full coverage for users and internal links while showing Google only pages with substance. `follow` on thin pages still passes equity down to institute pages | Index everything at 1 (fastest coverage, accepts a doorway pattern across the domain); create only at 3+ (simplest rule, but thin combinations become dead ends for users who arrive by filter) |

## 5. URL grammar

```
/{exam}-coaching-in-{city}            →  /jee-coaching-in-pune
/{mode}-{exam}-coaching-in-{city}     →  /online-jee-coaching-in-pune
```

### Parsing is not a regex

Both exam and city slugs may contain hyphens, so `/jee-advanced-coaching-in-new-delhi` is
ambiguous to any naive pattern — `jee` + `advanced-coaching-in-new-delhi`, or
`jee-advanced` + `new-delhi`?

The `-coaching-in-` infix is the one unambiguous delimiter. The algorithm:

1. Split the slug on `-coaching-in-`. Anything other than exactly two parts is not a
   landing URL.
2. The right part is the city slug.
3. If the left part begins with `online-`, `offline-` or `hybrid-` **and the remainder is a
   known exam slug**, it is a mode variant. Otherwise the whole left part is the exam slug.
   The second condition matters: an exam slug that happens to start with those letters
   still resolves correctly.
4. Resolve both slugs against the database. Unknown exam or city is a 404.

Step 3's ordering is the subtle part, and it is why resolution needs the exam list rather
than being purely syntactic.

### Two layers, two homes

The **grammar** is pure and lives in `packages/shared/src/landing.ts`, so the web app can
build links and the API can parse requests from one definition:

```ts
export const LANDING_INFIX = '-coaching-in-'
export const LANDING_MODE_PREFIXES = ['online', 'offline', 'hybrid'] as const

/// Syntactic parse only — does not know which exams or cities exist. Returns
/// candidates for the caller to resolve, because "online-x" is only a mode
/// variant if "x" is a real exam slug.
export function parseLandingPath(slug: string): LandingCandidate[]

export function buildLandingPath(parts: { examSlug: string; citySlug: string; mode?: Mode }): string
```

`parseLandingPath` returns up to two candidates (with and without a mode interpretation),
ordered most-specific first. **Resolution** — picking the candidate whose slugs exist — is
the API's job, because only it can see the data.

### Route ownership

One route: `apps/web/src/app/[landing]/page.tsx`. Next resolves static segments before
dynamic ones, so `/institutes`, `/sitemap.xml` and `/robots.txt` are unaffected.

This route does own the root namespace: any unmatched root path reaches it and 404s, which
is correct behaviour but means **a future dynamic root sibling would collide**. That
constraint goes in a comment in the file.

## 6. Eligibility, indexability and canonicals

One constant, `LANDING_MIN_INDEXABLE = 3`, exported from `@one/shared` because both the
page (for its robots directive) and the sitemap (for its contents) need it.

| Published listings | Page         | Robots            | Sitemap |
| ------------------ | ------------ | ----------------- | ------- |
| 0                  | `notFound()` | —                 | absent  |
| 1–2                | renders      | `noindex, follow` | absent  |
| 3+                 | renders      | indexable         | present |

Thin pages still exist and still link onward, so a user arriving from a filter or a sibling
link gets a real page, and `follow` keeps passing equity to the institute pages. They are
simply invisible to the index.

### Mode canonicalisation is provable, not heuristic

A mode-filtered result set is always a subset of the unfiltered set for the same exam and
city. Therefore **equal cardinality proves equal membership.**

So when a mode variant's total equals its parent's total, the two pages would show
identical content, and the variant sets `canonical` to the parent. No judgement call, no
content comparison — one integer equality.

This is why the API returns `parentTotal` alongside `total`: the canonical decision needs
both, and the page should not have to make a second request to discover it.

## 7. API surface

One new endpoint, because a landing page needs several things the existing API cannot give
it, and three round trips from a Server Component is worse than one.

```
GET /api/v1/landing?exam={slug}&city={slug}[&mode=ONLINE][&page=1][&limit=20]
```

Returns `landingPageResponse`:

```ts
{
  exam: { slug, label },
  city: { slug, name, state },
  mode: Mode | null,
  listings: Paginated<InstituteSummary>,   // reuses P1a's search path unchanged
  parentTotal: number,                      // same query without the mode filter
  indexable: boolean,                       // listings.total >= LANDING_MIN_INDEXABLE
  canonicalPath: string,                    // itself, or the parent when sets match
  feeStats: { minFeeAmount: number | null; maxFeeAmount: number | null },
  siblings: {
    examsInCity: { slug, label, count, path }[],
    citiesForExam: { slug, name, count, path }[],
    modeVariants: { mode, count, path }[],
  },
}
```

- **404** when the exam or city slug is unknown, or when `listings.total` is 0. The page
  maps that to `notFound()`.
- **`feeStats` spans the whole matching set**, not the visible page. A page showing 20 of
  60 institutes must still say "fees from ₹25,000", which the per-listing aggregates on the
  current page cannot tell it.
- **`examsInCity` is nearly free.** P1a's `examFacets` already omits its own filter, so
  facets with the city filter applied and the exam filter omitted return every exam
  available in that city with counts.
- **`listings` uses the standard pagination defaults** — page 1, limit 20, max 50.

### Siblings exclude the current page, and ignore mode

Three rules, all of which exist to stop a page linking to itself or to a near-duplicate:

- **`examsInCity` excludes the current exam.** `examFacets` includes it, because omitting
  the exam filter counts every exam in the city — so the service filters the current exam
  out before responding. Without this, every page links to itself.
- **`citiesForExam` excludes the current city**, for the same reason.
- **Both ignore the `mode` filter.** From `/online-jee-coaching-in-pune`, the sibling links
  point at `/neet-coaching-in-pune` and `/jee-coaching-in-mumbai`, not at their online
  variants. Siblings move along one taxonomy axis at a time; compounding mode into lateral
  links multiplies the graph for no additional search intent.
- **`modeVariants` excludes the current mode**, and excludes any variant that would
  canonicalise to the page it is linked from.

### `canonicalPath` in full

| Page                                       | `canonicalPath`                            |
| ------------------------------------------ | ------------------------------------------ |
| Exam × city                                | itself                                     |
| Mode variant where `total < parentTotal`   | itself — the mode filter genuinely narrows |
| Mode variant where `total === parentTotal` | the parent exam × city path                |

A second endpoint feeds the sitemap:

```
GET /api/v1/landing/indexable   →  { paths: string[] }
```

Only combinations at or above the threshold. Distinct path, so no routing conflict with
`/landing`.

### New aggregates

Four, all in `institutes.landing.repository.ts` — named to match the repository glob so the
R1/R3 lint rule keeps permitting its `@one/db` import and rejecting it elsewhere:

| Function                | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `feeStatsForFilters`    | min and max published batch fee across the whole matching set                   |
| `citiesForExam`         | cities with published listings for an exam, with counts — powers lateral links  |
| `modeCountsFor`         | per-mode counts for one exam × city, to decide which variants are worth linking |
| `indexableCombinations` | exam × city groups at or above the threshold, for the sitemap                   |

`citiesForExam` and `indexableCombinations` are closely related group-by queries; both
exist because one is scoped to a single exam and the other spans everything.

### Module ownership

All of this sits in the **institutes** module as `institutes.landing.*`. Exam × city is
institute-vertical taxonomy — hostels will want location × room type or similar — so it
belongs behind the vertical seam from ADR 0004 rather than in the shared listing core.

## 8. Internal linking

The part that does the actual SEO work, and nearly free once the data exists.

| From                      | To                                | Source                               |
| ------------------------- | --------------------------------- | ------------------------------------ |
| Landing page              | other exams in the same city      | `siblings.examsInCity`               |
| Landing page              | the same exam in other cities     | `siblings.citiesForExam`             |
| Landing page              | its own worthwhile mode variants  | `siblings.modeVariants`              |
| **Institute detail page** | **its city × exam landing pages** | built locally from `instituteDetail` |

The last row matters most and costs nothing: `instituteDetail` already carries `city.slug`
and `exams[]`, so the detail page builds those paths with `buildLandingPath` and needs no
API change. It turns every institute page into an entry point to the landing graph, which
is the direction crawl budget should flow.

A mode variant is only linked when it is eligible **and** not canonicalised away —
otherwise the page would link to a near-duplicate of itself.

## 9. Sitemap

`apps/web/src/app/sitemap.ts` gains indexable landing paths from
`GET /api/v1/landing/indexable`. It stays `force-dynamic`, so a build still never depends
on the API being reachable.

**Thin pages are excluded.** Listing a `noindex` URL in a sitemap tells Google two
contradictory things, which is worse than saying nothing.

**No sitemap index yet.** At 5,000 institutes plus a few hundred landing pages the total is
far below the 50,000-URL limit, and `generateSitemaps` is a mechanical change when it is
approached. The trigger to split is crossing roughly 40,000 URLs, not a guess about future
growth.

## 10. Metadata and structured data

Everything derives from data, so each page is unique without any generated prose:

- **Title:** `JEE Coaching in Pune` — mode variants prefix it: `Online JEE Coaching in Pune`
- **Description:** built from the real count and fee floor, e.g. "Compare 12 JEE coaching
  institutes in Pune. Fees from ₹25,000, with upcoming batches and schedules."
- **Robots:** default when indexable, `{ index: false, follow: true }` below the threshold
- **Canonical:** `canonicalPath` from the API — itself, or the parent for a duplicate mode
  variant
- **JSON-LD:** `BreadcrumbList` (Home → Institutes → this page) and an `ItemList` of the
  institutes on the page, each with position, name and URL

## 11. Caching and rendering

Landing pages are dynamic with ISR, not statically prerendered. `generateStaticParams` over
every eligible combination would give better TTFB, but it would make `next build` depend on
a reachable API — the coupling deliberately avoided for the sitemap in P1a. The TTL comes
from `API_CACHE_TTL` (default 300) like every other public page.

If landing-page TTFB later proves to be the SEO bottleneck, prerendering the top N
combinations is a contained follow-up, not a redesign.

## 12. Testing

| Layer              | Coverage                                                                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit (grammar)** | Round-trip parse and build; hyphenated exam slugs (`jee-advanced`); hyphenated city slugs (`new-delhi`); both at once; mode-prefix ambiguity where the exam itself starts with `online-`; rejection of garbage, of a missing infix, and of a doubled infix |
| Integration        | Each eligibility band: 0 → 404, 1–2 → `indexable: false`, 3+ → `indexable: true`                                                                                                                                                                           |
| Integration        | Mode canonical collapses when counts are equal, and does **not** when the mode filter actually narrows                                                                                                                                                     |
| Integration        | `feeStats` reflects the whole set, not just page 1 — assert with more listings than fit on a page                                                                                                                                                          |
| Integration        | `examsInCity` excludes the current exam and `citiesForExam` excludes the current city, so no page links to itself                                                                                                                                          |
| Integration        | Siblings ignore the mode filter: the same links appear on a page and on its mode variant                                                                                                                                                                   |
| Integration        | `citiesForExam` counts only published listings                                                                                                                                                                                                             |
| Integration        | `/landing/indexable` returns only combinations at or above the threshold                                                                                                                                                                                   |
| E2E                | A landing page renders with its listings and sibling links; a thin page is `noindex`; an unknown combination 404s; an institute detail page links to its landing pages; the sitemap contains an indexable path and excludes a thin one                     |

The grammar unit tests carry the most weight. Everything else in this phase is a
straightforward read path; the parser is the part with genuine edge cases.

## 13. What this leaves for the rest of P1

| Phase | Scope                                                                   | Depends on                                |
| ----- | ----------------------------------------------------------------------- | ----------------------------------------- |
| P1c   | Comparison: select 2–4 listings, project comparable attributes (BR-008) | A rich result set to select from          |
| P1d   | Reviews, ratings and student accounts; restores `sort=rating` (BR-006)  | A second auth surface; sequenced after P2 |

Deferred from this phase and worth revisiting in order: city hubs (if exam × city pages
plateau), locality pages (needs a `Locality` entity), hand-written copy for top cities, and
prerendering the highest-value combinations.

## 14. Open items

- **Fee-floor phrasing in descriptions** assumes a meaningful minimum exists. Pages whose
  entire set has no published batches show no fee sentence; the copy must degrade rather
  than print "Fees from null".
- **The threshold of 3 is a judgement, not a measurement.** Revisit once Search Console
  shows how these pages actually perform; it is one exported constant.
- Whether mode variants earn their keep at all is an empirical question. If none of them
  ever rank, removing them is cheaper than maintaining them.
