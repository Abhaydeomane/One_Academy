# Flow: Institute discovery

Last verified against commit: dc2e9ee7706c17bb3769feaf99d263d55898e875

## Purpose

How an anonymous student finds an institute, reads its batches and submits an enquiry.
This is the acquisition path, so every step is cacheable, indexable and mobile-first.

## Actors and entry points

- Anonymous visitor arriving from search at `/institutes/<slug>`, or browsing `/institutes`
- Google crawler, via `/sitemap.xml` and `/robots.txt`

## Sequence

**List**

```
apps/web/src/app/institutes/page.tsx
  → apps/web/src/app/institutes/SearchForm.tsx            GET form; the URL is the state
  → apps/web/src/app/institutes/FilterRail.tsx            chips carry facet counts
  → apps/web/src/lib/api.ts            apiGet(listInstitutesQuery → instituteListResponse)
  → GET /api/v1/institutes
  → apps/api/src/modules/institutes/institutes.routes.ts
  → apps/api/src/modules/institutes/institutes.service.ts         resolveSort, order preserved
  → apps/api/src/modules/institutes/institutes.search.repository.ts
                                       tsvector match, ts_rank, fee aggregate, facets
  → apps/api/src/modules/institutes/institutes.repository.ts      typed projection by id
```

Search and filtering need no client JavaScript: the box is a `GET` form and every chip is a
link that rewrites the query string (ADR 0012). The raw query selects and orders the ids;
Prisma then projects those rows through the typed `SELECT`, and the service restores the
rank order because `IN` does not preserve it.

Free text matches institute name (weight A), exam labels (B), locality and city (C) and
the description (D), via a trigger-maintained `tsvector` (ADR 0011). Facet counts omit
their own filter, so selecting JEE still reports NEET's count.

**Detail**

```
apps/web/src/app/institutes/[slug]/page.tsx
  → GET /api/v1/institutes/:slug
  → institutes.service.getPublishedBySlug()
  → apps/api/src/modules/listings/listings.service.ts   resolvePublishedSlug() — BR-002, BR-009
  → institutes.repository.findPublishedById()
```

An old slug resolves through `ListingRedirect` and the route answers 301 with the
canonical URL.

**Batches**

```
GET /api/v1/institutes/:slug/batches
  → institutes.service.listPublishedBatchesBySlug()    delegates, because R4 bars the
  → apps/api/src/modules/batches/batches.service.ts    route from another module
  → batches.repository.listPublishedByListing()        status=PUBLISHED only
```

**Enquiry**

```
apps/web/src/app/institutes/[slug]/EnquiryForm.tsx
  → apps/web/src/app/institutes/[slug]/actions.ts      validates with createEnquiryBody
  → POST /api/v1/enquiries                             rate limited 10/hour/IP
  → apps/api/src/modules/enquiries/enquiries.routes.ts
  → apps/api/src/modules/enquiries/enquiries.service.ts    resolvePublishedSlug → BR-009
  → apps/api/src/modules/enquiries/enquiries.repository.ts
```

The form validates with the same schema the API enforces, so a malformed phone number is
reported without a round trip.

## Diagram

A sequence diagram: visitor → web Server Component → API route → service → repository →
Postgres, with the `status = PUBLISHED` filter applied at the repository boundary and the
301 redirect branching out of `resolvePublishedSlug`.

## Business rules invoked

BR-002, BR-005, BR-009

## Failure modes

| Condition                                        | API response                            | What the user sees                                                  |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------- |
| Slug is DRAFT or unknown                         | 404 `NOT_FOUND`                         | `not-found.tsx` — "Institute not found"                             |
| Slug was renamed before publication              | 301 to the canonical slug               | Transparent redirect                                                |
| Phone is not 10 digits                           | 400 `VALIDATION_FAILED`                 | Inline field error, caught client-side first                        |
| `batchId` belongs to another listing             | 400 `VALIDATION_FAILED`                 | Generic form error                                                  |
| More than 10 enquiries in an hour from one IP    | 429 `RATE_LIMITED`                      | "Too many requests. Please try again later."                        |
| Listing unpublished between page load and submit | 404 `NOT_FOUND`                         | "This institute is no longer accepting enquiries."                  |
| API unreachable                                  | —                                       | Next.js error boundary                                              |
| Free-text query matches nothing                  | 200, empty list and empty facets        | "No institutes match …" plus an offer to clear the narrowing filter |
| Query is a near-miss spelling                    | 200, empty list                         | Nothing — Postgres full-text has no typo tolerance (ADR 0010)       |
| `feeMin` greater than `feeMax`                   | 400 `VALIDATION_FAILED`                 | Unreachable from the UI, which only emits preset buckets            |
| A filter combination has no results              | 200, empty list, facets still populated | Counts on the other chips show where results do exist               |

## Related flows

`listing-lifecycle.md` — how a listing becomes publicly visible in the first place.
