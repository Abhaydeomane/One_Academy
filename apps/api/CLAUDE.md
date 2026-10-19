# apps/api

Express 5 REST API. Vertical slices in `src/modules/<module>/`, strictly layered inside
each slice. The only workspace that writes to Postgres.

## Adding an endpoint, in order

1. Define its Zod schemas in `packages/shared/src/contracts/<module>.ts` and export the
   inferred types.
2. Add the query to `<module>.repository.ts`. Return a plain row type, never a Prisma
   model type, so Prisma stays replaceable.
3. Put the business rule in `<module>.service.ts`. Throw `AppError` subclasses with a
   domain-specific code so the UI can explain the failure.
4. Add the route to `<module>.routes.ts` (or `.partner.routes.ts` / `.admin.routes.ts`),
   wrapped in `validate({ ... })`, reading input via `validated<T>(req, 'params')`.
5. Mount the router in `src/server.ts` if the module is new.
6. Write the integration test in `<module>.routes.test.ts` against real Postgres.
7. Register the path in `packages/shared/scripts/gen-openapi.ts` and regenerate, or CI
   fails on a stale spec.

## Routes group by resource, never by audience

A module has **one** service and **one** repository shared by its public, partner and
admin route files. Splitting by audience would put two callers of the same business rule in
different modules and guarantee they diverge. The admin moderation queue is therefore
`listings.admin.routes.ts`, not an `admin` module.

Because R4 bars a route from reaching into another module, a route that needs another
module's data calls a delegating function on its own service — see
`institutes.service.listPublishedBatchesBySlug`, which exists for exactly that reason.

## Clerk organisation ids are not local ids

`req.auth.orgId` is a **Clerk** organisation id. Translate it with each module service's
`resolveOrganizationId()` before any database query. An organisation Clerk knows but the mirror
has not seen is provisioned on demand from Clerk (`lib/clerk.ts`); it is never matched by
slug (ADR 0016).

## Tests

Migrate the test database after every new migration, or integration tests run against a
stale schema:

    DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" \
      pnpm --filter @one/db exec prisma migrate deploy

`requireAuth` honours an `x-test-auth` header **only when `NODE_ENV=test`**, so tests
exercise the real authorization logic without depending on live Clerk sessions. This is
the one deliberate test seam in the API; never rely on it elsewhere.

The enquiry rate limit is raised under test so repeated suite runs are not throttled.

## One documented exception: the search query reads Batch

`institutes.search.repository.ts` reads the `Batch` table directly, which the batches
module would normally own. Filtering and sorting on a joined aggregate cannot be composed
across two services — the aggregate has to exist inside the query that orders and
paginates, because you cannot sort by a value you fetch afterwards.

This is the only such exception. **If a second query needs the same thing, do not add
another one**: denormalise `minFeeAmount` / `maxFeeAmount` / `publishedBatchCount` onto
`Listing` with triggers, the same mechanism `searchVector` uses (ADR 0011). That was
considered during P1a and rejected as premature for a query shape appearing once.

The single-listing case goes through `batches.service.feeSummaryForListing` and respects
the boundary normally.

## Comparison

`institutes.compare.{routes,service,repository}.ts` serve `GET /api/v1/compare`. Read
`docs/flows/comparison.md` and ADR 0015 before changing them.

- **Mounted at `/api/v1/compare`, not under `/api/v1/institutes`.** `institutesRouter`
  already declares `GET /:slug`, which would shadow it the moment a listing is slugged
  `compare`. ADR 0004 governs where the code lives, not what the URL looks like.
- **Separate rot from tampering — this is the central judgement.** A pin that is gone, has
  started, or was unpublished is the expected fate of a shared link: fall back to the
  default and set `pinFellBack`. A pin naming a _published_ batch of a different institute
  is a 400. A draft batch elsewhere is treated as rot, because confirming it would leak the
  existence of unpublished content.
- **A stale slug is dropped and reported, never fatal**, until fewer than two survive.
  `dropped[]` is part of the contract so the UI can explain a link the student was sent.
- **This route never answers 301.** `fetch` follows redirects transparently, so the
  browser would keep the stale URL (BUG-001). Return `canonicalSlugs` as data and let the
  page redirect.
- **R4**: batch data comes only through `batches.service` —
  `listUpcomingPublishedForListing`, `belongsToListing`, `findPublishedById`.
- **Upcoming means `startDate >= now()`, and only comparison knows that.** Search cards,
  landing cards and the detail page all say "upcoming" while counting every published batch
  (BUG-002). Tightening that predicate globally moves P1a/P1b fee expectations and can drop
  landing pages below `LANDING_MIN_INDEXABLE`, so it is not done here. **A search card may
  report more batches than the comparison does. Comparison is correct — do not "fix" the
  divergence by making comparison count past batches.**

## Landing pages reuse the search query

`institutes.landing.service.ts` and `institutes.landing.repository.ts` serve
`/api/v1/landing` and `/api/v1/landing/indexable`. Read
`docs/flows/seo-landing-pages.md` before changing them.

- **A landing page is a pre-built filter, not a second code path.** Results come from
  `searchPublished` in `institutes.search.repository.ts`. `wherePredicates`, `queryCte`,
  `baseJoins` and `Omitted` are exported from it so the landing aggregates filter on
  exactly the same conditions. If you change what a filter means, change it once, there.
- **The endpoint takes the raw `path`, not pre-split parameters.** `parseLandingPath`
  returns ranked candidates because `online-jee` is ambiguous, and only the database can
  pick (ADR 0013). Splitting in the web app would cost a round trip per guess.
- `baseJoins()` emits only `FROM` and `JOIN`s. A predicate after it must start with
  **`WHERE`** — an `AND` attaches to the trailing `LEFT JOIN`'s `ON` clause, which is valid
  SQL that silently stops filtering. That bug leaked a DRAFT listing's fee once.
- The parent-total probe uses **`take: 1`, never `0`**: `searchPublished` reads the total
  off the first row, so an empty page reports no total.
- `examFacets` is called with `{ ...filters, mode: undefined }`. Keeping the mode would hide
  every sibling exam with no presence in that mode.
- Eligibility and canonicals are **resolved here and returned as booleans and strings**.
  The web app must not recompute them. The threshold is `LANDING_MIN_INDEXABLE` in
  `@one/shared`, used by both the page and the sitemap (ADR 0014).

## The one hand-written SQL file

`institutes.search.repository.ts` holds all three raw queries: matching, exam facets, mode
facets. It is named `*.repository.ts` so the R1/R3 lint rule permits its `@one/db` import
and keeps rejecting that import everywhere else.

- **Every value goes through `Prisma.sql` interpolation**, which parameterises it. Never
  build a fragment by concatenating a string that came from a request. A test submits SQL
  metacharacters as a search term and asserts the tables survive.
- **`count()` and `count(*) OVER ()` return `bigint`.** Convert with `Number()` before the
  value reaches a Zod schema, or validation fails with a type error that reads as
  unrelated.
- **Fee filtering is an `EXISTS` over individual batch rows**, never a comparison against
  the min/max aggregate. The aggregate tests whether a listing's fee _interval_ overlaps
  the range, which is a different question: a listing with batches at ₹25,000 and
  ₹1,00,000 would match a ₹40,000–₹50,000 filter despite having nothing in that band.

## Listing moderation (P2b)

Read `docs/flows/listing-lifecycle.md` and ADRs 0016–0018 before changing transitions.

- **Every status transition is an `updateMany` guarded on the status it starts from.** Zero
  rows changed means another decision won: throw `INVALID_STATUS_TRANSITION`.
- **"Has this listing been public?" is `hasEverBeenPublished` (`firstPublishedAt`), never a
  status check.** The slug and city freezes depend on it, and so does where a listing
  leaving review goes (`returnStatusFor`). `publishedAt` is reset on every publish and drives
  the "recent" sort; do not reuse it.
- **Call `revalidatePublicPages()` after any write that changes what the public sees**, once
  the write has committed. It never throws; surface its result where an admin needs to
  know.
- Partner edits go through `ensureReviewBaseline` before and `recordPartnerEdit` after the
  write (BR-018). A new editable listing field the public reads belongs in
  `WATCHED_LISTING_FIELDS`.
