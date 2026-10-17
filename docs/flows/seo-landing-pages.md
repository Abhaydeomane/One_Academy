# Flow: SEO landing pages

Last verified against commit: a7f16839cf9202b2a01bfddd78d797b9f2269d06

## Purpose

How `/jee-coaching-in-pune` and its mode variants are resolved, rendered, linked to each
other and selectively indexed. These pages exist to capture the phrase people actually
search, so every decision here is about what Google sees — the user-facing content is a
by-product of getting that right.

The two decisions that shape the whole flow: the URL is parsed from a grammar
(ADR 0013), and a page exists at one listing but is only indexed at three (ADR 0014).

## Actors and entry points

- Anonymous visitor arriving from a search result at `/<exam>-coaching-in-<city>`
- The same visitor moving laterally through sibling rails, or arriving from an institute
  detail page's breadcrumb links
- Google crawler, via `/sitemap.xml`

## Sequence

**Resolve and render**

```
apps/web/src/app/[landing]/page.tsx               owns the root namespace
  → packages/shared/src/landing.ts                parseLandingPath() — cheap reject
  → apps/web/src/lib/api.ts                       apiGetOptional(landingPageResponse)
  → GET /api/v1/landing?path=/jee-coaching-in-pune
  → apps/api/src/modules/institutes/institutes.routes.ts
  → apps/api/src/modules/institutes/institutes.landing.service.ts
      parseLandingPath → resolve candidates against the DB → eligibility → canonical
  → apps/api/src/modules/institutes/institutes.landing.repository.ts
      findExamBySlug, findCityBySlug, feeStats, examFacets, cityFacets, modeFacets
  → apps/api/src/modules/institutes/institutes.search.repository.ts
      searchPublished() — the same query that powers /institutes
```

The web app rejects anything that fails the grammar before spending a request, then calls
`notFound()` if the API answers 404. Because `/[landing]` is a dynamic root segment, every
unmatched root path lands here — a 404 is the correct outcome, not an error.

Resolution cannot be purely syntactic. `parseLandingPath` returns **ranked candidates**
(mode-prefixed readings first, then the bare reading), because `online-jee` could be mode
`ONLINE` plus exam `jee` or an exam slugged exactly that. The service takes the first
candidate whose exam and city both exist in the database.

Results come from `searchPublished` — the P1a search query, unchanged. A landing page is a
pre-built filter over the same index, not a second code path, so BR-009 holds here for free.

**Eligibility and canonical**

```
institutes.landing.service.ts
  total          = listings.total                    from searchPublished
  parentTotal    = searchPublished({ ...filters, mode: undefined }, { take: 1 })
  indexable      = total >= LANDING_MIN_INDEXABLE    packages/shared/src/landing.ts
  canonicalPath  = mode && total === parentTotal ? parentPath : selfPath
```

`parentTotal` is fetched with `take: 1`, never `0` — `searchPublished` reads the total off
the first row, so a page of zero rows reports no total.

The canonical rule is a proof rather than a heuristic: a mode-filtered set is always a
subset of the unfiltered set for the same exam and city, so equal cardinality entails equal
membership. One integer comparison replaces any content comparison.

**Sibling links**

```
institutes.landing.service.ts
  siblings.examsInCity    examFacets({ ...filters, mode: undefined })   other exams, same city
  siblings.citiesForExam  cityFacets(filters)                           same exam, other cities
  siblings.modeVariants   modeFacets(filters)                           narrowings that differ
  → apps/web/src/app/[landing]/SiblingRail.tsx
```

Each rail omits the current page, so no page ever links to itself. `examsInCity` drops
`mode` deliberately: an offline Pune page should still surface NEET in Pune, and keeping
the mode filter would hide every sibling with no offline presence.

A mode variant that would canonicalise to its parent is omitted from `modeVariants`, so the
graph contains no link to a near-duplicate.

These pages also carry the comparison checkboxes and `CompareBar`, identically to
`/institutes` — this is where high-intent traffic lands, so omitting comparison here would
waste it. See `comparison.md`.

**Sitemap**

```
apps/web/src/app/sitemap.ts
  → GET /api/v1/landing/indexable
  → institutes.landing.service.listIndexablePaths()
```

The endpoint returns only paths at or above the threshold. A `noindex` URL in a sitemap
tells Google two contradictory things, which is worse than omitting it.

## Diagram

A fan: one request to `/[landing]`, out to the landing service, which issues one
`searchPublished` for the page's own rows, one `take: 1` probe for the parent total, and
three facet queries for the rails — then collapses back into a single response carrying
`indexable` and `canonicalPath` as resolved booleans and strings, so the page component
makes no SEO decisions of its own.

## Business rules invoked

BR-005, BR-009

## Failure modes

| Condition                                    | API response                          | What the user sees                                          |
| -------------------------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| Path does not match the grammar              | — (rejected in the web app)           | 404                                                         |
| Exam or city slug does not exist             | 404 `NOT_FOUND`                       | 404                                                         |
| Combination exists but has no published rows | 404 `NOT_FOUND`                       | 404 — an empty landing page is worth nothing                |
| 1–2 published rows                           | 200, `indexable: false`               | Normal page; `noindex, follow` in the head                  |
| Mode variant identical to its parent         | 200, `canonicalPath` = parent         | Normal page; canonical points at the parent                 |
| Set has no published batches                 | 200, `feeStats.minFeeAmount: null`    | Fee sentence is omitted rather than printing `null`         |
| A sibling drops below the threshold          | 200, still linked with its real count | Link works; that page serves `noindex`                      |
| API unreachable during a build               | —                                     | Sitemap is `force-dynamic`; the build does not depend on it |

## Related flows

`institute-discovery.md` — the search query these pages are a pre-built filter over, and
where a visitor goes next.

`comparison.md` — these pages carry the same comparison checkboxes, because this is where
high-intent traffic lands.
