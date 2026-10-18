# ADR 0016 — Self-registration with verification merged into the first listing review

Date: 2026-10-19
Status: Accepted

## Context

Every institute was added by hand, so supply was capped by the owner's time. P2a lets an
institute go from unknown to "submitted for review" on a phone. That opens the platform to
anyone, so three questions had to be settled: how an institute gets onto the platform, how
we know it is real, and how a self-created Clerk organisation maps to local data.

## Decision

**Institutes self-register.** A partner signs up, creates a Clerk organisation, and creates
their own DRAFT listing (BR-011).

**Verification is an admin reading the submitted details** — name, address, contact phone,
website — before publishing (BR-012).

**Verification is merged into the first listing review.** Publishing an organisation's
first listing verifies the organisation in the same transaction (BR-013). There is no
separate organisation queue. Consequence by design: a rejected first listing leaves the
organisation unverified, and the next submission is flagged "New institute" again.

**Review decisions are conditional writes.** Admin publish accepts only a PENDING_REVIEW
listing (publishing a DRAFT is `INVALID_STATUS_TRANSITION`), and publish and reject are
`updateMany` calls guarded by `status = 'PENDING_REVIEW'`. Two admins deciding the same
listing at once produce exactly one success and one 409, which the review screen shows as
"This listing was already reviewed".

**Organisations link to Clerk only by `clerkOrgId`.** A local organisation is never matched
to a Clerk organisation by slug. An unseen Clerk organisation is provisioned on demand: the
API fetches its name and slug from Clerk's Backend API with the server secret
(`apps/api/src/lib/clerk.ts`) and inserts it once; the insert tolerates the webhook racing
it, because `clerkOrgId` is unique and the loser re-reads the winner's row. If Clerk is
unreachable the request is `503 UPSTREAM_UNAVAILABLE` and nothing is written.

## Alternatives rejected

**Claiming pre-listed institutes.** There is no pre-listed supply to claim, and claiming
brings ownership transfer, disputed claims and a support burden for a problem we do not
have.

**OTP or document verification.** Phone OTP needs an SMS provider and DLT registration;
document upload needs private storage and a retention policy. Admin review of details is
enough at current volume. Phone OTP stays the next defence if junk sign-ups fill the queue.

**A separate organisation verification gate.** A second queue for what is, at current
volume, one listing per institute. The admin would approve the same institute twice.

**Allowing admin publish from DRAFT, with unconditional writes.** It lets a listing skip
review, and verifies an organisation on details nobody examined. Unconditional writes make
the last concurrent decision win silently, so a reject landing after a publish would pull a
live listing back to DRAFT.

**Linking by slug (the previous behaviour).** Convenient for seeded data and an account
takeover under self-registration: naming a Clerk organisation "Alpha Education Group"
would attach the creator to the real Alpha's listings, batches and leads. Linking a seeded
organisation is now a manual database statement only.

**Refusing unseen Clerk organisations (the previous 403).** Under self-registration every
Clerk organisation is a legitimate new institute, and the webhook can arrive after the
partner's first request.

## Consequences

- Clerk's Backend API is now a runtime dependency of the first request from a new
  organisation. It is wrapped in one module so tests replace it; it is the repo's only
  mock, permitted because Clerk is external. The database is still never mocked.
- Spam sign-ups cost the owner review time. The queue is the only throttle.
- Admin rights come from Clerk session metadata (ADR 0006), not the database.
- Edits made after submission (while PENDING_REVIEW) or after publication are not
  re-reviewed in P2a. An approval can cover details changed after the admin opened the
  review page, and a published listing can be renamed without review. Closing this is P2b
  moderation work.
- The webhook stays the normal path; on-demand provisioning only closes the race.
