# Flow: Institute discovery

Last verified against commit: c339be4baf399c2bd8494a7c3526187bcc95c836

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
  → apps/web/src/lib/api.ts            apiGet(listInstitutesQuery → instituteListResponse)
  → GET /api/v1/institutes
  → apps/api/src/modules/institutes/institutes.routes.ts
  → apps/api/src/modules/institutes/institutes.service.ts        listPublished()
  → apps/api/src/modules/institutes/institutes.repository.ts     status=PUBLISHED (BR-009)
  → apps/api/src/modules/batches/batches.repository.ts           published batch counts
```

Filters render as a chip rail in `apps/web/src/app/institutes/FilterRail.tsx`; each chip is
a link that rewrites the query string, so filtering needs no client JavaScript.

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

| Condition                                        | API response              | What the user sees                                 |
| ------------------------------------------------ | ------------------------- | -------------------------------------------------- |
| Slug is DRAFT or unknown                         | 404 `NOT_FOUND`           | `not-found.tsx` — "Institute not found"            |
| Slug was renamed before publication              | 301 to the canonical slug | Transparent redirect                               |
| Phone is not 10 digits                           | 400 `VALIDATION_FAILED`   | Inline field error, caught client-side first       |
| `batchId` belongs to another listing             | 400 `VALIDATION_FAILED`   | Generic form error                                 |
| More than 10 enquiries in an hour from one IP    | 429 `RATE_LIMITED`        | "Too many requests. Please try again later."       |
| Listing unpublished between page load and submit | 404 `NOT_FOUND`           | "This institute is no longer accepting enquiries." |
| API unreachable                                  | —                         | Next.js error boundary                             |

## Related flows

`listing-lifecycle.md` — how a listing becomes publicly visible in the first place.
