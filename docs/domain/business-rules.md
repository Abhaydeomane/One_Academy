# Business rules

Each rule has a stable ID referenced from test names and from the single permitted code
comment. `grep -r BR-003` returns the rule, its test and its implementation.

## BR-001 — A Listing transitions to PUBLISHED only by a global ADMIN

Partner-submitted content must not reach the public site unreviewed.

- Implemented: `middleware/auth.ts requireAdmin`, `listings.service.publishAsAdmin`
- Tested: `listings.admin.routes.test.ts`

## BR-002 — A PUBLISHED slug is immutable; a change creates a ListingRedirect

Google is the acquisition channel, so a changed URL is lost traffic. Pre-publication
renames are free; afterwards the old slug answers with a 301.

- Implemented: `listings.service.changeSlug`, `ListingRedirect`, `institutes.routes.ts`
- Tested: `listings.service.test.ts`, `institutes.routes.test.ts`

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
partner lead inbox in P2 must enforce it explicitly.

## BR-008 — Comparison accepts 2–4 listings of a single vertical

P1. Not implemented.

## BR-009 — Only PUBLISHED listings appear in public search or detail routes

Applied in the repository's `where` clause rather than per caller, so a new endpoint
cannot forget it.

- Implemented: `institutes.repository.listPublished`, `listings.service.resolvePublishedSlug`
- Tested: `institutes.routes.test.ts`, `enquiries.routes.test.ts`, `listings.service.test.ts`,
  and end to end in `e2e/tests/discovery.spec.ts`

## BR-010 — seatsAvailable is always between 0 and seatsTotal inclusive

Enforced twice: in the service, so a partner gets a readable `SEATS_OUT_OF_RANGE`; and as
the `Batch_seats_invariant` CHECK constraint, so the invariant holds whatever writes the
row — a backfill, a migration, or psql. Violations are rejected, never clamped: silently
changing a partner's number would be worse than refusing it.

- Implemented: `batches.service.assertSeats`, migration `batch_seats_invariant`
- Tested: `batches.service.test.ts`
