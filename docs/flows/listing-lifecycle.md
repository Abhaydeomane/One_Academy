# Flow: Listing lifecycle

Last verified against commit: f596c439ed104ca3ac97717b277a613af74c6501

## Purpose

How an institute's listing moves from draft to publicly visible, and who may move it.
This is the moderation gate: nothing a partner writes reaches the public site unreviewed.

## Actors and entry points

- Partner — a Clerk user with an active organisation, at `/dashboard/<listingId>`
  (creation is in `partner-onboarding.md`)
- Global ADMIN — at `/admin/review?tab=review|changed|published|suspended` and
  `/admin/review/<listingId>`, via `POST /api/v1/admin/listings/:listingId/{publish,reject,suspend,reinstate,mark-reviewed}`

## State machine

```
                  ┌──────── withdraw (partner) ────────┐
                  ▼                                     │
DRAFT ──submit──▶ PENDING_REVIEW ──publish (ADMIN)──▶ PUBLISHED
  ▲                │    ▲                                 │  ▲
  └─reject─────────┘    │                     suspend     │  │ reinstate
    (never published)   │                     (ADMIN)     ▼  │ (ADMIN)
                        └──── submit (partner) ──────── SUSPENDED
                              reject / withdraw ───────▶ (if ever published)
```

| Transition                       | Who                                          | Rule           |
| -------------------------------- | -------------------------------------------- | -------------- |
| DRAFT → PENDING_REVIEW           | Partner                                      | BR-012         |
| PENDING_REVIEW → PUBLISHED       | ADMIN                                        | BR-001, BR-013 |
| PENDING_REVIEW → DRAFT/SUSPENDED | ADMIN (reject, reason) or partner (withdraw) | BR-014, BR-017 |
| PUBLISHED → SUSPENDED            | ADMIN, reason required                       | BR-015         |
| SUSPENDED → PUBLISHED            | ADMIN ("Lift suspension")                    | BR-016         |
| SUSPENDED → PENDING_REVIEW       | Partner (resubmit)                           | BR-012, BR-016 |

Only an ADMIN transition publishes (BR-001). A listing leaving review unpublished goes to
SUSPENDED if `firstPublishedAt` is set, otherwise DRAFT (`listings.service.returnStatusFor`):
a once-public listing in review can only have come from SUSPENDED. The slug and city
freeze on `firstPublishedAt`, never on the current status (BR-002), so a suspended or
resubmitted listing keeps its URL. Every transition is a write conditional on the status
it starts from, so two concurrent decisions on one listing yield exactly one success and
one 409.

## Sequence

**Partner submits for review** (BR-012)

```
apps/partner/src/app/dashboard/[listingId]/page.tsx
  → apps/partner/src/app/dashboard/[listingId]/actions.ts    submitListingAction
  → apps/partner/src/lib/api.ts                              attaches the Clerk bearer token
  → POST /api/v1/partner/listings/:listingId/submit
  → apps/api/src/modules/institutes/institutes.partner.routes.ts
  → apps/api/src/modules/accounts/accounts.service.ts   resolveLocalOrgId: Clerk id → local id
  → apps/api/src/modules/institutes/institutes.service.ts    submitForReviewForOrg
  → apps/api/src/modules/listings/listings.service.ts        assertOrgOwnsListing, submitForReview
```

`submitForReviewForOrg` checks the status first, then completeness: a listing that is not
DRAFT or SUSPENDED is `INVALID_STATUS_TRANSITION` even if it is incomplete; a DRAFT or
SUSPENDED listing missing details is
`LISTING_INCOMPLETE` with `details.missing`. `missingForSubmission`
(`packages/shared/src/submission.ts`) is the single definition, shared with the checklist on
the partner page. A successful submit stamps `submittedAt` and clears `rejectionReason`.

**Partner creates and publishes a batch**

```
apps/partner/src/app/dashboard/[listingId]/BatchForm.tsx
  → actions.ts createBatchAction          rupees → integer paise (BR-005)
  → POST /api/v1/partner/listings/:listingId/batches
  → apps/api/src/modules/batches/batches.service.ts    createForOrg — seats checked (BR-010),
                                                       created as DRAFT
  → actions.ts publishBatchAction
  → PATCH /api/v1/partner/batches/:batchId
  → apps/api/src/modules/batches/batches.partner.routes.ts
  → batches.service.updateForOrg          BR-003 future start, BR-004 parent published
```

**Admin publishes the listing** (BR-013)

```
/admin/review/<id>
  → apps/partner/src/app/admin/review/[listingId]/actions.ts   approveAction
  → POST /api/v1/admin/listings/:listingId/publish
  → apps/api/src/modules/listings/listings.admin.routes.ts     requireAdmin (BR-001)
  → apps/api/src/modules/listings/listings.service.ts          publishAsAdmin → publish()
  → apps/api/src/modules/listings/listings.repository.ts       publishAndVerify
```

`publishAndVerify` sets the listing PUBLISHED and, if the organisation's `verifiedAt` is
null, verifies it in the same transaction. Both writes are conditional (listing on
PENDING_REVIEW, organisation on `verifiedAt: null`). If another decision won, nothing is
written and the caller gets 409.

The listing is then visible on the public detail page, and previously-draft batches can be
published.

**Admin rejects** (BR-014)

```
/admin/review/<id>
  → apps/partner/src/app/admin/review/[listingId]/actions.ts   rejectAction
  → POST /api/v1/admin/listings/:listingId/reject
  → apps/api/src/modules/listings/listings.admin.routes.ts     requireAdmin
  → apps/api/src/modules/listings/listings.service.ts          rejectAsAdmin
  → apps/api/src/modules/listings/listings.repository.ts       markRejected
```

The listing returns to DRAFT with `rejectionReason` set; the partner page shows it in a red
banner and the partner can fix and resubmit. The organisation is not verified by a rejection.

**Admin suspends a live listing** (BR-015)

```
/admin/review/<id>  (PUBLISHED)
  → apps/partner/src/app/admin/review/[listingId]/ModerationActions.tsx   SuspendForm
  → apps/partner/src/app/admin/review/[listingId]/actions.ts   suspendAction
  → POST /api/v1/admin/listings/:listingId/suspend
  → apps/api/src/modules/listings/listings.admin.routes.ts     requireAdmin
  → apps/api/src/modules/listings/listings.service.ts          suspendAsAdmin
  → apps/api/src/modules/listings/listings.repository.ts       markSuspended
  → apps/api/src/lib/revalidate.ts                             revalidatePublicPages
  → POST <web>/api/revalidate
  → apps/web/src/app/api/revalidate/route.ts                   revalidateTag('listings', { expire: 0 })
```

The listing leaves every public route on the next request (BR-009). Its batches and
enquiries are untouched. The partner sees the reason in a red banner, fixes the listing
and resubmits; the admin can also **Lift suspension** directly (`reinstateAsAdmin` →
`markReinstated`), which clears the suspension columns. Publishing a resubmission clears
them too.

**Partner withdraws from review** (BR-017)

```
/dashboard/<id>  (PENDING_REVIEW, form read-only)
  → apps/partner/src/app/dashboard/[listingId]/actions.ts   withdrawListingAction
  → POST /api/v1/partner/listings/:listingId/withdraw
  → apps/api/src/modules/institutes/institutes.service.ts   withdrawForOrg
  → apps/api/src/modules/listings/listings.service.ts       withdrawFromReview → markWithdrawn
```

`PATCH` on a listing in review is `409 LISTING_UNDER_REVIEW`, so what an admin approves is
exactly what they read. Batch endpoints are not locked: draft batches are invisible until
the listing is published.

**Partner edits a published listing** (BR-018)

```
apps/partner/src/app/dashboard/[listingId]/actions.ts   updateVerificationAction
  → PATCH /api/v1/partner/listings/:listingId
  → apps/api/src/modules/institutes/institutes.service.ts   updateForOrg
  → apps/api/src/modules/listings/listings.service.ts       ensureReviewBaseline   (before the write)
  → apps/api/src/modules/institutes/institutes.repository.ts updateListingAndProfile
  → apps/api/src/modules/listings/listings.service.ts       recordPartnerEdit      (after the write)
  → apps/api/src/lib/revalidate.ts                          revalidatePublicPages  (if PUBLISHED)
```

The edit is live at once. If a watched field (`WATCHED_LISTING_FIELDS`) now differs from
`reviewedSnapshot`, `changedSinceReviewAt` is set and the listing appears under the admin's
**Changed** tab, each change shown before → after (`diffSnapshot`). **Looks fine**
(`markReviewedAsAdmin` → `markReviewed`) re-takes the snapshot, conditional on the
`changedSinceReviewAt` the admin saw. See ADR 0017.

**Media** — logo and photo writes reuse the same rules through
`listings.service.applyPartnerEdit`: refused in review (BR-017), live then flagged on an
ever-published listing (BR-018, with `logo` and ordered `photos` watched), and an admin can
remove one image in any status without flagging the listing. See `media.md`.

## Diagram

A state diagram of the four listing statuses, with the actor permitted to make each
transition labelled on the arrows (including suspend, reinstate, resubmit and withdraw),
and BR-004 drawn as a guard on batch publication.

## Business rules invoked

BR-001, BR-002, BR-003, BR-004, BR-005, BR-009, BR-010, BR-012, BR-013, BR-014, BR-015,
BR-016, BR-017, BR-018

## Failure modes

| Condition                                           | API response                     | What the partner sees                                                |
| --------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| Listing owned by another organisation               | 403 `FORBIDDEN`                  | "You do not have permission to change this listing."                 |
| Submitting a listing that is not DRAFT or SUSPENDED | 409 `INVALID_STATUS_TRANSITION`  | "This listing cannot be submitted in its current state."             |
| Editing a listing in review                         | 409 `LISTING_UNDER_REVIEW`       | Form is read-only; "Withdraw your listing from review…" if raced     |
| Withdrawing a listing that is not in review         | 409 `INVALID_STATUS_TRANSITION`  | "This listing is no longer in review."                               |
| Suspending a listing that is not PUBLISHED          | 409 `INVALID_STATUS_TRANSITION`  | "This listing changed — reload"                                      |
| Suspending without a valid reason                   | 400 `VALIDATION_FAILED`          | Inline error on the reason box                                       |
| Lifting a suspension on a listing not SUSPENDED     | 409 `INVALID_STATUS_TRANSITION`  | "This listing changed — reload"                                      |
| "Looks fine" after the partner edited again         | 409 `REVIEW_STALE`               | Detail page reloads with the new changes                             |
| Web revalidation fails or times out                 | 200, `publicCacheCleared: false` | "…may stay visible for up to 5 minutes"                              |
| Submit with required details missing                | 409 `LISTING_INCOMPLETE`         | The checklist items still unticked                                   |
| City changed once ever published                    | 409 `CITY_IMMUTABLE`             | City shown as fixed; "A published listing's city cannot be changed." |
| Reject without a valid reason                       | 400 `VALIDATION_FAILED`          | Inline error on the reason box                                       |
| Publish or reject a listing not in review           | 409 `INVALID_STATUS_TRANSITION`  | "This listing was already reviewed" (also on a lost race)            |
| Publishing a batch starting in the past             | 409 `BATCH_START_DATE_PAST`      | "A batch starting in the past cannot be published."                  |
| Publishing a batch on an unpublished listing        | 409 `BATCH_PARENT_NOT_PUBLISHED` | "Your listing must be published before you can publish a batch."     |
| seatsAvailable outside 0..seatsTotal                | 409 `SEATS_OUT_OF_RANGE`         | "Seats available must be between zero and the total seats."          |
| Non-admin attempting to publish a listing           | 403 `FORBIDDEN`                  | Not reachable from the partner UI                                    |
| Renaming a published slug                           | 409 `SLUG_IMMUTABLE`             | "A published listing address cannot be changed."                     |
| Clerk does not know the session's organisation      | 403 `FORBIDDEN`                  | "You do not have permission to change this listing."                 |
| Clerk unreachable during first-request provisioning | 503 `UPSTREAM_UNAVAILABLE`       | Generic retry message (the cause is logged)                          |
| Saving verification details with nothing filled in  | (no request)                     | "Nothing to save — fill in at least one field."                      |

## Public cache

Public pages cache API responses for 300 seconds. After publish, suspend, reinstate and
edits to a live listing or its batches, the API clears that cache through the web app's
signed `/api/revalidate` (ADR 0018), so BR-009 holds at the edge on the next request. If
that call fails the change still happens, the admin is told, and the TTL is the backstop.

## Related flows

`institute-discovery.md` — what becomes visible once PUBLISHED.
