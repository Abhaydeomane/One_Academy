# Glossary

**Listing** — the shared core row for anything discoverable, discriminated by `vertical`.
Carries identity, slug, status, location and rating. Not institute-specific: a hostel will
be a Listing too.

**Institute** — a Listing with `vertical = INSTITUTE` plus its `InstituteProfile`. In
conversation "institute" means the pair; in code they are separate rows joined one-to-one.

**Batch** — a dated cohort belonging to one institute Listing: exam, mode, schedule, seats
and fee. Has its own `DRAFT | PUBLISHED | ARCHIVED` status, independent of its listing's
status — though it cannot be published while the listing is not (BR-004).

**Organization** — the partner account that owns listings. Mirrors a Clerk organisation. A
user acts on behalf of exactly one at a time, carried as `req.auth.orgId`.

**Clerk organisation id vs Organization id** — `req.auth.orgId` is Clerk's identifier. The
local `Organization.id` is different, and every database query uses the local one.
`resolveOrganizationId()` translates.

**Membership** — a user's role within an organisation: `OWNER | MANAGER | VIEWER`.

**Global role** — `USER` or `ADMIN`, read from the Clerk session's `metadata.globalRole`.
Distinct from Membership role: Membership is per-organisation, globalRole is platform-wide.
The `User.globalRole` column is not used for authorization.

**Verified organisation** — one whose first listing an admin has published (BR-013);
`Organization.verifiedAt` is set.

**Enquiry** — a student's lead on a listing, optionally naming a batch. Becomes the
admissions pipeline in P3.

**Vertical** — a listing category with its own typed profile tables. `INSTITUTE` today,
`HOSTEL` planned for P4.

**Listing status** — `DRAFT` (partner editing) → `PENDING_REVIEW` (submitted) →
`PUBLISHED` (publicly visible) → `SUSPENDED` (withdrawn). Only an ADMIN moves a listing to
PUBLISHED.
