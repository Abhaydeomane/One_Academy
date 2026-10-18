# Flow: Listing lifecycle

Last verified against commit: a7f16839cf9202b2a01bfddd78d797b9f2269d06

## Purpose

How an institute's listing moves from draft to publicly visible, and who may move it.
This is the moderation gate: nothing a partner writes reaches the public site unreviewed.

## Actors and entry points

- Partner — a Clerk user with an active organisation, at `/dashboard/<listingId>`
  (creation is in `partner-onboarding.md`)
- Global ADMIN — at `/admin/review/<listingId>`, via `POST /api/v1/admin/listings/:listingId/publish`
  and `.../reject`

## State machine

```
DRAFT ──submit──▶ PENDING_REVIEW ──publish (ADMIN only)──▶ PUBLISHED ──▶ SUSPENDED
  ▲                    │
  └─reject (ADMIN, reason required)
```

Only the ADMIN transition publishes (BR-001). A published slug is frozen (BR-002). Publish
and reject both start from PENDING_REVIEW only — publishing a DRAFT is
`INVALID_STATUS_TRANSITION` — and each is a write conditional on that status, so two
concurrent admin decisions on one listing yield exactly one success and one 409.

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

`submitForReviewForOrg` checks the status first, then completeness: a non-DRAFT listing is
`INVALID_STATUS_TRANSITION` even if it is incomplete; a DRAFT missing details is
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

## Diagram

A state diagram of the four listing statuses, with the actor permitted to make each
transition labelled on the arrows, and BR-004 drawn as a guard on batch publication.

## Business rules invoked

BR-001, BR-002, BR-003, BR-004, BR-005, BR-010, BR-012, BR-013, BR-014

## Failure modes

| Condition                                    | API response                     | What the partner sees                                            |
| -------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| Listing owned by another organisation        | 403 `FORBIDDEN`                  | "You do not have permission to change this listing."             |
| Submitting a non-DRAFT listing               | 409 `INVALID_STATUS_TRANSITION`  | "This listing cannot be submitted in its current state."         |
| Submit with required details missing         | 409 `LISTING_INCOMPLETE`         | The checklist items still unticked                               |
| City changed after publication               | 409 `CITY_IMMUTABLE`             | "A published listing's city cannot be changed."                  |
| Reject without a valid reason                | 400 `VALIDATION_FAILED`          | Inline error on the reason box                                   |
| Publish or reject a listing not in review    | 409 `INVALID_STATUS_TRANSITION`  | "This listing was already reviewed" (also on a lost race)        |
| Publishing a batch starting in the past      | 409 `BATCH_START_DATE_PAST`      | "A batch starting in the past cannot be published."              |
| Publishing a batch on an unpublished listing | 409 `BATCH_PARENT_NOT_PUBLISHED` | "Your listing must be published before you can publish a batch." |
| seatsAvailable outside 0..seatsTotal         | 409 `SEATS_OUT_OF_RANGE`         | "Seats available must be between zero and the total seats."      |
| Non-admin attempting to publish a listing    | 403 `FORBIDDEN`                  | Not reachable from the partner UI                                |
| Renaming a published slug                    | 409 `SLUG_IMMUTABLE`             | "A published listing address cannot be changed."                 |

## Known gap: moderation is not instant on the public site

Public pages cache for 300 seconds (`revalidate` in `apps/web`), so a status change takes
up to five minutes to reach visitors. Publishing appearing late is merely annoying;
**suspending taking effect late is a real moderation gap** — a listing withdrawn for cause
stays reachable until the cache expires. BR-009 therefore holds at the API immediately but
at the edge only eventually. Tracked as `docs/work/requests/REQ-002`.

## Related flows

`institute-discovery.md` — what becomes visible once PUBLISHED.
