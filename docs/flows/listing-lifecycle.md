# Flow: Listing lifecycle

Last verified against commit: REPLACE_WITH_HEAD_SHA

## Purpose

How an institute's listing moves from draft to publicly visible, and who may move it.
This is the moderation gate: nothing a partner writes reaches the public site unreviewed.

## Actors and entry points

- Partner — a Clerk user with an active organisation, at `/dashboard/<listingId>`
- Global ADMIN — via `POST /api/v1/admin/listings/:listingId/publish`

## State machine

```
DRAFT ──submit──▶ PENDING_REVIEW ──publish (ADMIN only)──▶ PUBLISHED ──▶ SUSPENDED
```

Only the ADMIN transition publishes (BR-001). A published slug is frozen (BR-002).

## Sequence

**Partner submits for review**

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

`submitForReview` accepts only a DRAFT listing; anything else is
`INVALID_STATUS_TRANSITION`.

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

**Admin publishes the listing**

```
POST /api/v1/admin/listings/:listingId/publish
  → apps/api/src/modules/listings/listings.admin.routes.ts   requireAdmin (BR-001)
  → apps/api/src/modules/listings/listings.service.ts        publishAsAdmin → publish()
                                                             stamps publishedAt
```

The listing is then visible on the public detail page, and previously-draft batches can be
published.

## Diagram

A state diagram of the four listing statuses, with the actor permitted to make each
transition labelled on the arrows, and BR-004 drawn as a guard on batch publication.

## Business rules invoked

BR-001, BR-002, BR-003, BR-004, BR-005, BR-010

## Failure modes

| Condition                                    | API response                     | What the partner sees                                            |
| -------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| Listing owned by another organisation        | 403 `FORBIDDEN`                  | "You do not have permission to change this listing."             |
| Clerk organisation not provisioned locally   | 403 `FORBIDDEN`                  | "No organisation selected" card                                  |
| Submitting a non-DRAFT listing               | 409 `INVALID_STATUS_TRANSITION`  | "This listing cannot be submitted in its current state."         |
| Publishing a batch starting in the past      | 409 `BATCH_START_DATE_PAST`      | "A batch starting in the past cannot be published."              |
| Publishing a batch on an unpublished listing | 409 `BATCH_PARENT_NOT_PUBLISHED` | "Your listing must be published before you can publish a batch." |
| seatsAvailable outside 0..seatsTotal         | 409 `SEATS_OUT_OF_RANGE`         | "Seats available must be between zero and the total seats."      |
| Non-admin attempting to publish a listing    | 403 `FORBIDDEN`                  | Not reachable from the partner UI                                |
| Renaming a published slug                    | 409 `SLUG_IMMUTABLE`             | "A published listing address cannot be changed."                 |

## Related flows

`institute-discovery.md` — what becomes visible once PUBLISHED.
