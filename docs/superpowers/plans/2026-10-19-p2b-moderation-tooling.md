# P2b Moderation Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin suspend and reinstate a live listing with instant effect on the public site, lock listings while in review, and surface what a published institute has changed since approval.

**Architecture:** New listing transitions (suspend, reinstate, resubmit-from-suspended, withdraw) as conditional writes in `listings.repository`, following ADR 0016. A `firstPublishedAt` column replaces status checks for the slug and city freezes. A JSON snapshot of the watched fields, taken at approval, is diffed against current values to flag and display post-publication edits. The API calls a secret-protected route handler on `apps/web` that expires the single `listings` fetch-cache tag.

**Tech Stack:** Zod 4.6.5, Express 5.3.0, Prisma 7.10.0, Next.js 16.4.0 App Router, React 19.3.0, Tailwind 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-p2b-moderation-tooling-design.md`

## Global Constraints

- Work on branch `p2b-moderation`, never on `main`. Conventional commits; the final docs commit references `REQ-002`.
- R1–R6 from `CLAUDE.md` hold: only `*.repository.ts` imports `@one/db`; services never import `express`; cross-module access goes through the other module's service; every route input validated with a `@one/shared` schema; only `AppError` subclasses are thrown.
- Every listing status transition is an `updateMany` guarded on the expected status; zero rows changed → `ConflictError('INVALID_STATUS_TRANSITION', …)`.
- Reasons (suspend, reject) are trimmed, 10–500 characters.
- After every new migration, migrate the test DB: `DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" pnpm --filter @one/db exec prisma migrate deploy`.
- Every new or changed API path is registered in `packages/shared/scripts/gen-openapi.ts`, then `pnpm --filter @one/shared gen:openapi`.
- Never mock the database. The only mocks permitted are `lib/clerk.ts` (existing) and `next/cache` in the web route test.
- Each task ends with `pnpm verify` green before its commit.
- Next 16: `revalidateTag(tag)` with one argument is deprecated and `'max'` serves stale content once. Use `revalidateTag('listings', { expire: 0 })`.
- Mobile first: one column, `tap-target`, 16px inputs; copy exactly as the spec gives it.

## Review Focus

1. **A partner renames a SUSPENDED listing** — the slug must not change. (Task 1 test `keeps the slug when a suspended listing is renamed`.)
2. **The revalidation call hangs or the web app is down** — the admin's suspend must still succeed within ~2 s and report `publicCacheCleared: false`. (Task 5 test `reports false and still suspends when the web app is unreachable`.)
3. **The partner edits again between the admin opening the diff and pressing "Looks fine"** — must be `409 REVIEW_STALE`, not a silent re-baseline. (Task 4 test `409s REVIEW_STALE when the change token is old`.)
4. **An edit that touches only unwatched fields, or re-saves identical values** — must not flag the listing. (Task 4 tests `does not flag an edit that changes nothing watched` and `clears the flag when an edit restores the snapshot`.)
5. **Exam or mode order changes without content changing** — `['NEET','JEE']` vs `['JEE','NEET']` is not a change. (Task 4 unit test `treats arrays as sets`.)

---

### Task 1: `firstPublishedAt` and the amended slug/city freeze (BR-002)

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (`Listing`)
- Create: migration `listing_first_published_at` via `pnpm --filter @one/db db:migrate --name listing_first_published_at`
- Modify: `packages/db/prisma/seed.ts` (set `firstPublishedAt` next to each `publishedAt`)
- Modify: `apps/api/test/helpers/db.ts` (`seedMinimal` published listing gets `firstPublishedAt`)
- Modify: `apps/api/src/modules/listings/listings.repository.ts`, `listings.service.ts`
- Modify: `apps/api/src/modules/institutes/institutes.repository.ts`, `institutes.service.ts`
- Test: `apps/api/src/modules/institutes/institutes.partner.routes.test.ts`, `apps/api/src/modules/listings/listings.service.test.ts`, `listings.admin.routes.test.ts`

**Interfaces:**

- Produces: `Listing.firstPublishedAt DateTime?` (doc comment: "Set on the first publish only; never overwritten or cleared. Defines 'has ever been public' (BR-002)."); `ListingCore.firstPublishedAt: Date | null` and `CORE_SELECT` includes it; `PartnerListingRow.firstPublishedAt: Date | null`; `listings.service.hasEverBeenPublished(listing: { firstPublishedAt: Date | null }): boolean`.

- [ ] **Step 1: Add the column and migration.** Hand-append to the generated `migration.sql`:

```sql
UPDATE "Listing" SET "firstPublishedAt" = COALESCE("publishedAt", "updatedAt")
WHERE "status" IN ('PUBLISHED', 'SUSPENDED');
```

Migrate the test DB (Global Constraints).

- [ ] **Step 2: Write failing tests**

In `institutes.partner.routes.test.ts`, describe `BR-002 amended`:

- `keeps the slug when a suspended listing is renamed` — set the seeded published listing to `status: 'SUSPENDED'` via prisma; PATCH `{ name: 'Alpha Academy Renamed' }` as its org → 200; `slug` still `'alpha-academy'`, name changed.
- `keeps the slug when a once-published listing back in DRAFT is renamed` — `status: 'DRAFT'` with `firstPublishedAt` set; same assertions.
- `refuses a city change on a suspended listing` — create a second city; PATCH `{ citySlug }` → 409 `CITY_IMMUTABLE`.
- `still regenerates the slug of a never-published draft` — existing behaviour on `seed.draftListingId`, keep or add.

In `listings.admin.routes.test.ts`:

- `sets firstPublishedAt on first publish and never moves it` — PENDING_REVIEW draft → publish → `firstPublishedAt` equals `publishedAt`; set it back to PENDING_REVIEW via prisma, publish again → `publishedAt` moved, `firstPublishedAt` unchanged.

In `listings.service.test.ts`: `changeSlug refuses a SUSPENDED listing that was published` → `SLUG_IMMUTABLE`.

- [ ] **Step 3: Run** `pnpm --filter @one/api test -- institutes.partner listings` — expect the new tests to FAIL.

- [ ] **Step 4: Implement.**
  - `publishAndVerify`: inside the transaction, after the listing write succeeds, `tx.listing.updateMany({ where: { id, firstPublishedAt: null }, data: { firstPublishedAt: at } })`.
  - `hasEverBeenPublished` in `listings.service.ts`; `changeSlug` uses it instead of `status === 'PUBLISHED'`.
  - `institutes.service.updateForOrg`: replace both `current.status !== 'DRAFT'` (city) and `current.status === 'DRAFT'` (slug regeneration) with `hasEverBeenPublished(current)`. Update the comment above the slug block to say "never been public (`firstPublishedAt` is null)".
  - Add `firstPublishedAt` to `PARTNER_SELECT` / `PartnerListingRow`.

- [ ] **Step 5: Run** the same tests → PASS; then `pnpm verify` → green.

- [ ] **Step 6: Commit** `fix(api): freeze slug and city on first publication, not current status`

---

### Task 2: Suspend and lift suspension (BR-015, BR-016 direct path)

**Files:**

- Modify: `packages/db/prisma/schema.prisma`; migration `listing_suspension` (`suspensionReason String?`, `suspendedAt DateTime?`, `suspendedByClerkUserId String?`, doc comments as spec §4)
- Modify: `packages/shared/src/contracts/admin.ts`, `packages/shared/src/contracts/partner.ts`
- Modify: `apps/api/src/modules/listings/listings.repository.ts`, `listings.service.ts`, `listings.admin.routes.ts`
- Modify: `apps/api/src/modules/institutes/institutes.repository.ts`, `institutes.service.ts` (partner summary gains `suspensionReason`)
- Modify: `packages/shared/scripts/gen-openapi.ts`
- Test: `listings.admin.routes.test.ts`, `packages/shared/src/contracts/contracts.test.ts`, `institutes.routes.test.ts`, `enquiries.routes.test.ts`

**Interfaces:**

- Produces (shared):
  - `suspendListingBody = z.object({ reason: z.string().trim().min(10).max(500) })`, `SuspendListingBody`.
  - `adminListingSummary` gains `suspensionReason: z.string().nullable()`.
  - `adminListingDetail` gains `suspendedAt: z.iso.datetime().nullable()`, `firstPublishedAt: z.iso.datetime().nullable()`.
  - `partnerListingSummary` gains `suspensionReason: z.string().nullable()`; `partnerListingDetail` gains `firstPublishedAt: z.iso.datetime().nullable()`.
- Produces (API):
  - `repo.markSuspended(id: string, reason: string, at: Date, adminClerkUserId: string): Promise<number>` — guarded on PUBLISHED.
  - `repo.markReinstated(id: string): Promise<number>` — guarded on SUSPENDED; sets PUBLISHED and nulls the three suspension columns.
  - `publishAndVerify` also nulls the three suspension columns.
  - `listings.service.suspendAsAdmin(listingId: string, reason: string, adminClerkUserId: string): Promise<AdminListingSummary>`
  - `listings.service.reinstateAsAdmin(listingId: string): Promise<AdminListingSummary>`
  - Routes `POST /api/v1/admin/listings/:listingId/suspend` (body `suspendListingBody`) and `.../reinstate` (no body).
    (Task 5 widens both return types to `AdminDecisionResponse`.)

- [ ] **Step 1: Write failing tests** in `listings.admin.routes.test.ts`, describe `POST …/suspend (BR-015)`:
  - `403s a non-admin and leaves the listing PUBLISHED`
  - `suspends a published listing with the reason, time and admin` — 200; DB row has `status: 'SUSPENDED'`, `suspensionReason` = trimmed reason, `suspendedAt` set, `suspendedByClerkUserId: 'u-admin'`.
  - `400s a reason shorter than 10 characters after trimming` — `'   short   '`.
  - it.each over `['DRAFT', 'PENDING_REVIEW', 'SUSPENDED']`: `409s from <status>` with `INVALID_STATUS_TRANSITION`.
  - `lets exactly one of two concurrent suspends win` — `Promise.all` of two suspends → statuses sorted `[200, 409]`.

  Describe `POST …/reinstate (BR-016)`:
  - `returns a suspended listing to PUBLISHED and clears the suspension` — all three columns null.
  - `409s a listing that is not suspended`.
  - `suspend racing reinstate yields one success` — start from SUSPENDED; `Promise.all([reinstate, reinstate])` → `[200, 409]`.

  In `institutes.routes.test.ts` and `enquiries.routes.test.ts`, extend the existing BR-009 cases with a SUSPENDED listing: public detail 404, its batches 404, absent from `GET /api/v1/institutes`, enquiry POST 404. Add a SUSPENDED case to the landing and compare BR-009 tests if they exist; otherwise one assertion each that a suspended listing's slug is dropped from compare and not counted on its landing page.

  In `contracts.test.ts`: `suspendListingBody trims and bounds the reason` (9 chars after trim fails, 10 passes, 501 fails).

- [ ] **Step 2: Run** `pnpm --filter @one/shared test && pnpm --filter @one/api test -- listings institutes enquiries` → new tests FAIL.

- [ ] **Step 3: Implement** the migration (migrate the test DB), contracts, repository functions, service functions (mirror `rejectAsAdmin`: status pre-check for a precise message, then the guarded write, 0 rows → 409, then return `toAdminSummary(findModerationRow)`), routes, and summary mapping. Register both paths in `gen-openapi.ts` (responses 200, 400 for suspend, 401, 403, 404, 409) and regenerate.

- [ ] **Step 4: Run** the tests → PASS; `pnpm verify` → green.

- [ ] **Step 5: Commit** `feat(api): admin suspend and lift suspension (BR-015, BR-016)`

---

### Task 3: Resubmit, return rule, withdraw, and the review lock (BR-016, BR-017)

**Files:**

- Modify: `packages/shared/src/errors.ts` (add `'LISTING_UNDER_REVIEW'`)
- Modify: `packages/shared/src/contracts/admin.ts` (summary gains `resubmittedAfterSuspension: z.boolean()`)
- Modify: `apps/api/src/modules/listings/listings.repository.ts`, `listings.service.ts`
- Modify: `apps/api/src/modules/institutes/institutes.service.ts`, `institutes.partner.routes.ts`
- Modify: `packages/shared/scripts/gen-openapi.ts`
- Test: `institutes.partner.routes.test.ts`, `listings.admin.routes.test.ts`

**Interfaces:**

- Consumes: `hasEverBeenPublished` (Task 1).
- Produces:
  - `listings.service.returnStatusFor(listing: { firstPublishedAt: Date | null }): 'DRAFT' | 'SUSPENDED'`
  - `repo.markSubmitted(id: string, from: 'DRAFT' | 'SUSPENDED'): Promise<number>` (guarded on `from`; replaces the unconditional version)
  - `repo.markRejected(id: string, reason: string, returnTo: 'DRAFT' | 'SUSPENDED'): Promise<number>`
  - `repo.markWithdrawn(id: string, returnTo: 'DRAFT' | 'SUSPENDED'): Promise<number>` (guarded on PENDING_REVIEW)
  - `listings.service.withdrawFromReview(listingId: string): Promise<void>`
  - `institutes.service.withdrawForOrg(listingId: string, organizationId: string): Promise<PartnerListingDetail>`
  - Route `POST /api/v1/partner/listings/:listingId/withdraw`.

- [ ] **Step 1: Write failing tests.** In `institutes.partner.routes.test.ts`:
  - `resubmits a suspended listing into review` — SUSPENDED + complete details → submit 200, status PENDING_REVIEW, `suspensionReason` still set (it is cleared only by publish).
  - `applies BR-012 to a suspended listing` — SUSPENDED with `address: null` → 409 `LISTING_INCOMPLETE`, `details.missing` equals `['address']`.
  - `409s LISTING_UNDER_REVIEW for an edit while in review` — PENDING_REVIEW, PATCH `{ shortDescription: 'x' }` → 409, DB unchanged.
  - `still allows batch creation while in review` — POST batches on a PENDING_REVIEW listing → 201.
  - `withdraws a never-published listing to DRAFT` and `withdraws a once-published listing to SUSPENDED`.
  - `409s a withdraw outside review` — DRAFT → 409 `INVALID_STATUS_TRANSITION`.
  - `403s a withdraw of another organisation's listing`.

  In `listings.admin.routes.test.ts`:
  - `rejecting a resubmission returns it to SUSPENDED` — PENDING_REVIEW with `firstPublishedAt` set → reject → SUSPENDED, `rejectionReason` set.
  - `rejecting a first submission still returns it to DRAFT` (existing behaviour, keep).
  - `publishing a resubmission clears the suspension` — `suspensionReason` null after publish.
  - `flags resubmittedAfterSuspension in the queue` — queue item true for PENDING_REVIEW with `firstPublishedAt`, false otherwise.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** `submitForReview` accepts `DRAFT` or `SUSPENDED`; `submitForReviewForOrg` runs `missingForSubmission` for either (update its comment). `rejectAsAdmin` and `withdrawFromReview` pass `returnStatusFor(listing)`. `updateForOrg` throws `ConflictError('LISTING_UNDER_REVIEW', 'A listing cannot be edited while it is being reviewed; withdraw it first')` when `current.status === 'PENDING_REVIEW'`, before any other check. `toAdminSummary` computes `resubmittedAfterSuspension` from `status === 'PENDING_REVIEW' && firstPublishedAt !== null` (add `firstPublishedAt` to `MODERATION_SELECT`). Register `withdraw` in `gen-openapi.ts` and regenerate.

- [ ] **Step 4: Run** → PASS; `pnpm verify` → green.

- [ ] **Step 5: Commit** `feat(api): resubmit after suspension, withdraw, and lock edits in review (BR-016, BR-017)`

---

### Task 4: Watched-field snapshot, the Changed queue and "Looks fine" (BR-018)

**Files:**

- Create: `packages/shared/src/watched.ts`, `packages/shared/src/watched.test.ts`; export from `packages/shared/src/index.ts`
- Modify: `packages/shared/src/errors.ts` (add `'REVIEW_STALE'`)
- Modify: `packages/shared/src/contracts/admin.ts`
- Modify: `packages/db/prisma/schema.prisma`; migration `listing_review_snapshot` (`reviewedSnapshot Json?`, `changedSinceReviewAt DateTime?`)
- Modify: `apps/api/src/modules/listings/listings.repository.ts`, `listings.service.ts`, `listings.admin.routes.ts`
- Modify: `apps/api/src/modules/institutes/institutes.service.ts`
- Modify: `packages/shared/scripts/gen-openapi.ts`
- Test: `watched.test.ts`, `listings.admin.routes.test.ts`, `institutes.partner.routes.test.ts`

**Interfaces:**

- Produces (shared, `watched.ts`):
  - `WATCHED_LISTING_FIELDS = ['name', 'shortDescription', 'locality', 'address', 'contactPhone', 'about', 'website', 'establishedYear', 'facultyCount', 'modes', 'exams'] as const`; `type WatchedField`.
  - `WATCHED_FIELD_LABELS: Record<WatchedField, string>` — `name: 'Name'`, `shortDescription: 'Short description'`, `locality: 'Locality'`, `address: 'Address'`, `contactPhone: 'Contact phone'`, `about: 'About'`, `website: 'Website'`, `establishedYear: 'Established'`, `facultyCount: 'Faculty'`, `modes: 'Modes'`, `exams: 'Exams'`.
  - `type WatchedValue = string | number | string[] | null`; `type WatchedSnapshot = Record<WatchedField, WatchedValue>`.
  - `listingChangeSchema = z.object({ field: z.enum(WATCHED_LISTING_FIELDS), before: watchedValueSchema, after: watchedValueSchema })`; `type ListingChange`.
  - `diffSnapshot(before: WatchedSnapshot, after: WatchedSnapshot): ListingChange[]` — in `WATCHED_LISTING_FIELDS` order; arrays compared as sorted copies and emitted sorted; `''` and `null` are equal (a cleared optional field saved as empty string is not a change).
- Produces (shared, `admin.ts`):
  - `adminListingQueueQuery` gains `changed: z.stringbool().optional()` and `q: z.string().trim().min(1).max(100).optional()`.
  - `adminListingSummary` gains `changedSinceReviewAt: z.iso.datetime().nullable()`, `changedFieldCount: z.number().int()`.
  - `adminListingDetail` gains `changes: z.array(listingChangeSchema)`.
  - `markReviewedBody = z.object({ changedSinceReviewAt: z.iso.datetime() })`, `MarkReviewedBody`.
- Produces (API):
  - `repo.findWatchedRow(id: string): Promise<WatchedRow | null>` where `WatchedRow` has the listing's watched columns, `instituteProfile` (about, website, establishedYear, facultyCount, modes), exam tag slugs, `status`, `firstPublishedAt`, `reviewedSnapshot: unknown`, `changedSinceReviewAt: Date | null`.
  - `listings.service.snapshotOf(row: WatchedRow): WatchedSnapshot`
  - `repo.saveSnapshot(id: string, snapshot: WatchedSnapshot): Promise<void>` (also nulls `changedSinceReviewAt`)
  - `repo.setChangedSinceReview(id: string, at: Date | null): Promise<void>`
  - `repo.markReviewed(id: string, seen: Date, snapshot: WatchedSnapshot): Promise<number>` — guarded on `status: 'PUBLISHED', changedSinceReviewAt: seen`.
  - `publishAndVerify(id, organizationId, at, verifierClerkUserId, snapshot: WatchedSnapshot)` — writes the snapshot and nulls `changedSinceReviewAt` in the guarded listing write. `publish()` reads `findWatchedRow` before calling it.
  - `listings.service.ensureReviewBaseline(listingId: string): Promise<void>` — if ever published and `reviewedSnapshot` is null, save the current snapshot.
  - `listings.service.recordPartnerEdit(listingId: string): Promise<void>` — if ever published: `diffSnapshot(stored, current)`; non-empty → `setChangedSinceReview(id, new Date())`; empty → `setChangedSinceReview(id, null)`.
  - `listings.service.markReviewedAsAdmin(listingId: string, seen: string): Promise<AdminListingSummary>` — not PUBLISHED → 409 `INVALID_STATUS_TRANSITION`; 0 rows → 409 `REVIEW_STALE`.
  - `repo.listForModeration(filter: { status: ListingStatus; changed?: boolean; q?: string }, skip: number, take: number)` replaces `listByStatus`. `changed: true` forces `status: 'PUBLISHED'`, `changedSinceReviewAt: { not: null }`, ordered by `changedSinceReviewAt asc`. `q` → `OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q.toLowerCase() } }]`.
  - Route `POST /api/v1/admin/listings/:listingId/mark-reviewed` (body `markReviewedBody`).

`changedFieldCount` on summaries needs the diff, so `MODERATION_SELECT` gains the watched columns and the service computes it; summaries are capped at `limit` ≤ the pagination max, so this is bounded.

- [ ] **Step 1: Write failing unit tests** in `watched.test.ts`:
  - `reports each watched field changed alone` — `it.each(WATCHED_LISTING_FIELDS)`, a base snapshot with one field altered → exactly one change with that field, `before` and `after`.
  - `treats arrays as sets` — `exams: ['neet','jee']` vs `['jee','neet']` → `[]`.
  - `treats empty string and null as equal` — `locality: ''` vs `null` → `[]`.
  - `returns nothing for identical snapshots`.

- [ ] **Step 2: Write failing API tests.** In `institutes.partner.routes.test.ts`, describe `BR-018`:
  - `does not flag an edit that changes nothing watched` — published listing, PATCH `{ shortDescription: 'JEE coaching' }` (its current value) → `changedSinceReviewAt` null.
  - `flags a watched edit on a published listing and baselines a missing snapshot` — PATCH `{ about: 'New about text' }` → `changedSinceReviewAt` set; `reviewedSnapshot.about` is null (the pre-edit value).
  - `clears the flag when an edit restores the snapshot` — edit then edit back → null.
  - `does not flag a draft that was never published`.

  In `listings.admin.routes.test.ts`:
  - `lists changed listings with ?changed=true, oldest change first` — two flagged with different `changedSinceReviewAt` → order; an unflagged published listing absent.
  - `searches by name or slug with q` — `q=ALPHA` finds `alpha-academy`; `q=nomatch` → empty.
  - `shows before and after in the detail` — after the `about` edit, `changes` equals `[{ field: 'about', before: null, after: 'New about text' }]`; summary `changedFieldCount: 1`.
  - `marks reviewed with the current token` — 200; `changedSinceReviewAt` null; `reviewedSnapshot.about` is the new text.
  - `409s REVIEW_STALE when the change token is old` — read detail, partner edits again, mark-reviewed with the first token → 409 `REVIEW_STALE`, flag still set.
  - `409s mark-reviewed on a listing that is not published`.
  - `publish takes the snapshot` — publish a pending listing → `reviewedSnapshot.name` equals its name, `changedSinceReviewAt` null.

- [ ] **Step 3: Run** `pnpm --filter @one/shared test && pnpm --filter @one/api test -- listings institutes.partner` → FAIL.

- [ ] **Step 4: Implement.** Migration (migrate test DB). In `updateForOrg`: call `ensureReviewBaseline(listingId)` immediately before `repo.updateListingAndProfile`, and `recordPartnerEdit(listingId)` immediately after. `reviewedSnapshot` is read as `unknown` and narrowed in the service with a Zod schema built from `WATCHED_LISTING_FIELDS` (a malformed value is treated as missing and re-baselined). Register `mark-reviewed` in `gen-openapi.ts`; regenerate.

- [ ] **Step 5: Run** → PASS; `pnpm verify` → green.

- [ ] **Step 6: Commit** `feat(api): flag and diff edits to published listings (BR-018)`

---

### Task 5: API revalidation client and call sites

**Files:**

- Create: `apps/api/src/lib/revalidate.ts`, `apps/api/src/lib/revalidate.test.ts`
- Modify: `apps/api/src/config/index.ts`, `apps/api/.env.example`
- Modify: `packages/shared/src/contracts/admin.ts`
- Modify: `apps/api/src/modules/listings/listings.service.ts`, `listings.admin.routes.ts`
- Modify: `apps/api/src/modules/institutes/institutes.service.ts`, `apps/api/src/modules/batches/batches.service.ts`
- Modify: `packages/shared/scripts/gen-openapi.ts`
- Test: `revalidate.test.ts`, `listings.admin.routes.test.ts`

**Interfaces:**

- Produces:
  - Config: `WEB_REVALIDATE_URL: z.url().optional()`, `REVALIDATE_SECRET: z.string().min(32).optional()` → `config.webRevalidateUrl`, `config.revalidateSecret`. Refine: if one is set, both must be.
  - `revalidatePublicPages(): Promise<boolean>` in `lib/revalidate.ts` — no-op `false` when unconfigured; otherwise `fetch(url, { method: 'POST', headers: { 'x-revalidate-secret': secret }, signal: AbortSignal.timeout(2000) })`; returns `response.ok`; any throw or non-OK → `logger.warn({ err, status }, 'public cache revalidation failed')` and `false`. Never throws.
  - Shared: `adminDecisionResponse = adminListingSummary.extend({ publicCacheCleared: z.boolean() })`, `AdminDecisionResponse`. Used by publish, suspend and reinstate responses (reject and mark-reviewed keep `adminListingSummary`: they change nothing public).
  - `publishAsAdmin`, `suspendAsAdmin`, `reinstateAsAdmin` return `Promise<AdminDecisionResponse>`.

To test the client without a mock, `revalidatePublicPages` takes an optional `target?: { url: string; secret: string }` that defaults to config; the test starts a throwaway `node:http` server.

- [ ] **Step 1: Write failing tests** in `revalidate.test.ts`:
  - `returns false without calling anything when unconfigured`.
  - `posts the secret header and returns true on 200` — local server records the header.
  - `returns false on a 401`.
  - `returns false within the timeout when the server never answers` — server that never responds; assert resolves `false` in under 3000 ms.
  - `reports false and still suspends when the web app is unreachable` — call with `url: 'http://127.0.0.1:9/'`; resolves `false`.

  In `listings.admin.routes.test.ts`: `suspend, reinstate and publish report publicCacheCleared` — `false` under test config (no URL) and parse with `adminDecisionResponse`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** the config, client, contract and call sites. Call `revalidatePublicPages()` **after** the write returns:
  - `publishAsAdmin`, `suspendAsAdmin`, `reinstateAsAdmin` → put the result in `publicCacheCleared`.
  - `institutes.service.updateForOrg` when the listing is PUBLISHED (result ignored).
  - `batches.service.updateForOrg` when `isPublished(existing.listingId)` (result ignored).
    Add both variables, commented and blank, to `apps/api/.env.example`. Update `gen-openapi.ts` responses for the three routes; regenerate.

- [ ] **Step 4: Run** → PASS; `pnpm verify` → green.

- [ ] **Step 5: Commit** `feat(api): clear the public page cache after moderation changes (REQ-002)`

---

### Task 6: Web revalidation endpoint, cache tag, and the e2e suspend spec

**Files:**

- Create: `apps/web/src/app/api/revalidate/route.ts`, `apps/web/src/app/api/revalidate/route.test.ts`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/next.config.ts`, `apps/web/.env.example`
- Modify: `e2e/playwright.config.ts`
- Create: `e2e/tests/revalidation.spec.ts`

**Interfaces:**

- Produces: `PUBLIC_CACHE_TAG = 'listings'` exported from `apps/web/src/lib/api.ts`; `apiGet` fetches with `next: { revalidate, tags: [PUBLIC_CACHE_TAG] }`. `POST /api/revalidate` → 401 `{ revalidated: false }` unless `x-revalidate-secret` matches `process.env.REVALIDATE_SECRET` (constant-time: equal-length check then `crypto.timingSafeEqual`; an unset env secret always 401s); on success `revalidateTag(PUBLIC_CACHE_TAG, { expire: 0 })` and 200 `{ revalidated: true }`.
- `next.config.ts`: `distDir: process.env.NEXT_DIST_DIR ?? '.next'` (lets a second dev server run from the same app; comment says so).

- [ ] **Step 1: Write failing tests** in `route.test.ts` (`vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))`, set `process.env.REVALIDATE_SECRET` to a 32+ char value in `beforeEach`):
  - `401s without the header` — `revalidateTag` not called.
  - `401s a wrong secret of the same length`.
  - `401s every request when REVALIDATE_SECRET is unset`.
  - `expires the listings tag immediately with the right secret` — 200; `revalidateTag` called with `('listings', { expire: 0 })`.

- [ ] **Step 2: Run** `pnpm --filter @one/web test` → FAIL; implement route, tag and config; run → PASS.

- [ ] **Step 3: Add the cached e2e web server.** In `playwright.config.ts` add a third `webServer`: `pnpm --filter @one/web dev`, `url: 'http://localhost:3200'`, env as the 3100 server but `PORT: '3200'`, `SITE_URL: 'http://localhost:3200'`, **`API_CACHE_TTL: '300'`**, `NEXT_DIST_DIR: '.next-e2e-cached'`, `REVALIDATE_SECRET: E2E_REVALIDATE_SECRET`. Give the API server `WEB_REVALIDATE_URL: 'http://localhost:3200/api/revalidate'` and the same secret. Comment why this server caches when the other does not. Add `.next-e2e-cached` to `.gitignore`.

  If two `next dev` processes still conflict on a shared lock despite separate `distDir`s, stop and report it, then switch this server to `next build && next start` with `NEXT_DIST_DIR`. Do not drop the cached server: without caching, the spec proves nothing.

- [ ] **Step 4: Write** `e2e/tests/revalidation.spec.ts` (`const WEB = 'http://localhost:3200'`, a fresh slug per run as in `moderation.spec.ts`; arrange a PUBLISHED listing with one published future batch via `@one/db`):
  - `test('the cache is on: a direct database edit is not visible')` — `page.goto(WEB + '/institutes/' + slug)` shows the name; `prisma.listing.update` the name directly; goto again → **old** name still shown. This is the control: if it fails, caching is off and the next test is meaningless.
  - `test('suspending removes the listing on the next request')` — POST `${API}/api/v1/admin/listings/${id}/suspend` as admin → 200 with `publicCacheCleared: true`; goto the detail page → 404 text; goto `${WEB}/institutes` → slug's name absent.
  - `test('reinstating brings it back on the next request')` — reinstate → `publicCacheCleared: true`; detail page visible again.

- [ ] **Step 5: Run** `pnpm e2e` → all specs PASS (existing specs unaffected); `pnpm verify` → green.

- [ ] **Step 6: Commit** `feat(web): signed revalidation endpoint and instant suspend e2e (REQ-002)`

---

### Task 7: Partner screens

**Files:**

- Modify: `apps/partner/src/app/dashboard/[listingId]/StatusBanner.tsx`, `VerificationForm.tsx`, `actions.ts`
- Modify: `apps/partner/src/lib/api.ts` (`partnerErrorMessage`)

**Interfaces:**

- Consumes: `POST /api/v1/partner/listings/:listingId/withdraw` (Task 3), `suspensionReason`, `firstPublishedAt` (Task 2).
- Produces: `withdrawListingAction(prev: ActionState, formData: FormData): Promise<ActionState>` in `actions.ts` (posts withdraw, `revalidatePath` the detail page, maps 409 to "This listing is no longer in review.").

- [ ] **Step 1: Implement the banner** per spec §9, copy verbatim:
  - PENDING_REVIEW: existing sentence, then an `ActionButton` **Withdraw to make changes** whose form confirms with `window.confirm("Your listing will leave the review queue. Submit again when you're done.")` (add an optional `confirm?: string` prop to `ActionButton`).
  - SUSPENDED: red `role="alert"` box — "Your listing has been taken off One Academy.", the `suspensionReason`, "Fix the details below and submit for review again." — then the same checklist and **Submit for review** as DRAFT (extract the checklist block into a local component rather than duplicating it).
  - PUBLISHED: existing content plus "Changes go live straight away and may be checked by One Academy." in `text-xs text-gray-600`.
- [ ] **Step 2: Lock the form.** `VerificationForm` renders inputs `disabled` with no save button when `status === 'PENDING_REVIEW'`; the city select is disabled with "The city can't change once your listing has been public." when `firstPublishedAt` is set.
- [ ] **Step 3: Error copy** — add `LISTING_UNDER_REVIEW: 'Withdraw your listing from review before making changes.'` and `REVIEW_STALE: 'This listing changed — reload'` to `partnerErrorMessage`.
- [ ] **Step 4: Run** `pnpm verify` → green. Start `pnpm dev`, and with Clerk test keys check each banner state at a 390px-wide viewport (set states via psql if needed). Note anything not checked.
- [ ] **Step 5: Commit** `feat(partner): suspended and in-review states with withdraw`

---

### Task 8: Admin screens

**Files:**

- Create: `apps/partner/src/app/admin/AdminTabs.tsx`
- Modify: `apps/partner/src/app/admin/layout.tsx`, `apps/partner/src/app/admin/review/page.tsx`
- Modify: `apps/partner/src/app/admin/review/[listingId]/page.tsx`, `actions.ts`, `ReviewActions.tsx`
- Create: `apps/partner/src/app/admin/review/[listingId]/ModerationActions.tsx`, `ChangesList.tsx`

**Interfaces:**

- Consumes: Tasks 2–5 endpoints and contracts (`adminDecisionResponse`, `changes`, `changedFieldCount`, `resubmittedAfterSuspension`, `suspensionReason`, `WATCHED_FIELD_LABELS`).
- Produces: server actions `suspendAction`, `reinstateAction`, `markReviewedAction` in `actions.ts`, sharing `decide()`. `decide` gains a `schema` parameter, and when the response has `publicCacheCleared` it picks the notice key `<done>` or `<done>-slow`.

- [ ] **Step 1: Tabs.** `AdminTabs` (client, `usePathname`/`useSearchParams`) — links to `/admin/review?tab=review|changed|published|suspended`, labels "Review", "Changed", "Published", "Suspended"; rendered in `layout.tsx`. Horizontally scrollable row on phones.
- [ ] **Step 2: Queue page.** `tab` → query: review `status=PENDING_REVIEW`; changed `changed=true`; published `status=PUBLISHED&q=<q>`; suspended `status=SUSPENDED`. Published tab has a search form (`name="q"`, `type="search"`, label "Name or web address"). Card extras: **Resubmitted after suspension** badge; on Changed, "N fields changed, <relative time>"; on Suspended, the reason (line-clamped) and date. Empty states: "Nothing waiting for review.", "No unreviewed changes.", "No published listings match.", "Nothing is suspended." NOTICES add: `suspended: 'Suspended. Removed from the site.'`, `'suspended-slow': 'Suspended. It may stay visible for up to 5 minutes.'`, `reinstated: 'Suspension lifted. Back on the site.'`, `'reinstated-slow': 'Suspension lifted. It may take up to 5 minutes to reappear.'`, `published: 'Published. It is now on the site.'`, `'published-slow': 'Published. It will appear on the site within 5 minutes.'`, `reviewed: 'Marked as reviewed.'`, `already: 'This listing changed — reload'` (keep the amber style).
- [ ] **Step 3: Detail page actions by status** (spec §10 table). PENDING_REVIEW keeps `ReviewActions` and shows a previous `suspensionReason` as "Previously suspended: <reason>". PUBLISHED renders `ChangesList` (each change as label, struck-through before, after; arrays joined with ", "; null as "—") with a **Looks fine** button posting `changedSinceReviewAt`, and `ModerationActions` with **Suspend…** opening a reason textarea ("Reason (the institute sees this)", 10–500) and confirming `Suspend <name>? It will be removed from the site.`. SUSPENDED shows the reason and date and a **Lift suspension** button. DRAFT shows no actions. Any 409 redirects to the queue with `done=already`, except `REVIEW_STALE`, which reloads the detail page so the new diff shows.
- [ ] **Step 4: Run** `pnpm verify` → green. Walk each tab and each detail state at 390px with Clerk test keys; note anything not checked.
- [ ] **Step 5: Commit** `feat(partner): admin tabs, suspend, lift suspension and change review`

---

### Task 9: Documentation and close-out

**Files:**

- Modify: `docs/flows/listing-lifecycle.md`, `docs/domain/business-rules.md`, `docs/decisions/0016-self-registration-with-merged-verification.md`, `docs/runbooks/local-setup.md`, `docs/README.md` ("Where the project is")
- Create: `docs/decisions/0017-published-edits-live-then-reviewed.md`, `docs/decisions/0018-signed-tag-revalidation.md`
- Move: `docs/work/requests/REQ-002-revalidate-public-pages-on-moderation.md` → `docs/work/archive/` with an Outcome block
- Modify: `apps/api/CLAUDE.md` (one short section: transitions are guarded writes; `hasEverBeenPublished`, not status, for freezes; call `revalidatePublicPages()` after any write that changes public content)

- [ ] **Step 1:** Lifecycle flow: the spec §5 state diagram and transition table, sequences for suspend, reinstate, withdraw, partner edit with flagging, revalidation; failure-mode rows from spec §11; delete "Known gap"; set `Last verified against commit:` to the current HEAD sha.
- [ ] **Step 2:** Business rules: BR-002 amended text; BR-015–BR-018 with Implemented/Tested lines naming the real functions and test files; BR-009 gains "Holds at the edge immediately via `revalidatePublicPages` (ADR 0018); the 300-second TTL is the fallback."
- [ ] **Step 3:** ADR 0017 (decision from spec §6, alternatives: held edits, re-review every edit) and ADR 0018 (spec §7; alternatives: per-slug tags, `'max'` profile, waiting for hosting). ADR 0016's Consequences bullet points to ADR 0017. Runbook gets `REVALIDATE_SECRET` (same value in api and web), `WEB_REVALIDATE_URL`, and the e2e cached server.
- [ ] **Step 4:** Run `pnpm exec tsx scripts/check-docs-freshness.ts` → no stale flows; `pnpm verify` → green; `pnpm e2e` → green.
- [ ] **Step 5:** Record the manual phone walkthrough (suspend → partner sees reason → fix → resubmit → approve; a published edit appears under Changed → Looks fine) in REQ-002's Outcome block, saying plainly what was and was not checked.
- [ ] **Step 6: Commit** `docs(p2b): moderation flows, BR-015–018, ADRs 0017–0018; close REQ-002`
