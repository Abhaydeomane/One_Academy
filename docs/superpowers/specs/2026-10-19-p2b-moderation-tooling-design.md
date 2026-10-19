# One Academy — P2b: Moderation tooling

Date: 2026-10-19
Status: Approved
Phase: P2b
Depends on: P2a (self-registration, admin review screens)

---

## 1. Context

P2a let anyone register an institute and gave the owner a review queue. Review is the only
gate, and it has three holes that self-registration makes real:

1. **A published listing cannot be taken down.** `SUSPENDED` exists in `ListingStatus` but
   nothing writes it. A fraudulent or abusive institute stays live until someone edits the
   database.
2. **Edits are never re-reviewed** (ADR 0016, Consequences). An approval can cover details
   changed after the admin opened the review page, and a published listing can be renamed
   or rewritten without anyone seeing it.
3. **Status changes reach the public site up to five minutes late** (REQ-002). For
   publishing that is annoying; for a suspension it is a moderation gap, and the reason
   BR-009 holds at the API but not at the edge.

There is also a latent bug that suspension would expose: the slug and city freezes
(BR-002, `CITY_IMMUTABLE`) test `status === 'PUBLISHED'` / `status === 'DRAFT'`. Once a
published listing can leave PUBLISHED, a rename would regenerate its slug and break every
link Google holds.

| Slice   | Scope                                     | Status    |
| ------- | ----------------------------------------- | --------- |
| P2a     | Self-registration and verification        | Done      |
| **P2b** | Moderation tooling (this doc)             | This spec |
| P2c     | Media upload (logo, photos)               | Next      |
| P2d     | Lead inbox, lead actions, new-lead alerts | Later     |
| P2e     | Partner analytics                         | Later     |

The owner asked to skip the design questions, so every decision below is the spec
author's call, made from the repo and ADR 0016. Each is marked **(call)** where a
different answer would change what gets built; §14 lists them for the owner to check.

## 2. Goals

1. The owner can take a live listing off the site from a phone, with a reason, and it is
   gone from every public page within seconds.
2. A suspended institute learns why, can fix its listing, and can ask to come back.
3. Nothing an admin approves can change between the admin reading it and approving it.
4. The owner can see what a published institute has changed since approval, and act on it.
5. A slug that was ever public never changes.

## 3. Non-goals

- Suspending an organisation (`OrgStatus.SUSPENDED` stays unused). At one listing per
  institute, suspending the listing is enough. **(call)**
- Holding edits to a published listing for approval before they go live (see §6).
- Moderation history. Only the latest suspension reason is kept, as with rejection.
- Notifications of any kind; the partner learns of a suspension on their dashboard.
- Review (student rating) moderation — BR-006 waits for the reviews feature.
- Partners unpublishing their own listing. They ask the owner, who suspends it.
- Watching batch changes. Batches are fees and dates that change routinely; they are not
  part of what verification checked.

### Anti-goals

- A suspension that is "done" in the admin screen but still visible to students.
- A rename after suspension that silently moves a published URL.
- Partners waiting days to fix a typo on a live listing.

## 4. Data model

New columns on `Listing`:

| Column                   | Type        | Meaning                                                                        |
| ------------------------ | ----------- | ------------------------------------------------------------------------------ |
| `suspensionReason`       | `String?`   | Latest reason (BR-015). Cleared when the listing is published again.           |
| `suspendedAt`            | `DateTime?` | When it was last suspended.                                                    |
| `suspendedByClerkUserId` | `String?`   | Admin who suspended it. Plain string, as `verifiedByClerkUserId`.              |
| `reviewedSnapshot`       | `Json?`     | The watched fields as last approved (§6). Written on publish and "Looks fine". |
| `changedSinceReviewAt`   | `DateTime?` | Set when a partner edit makes a watched field differ from the snapshot.        |
| `firstPublishedAt`       | `DateTime?` | Set on the first publish only; never overwritten or cleared.                   |

`firstPublishedAt` is the definition of "has ever been public". The existing `publishedAt`
cannot serve: `publishAndVerify` overwrites it on every publish and it drives the "recent"
sort, so it keeps its current meaning. The migration backfills `firstPublishedAt` from
`publishedAt` (falling back to `updatedAt`) for every PUBLISHED or SUSPENDED listing.

`reviewedSnapshot` is not backfilled. An ever-published listing with no snapshot takes one
from its current values just before its first partner edit, which is the same baseline a
migration backfill would have produced, and also covers seeded and test listings.

**Watched fields** — the details verification looked at plus what students read: `name`,
`shortDescription`, `locality`, `address`, `contactPhone`, `about`, `website`,
`establishedYear`, `facultyCount`, `modes`, `exams`. One exported list in `@one/shared`
(`WATCHED_LISTING_FIELDS`) so the API's snapshot and the admin diff cannot disagree.

## 5. Listing lifecycle

```
                  ┌──────── withdraw (partner) ────────┐
                  ▼                                     │
DRAFT ──submit──▶ PENDING_REVIEW ──publish (ADMIN)──▶ PUBLISHED
  ▲                │    ▲                                 │  ▲
  └─reject─────────┘    │                     suspend     │  │ reinstate
    (never published)   │                     (ADMIN,     ▼  │ (ADMIN)
                        └──── submit (partner) ──────── SUSPENDED
                              reject / withdraw ───────▶ (if ever published)
```

New transitions:

| Transition                       | Who     | Notes                                                      |
| -------------------------------- | ------- | ---------------------------------------------------------- |
| PUBLISHED → SUSPENDED            | ADMIN   | Reason required (BR-015).                                  |
| SUSPENDED → PUBLISHED            | ADMIN   | "Lift suspension" — for a mistaken or resolved suspension. |
| SUSPENDED → PENDING_REVIEW       | Partner | Resubmit after fixing. BR-012 completeness applies.        |
| PENDING_REVIEW → DRAFT/SUSPENDED | Partner | Withdraw, to edit (BR-017).                                |

Changed: **reject** and **withdraw** return a listing to `SUSPENDED` if `firstPublishedAt` is
set, otherwise to `DRAFT`. A listing in review that was once public can only have come
from SUSPENDED, so no extra column is needed. **(call)** — the alternative, returning it
to DRAFT, would make a once-public listing look like a never-public one to every check
that reads status.

All transitions are conditional writes guarded on the expected status, as in ADR 0016;
the losing side of a race gets `409 INVALID_STATUS_TRANSITION`.

### Business rules

- **BR-002 (amended)** — A slug is frozen once the listing has **ever** been published
  (`firstPublishedAt` set), whatever its current status. The same test replaces
  `status !== 'DRAFT'` for `CITY_IMMUTABLE`, because the URL embeds the city.
- **BR-015 — Only a global ADMIN suspends, and only a PUBLISHED listing.** A reason of
  10–500 characters is required and shown to the partner. Suspension hides the listing
  everywhere BR-009 applies; its batches and enquiries are untouched.
- **BR-016 — A suspended listing returns to PUBLISHED only through an ADMIN**, either by
  lifting the suspension directly or by approving a resubmission. Publishing clears
  `suspensionReason`. BR-013 is unaffected (the organisation is already verified).
- **BR-017 — A listing's details cannot change while it is PENDING_REVIEW.** A partner
  `PATCH` is `409 LISTING_UNDER_REVIEW`. To edit, the partner withdraws it first. Batch
  endpoints are unaffected (draft batches are invisible until the listing is published).
  This closes ADR 0016's "approval can cover details changed after the admin opened the
  review page" hole without a version token.
- **BR-018 — An edit to a watched field of an ever-published listing goes live
  immediately and flags the listing for review.** `changedSinceReviewAt` is set when the
  edit leaves any watched field different from `reviewedSnapshot`; an edit that restores
  the snapshot clears it. Publishing or an admin "Looks fine" re-takes the snapshot and
  clears the flag.

## 6. Edits to published listings: live, then reviewed

**(call)** Edits go live and land in a "Changed since approval" list, rather than being
held until approved.

- Held edits need a shadow copy of every field and table, and every edit costs owner review
  time. The queue is the only throttle (ADR 0016), so that doubles the throttle's load.
- A partner fixing a wrong fee description or phone number on a live page must not wait
  days.
- Suspension (BR-015) plus instant cache clearing (§7) is the remedy when an edit is
  abusive. The exposure window is how often the owner looks at the list.

The admin sees each changed field as **before → after**, computed from `reviewedSnapshot`
against current values, so a phone screen shows exactly what moved instead of the whole
listing. "Looks fine" carries the `changedSinceReviewAt` the admin saw and is conditional
on it; if the partner edited again meanwhile, it is `409 REVIEW_STALE` and the screen
reloads the diff.

## 7. Public cache: instant on moderation (REQ-002)

**(call)** A signed revalidation endpoint on the web app, called by the API. This works on
any Next host, so it does not wait for the hosting decision REQ-002 deferred to.

- **Web:** every public fetch in `apps/web/src/lib/api.ts` that returns listing data is
  tagged `listings`. New route handler `POST /api/revalidate` checks
  `x-revalidate-secret` against `REVALIDATE_SECRET` with a constant-time compare and calls
  `revalidateTag('listings')`. Wrong or missing secret is 401. No body.
- **API:** `lib/revalidate.ts` posts to `WEB_REVALIDATE_URL` after the database write
  commits, with a 2-second timeout. Failure is logged and **does not fail the request** —
  the 300-second `revalidate` remains as the backstop. When `WEB_REVALIDATE_URL` is unset
  (unit and integration tests, local API-only runs) it is a no-op that reports `false`.
- **Called after:** publish, suspend, lift suspension, any partner edit to a PUBLISHED
  listing, and any batch update on a PUBLISHED listing (a new batch is a
  draft, so creating one changes nothing public).
- One global tag, not per-slug tags. A suspension also changes search results, landing
  counts, sibling rails, comparisons and the sitemap; tracking which pages contain a
  listing is not worth it at current volume. **(call)**
- Publish, suspend and lift-suspension responses gain `publicCacheCleared: boolean`
  (reject and "Looks fine" change nothing public). The admin screen says
  "Removed from the site" when true and "Removed — may stay visible for up to 5 minutes"
  when false, so a failure is never silent.

The API still does not import anything from the web app; the coupling is one URL and one
secret, both in `.env.example` and the local-setup runbook.

## 8. API surface

All bodies are Zod schemas in `packages/shared/src/contracts/`; every path is registered
in `gen-openapi.ts`.

### Admin (`requireAuth`, `requireAdmin`)

| Method and path                                  | Change   | Behaviour                                                                                                                      |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/admin/listings?status=&changed=&q=` | Extended | `changed=true` lists PUBLISHED listings with `changedSinceReviewAt`, oldest first. `q` matches name or slug, case-insensitive. |
| `GET /api/v1/admin/listings/:id`                 | Extended | Adds `suspensionReason`, `suspendedAt`, `firstPublishedAt`, `changedSinceReviewAt`, `changes: [{ field, before, after }]`.     |
| `POST /api/v1/admin/listings/:id/suspend`        | New      | Body `{ reason }`. BR-015.                                                                                                     |
| `POST /api/v1/admin/listings/:id/reinstate`      | New      | No body. SUSPENDED → PUBLISHED. BR-016.                                                                                        |
| `POST /api/v1/admin/listings/:id/mark-reviewed`  | New      | Body `{ changedSinceReviewAt }`. BR-018; `409 REVIEW_STALE` if it no longer matches.                                           |
| `POST .../publish`, `.../reject`                 | Extended | Publish re-takes the snapshot and clears suspension fields; reject follows §5's return rule.                                   |

Summary items gain `changedSinceReviewAt` and `resubmittedAfterSuspension` (status
PENDING_REVIEW with `firstPublishedAt` set). Publish, suspend and reinstate responses gain
`publicCacheCleared`.

### Partner (`requireAuth`, `requireOrg`)

| Method and path                              | Change   | Behaviour                                                                      |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `PATCH /api/v1/partner/listings/:id`         | Extended | BR-017 lock; BR-018 flagging; BR-002 amended freeze; revalidates if PUBLISHED. |
| `POST /api/v1/partner/listings/:id/submit`   | Extended | Also accepts SUSPENDED.                                                        |
| `POST /api/v1/partner/listings/:id/withdraw` | New      | PENDING_REVIEW → DRAFT or SUSPENDED (§5).                                      |
| `GET` list and detail                        | Extended | Adds `suspensionReason`.                                                       |

## 9. Partner screens

`/dashboard/<id>` banner gains two states and changes one:

| State          | Banner                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PENDING_REVIEW | "We're reviewing your institute…" — form **read-only**, with **Withdraw to make changes**.                                                                     |
| SUSPENDED      | Red: "Your listing has been taken off One Academy." The reason, then "Fix the details below and submit for review again." Checklist and **Submit for review**. |
| PUBLISHED      | Link to the public page, plus a quiet note: "Changes go live straight away and may be checked by One Academy."                                                 |

Withdraw asks for confirmation: "Your listing will leave the review queue. Submit again
when you're done." The city field shows as fixed, with a one-line reason, once `firstPublishedAt` is set. The
name stays editable: renaming a published listing keeps its slug (BR-002).

## 10. Admin screens

The admin header becomes four tabs, each a list of cards in the P2a style:

- **Review** — unchanged queue, plus a **Resubmitted after suspension** badge.
- **Changed** — published listings with unreviewed changes, oldest change first. Card
  shows the listing, organisation, and "N fields changed, M days ago".
- **Published** — with a search box (`q`). The owner who gets a complaint about a listing
  can paste its name or URL slug.
- **Suspended** — with each reason and date.

`/admin/review/<id>` becomes the one listing page for every status; its actions depend on
status:

| Status         | Actions                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| PENDING_REVIEW | Approve & publish, Reject (unchanged). Shows the previous suspension reason when resubmitted.                |
| PUBLISHED      | **Suspend** (reason box, "the institute sees this"). If changed: the before → after list and **Looks fine**. |
| SUSPENDED      | **Lift suspension**, with the reason shown.                                                                  |
| DRAFT          | None (read-only).                                                                                            |

Suspend asks for confirmation naming the listing. A `409` on any action shows "This
listing changed — reload" and reloads it.

## 11. Failure modes

| Condition                                          | API response                                  | What the user sees                                          |
| -------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| Suspend a listing that is not PUBLISHED            | 409 `INVALID_STATUS_TRANSITION`               | "This listing changed — reload"                             |
| Suspend without a valid reason                     | 400 `VALIDATION_FAILED`                       | Inline error on the reason box                              |
| Lift suspension on a listing that is not SUSPENDED | 409 `INVALID_STATUS_TRANSITION`               | "This listing changed — reload"                             |
| "Looks fine" after the partner edited again        | 409 `REVIEW_STALE`                            | Diff reloads with the new values                            |
| Partner edits a listing in review                  | 409 `LISTING_UNDER_REVIEW`                    | Unreachable — form is read-only; message if raced           |
| Withdraw a listing that is not in review           | 409 `INVALID_STATUS_TRANSITION`               | "This listing is no longer in review." and the page reloads |
| Rename or move city of an ever-published listing   | 409 `SLUG_IMMUTABLE` / `CITY_IMMUTABLE`       | Existing messages                                           |
| Web revalidation fails or times out                | Request succeeds, `publicCacheCleared: false` | "…may stay visible for up to 5 minutes"                     |
| `/api/revalidate` with a wrong secret              | 401                                           | Logged by the API                                           |

## 12. Testing

**Unit** — the snapshot diff: each watched field changed alone, arrays compared as sets
(`modes`, `exams`), restoring a value clears the change.

**API integration** (real Postgres, `x-test-auth`, `WEB_REVALIDATE_URL` unset):

- BR-015: suspend from each non-PUBLISHED status is 409; reason bounds; non-admin 403;
  a suspended listing 404s on public detail, batches, enquiry, and is absent from search,
  landing and compare (extend the BR-009 tests rather than adding parallel ones).
- BR-016: lift suspension; resubmit from SUSPENDED → PENDING_REVIEW → publish clears
  `suspensionReason`; reject of a resubmission returns to SUSPENDED.
- BR-017: PATCH in review is 409; withdraw returns to DRAFT or SUSPENDED by `firstPublishedAt`.
- BR-018: watched edit flags; unwatched-only edit does not; restore clears; mark-reviewed
  with a stale token is 409; publish re-snapshots.
- BR-002 amended: rename and city change on a SUSPENDED listing, and on a once-published
  listing back in review, keep the slug.
- Concurrency: suspend racing reinstate yields one success and one 409.
- A published listing with no snapshot is not flagged by an edit that changes nothing
  watched, and is flagged by one that does.

**Web** — `/api/revalidate` rejects a missing and a wrong secret, accepts the right one.

**End to end** (`e2e/tests/moderation.spec.ts`, which starts the web app): publish →
public page visible → suspend through the API → the **next** request for the detail page
and `/institutes` no longer shows it (no five-minute wait) → resubmit → publish → visible
again. This is REQ-002's required suspend coverage.

**Manual** — as in P2a, the partner app is walked on a real phone with Clerk test keys:
suspend, partner sees the reason, fixes, resubmits, approve; and a published edit showing
up under **Changed**. Recorded in the work item.

## 13. Documentation

- `docs/flows/listing-lifecycle.md`: new state machine, transitions, failure modes; remove
  the "Known gap" section; bump the verified sha.
- `docs/domain/business-rules.md`: BR-002 amended, BR-015 to BR-018; BR-009 note that it
  now holds at the edge too.
- **ADR 0017** — published edits go live and are flagged, not held (§6).
- **ADR 0018** — tag revalidation through a signed web endpoint (§7).
- ADR 0016: point its "edits are not re-reviewed" consequence at ADR 0017.
- `runbooks/local-setup.md` and `.env.example`: `REVALIDATE_SECRET`, `WEB_REVALIDATE_URL`.
- Archive REQ-002 with an Outcome block.
- Regenerate `docs/api/openapi.json`.

## 14. Build order

Each step ends with `pnpm verify` green.

1. BR-002 amended (slug and city freeze on a new, backfilled `firstPublishedAt`) with its regression tests — a
   standalone fix, safe before anything else.
2. Migration (columns, snapshot backfill); suspend, reinstate, resubmit, reject return
   rule, withdraw, edit lock — API and tests.
3. Snapshot, diff, `changed` queue and mark-reviewed — API and tests.
4. Revalidation: web endpoint, API client, call sites, e2e suspend spec.
5. Partner screens, then admin screens.
6. Docs, ADRs, manual phone walkthrough.

## 15. Calls for the owner to check

1. **Edits to a live listing go live immediately** and are reviewed after (§6), rather
   than waiting for approval.
2. **Editing is locked while a listing is in review**; the partner withdraws to edit
   (BR-017). P2a's banner currently says "Editing allowed".
3. **Suspension is per listing**, not per organisation.
4. **A rejected resubmission stays suspended** rather than going back to draft.
5. **One cache tag for everything**: any moderation change refreshes all public listing
   pages at once.
6. **Batch changes are not watched** for review.
