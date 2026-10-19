# Business rules

Each rule has a stable ID referenced from test names and from the single permitted code
comment. `grep -r BR-003` returns the rule, its test and its implementation.

## BR-001 — A Listing transitions to PUBLISHED only by a global ADMIN

Partner-submitted content must not reach the public site unreviewed.

- Implemented: `middleware/auth.ts requireAdmin`, `listings.service.publishAsAdmin`
- Tested: `listings.admin.routes.test.ts`

## BR-002 — A slug is immutable once the listing has ever been published

Google is the acquisition channel, so a changed URL is lost traffic. Renames before first
publication are free; afterwards the slug is frozen **whatever the listing's current
status** — a suspended or resubmitted listing is still the URL Google holds. The test is
`firstPublishedAt` (set once, never cleared), not `status`; the same test fixes the city
(`CITY_IMMUTABLE`), because the URL embeds it. Amended in P2b: the original check read
`status === 'PUBLISHED'` and would have let a suspended listing's rename move its URL.

- Implemented: `listings.service.hasEverBeenPublished`, `listings.service.changeSlug`,
  `institutes.service.updateForOrg`, `ListingRedirect`, `institutes.routes.ts`
- Tested: `listings.service.test.ts`, `institutes.routes.test.ts`,
  `institutes.partner.routes.test.ts` ("BR-002 amended"), `listings.admin.routes.test.ts`
  (`firstPublishedAt` set on first publish only)

## BR-003 — A Batch cannot be PUBLISHED with a startDate in the past

- Implemented: `batches.service.updateForOrg`
- Tested: `batches.service.test.ts`

## BR-004 — A Batch cannot be PUBLISHED unless its parent Listing is PUBLISHED

Without this, a partner could publish batches on an unreviewed listing and reach students
around the moderation gate.

- Implemented: `batches.service.updateForOrg` via `listings.service.isPublished`
- Tested: `batches.service.test.ts`, `institutes.partner.routes.test.ts`

## BR-005 — Monetary values are integer minor units with an explicit currency

Floating point cannot represent currency exactly. `Batch.feeAmount` is paise; the partner
UI collects rupees and converts at the boundary; the public UI formats for display only.

- Implemented: `Batch.feeAmount Int`, `createBatchBody`, `apps/partner/.../actions.ts`,
  `apps/web/src/lib/format.ts`
- Tested: `contracts.test.ts`, `format.test.ts`, `institutes.routes.test.ts`

## BR-006 — Reviews are PENDING until moderated

Schema only in P0; no endpoints until P2.

- Implemented: `Review.status` defaults to PENDING

## BR-007 — Enquiries are readable only by the owning Organization and global ADMINs

P0 exposes no enquiry read endpoint, so this holds by construction;
`enquiries.service.listForListing` is reachable only from organisation-scoped routes. The
partner lead inbox (slice P2d) must enforce it explicitly.

## BR-008 — Comparison accepts 2–4 listings of a single vertical

Implemented in P1c. `COMPARE_MIN` and `COMPARE_MAX` in `@one/shared` are the single
source. Slugs are **de-duplicated before the count is checked**, so a doubled checkbox
value cannot consume a slot; outside the range is a 400, and `CompareBar` disables
submission so the UI cannot produce that request. The single-vertical rule is enforced at
the repository boundary (`vertical: 'INSTITUTE'`), not in the service.

Each column may additionally pin **one** published upcoming batch (ADR 0015). Comparing
two batches of the same institute is deliberately out of scope: that is "which batch
should I join?", a detail-page question.

## BR-009 — Only PUBLISHED listings appear in public search or detail routes

Applied in the repository's `where` clause rather than per caller, so a new endpoint
cannot forget it.

Holds at the edge too: after any change to what the public sees, the API expires the web
app's `listings` cache tag (ADR 0018), so a suspended listing is gone on the next request.
The 300-second TTL is only the fallback when that call fails.

- Implemented: `institutes.repository.listPublished`, `listings.service.resolvePublishedSlug`,
  `lib/revalidate.ts`, `apps/web/src/app/api/revalidate/route.ts`
- Tested: `institutes.routes.test.ts`, `enquiries.routes.test.ts`, `listings.service.test.ts`,
  the SUSPENDED cases in the compare and landing route tests, and end to end in
  `e2e/tests/discovery.spec.ts` and `e2e/tests/revalidation.spec.ts`

## BR-010 — seatsAvailable is always between 0 and seatsTotal inclusive

Enforced twice: in the service, so a partner gets a readable `SEATS_OUT_OF_RANGE`; and as
the `Batch_seats_invariant` CHECK constraint, so the invariant holds whatever writes the
row — a backfill, a migration, or psql. Violations are rejected, never clamped: silently
changing a partner's number would be worse than refusing it.

- Implemented: `batches.service.assertSeats`, migration `batch_seats_invariant`
- Tested: `batches.service.test.ts`

## BR-011 — A partner creates listings only for their own organisation, always as DRAFT

The create body carries no status or organisation; both come from the server. A client that
sends them changes nothing. The same boundary rejects a non-http(s) `website`
(`updateListingBody`), and `safeHttpUrl` in `@one/shared` guards rendering of any stored
website link, so a `javascript:` URL can never become an `href`.

- Implemented: `createListingBody`, `institutes.service.createForOrg`
- Tested: `institutes.partner.routes.test.ts`, `e2e/tests/moderation.spec.ts`

## BR-012 — A listing is submitted for review only with the details needed to verify it

Name, city, address, contact phone and at least one exam. Otherwise 409
`LISTING_INCOMPLETE` with `details.missing`. `missingForSubmission` in `@one/shared` is the
single definition, used by the API and by the partner checklist. The status check runs
first: submitting a listing that is not DRAFT is `INVALID_STATUS_TRANSITION`, whatever it
contains.

- Implemented: `packages/shared/src/submission.ts`, `institutes.service.submitForReviewForOrg`
- Tested: `submission.test.ts`, `institutes.partner.routes.test.ts`, e2e

## BR-013 — Publishing a listing of an unverified organisation also verifies it

Same transaction; `verifiedAt` and `verifiedByClerkUserId` are never overwritten.
Admin publish accepts only a PENDING_REVIEW listing, and the write is conditional on that
status, so two concurrent admin decisions yield one success and one 409.

- Implemented: `listings.repository.publishAndVerify`
- Tested: `listings.admin.routes.test.ts`, e2e

## BR-014 — Rejection needs a 10–500 character reason and only applies to PENDING_REVIEW

The listing returns to DRAFT so the partner can fix and resubmit. Like publish, the write is
conditional on PENDING_REVIEW, so a reject racing a publish cannot both succeed.

- Implemented: `rejectListingBody`, `listings.service.rejectAsAdmin`
- Tested: `contracts.test.ts`, `listings.admin.routes.test.ts`, e2e

## BR-015 — Only a global ADMIN suspends, and only a PUBLISHED listing

A reason of 10–500 characters (trimmed) is required and shown to the partner. Suspension
hides the listing everywhere BR-009 applies; its batches and enquiries are untouched. The
write is conditional on PUBLISHED, so concurrent decisions yield one success and one 409.

- Implemented: `suspendListingBody`, `listings.service.suspendAsAdmin`,
  `listings.repository.markSuspended`
- Tested: `contracts.test.ts`, `listings.admin.routes.test.ts`, `e2e/tests/revalidation.spec.ts`

## BR-016 — A suspended listing returns to PUBLISHED only through an ADMIN

Either directly ("Lift suspension") or by approving the partner's resubmission
(SUSPENDED → PENDING_REVIEW, with BR-012 applying). Both clear the suspension columns.
Rejecting or withdrawing a resubmission returns it to SUSPENDED, not DRAFT
(`listings.service.returnStatusFor`).

- Implemented: `listings.service.reinstateAsAdmin`, `listings.service.submitForReview`,
  `listings.repository.markReinstated`, `listings.repository.publishAndVerify`
- Tested: `listings.admin.routes.test.ts`, `institutes.partner.routes.test.ts`

## BR-017 — A listing's details cannot change while it is in review

A partner `PATCH` on a PENDING_REVIEW listing is `409 LISTING_UNDER_REVIEW`; the partner
withdraws it first (back to DRAFT, or SUSPENDED if it was ever public). What an admin
approves is therefore exactly what they read. Batch endpoints are not locked: draft batches
are invisible until the listing is published (BR-004).

- Implemented: `institutes.service.updateForOrg`, `listings.service.withdrawFromReview`,
  `listings.repository.markWithdrawn`
- Tested: `institutes.partner.routes.test.ts`

## BR-018 — An edit to a watched field of an ever-published listing goes live and is flagged

`WATCHED_LISTING_FIELDS` in `@one/shared` is the single list. Publishing snapshots them; an
edit that leaves any of them different from the snapshot sets `changedSinceReviewAt`, one
that restores the snapshot clears it. Arrays compare as sets and an empty string equals
null. "Looks fine" re-takes the snapshot, conditional on the `changedSinceReviewAt` the
admin saw (`409 REVIEW_STALE` otherwise). See ADR 0017.

Amended in P2c: the watched fields include `logo` (asset id or null) and `photos` (asset
ids **in order** — the first is the cover students see, so a reorder is a change). A
snapshot saved before P2c parses with no logo and no photos. An admin removing one image
is not a partner change: the asset leaves the snapshot too.

- Implemented: `packages/shared/src/watched.ts`, `listings.service.ensureReviewBaseline`,
  `recordPartnerEdit`, `markReviewedAsAdmin`, `listings.repository.listForModeration`
- Tested: `watched.test.ts`, `institutes.partner.routes.test.ts`, `listings.admin.routes.test.ts`

## BR-019 — Uploaded images are decoded and re-encoded by the server before storage

The content decides what a file is, never its name or declared type: anything that does not
decode as JPEG, PNG or WebP is `MEDIA_INVALID NOT_AN_IMAGE`, and over 40 megapixels is
`TOO_MANY_PIXELS` (refused from the header, before decoding). EXIF orientation is applied
and **all metadata is dropped** — a phone's GPS position is never published. Only WebP
variants are stored; originals are not kept. See ADR 0019.

- Implemented: `media.images.processImage`, `middleware/upload.ts`
- Tested: `media.images.test.ts`, `media.partner.routes.test.ts`

## BR-020 — A listing has at most one logo and ten photos

A second logo replaces the first. The eleventh photo is `409 MEDIA_LIMIT_REACHED`. The
insert runs under the listing's row lock, so concurrent uploads cannot overshoot the limit;
the partial unique index `MediaAsset_one_logo_per_listing` backs the logo rule in the
database.

- Implemented: `MEDIA_LIMITS` in `@one/shared`, `media.repository.insertGuarded`, migration
  `media_assets`
- Tested: `media.partner.routes.test.ts` ("never exceeds 10 photos under concurrent uploads")
