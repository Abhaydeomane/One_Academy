# ADR 0017 — Edits to a published listing go live, then get reviewed

Date: 2026-10-19
Status: Accepted

## Context

ADR 0016 left a gap: edits made after publication were never reviewed, so a verified
institute could rename itself or rewrite its description without anyone looking. Closing
it means choosing between holding edits until approved and letting them through and
reviewing afterwards. The owner's review time is the only throttle on the platform (ADR
0016), and suspension (BR-015) now exists as a remedy.

## Decision

**An edit to a watched field of an ever-published listing goes live immediately and flags
the listing (BR-018).** The watched fields are the details verification checked plus what
students read — `WATCHED_LISTING_FIELDS` in `@one/shared`, one list used by both the API
and the admin screen.

- Publishing stores a JSON snapshot of the watched fields (`Listing.reviewedSnapshot`).
- A partner edit that leaves any watched field different from the snapshot sets
  `changedSinceReviewAt`; one that restores it clears the flag.
- The admin's **Changed** tab lists flagged listings, and each shows its changes as
  before → after, computed from the snapshot against current values.
- **Looks fine** re-takes the snapshot. It carries the `changedSinceReviewAt` the admin
  saw and is conditional on it, so a later edit is `409 REVIEW_STALE`, never silently
  approved.
- A listing with no snapshot (published before this change, seeded, or in tests) takes one
  from its current values just before its first partner edit — the same baseline a
  migration backfill would have produced.

Edits while a listing is **in review** are refused instead (BR-017): there the admin is
about to approve exactly what they read.

## Alternatives rejected

**Hold edits until approved.** It needs a shadow copy of every field and related table,
doubles the owner's review load, and makes a partner wait days to fix a wrong phone number
on a live page.

**Re-review every edit by sending the listing back to the queue.** Unpublishes a live
listing for a typo; the same cost as holding, with downtime added.

**Diff stored as an audit log.** History is a non-goal (as with rejection); the snapshot is
enough to show what changed since the last approval.

## Consequences

- The exposure window for an abusive edit is how often the owner opens the Changed tab.
  Suspension, made instant by ADR 0018, is the remedy.
- Batch changes (fees, dates, seats) are not watched; they change routinely and were never
  part of verification.
- "Looks fine" reads the values just before its guarded write. A partner edit landing in
  the same instant, between that edit's content write and its flag write, could be absorbed
  into the new baseline. Closing that needs a transaction spanning the institutes and
  listings modules; at current volume it is accepted.
