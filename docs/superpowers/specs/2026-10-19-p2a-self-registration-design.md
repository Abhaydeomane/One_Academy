# One Academy — P2a: Institute self-registration and verification

Date: 2026-10-19
Status: Approved
Phase: P2a
Depends on: P0 (foundation, moderation gate), P1a–P1c

---

## 1. Context

Every institute on One Academy today was added by hand. The partner dashboard's empty state
says "Contact One Academy to have your institute added", and there is no endpoint through
which a partner can create a listing. Supply is therefore capped by the owner's time.

P2 ("partner portal and admin", foundation spec §16) is five independent subsystems, so it
is split like P1:

| Slice   | Scope                                         | Status       |
| ------- | --------------------------------------------- | ------------ |
| **P2a** | Self-registration and verification (this doc) | This spec    |
| P2b     | Remaining moderation tooling (suspend, etc.)  | Later        |
| P2c     | Media upload (logo, photos)                   | Later        |
| P2d     | Lead inbox, lead actions, new-lead alerts     | Owner: later |
| P2e     | Partner analytics                             | Later        |

The lead inbox was considered first and deferred by the owner. This slice also absorbs most
of the old "moderation queue UI" item, because verifying institutes needs a review screen.

### Decisions made with the owner

- **Institutes self-register.** There are no pre-listed institutes to claim, so no
  ownership transfer and no disputed claims.
- **Verification is admin review of submitted details** — name, address, contact phone,
  website. No OTP, no document upload, no external provider.
- **Verification is merged into the first listing review.** Publishing an organisation's
  first listing also verifies the organisation. There is no separate verification queue.
- **Admin screens live at `/admin` in the partner app**, not in a new deployable.
- **No notifications** in this slice. The partner learns of a decision on their dashboard.

## 2. Goals

1. An institute can go from "never heard of One Academy" to "listing submitted for review"
   on a phone, without contacting the owner.
2. The owner can review, approve or reject a submission from a phone, with enough
   information to verify that the institute is real.
3. A rejected institute learns why and can fix and resubmit.
4. Self-registration opens no path to another organisation's data.

## 3. Non-goals

- Claiming pre-listed institutes.
- Email, SMS or WhatsApp notifications of any kind.
- A public "verified" badge. Every published listing is already reviewed, so a badge would
  carry no extra meaning yet.
- Rejection history. Only the latest reason is kept.
- Limits on listings per organisation.
- Media upload, lead inbox, analytics, suspension UI.
- End-to-end browser tests of the partner app (see §11).

## 4. Data model

One migration. Every new column is nullable; no new tables.

| Table          | Column                  | Type        | Meaning                                                          |
| -------------- | ----------------------- | ----------- | ---------------------------------------------------------------- |
| `Organization` | `verifiedAt`            | `DateTime?` | When its first listing was published. `null` means not verified. |
| `Organization` | `verifiedByClerkUserId` | `String?`   | The admin who published it. A Clerk id, not a FK — see below.    |
| `Listing`      | `address`               | `String?`   | Full street address. Public on the detail page.                  |
| `Listing`      | `contactPhone`          | `String?`   | **Private.** Owning organisation and admins only.                |
| `Listing`      | `rejectionReason`       | `String?`   | Written on reject, cleared on submit. Shown to the partner.      |
| `Listing`      | `submittedAt`           | `DateTime?` | Set on each submit. Orders the admin queue oldest first.         |

`verifiedByClerkUserId` is a plain string rather than a foreign key to `User` because the
local `User` row exists only if the `user.created` webhook arrived. A missed webhook must
not make approvals fail. The Clerk user id is always present in the admin's session.

`contactPhone` is for verification, not lead capture: students reach institutes through
the enquiry form. Public contracts are explicit Zod schemas, so the column stays private by
omission, and a test asserts it (§11).

**Backfills.** `submittedAt` is set from `updatedAt` for listings already in
PENDING_REVIEW. The migration also sets `verifiedAt = now()` on every organisation that already
has a `PUBLISHED` listing. The owner verified those by hand; without the backfill their
next listing would be flagged as a new institute.

## 5. Listing lifecycle

```
DRAFT ──submit──▶ PENDING_REVIEW ──publish (ADMIN)──▶ PUBLISHED ──▶ SUSPENDED
  ▲                    │
  └─reject (ADMIN, reason required)
```

The only new transition is **reject**, `PENDING_REVIEW → DRAFT`. A rejection is not
terminal, so a typo in an address costs one resubmission rather than a new registration.

### New business rules

- **BR-011 — A partner creates listings only for their own organisation, always as
  DRAFT.** The create body has no `status` or `organizationId`; the organisation comes from
  the session.
- **BR-012 — A listing can be submitted for review only when it carries the details needed
  to verify it:** name, city, address, contact phone and at least one exam. Otherwise
  `409 LISTING_INCOMPLETE` with `details.missing: string[]` naming the fields.
- **BR-013 — Publishing a listing of an unverified organisation also verifies the
  organisation**, in the same transaction, setting `verifiedAt` and
  `verifiedByClerkUserId`. Neither is ever overwritten or cleared by a later publish.
- **BR-014 — Rejecting requires a reason of 10–500 characters and is allowed only from
  PENDING_REVIEW.** The listing returns to DRAFT. Rejecting from any other state is
  `409 INVALID_STATUS_TRANSITION`.

`missingForSubmission(listing)` in `@one/shared` is the single definition of "complete".
The API enforces BR-012 with it and the partner page draws its checklist with it, so the
two cannot disagree.

The phone number rule (10 digits) is extracted from `createEnquiryBody` into one shared
`phoneSchema`, used by both enquiries and `contactPhone`.

## 6. Security: organisation provisioning

### The slug-linking hole

`accounts.service.syncOrganization` currently links an incoming Clerk organisation to an
**existing local organisation whose slug matches**. While only the owner created
organisations this was a convenience for linking seeded data. Under self-registration it
is an account takeover: anyone who creates a Clerk organisation named "Alpha Education
Group" would be attached to the real Alpha organisation and its listings, batches and,
later, leads.

**Fix:** a Clerk organisation matches a local organisation **only by `clerkOrgId`**. On a
slug collision the new local organisation gets a suffixed slug (`alpha-education-group-2`).
Linking a seeded organisation to Clerk remains a manual database statement, as
`runbooks/local-setup.md` already documents.

### Provisioning on demand

Clerk creates the organisation and the `organization.created` webhook mirrors it
asynchronously. A partner who creates an organisation and immediately creates a listing
can reach the API first, which before P2a was a 403 "not onboarded".

**Change:** when an authenticated request carries a Clerk organisation id with no local
row, `accounts.service` creates the row on the spot:

- The organisation's name and slug are fetched **from Clerk's Backend API with the server
  secret**, never taken from the request. The id itself comes from the verified session.
- The insert is an upsert on the unique `clerkOrgId`, so a webhook and a request arriving
  together produce one row.
- The Clerk call is wrapped in `apps/api/src/lib/clerk.ts` so tests can replace it.

This retires the rule that an unknown Clerk organisation is a 403: under self-registration,
every Clerk organisation is a legitimate new institute. The webhook remains the normal path.

### Admin identity

`requireAdmin` reads `globalRole` from **Clerk session metadata**; the runbook and ADR 0006
say it lives in the database `User.globalRole`. Following the runbook does not make anyone
an admin. **Clerk session metadata is the single source of truth**: the API already uses
it and it costs no database read. The partner app reads the same claim to show `/admin`.
The runbook and ADR 0006 are corrected; `User.globalRole` is left in place and documented
as unused for authorization.

## 7. API surface

All bodies and responses are Zod schemas in `packages/shared/src/contracts/`, and every
new path is registered in `gen-openapi.ts`.

### Partner (`requireAuth`, `requireOrg`)

| Method and path                            | Change   | Behaviour                                                                                                                                              |
| ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/partner/reference`            | New      | `{ cities: [{slug,name,state}], exams: [{slug,label}] }` for the create form.                                                                          |
| `POST /api/v1/partner/listings`            | New      | Body `{ name, citySlug }`. Creates a DRAFT (BR-011). Slug from name + city, suffixed on collision. Returns the partner detail. Unknown city is `400`.  |
| `PATCH /api/v1/partner/listings/:id`       | Extended | Adds `address`, `contactPhone`, `examSlugs`, and `citySlug` (DRAFT only; otherwise `409 CITY_IMMUTABLE`, because the published URL contains the city). |
| `POST /api/v1/partner/listings/:id/submit` | Extended | Enforces BR-012; clears `rejectionReason`.                                                                                                             |
| `GET` list and detail                      | Extended | Adds `rejectionReason`, `address`, `contactPhone`, `exams`.                                                                                            |

Ownership checks reuse `listings.service.assertOrgOwnsListing`; R1–R6 apply unchanged.

### Admin (`requireAuth`, `requireAdmin`)

| Method and path                           | Change   | Behaviour                                                                                                                               |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/admin/listings?status=…`     | Extended | Items add `organizationName`, `newInstitute` (`verifiedAt` is null), `address`, `contactPhone`, `website`, `submittedAt`. Oldest first. |
| `GET /api/v1/admin/listings/:id`          | New      | Everything the review screen shows, including exams, modes, about and batch count.                                                      |
| `POST /api/v1/admin/listings/:id/publish` | Extended | Applies BR-013.                                                                                                                         |
| `POST /api/v1/admin/listings/:id/reject`  | New      | Body `{ reason }`. Applies BR-014.                                                                                                      |

`submittedAt` is the column from §4. The migration backfills it from `updatedAt` for
listings already in PENDING_REVIEW, so the queue order is defined from the first deploy.

## 8. Partner screens

Mobile first: one column, `tap-target`, 16px inputs, `type="tel"` and `autoComplete` where
they apply. Forms post through server actions and validate with the shared schemas first.

```
/ ──"List your institute"──▶ /sign-up ──▶ /onboarding ──▶ /dashboard/new ──▶ /dashboard/<id>
                             <SignUp/>    <CreateOrganization/>  name + city      details → submit
```

- **`/`** — a primary "List your institute" button for signed-out visitors.
- **`/sign-up`, `/sign-in`** — Clerk's components on their own pages.
- **`/onboarding`** — Clerk's create-organisation form, explaining that an organisation is
  the institute or group and can hold several branches. Continues to `/dashboard/new`.
- **Header** — Clerk's organisation switcher with the personal account hidden.
- **`/dashboard`** — signed in with no active organisation redirects to `/onboarding`,
  replacing the "No organisation selected" card. With no listings, the empty state becomes
  an "Add your institute" button.
- **`/dashboard/new`** — name and city only. Creates the draft and opens it.
- **`/dashboard/<id>`** gains a status banner and a "Verification details" section:

| State                        | Banner                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| DRAFT                        | Checklist from `missingForSubmission`; **Submit for review** enabled when complete.     |
| DRAFT with `rejectionReason` | Red: the reason, then "Fix the details below and submit again."                         |
| PENDING_REVIEW               | "We're reviewing your institute. This usually takes 1–2 working days." Editing allowed. |
| PUBLISHED                    | Link to the public page.                                                                |

Verification details: address, contact phone (labelled "Private — only One Academy sees
this"), exam chips (checkbox inputs styled as chips), city (editable only in DRAFT).

## 9. Admin screens

`/admin` in the partner app. The partner app reads `globalRole` from the session claim; a
non-admin gets `notFound()` so the area's existence is not disclosed. The API's
`requireAdmin` is the real enforcement. Admin pages do not require an active organisation.
The header shows an **Admin** link to admins only.

- **`/admin/review`** — PENDING_REVIEW listings, oldest first. Each card: listing name,
  organisation, city, "submitted N days ago", and a **New institute** badge when approving
  will also verify the organisation. Empty state: "Nothing waiting for review."
- **`/admin/review/<id>`** — name, organisation, city, locality, address, **contact phone
  as a `tel:` link**, website (new tab), exams, modes, about, batch count.
  - **Approve & publish** — labelled "Approve & publish (also verifies <org>)" for a new
    institute. Confirms "Published. It will appear on the site within 5 minutes." (REQ-002.)
  - **Reject** — a required reason (10–500 characters), noting that the institute sees it.
  - A `409` from either action means another tab already decided: show "This listing was
    already reviewed" and return to the queue.

## 10. Failure modes

| Condition                                      | API response                         | What the user sees                                          |
| ---------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| Submit with required details missing           | 409 `LISTING_INCOMPLETE` + `missing` | The checklist items still unticked                          |
| City changed after publication                 | 409 `CITY_IMMUTABLE`                 | "A published listing's city cannot be changed."             |
| Unknown city or exam slug                      | 400 `VALIDATION_FAILED`              | Unreachable from the UI, which only offers reference values |
| Reject without a valid reason                  | 400 `VALIDATION_FAILED`              | Inline error on the reason box                              |
| Publish or reject a listing not PENDING_REVIEW | 409 `INVALID_STATUS_TRANSITION`      | "This listing was already reviewed"                         |
| Non-admin calls an admin endpoint              | 403 `FORBIDDEN`                      | Not reachable; `/admin` is a 404 for non-admins             |
| Clerk API unreachable while provisioning       | 503 `UPSTREAM_UNAVAILABLE`           | "We couldn't set up your institute. Please try again."      |
| Listing owned by another organisation          | 403 `FORBIDDEN` (unchanged)          | "You do not have permission to change this listing."        |

## 11. Testing

**Unit** — `missingForSubmission`: each required field missing alone, all present.

**API integration** (real Postgres, `x-test-auth`):

- BR-011: a `status` or `organizationId` in the create body is stripped as an unknown key
  and has no effect; the listing lands in DRAFT under the session's organisation.
- BR-012: each missing field yields 409 naming exactly it; a complete listing submits and
  `rejectionReason` is cleared.
- BR-013: first publish sets `verifiedAt` and `verifiedByClerkUserId`; a second publish
  leaves them unchanged.
- BR-014: reason length bounds; reject outside PENDING_REVIEW is 409; non-admin is 403.
- **Privacy:** `contactPhone` is absent from public detail, search, landing and compare
  responses, and present in partner and admin responses.
- **Slug hole:** a Clerk organisation whose slug matches an existing local organisation
  gets a new organisation; the existing one's `clerkOrgId` is unchanged.
- **Provisioning:** an unknown Clerk organisation is created once; a concurrent webhook and
  request yield one row; a Clerk failure is 503 and writes nothing.

`lib/clerk.ts` is the only module replaced in tests (`vi.mock`). It is the repo's first
mock, permitted because Clerk is an external service; the database is never mocked.

**End to end** — `e2e/tests/moderation.spec.ts` extends through the API and the public
site: create → submit incomplete (409) → complete → submit → reject → reason visible on
the partner detail response → resubmit → publish → organisation verified → public page
live, **with no contact phone in its HTML**.

**Manual** — e2e does not run the partner app (it needs live Clerk sessions), which is a
pre-existing gap. Before the slice is done, the owner's journey is walked on a real phone
with Clerk test keys — sign-up through publish, plus a rejection round trip — and the
result recorded in the work item.

## 12. Documentation

- New `docs/flows/partner-onboarding.md`.
- `docs/flows/listing-lifecycle.md`: the reject transition and new failure modes; bump its
  verified sha.
- BR-011 to BR-014 in `docs/domain/business-rules.md`.
- **ADR 0016** — self-registration with a merged verification gate; clerkOrgId-only
  linking; on-demand provisioning.
- ADR 0006 and `runbooks/local-setup.md` — admin rights come from Clerk session metadata;
  an unknown Clerk organisation is provisioned, not refused.
- Glossary: "verified organisation".
- Regenerate `docs/api/openapi.json`.

## 13. Build order

Each step ends with `pnpm verify` green.

1. Migration (columns, backfill) and the slug-linking fix with its regression test.
2. API: provisioning, partner endpoints, admin endpoints, with integration tests.
3. Partner onboarding screens.
4. Admin screens.
5. E2E extension, docs, manual phone walkthrough.

## 14. Open items

- **"1–2 working days"** in the under-review banner is a promise the owner must be able to
  keep. Confirm or change before step 3.
- **Clerk dashboard configuration** — organisations must be enabled, and `globalRole` must
  be exposed in the session token's `metadata` claim. Both are owner actions in the Clerk
  dashboard, recorded in the runbook.
- **Junk sign-ups** cost nothing but owner time while volume is low. If the queue fills with
  spam, phone OTP (considered and deferred) is the next defence.
