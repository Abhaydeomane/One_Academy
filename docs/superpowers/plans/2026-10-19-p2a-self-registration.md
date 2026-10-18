# P2a Institute Self-Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an institute sign up, create its organisation and a draft listing, and submit it for review from a phone; let the owner approve (which also verifies the organisation) or reject with a reason from `/admin` in the partner app.

**Architecture:** Additive columns on `Organization` and `Listing`, one new transition (reject: PENDING_REVIEW → DRAFT), and one shared definition of "complete enough to submit" (`missingForSubmission`). The accounts module stops linking organisations by slug (an account-takeover hole under self-registration) and provisions an unknown Clerk organisation on demand from Clerk's Backend API. The partner app gains Clerk sign-up/onboarding pages, a verification-details form with a status banner, and admin review screens gated on the same session claim the API trusts.

**Tech Stack:** Zod 4.6.5, Express 5.3.0, Prisma 7.10.0, Next.js 16.4.0 App Router, React 19.3.0, Tailwind 4, Clerk (`@clerk/express` 2.1.78, `@clerk/nextjs` 7.9.14), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-p2a-self-registration-design.md`

## Global Constraints

- **R1/R3** — only `*.repository.ts` may import `@one/db`.
- **R2** — services and repositories must not import `express`.
- **R4** — cross-module access goes through the other module's **service**. A route calls only its own module's service.
- **R5** — every route input is validated by a Zod schema from `@one/shared`, read with `validated<T>(req, …)`.
- **R6** — throw `AppError` subclasses from `apps/api/src/lib/errors.ts`; only `middleware/errorHandler.ts` maps to HTTP.
- **Never mock the database.** `apps/api/src/lib/clerk.ts` is the only module replaced in tests (`vi.mock`), because Clerk is an external service.
- **Express 5 catches async rejections.** No `asyncHandler` wrappers.
- **Versions are pinned** in `pnpm-workspace.yaml`'s catalog. This plan adds no dependencies.
- **Mobile first** — 390px is the design target; `tap-target` on anything interactive; inputs `text-base`; `type="tel"`, `inputMode`, `autoComplete` on form fields.
- **`contactPhone` is private.** It appears only in partner and admin contracts, never in a public one.
- **BR-011–BR-014** as stated in spec §5. Reason length **10–500** characters after trimming. Phone is **exactly 10 digits**.
- Copy, verbatim: "We're reviewing your institute. This usually takes 1–2 working days." / "Private — only One Academy sees this" / "Published. It will appear on the site within 5 minutes." / "This listing was already reviewed" / "Nothing waiting for review." / "We couldn't set up your institute. Please try again."
- Each task ends with `pnpm verify` green unless the task says otherwise. Commits are conventional and end with the `Co-Authored-By` trailer.

## Review Focus

1. **Phone typed the way Indians write it** (`+91 98765 43210`, `098765-43210`) — expect it to be accepted and stored as `9876543210`, not rejected. Pinned by `normalizePhone` tests in Task 1, used by the partner action in Task 11.
2. **A rejection reason padded with spaces** (`"   too short  "`) — expect it to be trimmed before the 10-character minimum is checked. Pinned by a `rejectListingBody` test in Task 7.
3. **Two institutes with the same name in the same city** — expect the second listing's slug to get a suffix, not a 500 on the unique constraint. Pinned in Task 5.
4. **An organisation or institute named only in a non-Latin script** (`ज्ञान अकादमी`) — expect a usable fallback slug, never an empty one. Pinned by `slugify` and provisioning tests in Task 4 and a listing test in Task 5.
5. **A signed-in user with no organisation deep-linking to `/dashboard/new`** — expect a redirect to `/onboarding`, not an error page. Implemented in Task 10 and checked in the Task 14 phone walkthrough (the partner app has no automated browser tests).

---

## File Structure

**Shared (`packages/shared/src/`)**

- `phone.ts` (create) — `phoneSchema`, `normalizePhone`. One definition of a valid phone for enquiries and listings.
- `submission.ts` (create) — `SUBMISSION_FIELDS`, `SUBMISSION_FIELD_LABELS`, `missingForSubmission`. The single definition of BR-012.
- `submission.test.ts`, `phone.test.ts` (create).
- `errors.ts` (modify) — three new error codes.
- `contracts/enquiries.ts` (modify) — uses `phoneSchema`.
- `contracts/partner.ts` (modify) — create body, reference response, extended detail and update body.
- `contracts/admin.ts` (modify) — extended summary, detail, reject body.
- `contracts/institutes.ts` (modify) — public `address`.
- `index.ts` (modify) — exports.
- `scripts/gen-openapi.ts` (modify) — new paths.

**Database (`packages/db/`)**

- `prisma/schema.prisma` (modify), one new migration, `prisma/seed.ts` (modify).

**API (`apps/api/src/`)**

- `lib/clerk.ts` (create) — the only Clerk Backend API call.
- `lib/slug.ts`, `lib/slug.test.ts` (create) — `slugify`.
- `lib/errors.ts` (modify) — `UpstreamUnavailableError`.
- `modules/accounts/accounts.service.ts` (modify) — clerkOrgId-only linking, on-demand provisioning.
- `modules/listings/listings.{service,repository,admin.routes}.ts` (modify) — submit/reject/publish-and-verify, admin detail.
- `modules/institutes/institutes.{service,repository,partner.routes}.ts` (modify) — reference, create, extended update, public address.
- `server.ts` (modify) — mount the reference router.
- `test/helpers/db.ts` (modify) — make the seeded draft submittable.

**Partner app (`apps/partner/src/`)**

- `lib/admin.ts` (create) — `isAdmin()`.
- `lib/api.ts` (modify) — error copy for new codes.
- `app/layout.tsx`, `app/page.tsx`, `app/dashboard/page.tsx` (modify).
- `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`, `app/onboarding/page.tsx` (create).
- `app/dashboard/new/{page.tsx,NewListingForm.tsx,actions.ts}` (create).
- `app/dashboard/[listingId]/{StatusBanner.tsx,VerificationForm.tsx}` (create); `page.tsx`, `actions.ts` (modify).
- `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/review/page.tsx`, `app/admin/review/[listingId]/{page.tsx,ReviewActions.tsx,actions.ts}` (create).

**Web, e2e, docs**

- `apps/web/src/app/institutes/[slug]/page.tsx` (modify) — show the address.
- `e2e/tests/moderation.spec.ts` (modify).
- Docs listed in Task 14.

---

## Task 1: Shared primitives — phone, submission completeness, error codes

**Files:**

- Create: `packages/shared/src/phone.ts`, `packages/shared/src/phone.test.ts`, `packages/shared/src/submission.ts`, `packages/shared/src/submission.test.ts`
- Modify: `packages/shared/src/errors.ts`, `packages/shared/src/contracts/enquiries.ts`, `packages/shared/src/index.ts`

**Interfaces:**

- Produces: `phoneSchema: z.ZodString`, `normalizePhone(raw: string): string`, `SUBMISSION_FIELDS`, `type SubmissionField = 'name' | 'city' | 'address' | 'contactPhone' | 'exams'`, `SUBMISSION_FIELD_LABELS: Record<SubmissionField, string>`, `type SubmissionCandidate`, `missingForSubmission(candidate): SubmissionField[]`; error codes `LISTING_INCOMPLETE`, `CITY_IMMUTABLE`, `UPSTREAM_UNAVAILABLE`.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/phone.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizePhone, phoneSchema } from './phone.js'

describe('normalizePhone', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['98765 43210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['+91-98765-43210', '9876543210'],
    ['919876543210', '9876543210'],
    ['098765-43210', '9876543210'],
    ['(98765) 43210', '9876543210'],
  ])('normalises %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected)
  })

  it('leaves a number it cannot interpret for the schema to reject', () => {
    expect(phoneSchema.safeParse(normalizePhone('12345')).success).toBe(false)
  })
})

describe('phoneSchema', () => {
  it('accepts exactly ten digits', () => {
    expect(phoneSchema.safeParse('9876543210').success).toBe(true)
  })

  it('rejects anything else', () => {
    expect(phoneSchema.safeParse('98765 43210').success).toBe(false)
    expect(phoneSchema.safeParse('98765432101').success).toBe(false)
  })
})
```

`packages/shared/src/submission.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { missingForSubmission, type SubmissionCandidate } from './submission.js'

const complete: SubmissionCandidate = {
  name: 'Alpha Academy',
  cityName: 'Pune',
  address: '12 FC Road, Shivajinagar, Pune 411005',
  contactPhone: '9876543210',
  exams: ['jee'],
}

describe('missingForSubmission (BR-012)', () => {
  it('reports nothing for a complete listing', () => {
    expect(missingForSubmission(complete)).toEqual([])
  })

  it.each([
    ['name', { name: '  ' }],
    ['city', { cityName: null }],
    ['address', { address: '' }],
    ['contactPhone', { contactPhone: null }],
    ['exams', { exams: [] }],
  ] as const)('reports %s alone when only it is missing', (field, override) => {
    expect(missingForSubmission({ ...complete, ...override })).toEqual([field])
  })

  it('reports every missing field in a stable order', () => {
    expect(missingForSubmission({})).toEqual(['name', 'city', 'address', 'contactPhone', 'exams'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @one/shared test`
Expected: FAIL — cannot resolve `./phone.js` and `./submission.js`.

- [ ] **Step 3: Implement**

`packages/shared/src/phone.ts`:

```ts
import { z } from 'zod'

/// The one definition of a valid phone number: ten digits, no prefix. Used by
/// enquiries and by a listing's private contact phone.
export const phoneSchema = z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits')

/// Turns the ways people actually type an Indian mobile number into the stored
/// form. Anything it cannot interpret is returned digits-only, for phoneSchema
/// to reject with a readable message.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}
```

`packages/shared/src/submission.ts`:

```ts
/// BR-012: the details a listing must carry before it can be submitted for
/// review, because they are what the owner verifies. The API enforces this and
/// the partner page draws its checklist from it, so the two cannot disagree.
export const SUBMISSION_FIELDS = ['name', 'city', 'address', 'contactPhone', 'exams'] as const
export type SubmissionField = (typeof SUBMISSION_FIELDS)[number]

export const SUBMISSION_FIELD_LABELS: Record<SubmissionField, string> = {
  name: 'Institute name',
  city: 'City',
  address: 'Full address',
  contactPhone: 'Contact phone',
  exams: 'At least one exam',
}

export type SubmissionCandidate = {
  name?: string | null
  cityName?: string | null
  address?: string | null
  contactPhone?: string | null
  exams?: readonly string[] | null
}

const blank = (value?: string | null) => !value || value.trim().length === 0

export function missingForSubmission(candidate: SubmissionCandidate): SubmissionField[] {
  const missing: SubmissionField[] = []
  if (blank(candidate.name)) missing.push('name')
  if (blank(candidate.cityName)) missing.push('city')
  if (blank(candidate.address)) missing.push('address')
  if (blank(candidate.contactPhone)) missing.push('contactPhone')
  if (!candidate.exams || candidate.exams.length === 0) missing.push('exams')
  return missing
}
```

In `packages/shared/src/errors.ts`, append to `ERROR_CODES` after `'INVALID_STATUS_TRANSITION',`:

```ts
  'LISTING_INCOMPLETE',
  'CITY_IMMUTABLE',
  'UPSTREAM_UNAVAILABLE',
```

In `packages/shared/src/contracts/enquiries.ts`, replace the `phone` line and add the import:

```ts
import { phoneSchema } from '../phone.js'
// …
  phone: phoneSchema,
```

In `packages/shared/src/index.ts`, add:

```ts
export * from './phone.js'
export * from './submission.js'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @one/shared test`
Expected: PASS, including the existing `createEnquiryBody` tests (the phone rule is unchanged).

- [ ] **Step 5: Run `pnpm verify` and commit**

```bash
git add packages/shared
git commit -m "feat(shared): phone normalisation, BR-012 completeness and P2a error codes"
```

---

## Task 2: Schema migration and backfills

**Files:**

- Modify: `packages/db/prisma/schema.prisma`, `packages/db/prisma/seed.ts`
- Create: `packages/db/prisma/migrations/<timestamp>_p2a_self_registration/migration.sql` (generated, then edited)

**Interfaces:**

- Produces: `Organization.verifiedAt DateTime?`, `Organization.verifiedByClerkUserId String?`, `Listing.address String?`, `Listing.contactPhone String?`, `Listing.rejectionReason String?`, `Listing.submittedAt DateTime?`.

- [ ] **Step 1: Edit the schema**

In `model Organization`, after `status`:

```prisma
  /// Set when the organisation's first listing is published (BR-013). Null
  /// means One Academy has not yet verified that the institute is real.
  verifiedAt            DateTime?
  /// Clerk user id of the admin who verified it. A plain string, not a User FK:
  /// the local User row exists only if the user webhook arrived.
  verifiedByClerkUserId String?
```

In `model Listing`, after `locality`:

```prisma
  address         String?
  /// Private: for verification only. Never part of a public contract.
  contactPhone    String?
  /// Latest rejection reason (BR-014). Cleared on the next submit.
  rejectionReason String?
  submittedAt     DateTime?
```

- [ ] **Step 2: Generate the migration without applying it**

Run: `pnpm --filter @one/db exec prisma migrate dev --create-only --name p2a_self_registration`
Expected: a new folder under `packages/db/prisma/migrations/` with `ALTER TABLE` statements for the six columns.

- [ ] **Step 3: Append the backfills to the generated `migration.sql`**

```sql
-- Listings already waiting for review get a submission time so the admin
-- queue order is defined from the first deploy.
UPDATE "Listing" SET "submittedAt" = "updatedAt" WHERE "status" = 'PENDING_REVIEW';

-- Organisations with a published listing were verified by hand before P2a.
-- Without this, their next listing would be flagged as a new institute.
UPDATE "Organization" o SET "verifiedAt" = now()
WHERE EXISTS (
  SELECT 1 FROM "Listing" l WHERE l."organizationId" = o."id" AND l."status" = 'PUBLISHED'
);
```

- [ ] **Step 4: Apply to dev and test databases and rebuild the client**

```bash
pnpm --filter @one/db db:migrate
DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" \
  pnpm --filter @one/db exec prisma migrate deploy
pnpm --filter @one/db build
```

Expected: both report the migration applied; the build succeeds.

- [ ] **Step 5: Verify the backfill on dev data**

```bash
psql "postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev" -c \
  'SELECT o.slug, o."verifiedAt" IS NOT NULL AS verified, count(l.*) FILTER (WHERE l.status = $$PUBLISHED$$) AS published FROM "Organization" o LEFT JOIN "Listing" l ON l."organizationId" = o.id GROUP BY o.slug, o."verifiedAt";'
```

Expected: every row with `published > 0` has `verified = t`.

- [ ] **Step 6: Keep the seed consistent**

In `packages/db/prisma/seed.ts`, every organisation that the seed gives a `PUBLISHED` listing gets `verifiedAt: new Date('2026-01-01T00:00:00Z')` in both its `create` and `update` blocks, so a reseeded database matches a migrated one.

- [ ] **Step 7: Run `pnpm verify` and commit**

```bash
git add packages/db
git commit -m "feat(db): verification, address, private phone and review columns"
```

---

## Task 3: Close the slug-linking account takeover

**Files:**

- Modify: `apps/api/src/modules/accounts/accounts.service.ts`, `apps/api/src/modules/accounts/accounts.service.test.ts`

**Interfaces:**

- Consumes: `repo.findOrgByClerkId`, `repo.findOrgBySlug`, `repo.createOrg` (existing).
- Produces: `syncOrganization(input)` that never adopts an organisation by slug; internal `createOrgOnce(input): Promise<string>` reused by Task 4.

- [ ] **Step 1: Replace the adoption test with the regression test**

In `accounts.service.test.ts`, delete `it('adopts an existing organisation that has no Clerk id yet', …)` and add inside `describe('syncOrganization and resolveLocalOrgId', …)`:

```ts
it('never adopts an existing organisation by slug (account-takeover guard)', async () => {
  const existing = await prisma.organization.create({ data: { name: 'Seeded', slug: 'seeded' } })

  const id = await syncOrganization({ clerkOrgId: 'co_2', name: 'Seeded', slug: 'seeded' })

  expect(id).not.toBe(existing.id)
  const created = await prisma.organization.findUniqueOrThrow({ where: { id } })
  expect(created.slug).toBe('seeded-2')
  expect(
    (await prisma.organization.findUniqueOrThrow({ where: { id: existing.id } })).clerkOrgId,
  ).toBeNull()
})

it('suffixes past every taken slug', async () => {
  await prisma.organization.create({ data: { name: 'A', slug: 'alpha' } })
  await prisma.organization.create({ data: { name: 'A', slug: 'alpha-2' } })

  const id = await syncOrganization({ clerkOrgId: 'co_3', name: 'Alpha', slug: 'alpha' })
  expect((await prisma.organization.findUniqueOrThrow({ where: { id } })).slug).toBe('alpha-3')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @one/api exec vitest run src/modules/accounts/accounts.service.test.ts`
Expected: FAIL — the first test gets `existing.id` back.

- [ ] **Step 3: Implement**

Replace `syncOrganization` in `accounts.service.ts` and add the helpers below it:

```ts
/// A Clerk organisation matches a local one only by clerkOrgId. Matching by
/// slug would let anyone who names a Clerk organisation after an existing
/// institute take over its listings (spec §6). Linking a seeded organisation
/// to Clerk is a manual database statement (runbooks/local-setup.md).
export async function syncOrganization(input: {
  clerkOrgId: string
  name: string
  slug: string
}): Promise<string> {
  const byClerk = await repo.findOrgByClerkId(input.clerkOrgId)
  if (byClerk) return byClerk.id
  return createOrgOnce(input)
}

const MAX_SLUG_ATTEMPTS = 100

async function availableOrgSlug(base: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`
    if (!(await repo.findOrgBySlug(candidate))) return candidate
  }
  throw new ConflictError('CONFLICT', 'Could not allocate an organisation slug')
}

/// Creates the organisation, tolerating a concurrent creator: the webhook and
/// an on-demand provision (Task 4) can race, and the unique clerkOrgId makes
/// the loser's insert fail. The loser then returns the winner's row.
async function createOrgOnce(input: {
  clerkOrgId: string
  name: string
  slug: string
}): Promise<string> {
  const slug = await availableOrgSlug(input.slug)
  try {
    return await repo.createOrg({ ...input, slug })
  } catch (error) {
    const existing = await repo.findOrgByClerkId(input.clerkOrgId)
    if (existing) return existing.id
    throw error
  }
}
```

Change the errors import to `import { ConflictError, ForbiddenError } from '../../lib/errors.js'`.

- [ ] **Step 4: Run the accounts tests**

Run: `pnpm --filter @one/api exec vitest run src/modules/accounts`
Expected: PASS, including `accounts.routes.test.ts` (its webhook payloads use fresh slugs).

- [ ] **Step 5: Run `pnpm verify` and commit**

```bash
git add apps/api/src/modules/accounts
git commit -m "fix(api): link Clerk organisations by clerkOrgId only

Slug-based adoption let anyone who named a Clerk organisation after an
existing institute take over its listings once self-registration opens."
```

---

## Task 4: Provision unknown Clerk organisations on demand

**Files:**

- Create: `apps/api/src/lib/clerk.ts`, `apps/api/src/lib/slug.ts`, `apps/api/src/lib/slug.test.ts`
- Modify: `apps/api/src/lib/errors.ts`, `apps/api/src/modules/accounts/accounts.service.ts`, `apps/api/src/modules/accounts/accounts.service.test.ts`, `apps/api/src/modules/institutes/institutes.partner.routes.test.ts`

**Interfaces:**

- Consumes: `createOrgOnce` (Task 3).
- Produces: `fetchClerkOrganization(clerkOrgId: string): Promise<{ id: string; name: string; slug: string | null }>`; `slugify(value: string): string`; `UpstreamUnavailableError`; `resolveLocalOrgId(clerkOrgId)` now provisions instead of throwing 403.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/lib/slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { slugify } from './slug.js'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Alpha Academy  Pune')).toBe('alpha-academy-pune')
  })

  it('strips accents and punctuation', () => {
    expect(slugify("Ré's Classes & Co.")).toBe('re-s-classes-co')
  })

  it('returns an empty string for a non-Latin name, for the caller to replace', () => {
    expect(slugify('ज्ञान अकादमी')).toBe('')
  })

  it('caps the length without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(79)} b`)
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })
})
```

In `accounts.service.test.ts`, add `vi` to the existing `vitest` import, then add below the imports:

```ts
import { fetchClerkOrganization } from '../../lib/clerk.js'

vi.mock('../../lib/clerk.js', () => ({ fetchClerkOrganization: vi.fn() }))
const fetchOrg = vi.mocked(fetchClerkOrganization)
```

Add `fetchOrg.mockReset()` to the existing `beforeEach`. In `institutes.partner.routes.test.ts`, add the same three lines (with `vi` added to its `vitest` import) and the same `mockReset()` call. Delete `it('forbids an unknown Clerk organisation', …)` and add:

```ts
describe('on-demand provisioning', () => {
  it('creates an unknown organisation from Clerk', async () => {
    fetchOrg.mockResolvedValue({ id: 'co_new', name: 'Gamma Classes', slug: 'gamma-classes' })

    const id = await resolveLocalOrgId('co_new')

    const org = await prisma.organization.findUniqueOrThrow({ where: { id } })
    expect(org).toMatchObject({
      clerkOrgId: 'co_new',
      name: 'Gamma Classes',
      slug: 'gamma-classes',
    })
    expect(fetchOrg).toHaveBeenCalledWith('co_new')
  })

  it('does not call Clerk for a known organisation', async () => {
    const id = await syncOrganization({ clerkOrgId: 'co_1', name: 'Alpha', slug: 'alpha' })
    expect(await resolveLocalOrgId('co_1')).toBe(id)
    expect(fetchOrg).not.toHaveBeenCalled()
  })

  it('creates exactly one row when the webhook and a request race', async () => {
    fetchOrg.mockResolvedValue({ id: 'co_new', name: 'Gamma Classes', slug: 'gamma-classes' })

    const [fromWebhook, fromRequest] = await Promise.all([
      syncOrganization({ clerkOrgId: 'co_new', name: 'Gamma Classes', slug: 'gamma-classes' }),
      resolveLocalOrgId('co_new'),
    ])

    expect(fromRequest).toBe(fromWebhook)
    expect(await prisma.organization.count()).toBe(1)
  })

  it('falls back to a slug from the Clerk id for a non-Latin name', async () => {
    fetchOrg.mockResolvedValue({ id: 'co_Hindi1', name: 'ज्ञान अकादमी', slug: null })
    const id = await resolveLocalOrgId('co_Hindi1')
    expect((await prisma.organization.findUniqueOrThrow({ where: { id } })).slug).toBe(
      'org-co-hindi1',
    )
  })

  it('is UPSTREAM_UNAVAILABLE and writes nothing when Clerk fails', async () => {
    fetchOrg.mockRejectedValue(new Error('network down'))
    await expect(resolveLocalOrgId('co_new')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      status: 503,
    })
    expect(await prisma.organization.count()).toBe(0)
  })
})
```

In `institutes.partner.routes.test.ts`, add the same mock block at the top (path `'../../lib/clerk.js'`) and replace `it('403s an organisation that is not provisioned locally', …)` with:

```ts
it('provisions an organisation it has not seen and returns its empty list', async () => {
  fetchOrg.mockResolvedValue({ id: 'co_unknown', name: 'Gamma Classes', slug: 'gamma-classes' })

  const res = await testApp().get('/api/v1/partner/listings').set('x-test-auth', auth('co_unknown'))

  expect(res.status).toBe(200)
  expect(partnerListingListResponse.parse(res.body).items).toHaveLength(0)
  expect(await prisma.organization.count({ where: { clerkOrgId: 'co_unknown' } })).toBe(1)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @one/api exec vitest run src/lib/slug.test.ts src/modules/accounts src/modules/institutes/institutes.partner.routes.test.ts`
Expected: FAIL — `./slug.js` and `../../lib/clerk.js` do not exist.

- [ ] **Step 3: Implement**

`apps/api/src/lib/slug.ts`:

```ts
const MAX_LENGTH = 80

/// ASCII, lowercase, hyphen-separated. Returns '' for input with no Latin
/// letters or digits; callers supply their own fallback.
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, '')
}
```

`apps/api/src/lib/clerk.ts`:

```ts
import { clerkClient } from '@clerk/express'

export type ClerkOrganization = { id: string; name: string; slug: string | null }

/// The API's only call to Clerk's Backend API, isolated so tests can replace
/// it. Clerk is an external service; the database is never mocked.
export async function fetchClerkOrganization(clerkOrgId: string): Promise<ClerkOrganization> {
  const org = await clerkClient.organizations.getOrganization({ organizationId: clerkOrgId })
  return { id: org.id, name: org.name, slug: org.slug ?? null }
}
```

In `apps/api/src/lib/errors.ts`, append:

```ts
/// A service this request depends on (Clerk) did not answer. Nothing was written.
export class UpstreamUnavailableError extends AppError {
  constructor(message = 'An upstream service is unavailable') {
    super('UPSTREAM_UNAVAILABLE', 503, message)
  }
}
```

In `accounts.service.ts`, replace `resolveLocalOrgId` and its comment:

```ts
/// Translates a Clerk organisation id into the local Organization.id. Under
/// self-registration every Clerk organisation is a legitimate institute, so an
/// unseen one is provisioned here rather than refused: the organization.created
/// webhook can arrive after the partner's first request. The name comes from
/// Clerk with the server secret, never from the request; the id comes from the
/// verified session.
export async function resolveLocalOrgId(clerkOrgId: string): Promise<string> {
  const org = await repo.findOrgByClerkId(clerkOrgId)
  if (org) return org.id
  return provisionFromClerk(clerkOrgId)
}

async function provisionFromClerk(clerkOrgId: string): Promise<string> {
  let remote: ClerkOrganization
  try {
    remote = await fetchClerkOrganization(clerkOrgId)
  } catch {
    throw new UpstreamUnavailableError('Could not reach Clerk to set up the organisation')
  }
  const slug = slugify(remote.slug ?? remote.name) || `org-${slugify(clerkOrgId)}`
  return createOrgOnce({ clerkOrgId, name: remote.name, slug })
}
```

Update the imports in `accounts.service.ts`:

```ts
import { fetchClerkOrganization, type ClerkOrganization } from '../../lib/clerk.js'
import { ConflictError, UpstreamUnavailableError } from '../../lib/errors.js'
import { slugify } from '../../lib/slug.js'
```

(`ForbiddenError` is no longer used here; remove it if lint says so.)

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @one/api exec vitest run src/lib/slug.test.ts src/modules/accounts src/modules/institutes/institutes.partner.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Run `pnpm verify` and commit**

```bash
git add apps/api/src
git commit -m "feat(api): provision unseen Clerk organisations on demand"
```

---

## Task 5: Reference data and partner listing creation (BR-011)

**Files:**

- Modify: `packages/shared/src/contracts/partner.ts`, `apps/api/src/modules/institutes/institutes.{repository,service,partner.routes}.ts`, `apps/api/src/modules/listings/listings.service.ts`, `apps/api/src/server.ts`, `apps/api/src/modules/institutes/institutes.partner.routes.test.ts`

**Interfaces:**

- Consumes: `slugify` (Task 4).
- Produces: `createListingBody`, `CreateListingBody`, `partnerReferenceResponse`, `PartnerReferenceResponse`; `listings.service.isSlugTaken(slug): Promise<boolean>`; `institutes.service.referenceData()`, `institutes.service.createForOrg(organizationId, body)`, internal `availableListingSlug(base)`; `partnerReferenceRouter` mounted at `/api/v1/partner/reference`; `POST /api/v1/partner/listings`.

- [ ] **Step 1: Add the contracts**

Append to `packages/shared/src/contracts/partner.ts`:

```ts
export const partnerReferenceResponse = z.object({
  cities: z.array(z.object({ slug: z.string(), name: z.string(), state: z.string() })),
  exams: z.array(z.object({ slug: z.string(), label: z.string() })),
})
export type PartnerReferenceResponse = z.infer<typeof partnerReferenceResponse>

/// BR-011: no status and no organisation. Unknown keys are stripped, so a
/// client that sends them changes nothing; the organisation comes from the session.
export const createListingBody = z.object({
  name: z.string().trim().min(2).max(200),
  citySlug: z.string().min(1),
})
export type CreateListingBody = z.infer<typeof createListingBody>
```

- [ ] **Step 2: Write the failing route tests**

Append to `institutes.partner.routes.test.ts` (import `partnerReferenceResponse` alongside the existing contract imports):

```ts
describe('GET /api/v1/partner/reference', () => {
  it('lists cities and exam tags', async () => {
    const res = await testApp()
      .get('/api/v1/partner/reference')
      .set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(200)
    const body = partnerReferenceResponse.parse(res.body)
    expect(body.cities).toEqual([{ slug: 'pune', name: 'Pune', state: 'Maharashtra' }])
    expect(body.exams).toEqual([{ slug: 'jee', label: 'JEE' }])
  })
})

describe('POST /api/v1/partner/listings (BR-011)', () => {
  it('creates a DRAFT for the session organisation, ignoring status and organizationId', async () => {
    const res = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({
        name: 'Gamma Classes',
        citySlug: 'pune',
        status: 'PUBLISHED',
        organizationId: seed.otherOrgId,
      })

    expect(res.status).toBe(201)
    const body = partnerListingDetail.parse(res.body)
    expect(body.status).toBe('DRAFT')
    expect(body.slug).toBe('gamma-classes-pune')

    const row = await prisma.listing.findUniqueOrThrow({ where: { id: body.id } })
    expect(row.organizationId).toBe(seed.orgId)
  })

  it('suffixes the slug when the same name is taken in the same city', async () => {
    const first = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'Gamma Classes', citySlug: 'pune' })
    const second = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_beta'))
      .send({ name: 'Gamma Classes', citySlug: 'pune' })

    expect(first.body.slug).toBe('gamma-classes-pune')
    expect(second.status).toBe(201)
    expect(second.body.slug).toBe('gamma-classes-pune-2')
  })

  it('avoids a slug held by a redirect', async () => {
    await prisma.listingRedirect.create({
      data: { listingId: seed.publishedListingId, oldSlug: 'gamma-classes-pune' },
    })
    const res = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'Gamma Classes', citySlug: 'pune' })
    expect(res.body.slug).toBe('gamma-classes-pune-2')
  })

  it('builds a slug from the city alone for a non-Latin name', async () => {
    const res = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'ज्ञान अकादमी', citySlug: 'pune' })
    expect(res.status).toBe(201)
    expect(res.body.slug).toBe('pune')
  })

  it('400s an unknown city', async () => {
    const res = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: 'Gamma Classes', citySlug: 'atlantis' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('400s a one-character name', async () => {
    const res = await testApp()
      .post('/api/v1/partner/listings')
      .set('x-test-auth', auth('co_alpha'))
      .send({ name: ' G ', citySlug: 'pune' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @one/api exec vitest run src/modules/institutes/institutes.partner.routes.test.ts`
Expected: FAIL — 404 for both new paths.

- [ ] **Step 4: Implement**

`listings.service.ts`, add:

```ts
/// A slug is taken if a listing holds it or a redirect still answers for it;
/// reusing a redirect's old slug would hijack its traffic.
export async function isSlugTaken(slug: string): Promise<boolean> {
  return (await repo.findBySlug(slug)) !== null || (await repo.findRedirectTarget(slug)) !== null
}
```

`institutes.repository.ts`, add above the re-export block:

```ts
export async function listCities() {
  return prisma.city.findMany({
    orderBy: { name: 'asc' },
    select: { slug: true, name: true, state: true },
  })
}

export async function listExamTags() {
  return prisma.tag.findMany({
    where: { kind: 'EXAM' },
    orderBy: { label: 'asc' },
    select: { slug: true, label: true },
  })
}

export async function findCityBySlug(slug: string): Promise<{ id: string; slug: string } | null> {
  return prisma.city.findUnique({ where: { slug }, select: { id: true, slug: true } })
}

export async function createDraftListing(data: {
  organizationId: string
  cityId: string
  name: string
  slug: string
}): Promise<string> {
  const listing = await prisma.listing.create({
    data: { ...data, vertical: 'INSTITUTE', status: 'DRAFT', instituteProfile: { create: {} } },
    select: { id: true },
  })
  return listing.id
}
```

`institutes.service.ts`, add (import `slugify` from `'../../lib/slug.js'`, `BadRequestError` and `ConflictError` from `'../../lib/errors.js'`, `isSlugTaken` from `'../listings/listings.service.js'`, and the two new types from `@one/shared`):

```ts
export async function referenceData(): Promise<PartnerReferenceResponse> {
  const [cities, exams] = await Promise.all([repo.listCities(), repo.listExamTags()])
  return { cities, exams }
}

const MAX_SLUG_ATTEMPTS = 100

async function availableListingSlug(base: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`
    if (!(await isSlugTaken(candidate))) return candidate
  }
  throw new ConflictError('CONFLICT', 'Could not allocate a listing address')
}

/// BR-011: always a DRAFT, always under the session's organisation.
export async function createForOrg(
  organizationId: string,
  body: CreateListingBody,
): Promise<PartnerListingDetail> {
  const city = await repo.findCityBySlug(body.citySlug)
  if (!city) {
    throw new BadRequestError('Unknown city', { fieldErrors: { citySlug: ['Unknown city'] } })
  }
  // The city slug alone is always non-empty, so a non-Latin name still yields
  // a usable address.
  const slug = await availableListingSlug(slugify(`${body.name} ${city.slug}`))
  const id = await repo.createDraftListing({
    organizationId,
    cityId: city.id,
    name: body.name,
    slug,
  })
  return getForOrg(id, organizationId)
}
```

`institutes.partner.routes.ts` — import `createListingBody`, `type CreateListingBody`; add before the `/:listingId` routes:

```ts
partnerInstitutesRouter.post('/', validate({ body: createListingBody }), async (req, res) => {
  const body = validated<CreateListingBody>(req, 'body')
  const organizationId = await institutes.resolveOrganizationId(currentOrgId(req))
  res.status(201).json(await institutes.createForOrg(organizationId, body))
})

/// Mounted at /api/v1/partner/reference. It lives in this module because
/// cities and exam tags are institute reference data.
export const partnerReferenceRouter = Router()
partnerReferenceRouter.use(requireAuth, requireOrg)
partnerReferenceRouter.get('/', async (_req, res) => {
  res.json(await institutes.referenceData())
})
```

`server.ts` — import `partnerReferenceRouter` with `partnerInstitutesRouter` and mount after it:

```ts
app.use('/api/v1/partner/reference', partnerReferenceRouter)
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @one/api exec vitest run src/modules/institutes/institutes.partner.routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Run `pnpm verify` and commit**

```bash
git add packages/shared apps/api/src
git commit -m "feat(api): partners create draft listings and read reference data (BR-011)"
```

---

## Task 6: Verification details, submission gate and partner detail (BR-012)

**Files:**

- Modify: `packages/shared/src/contracts/partner.ts`, `apps/api/src/modules/institutes/institutes.{repository,service}.ts`, `apps/api/src/modules/listings/listings.{service,repository}.ts`, `apps/api/test/helpers/db.ts`, `apps/api/src/modules/institutes/institutes.partner.routes.test.ts`, `e2e/tests/moderation.spec.ts`

**Interfaces:**

- Consumes: `phoneSchema`, `missingForSubmission` (Task 1); `availableListingSlug`, `findCityBySlug` (Task 5).
- Produces: `partnerListingSummary.rejectionReason: string | null`; `partnerListingDetail` adds `citySlug: string`, `locality`, `address`, `contactPhone: string | null`, `exams: string[]` (slugs); `updateListingBody` adds `address`, `contactPhone`, `examSlugs`, `citySlug`; `listings.repository.markSubmitted(id)`; `institutes.repository.findExamTagIds(slugs)`.

- [ ] **Step 1: Extend the contracts**

In `partner.ts`, add `import { phoneSchema } from '../phone.js'` and change:

```ts
export const partnerListingSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: listingStatusSchema,
  cityName: z.string(),
  batchCount: z.number().int(),
  rejectionReason: z.string().nullable(),
  updatedAt: z.iso.datetime(),
})
```

```ts
export const partnerListingDetail = partnerListingSummary.extend({
  citySlug: z.string(),
  locality: z.string().nullable(),
  address: z.string().nullable(),
  /// Private (spec §4): partner and admin contracts only.
  contactPhone: z.string().nullable(),
  exams: z.array(z.string()),
  shortDescription: z.string().nullable(),
  about: z.string().nullable(),
  website: z.string().nullable(),
  batches: z.array(partnerBatchSummary),
})
```

In `updateListingBody`'s object, add:

```ts
    address: z.string().trim().min(5).max(300).optional(),
    contactPhone: phoneSchema.optional(),
    examSlugs: z.array(z.string().min(1)).min(1).max(20).optional(),
    citySlug: z.string().min(1).optional(),
```

- [ ] **Step 2: Make the seeded draft submittable, and keep e2e green**

The submit gate would otherwise fail every existing submit test. In `apps/api/test/helpers/db.ts`, give the `draft` listing in `seedMinimal`:

```ts
      address: '1 Test Road, Pune 411001',
      contactPhone: '9000000001',
      tags: { create: [{ tagId: exam.id }] },
```

In `e2e/tests/moderation.spec.ts` `beforeAll`, create an exam tag and give the listing the same three fields:

```ts
  const exam = await prisma.tag.create({ data: { slug: 'neet', label: 'NEET', kind: 'EXAM' } })
  // … in listing.create data:
      address: '5 Linking Road, Bandra, Mumbai 400050',
      contactPhone: '9000000002',
      tags: { create: [{ tagId: exam.id }] },
```

- [ ] **Step 3: Write the failing tests**

Append to `institutes.partner.routes.test.ts`:

```ts
describe('PATCH /api/v1/partner/listings/:listingId — verification details', () => {
  it('stores address, phone and exams and returns them to the owner', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ address: '9 MG Road, Pune 411001', contactPhone: '9876543210', examSlugs: ['jee'] })

    expect(res.status).toBe(200)
    const body = partnerListingDetail.parse(res.body)
    expect(body).toMatchObject({
      address: '9 MG Road, Pune 411001',
      contactPhone: '9876543210',
      exams: ['jee'],
    })
  })

  it('400s an unknown exam and changes nothing', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ examSlugs: ['jee', 'astrology'] })
    expect(res.status).toBe(400)
  })

  it('400s a malformed phone', async () => {
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ contactPhone: '+91 98765 43210' })
    expect(res.status).toBe(400)
  })

  it('moves a draft to another city and regenerates its slug', async () => {
    await prisma.city.create({ data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' } })
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ citySlug: 'mumbai' })

    const body = partnerListingDetail.parse(res.body)
    expect(body.citySlug).toBe('mumbai')
    expect(body.slug).toBe('draft-academy-mumbai')
  })

  it('409s CITY_IMMUTABLE on a published listing', async () => {
    await prisma.city.create({ data: { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' } })
    const res = await testApp()
      .patch(`/api/v1/partner/listings/${seed.publishedListingId}`)
      .set('x-test-auth', auth('co_alpha'))
      .send({ citySlug: 'mumbai' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CITY_IMMUTABLE')
  })
})

describe('POST /api/v1/partner/listings/:listingId/submit (BR-012)', () => {
  it.each([
    ['address', { address: null }],
    ['contactPhone', { contactPhone: null }],
  ] as const)('409s LISTING_INCOMPLETE naming %s', async (field, data) => {
    await prisma.listing.update({ where: { id: seed.draftListingId }, data })
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/submit`)
      .set('x-test-auth', auth('co_alpha'))
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LISTING_INCOMPLETE')
    expect(res.body.error.details.missing).toEqual([field])
  })

  it('409s naming exams when none are set', async () => {
    await prisma.listingTag.deleteMany({ where: { listingId: seed.draftListingId } })
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/submit`)
      .set('x-test-auth', auth('co_alpha'))
    expect(res.body.error.details.missing).toEqual(['exams'])
  })

  it('submits a complete listing, stamps submittedAt and clears the rejection reason', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { rejectionReason: 'Phone did not answer' },
    })
    const res = await testApp()
      .post(`/api/v1/partner/listings/${seed.draftListingId}/submit`)
      .set('x-test-auth', auth('co_alpha'))

    expect(res.status).toBe(200)
    expect(partnerListingDetail.parse(res.body)).toMatchObject({
      status: 'PENDING_REVIEW',
      rejectionReason: null,
    })
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(row.submittedAt).not.toBeNull()
  })
})
```

- [ ] **Step 4: Run to verify they fail**

Run: `pnpm --filter @one/api exec vitest run src/modules/institutes/institutes.partner.routes.test.ts`
Expected: FAIL — response lacks the new fields; submit returns 200 for incomplete listings.

- [ ] **Step 5: Implement the repositories**

`listings.repository.ts`, add:

```ts
export async function markSubmitted(id: string): Promise<void> {
  await prisma.listing.update({
    where: { id },
    data: { status: 'PENDING_REVIEW', submittedAt: new Date(), rejectionReason: null },
  })
}
```

`institutes.repository.ts` — extend `PartnerListingRow` and `PARTNER_SELECT`:

```ts
export type PartnerListingRow = {
  id: string
  slug: string
  name: string
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'SUSPENDED'
  locality: string | null
  address: string | null
  contactPhone: string | null
  rejectionReason: string | null
  shortDescription: string | null
  updatedAt: Date
  city: { name: string; slug: string }
  instituteProfile: { about: string | null; website: string | null } | null
  tags: { tag: { slug: string; kind: 'EXAM' | 'AMENITY' | 'FACILITY' } }[]
  _count: { batches: number }
}

const PARTNER_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  locality: true,
  address: true,
  contactPhone: true,
  rejectionReason: true,
  shortDescription: true,
  updatedAt: true,
  city: { select: { name: true, slug: true } },
  instituteProfile: { select: { about: true, website: true } },
  tags: { select: { tag: { select: { slug: true, kind: true } } } },
  _count: { select: { batches: true } },
} as const
```

Add `findExamTagIds` and replace `updateListingAndProfile`:

```ts
export async function findExamTagIds(slugs: string[]): Promise<{ id: string; slug: string }[]> {
  return prisma.tag.findMany({
    where: { kind: 'EXAM', slug: { in: slugs } },
    select: { id: true, slug: true },
  })
}

export async function updateListingAndProfile(
  id: string,
  listing: {
    name?: string
    shortDescription?: string
    locality?: string
    address?: string
    contactPhone?: string
    cityId?: string
  },
  profile: {
    about?: string
    website?: string
    establishedYear?: number
    facultyCount?: number
    modes?: Mode[]
  },
  examTagIds?: string[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.listing.update({
      where: { id },
      data: {
        ...listing,
        ...(Object.keys(profile).length > 0
          ? { instituteProfile: { upsert: { create: profile, update: profile } } }
          : {}),
      },
    })
    if (examTagIds) {
      // Exams are replaced as a set; amenity and facility tags are untouched.
      await tx.listingTag.deleteMany({ where: { listingId: id, tag: { kind: 'EXAM' } } })
      await tx.listingTag.createMany({
        data: examTagIds.map((tagId) => ({ listingId: id, tagId })),
      })
    }
  })
}
```

- [ ] **Step 6: Implement the services**

`listings.service.ts` — `submitForReview` ends with `await repo.markSubmitted(listingId)` instead of `repo.updateStatus(listingId, 'PENDING_REVIEW')`.

`institutes.service.ts`:

```ts
const examSlugs = (tags: { tag: { slug: string; kind: string } }[]) =>
  tags.filter((entry) => entry.tag.kind === 'EXAM').map((entry) => entry.tag.slug)
```

Add `rejectionReason: row.rejectionReason,` to `toPartnerSummary`. In `getForOrg`, return:

```ts
return {
  ...toPartnerSummary(row),
  citySlug: row.city.slug,
  locality: row.locality,
  address: row.address,
  contactPhone: row.contactPhone,
  exams: examSlugs(row.tags),
  shortDescription: row.shortDescription,
  about: row.instituteProfile?.about ?? null,
  website: row.instituteProfile?.website ?? null,
  batches: await batches.listAllForListing(listingId),
}
```

Replace `submitForReviewForOrg`:

```ts
export async function submitForReviewForOrg(
  listingId: string,
  organizationId: string,
): Promise<PartnerListingDetail> {
  const current = await getForOrg(listingId, organizationId)
  const missing = missingForSubmission({
    name: current.name,
    cityName: current.cityName,
    address: current.address,
    contactPhone: current.contactPhone,
    exams: current.exams,
  })
  if (missing.length > 0) {
    throw new ConflictError(
      'LISTING_INCOMPLETE',
      'Add the missing details before submitting for review',
      { missing },
    )
  }
  await submitForReview(listingId)
  return getForOrg(listingId, organizationId)
}
```

Replace `updateForOrg` (import `changeSlug` from the listings service and `missingForSubmission` from `@one/shared`):

```ts
export async function updateForOrg(
  listingId: string,
  organizationId: string,
  body: UpdateListingBody,
): Promise<PartnerListingDetail> {
  await assertOrgOwnsListing(listingId, organizationId)
  const current = await repo.findByIdForPartner(listingId)
  if (!current) throw new NotFoundError('Listing not found')

  let cityId: string | undefined
  if (body.citySlug !== undefined && body.citySlug !== current.city.slug) {
    if (current.status !== 'DRAFT') {
      throw new ConflictError(
        'CITY_IMMUTABLE',
        'A listing city can only change while it is a draft',
      )
    }
    const city = await repo.findCityBySlug(body.citySlug)
    if (!city) {
      throw new BadRequestError('Unknown city', { fieldErrors: { citySlug: ['Unknown city'] } })
    }
    cityId = city.id
    // The slug embeds the city. A draft has never been public, so the slug is
    // regenerated rather than redirected; BR-002 starts at publication.
    await changeSlug(
      listingId,
      await availableListingSlug(slugify(`${body.name ?? current.name} ${city.slug}`)),
    )
  }

  let examTagIds: string[] | undefined
  if (body.examSlugs) {
    const wanted = [...new Set(body.examSlugs)]
    const tags = await repo.findExamTagIds(wanted)
    if (tags.length !== wanted.length) {
      throw new BadRequestError('Unknown exam', { fieldErrors: { examSlugs: ['Unknown exam'] } })
    }
    examTagIds = tags.map((tag) => tag.id)
  }

  await repo.updateListingAndProfile(
    listingId,
    {
      ...(body.name ? { name: body.name } : {}),
      ...(body.shortDescription === undefined ? {} : { shortDescription: body.shortDescription }),
      ...(body.locality === undefined ? {} : { locality: body.locality }),
      ...(body.address === undefined ? {} : { address: body.address }),
      ...(body.contactPhone === undefined ? {} : { contactPhone: body.contactPhone }),
      ...(cityId ? { cityId } : {}),
    },
    {
      ...(body.about === undefined ? {} : { about: body.about }),
      ...(body.website === undefined ? {} : { website: body.website }),
      ...(body.establishedYear === undefined ? {} : { establishedYear: body.establishedYear }),
      ...(body.facultyCount === undefined ? {} : { facultyCount: body.facultyCount }),
      ...(body.modes === undefined ? {} : { modes: body.modes }),
    },
    examTagIds,
  )

  return getForOrg(listingId, organizationId)
}
```

- [ ] **Step 7: Run the full API suite**

Run: `pnpm --filter @one/api test`
Expected: PASS. If a search or facet test moved because the seeded draft now carries an exam tag, the test was counting draft listings — check BR-009 before changing anything.

- [ ] **Step 8: Run `pnpm verify` and `pnpm e2e`, then commit**

```bash
git add packages/shared apps/api e2e
git commit -m "feat(api): verification details and the BR-012 submission gate"
```

---

## Task 7: Admin review — detail, publish-and-verify, reject (BR-013, BR-014)

**Files:**

- Modify: `packages/shared/src/contracts/admin.ts`, `apps/api/src/modules/listings/listings.{repository,service,admin.routes}.ts`, `apps/api/src/modules/listings/listings.admin.routes.test.ts`, `packages/shared/src/contracts/contracts.test.ts`

**Interfaces:**

- Consumes: `currentAuth(req).userId` (existing).
- Produces: `adminListingSummary` adds `newInstitute: boolean`, `submittedAt: string | null`, `address`, `contactPhone`, `website: string | null`; `adminListingDetail`; `rejectListingBody`; `publishAsAdmin(listingId, adminClerkUserId)`; `rejectAsAdmin(listingId, reason)`; `getForModeration(listingId)`.

- [ ] **Step 1: Contracts and a contract test**

Replace `adminListingSummary` in `admin.ts` and add the rest (import `modeSchema` from `'./institutes.js'`):

```ts
export const adminListingSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: listingStatusSchema,
  organizationName: z.string(),
  /// True when publishing this listing will also verify its organisation (BR-013).
  newInstitute: z.boolean(),
  cityName: z.string(),
  address: z.string().nullable(),
  contactPhone: z.string().nullable(),
  website: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
})
export type AdminListingSummary = z.infer<typeof adminListingSummary>

export const adminListingDetail = adminListingSummary.extend({
  locality: z.string().nullable(),
  shortDescription: z.string().nullable(),
  about: z.string().nullable(),
  modes: z.array(modeSchema),
  exams: z.array(z.string()),
  batchCount: z.number().int(),
  rejectionReason: z.string().nullable(),
})
export type AdminListingDetail = z.infer<typeof adminListingDetail>

/// BR-014. Trimmed first, so padding cannot satisfy the minimum.
export const rejectListingBody = z.object({ reason: z.string().trim().min(10).max(500) })
export type RejectListingBody = z.infer<typeof rejectListingBody>
```

In `contracts.test.ts`, import `rejectListingBody` and add:

```ts
describe('rejectListingBody (BR-014)', () => {
  it('trims before checking the minimum', () => {
    expect(rejectListingBody.safeParse({ reason: '   too short  ' }).success).toBe(false)
  })

  it('accepts and trims a real reason', () => {
    expect(rejectListingBody.parse({ reason: '  Phone number did not answer  ' }).reason).toBe(
      'Phone number did not answer',
    )
  })

  it('rejects more than 500 characters', () => {
    expect(rejectListingBody.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Write the failing route tests**

Append to `listings.admin.routes.test.ts` (import `adminListingDetail`):

```ts
const asAdmin2 = JSON.stringify({ userId: 'u-admin-2', globalRole: 'ADMIN' })

async function makePending(listingId: string) {
  await prisma.listing.update({
    where: { id: listingId },
    data: { status: 'PENDING_REVIEW', submittedAt: new Date() },
  })
}

describe('queue fields', () => {
  it('flags a listing whose organisation is unverified as a new institute', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp().get('/api/v1/admin/listings').set('x-test-auth', asAdmin)
    const item = adminListingQueueResponse.parse(res.body).items[0]
    expect(item).toMatchObject({ newInstitute: true, contactPhone: '9000000001' })
    expect(item?.submittedAt).not.toBeNull()
  })

  it('does not flag a verified organisation', async () => {
    await prisma.organization.update({
      where: { id: seed.orgId },
      data: { verifiedAt: new Date() },
    })
    await makePending(seed.draftListingId)
    const res = await testApp().get('/api/v1/admin/listings').set('x-test-auth', asAdmin)
    expect(adminListingQueueResponse.parse(res.body).items[0]?.newInstitute).toBe(false)
  })
})

describe('GET /api/v1/admin/listings/:listingId', () => {
  it('returns everything the review screen needs', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp()
      .get(`/api/v1/admin/listings/${seed.draftListingId}`)
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)
    expect(adminListingDetail.parse(res.body)).toMatchObject({
      address: '1 Test Road, Pune 411001',
      exams: ['jee'],
      modes: ['ONLINE'],
      batchCount: 0,
    })
  })

  it('403s a non-admin', async () => {
    const res = await testApp()
      .get(`/api/v1/admin/listings/${seed.draftListingId}`)
      .set('x-test-auth', asUser)
    expect(res.status).toBe(403)
  })
})

describe('publish verifies the organisation (BR-013)', () => {
  it('sets verifiedAt and the verifying admin on first publish', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin)
    expect(res.status).toBe(200)

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: seed.orgId } })
    expect(org.verifiedAt).not.toBeNull()
    expect(org.verifiedByClerkUserId).toBe('u-admin')
  })

  it('never overwrites an existing verification', async () => {
    const original = new Date('2026-02-01T00:00:00Z')
    await prisma.organization.update({
      where: { id: seed.orgId },
      data: { verifiedAt: original, verifiedByClerkUserId: 'u-admin' },
    })
    await makePending(seed.draftListingId)
    await testApp()
      .post(`/api/v1/admin/listings/${seed.draftListingId}/publish`)
      .set('x-test-auth', asAdmin2)

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: seed.orgId } })
    expect(org.verifiedAt).toEqual(original)
    expect(org.verifiedByClerkUserId).toBe('u-admin')
  })

  it('409s a second publish of the same listing', async () => {
    await makePending(seed.draftListingId)
    const path = `/api/v1/admin/listings/${seed.draftListingId}/publish`
    await testApp().post(path).set('x-test-auth', asAdmin)
    const again = await testApp().post(path).set('x-test-auth', asAdmin)
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })
})

describe('POST /api/v1/admin/listings/:listingId/reject (BR-014)', () => {
  const path = () => `/api/v1/admin/listings/${seed.draftListingId}/reject`

  it('returns the listing to DRAFT with the reason', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp()
      .post(path())
      .set('x-test-auth', asAdmin)
      .send({ reason: 'The phone number did not answer.' })

    expect(res.status).toBe(200)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(row.status).toBe('DRAFT')
    expect(row.rejectionReason).toBe('The phone number did not answer.')
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: seed.orgId } })
    expect(org.verifiedAt).toBeNull()
  })

  it('400s a reason that is too short after trimming', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp()
      .post(path())
      .set('x-test-auth', asAdmin)
      .send({ reason: '   no   ' })
    expect(res.status).toBe(400)
  })

  it('409s a listing that is not waiting for review', async () => {
    const res = await testApp()
      .post(path())
      .set('x-test-auth', asAdmin)
      .send({ reason: 'The phone number did not answer.' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION')
  })

  it('403s a non-admin', async () => {
    await makePending(seed.draftListingId)
    const res = await testApp()
      .post(path())
      .set('x-test-auth', asUser)
      .send({ reason: 'The phone number did not answer.' })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @one/shared test && pnpm --filter @one/api exec vitest run src/modules/listings`
Expected: shared PASS after Step 1; API FAIL on the new fields and paths.

- [ ] **Step 4: Implement the repository**

In `listings.repository.ts`, replace the moderation types and selects:

```ts
type Mode = 'ONLINE' | 'OFFLINE' | 'HYBRID'

export type ModerationRow = {
  id: string
  slug: string
  name: string
  status: ListingStatus
  updatedAt: Date
  submittedAt: Date | null
  address: string | null
  contactPhone: string | null
  organization: { name: string; verifiedAt: Date | null }
  city: { name: string }
  instituteProfile: { website: string | null } | null
}

const MODERATION_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  updatedAt: true,
  submittedAt: true,
  address: true,
  contactPhone: true,
  organization: { select: { name: true, verifiedAt: true } },
  city: { select: { name: true } },
  instituteProfile: { select: { website: true } },
} as const

export type ModerationDetailRow = Omit<ModerationRow, 'instituteProfile'> & {
  locality: string | null
  shortDescription: string | null
  rejectionReason: string | null
  instituteProfile: { website: string | null; about: string | null; modes: Mode[] } | null
  tags: { tag: { slug: string; kind: 'EXAM' | 'AMENITY' | 'FACILITY' } }[]
  _count: { batches: number }
}

const MODERATION_DETAIL_SELECT = {
  ...MODERATION_SELECT,
  locality: true,
  shortDescription: true,
  rejectionReason: true,
  instituteProfile: { select: { website: true, about: true, modes: true } },
  tags: { select: { tag: { select: { slug: true, kind: true } } } },
  _count: { select: { batches: true } },
} as const
```

In `listByStatus`, change `orderBy` to oldest submission first:

```ts
      orderBy: [{ submittedAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'asc' }],
```

Add:

```ts
export async function findModerationDetail(id: string): Promise<ModerationDetailRow | null> {
  return prisma.listing.findUnique({ where: { id }, select: MODERATION_DETAIL_SELECT })
}

export async function markRejected(id: string, reason: string): Promise<void> {
  await prisma.listing.update({
    where: { id },
    data: { status: 'DRAFT', rejectionReason: reason },
  })
}

/// BR-013 needs the listing and its organisation to change together. The
/// organisation write lives here rather than behind accounts.service because
/// it must share the transaction; the verifiedAt: null guard means an existing
/// verification is never overwritten.
export async function publishAndVerify(
  id: string,
  organizationId: string,
  at: Date,
  verifierClerkUserId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.listing.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: at, rejectionReason: null },
    }),
    prisma.organization.updateMany({
      where: { id: organizationId, verifiedAt: null },
      data: { verifiedAt: at, verifiedByClerkUserId: verifierClerkUserId },
    }),
  ])
}
```

- [ ] **Step 5: Implement the service and routes**

In `listings.service.ts`, change `publish` to take the verifier and use the transaction, and update `toAdminSummary`, `publishAsAdmin`, plus add the new functions:

```ts
export async function publish(listingId: string, verifierClerkUserId: string) {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'PENDING_REVIEW' && listing.status !== 'DRAFT') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Cannot publish a listing in status ${listing.status}`,
    )
  }
  await repo.publishAndVerify(listingId, listing.organizationId, new Date(), verifierClerkUserId)
}

function toAdminSummary(row: repo.ModerationRow | repo.ModerationDetailRow): AdminListingSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    organizationName: row.organization.name,
    newInstitute: row.organization.verifiedAt === null,
    cityName: row.city.name,
    address: row.address,
    contactPhone: row.contactPhone,
    website: row.instituteProfile?.website ?? null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function getForModeration(listingId: string): Promise<AdminListingDetail> {
  const row = await repo.findModerationDetail(listingId)
  if (!row) throw new NotFoundError('Listing not found')
  return {
    ...toAdminSummary(row),
    locality: row.locality,
    shortDescription: row.shortDescription,
    about: row.instituteProfile?.about ?? null,
    modes: row.instituteProfile?.modes ?? [],
    exams: row.tags.filter((entry) => entry.tag.kind === 'EXAM').map((entry) => entry.tag.slug),
    batchCount: row._count.batches,
    rejectionReason: row.rejectionReason,
  }
}

export async function publishAsAdmin(
  listingId: string,
  adminClerkUserId: string,
): Promise<AdminListingSummary> {
  await publish(listingId, adminClerkUserId)
  const row = await repo.findModerationRow(listingId)
  if (!row) throw new NotFoundError('Listing not found')
  return toAdminSummary(row)
}

/// BR-014: only a listing waiting for review can be rejected, and it goes
/// back to DRAFT so the partner can fix it.
export async function rejectAsAdmin(
  listingId: string,
  reason: string,
): Promise<AdminListingSummary> {
  const listing = await repo.findById(listingId)
  if (!listing) throw new NotFoundError('Listing not found')
  if (listing.status !== 'PENDING_REVIEW') {
    throw new ConflictError(
      'INVALID_STATUS_TRANSITION',
      `Only a listing waiting for review can be rejected; this listing is ${listing.status}`,
    )
  }
  await repo.markRejected(listingId, reason)
  const row = await repo.findModerationRow(listingId)
  if (!row) throw new NotFoundError('Listing not found')
  return toAdminSummary(row)
}
```

Import `AdminListingDetail` from `@one/shared`. `publish` has two other callers, both in `listings.service.test.ts` (lines ~102 and ~109): change them to `publish(seed.draftListingId, 'u-admin')` and `publish(seed.publishedListingId, 'u-admin')`. Confirm there are no others with `grep -rn "publish(" apps/api/src packages/db/prisma`.

In `listings.admin.routes.ts` (import `rejectListingBody`, `type RejectListingBody`, `currentAuth`):

```ts
adminListingsRouter.get('/:listingId', validate({ params: listingIdParam }), async (req, res) => {
  const { listingId } = validated<ListingIdParam>(req, 'params')
  res.json(await listings.getForModeration(listingId))
})

adminListingsRouter.post(
  '/:listingId/publish',
  validate({ params: listingIdParam }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    res.json(await listings.publishAsAdmin(listingId, currentAuth(req).userId))
  },
)

adminListingsRouter.post(
  '/:listingId/reject',
  validate({ params: listingIdParam, body: rejectListingBody }),
  async (req, res) => {
    const { listingId } = validated<ListingIdParam>(req, 'params')
    const { reason } = validated<RejectListingBody>(req, 'body')
    res.json(await listings.rejectAsAdmin(listingId, reason))
  },
)
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @one/api test`
Expected: PASS.

- [ ] **Step 7: Run `pnpm verify` and `pnpm e2e`, then commit**

```bash
git add packages/shared apps/api
git commit -m "feat(api): admin review detail, reject, and verify on first publish (BR-013, BR-014)"
```

---

## Task 8: Public address, and proof the phone stays private

**Files:**

- Modify: `packages/shared/src/contracts/institutes.ts`, `apps/api/src/modules/institutes/institutes.{repository,service}.ts`, `apps/api/src/modules/institutes/institutes.routes.test.ts`, `apps/web/src/app/institutes/[slug]/page.tsx`

**Interfaces:**

- Produces: `instituteDetail.address: string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `institutes.routes.test.ts`:

```ts
describe('contactPhone never reaches a public response', () => {
  const PHONE = '9876543210'

  beforeEach(async () => {
    await prisma.listing.update({
      where: { id: seed.publishedListingId },
      data: { contactPhone: PHONE, address: '12 FC Road, Pune 411005' },
    })
    // Comparison needs two published listings.
    await prisma.listing.create({
      data: {
        vertical: 'INSTITUTE',
        slug: 'beta-academy',
        name: 'Beta Academy',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-01-02T00:00:00Z'),
        organizationId: seed.otherOrgId,
        cityId: seed.cityId,
        contactPhone: '9123456780',
        instituteProfile: { create: { modes: ['ONLINE'] } },
      },
    })
  })

  it.each([
    ['detail', () => `/api/v1/institutes/${seed.publishedSlug}`],
    ['search', () => '/api/v1/institutes?q=academy'],
    ['landing', () => '/api/v1/landing?path=jee-coaching-in-pune'],
    ['compare', () => `/api/v1/compare?slug=${seed.publishedSlug}&slug=beta-academy`],
  ])('%s omits it', async (_name, path) => {
    const res = await testApp().get(path())
    expect(res.status).toBe(200)
    const text = JSON.stringify(res.body)
    expect(text).not.toContain(PHONE)
    expect(text).not.toContain('9123456780')
    expect(text).not.toContain('contactPhone')
  })

  it('shows the address on the public detail', async () => {
    const res = await testApp().get(`/api/v1/institutes/${seed.publishedSlug}`)
    expect(res.body.address).toBe('12 FC Road, Pune 411005')
  })
})
```

(Import `beforeEach` from vitest if the file does not already.)

- [ ] **Step 2: Run to verify the address test fails**

Run: `pnpm --filter @one/api exec vitest run src/modules/institutes/institutes.routes.test.ts`
Expected: the four privacy cases PASS already (public contracts never had the field — that is the point of the test); the address case FAILS with `undefined`.

- [ ] **Step 3: Implement**

`institutes.ts` contract: in `instituteDetail`, add `address: z.string().nullable(),`.

`institutes.repository.ts`: add `address: string | null` to `InstituteRow` and `address: true` to `SELECT`.

`institutes.service.ts` `toDetail`: add `address: row.address,`.

`apps/web/src/app/institutes/[slug]/page.tsx`: in the JSON-LD block change the street address to `...(institute.address ?? institute.locality ? { streetAddress: institute.address ?? institute.locality } : {})`, and under the locality/city line add:

```tsx
{
  institute.address ? <p className="text-sm text-gray-600">{institute.address}</p> : null
}
```

- [ ] **Step 4: Run the tests and the web build**

Run: `pnpm --filter @one/api exec vitest run src/modules/institutes && pnpm --filter @one/web build`
Expected: PASS; build succeeds.

- [ ] **Step 5: Run `pnpm verify` and commit**

```bash
git add packages/shared apps/api apps/web
git commit -m "feat: show the address publicly and prove contactPhone stays private"
```

---

## Task 9: OpenAPI registration

**Files:**

- Modify: `packages/shared/scripts/gen-openapi.ts`, `docs/api/openapi.json` (generated)

- [ ] **Step 1: Register the new paths**

Add the new schemas to the import list (`adminListingDetail`, `createListingBody`, `partnerReferenceResponse`, `rejectListingBody`) and, after the existing admin paths:

```ts
registry.registerPath({
  method: 'get',
  path: '/api/v1/partner/reference',
  summary: 'Cities and exam tags for the partner listing forms',
  security: secured,
  responses: {
    200: { description: 'Reference data', ...json(partnerReferenceResponse) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/partner/listings',
  summary: 'Create a draft listing for the active organisation',
  description: 'Always DRAFT, always the session organisation (BR-011).',
  security: secured,
  request: { body: json(createListingBody) },
  responses: {
    201: { description: 'Created', ...json(partnerListingDetail) },
    400: BAD_REQUEST,
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    503: err('Clerk was unreachable while provisioning the organisation'),
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/listings/{listingId}',
  summary: 'One listing, with everything needed to review it',
  security: secured,
  request: { params: z.object({ listingId: z.string() }) },
  responses: {
    200: { description: 'Listing', ...json(adminListingDetail) },
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    404: NOT_FOUND,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/listings/{listingId}/reject',
  summary: 'Return a listing under review to DRAFT with a reason',
  description: 'Reason is 10–500 characters after trimming (BR-014).',
  security: secured,
  request: { params: z.object({ listingId: z.string() }), body: json(rejectListingBody) },
  responses: {
    200: { description: 'Rejected', ...json(adminListingSummary) },
    400: BAD_REQUEST,
    401: UNAUTHENTICATED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    409: CONFLICT,
  },
})
```

Also update the existing `/api/v1/admin/listings/{listingId}/publish` description to: `'Only a global ADMIN may publish (BR-001). Publishing verifies an unverified organisation (BR-013).'`, and the partner submit path's 409 description (if registered) to mention `LISTING_INCOMPLETE`.

- [ ] **Step 2: Regenerate and check the diff**

Run: `pnpm --filter @one/shared gen:openapi && git diff --stat docs/api/openapi.json`
Expected: the file changes; the four new paths appear (`grep -c '"/api/v1/partner/reference"' docs/api/openapi.json` prints 1).

- [ ] **Step 3: Run `pnpm verify` and commit**

```bash
git add packages/shared/scripts docs/api/openapi.json
git commit -m "docs(api): register P2a endpoints in the OpenAPI spec"
```

---

## Task 10: Partner onboarding — sign-up, organisation, first draft

No automated tests exist for the partner app (`test` is a no-op and e2e does not run it). Each UI task is verified with `pnpm --filter @one/partner typecheck`, `lint`, `build`, and the Task 14 phone walkthrough.

**Files:**

- Create: `apps/partner/src/lib/admin.ts`, `apps/partner/src/app/sign-in/[[...sign-in]]/page.tsx`, `apps/partner/src/app/sign-up/[[...sign-up]]/page.tsx`, `apps/partner/src/app/onboarding/page.tsx`, `apps/partner/src/app/dashboard/new/{page.tsx,NewListingForm.tsx,actions.ts}`
- Modify: `apps/partner/src/app/layout.tsx`, `apps/partner/src/app/page.tsx`, `apps/partner/src/app/dashboard/page.tsx`, `apps/partner/src/lib/api.ts`, `apps/partner/.env.example`

**Interfaces:**

- Consumes: `createListingBody`, `partnerReferenceResponse`, `partnerListingDetail` (Tasks 5–6).
- Produces: `isAdmin(): Promise<boolean>` (used by Task 12); `ActionState` re-used from `app/dashboard/[listingId]/actions.ts`.

- [ ] **Step 1: Confirm the Clerk component props this task uses**

Run:

```bash
grep -rhoE "(afterCreateOrganizationUrl|skipInvitationScreen|hidePersonal|afterSelectOrganizationUrl)\??:" \
  node_modules/.pnpm/@clerk+*/node_modules/@clerk/*/dist/types/*.d.ts 2>/dev/null | sort -u
```

Expected: all four names print. If one is missing in this Clerk version, find its replacement in the same `.d.ts` files and use that name below.

- [ ] **Step 2: Admin helper and error copy**

`apps/partner/src/lib/admin.ts`:

```ts
import { auth } from '@clerk/nextjs/server'

/// The same claim the API's requireAdmin trusts (spec §6): Clerk session
/// metadata, not the database. This only decides what to show; the API enforces.
export async function isAdmin(): Promise<boolean> {
  const { sessionClaims } = await auth()
  const metadata = sessionClaims?.metadata as { globalRole?: string } | undefined
  return metadata?.globalRole === 'ADMIN'
}
```

In `partnerErrorMessage` in `lib/api.ts`, add cases:

```ts
    case 'LISTING_INCOMPLETE':
      return 'Fill in the remaining details before submitting.'
    case 'CITY_IMMUTABLE':
      return "A published listing's city cannot be changed."
    case 'UPSTREAM_UNAVAILABLE':
      return "We couldn't set up your institute. Please try again."
```

- [ ] **Step 3: Sign-in, sign-up and onboarding pages**

`app/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from '@clerk/nextjs'

export const metadata = { title: 'Sign in' }

export default function SignInPage() {
  return (
    <div className="flex justify-center">
      <SignIn />
    </div>
  )
}
```

`app/sign-up/[[...sign-up]]/page.tsx`:

```tsx
import { SignUp } from '@clerk/nextjs'

export const metadata = { title: 'List your institute' }

export default function SignUpPage() {
  return (
    <div className="flex justify-center">
      <SignUp />
    </div>
  )
}
```

`app/onboarding/page.tsx`:

```tsx
import { CreateOrganization } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Set up your institute' }

export default async function OnboardingPage() {
  const { orgId } = await auth()
  if (orgId) redirect('/dashboard')

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Set up your institute</h1>
      <p className="text-base text-gray-600">
        Your organisation is your institute or coaching group. If you have several branches, they
        all live under one organisation.
      </p>
      <CreateOrganization afterCreateOrganizationUrl="/dashboard/new" skipInvitationScreen />
    </section>
  )
}
```

Add to `apps/partner/.env.example`:

```bash
# Where Clerk sends people after signing up or in.
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
```

`/sign-in(.*)` and `/sign-up(.*)` are already public in `src/proxy.ts`; `/onboarding` stays protected.

- [ ] **Step 4: Header and home page**

In `layout.tsx`, import `OrganizationSwitcher` and `isAdmin`; replace `{userId ? <UserButton /> : <SignInButton />}` with:

```tsx
{
  userId ? (
    <div className="flex items-center gap-3">
      {(await isAdmin()) ? (
        <Link href="/admin/review" className="text-sm font-medium text-brand-700">
          Admin
        </Link>
      ) : null}
      <OrganizationSwitcher
        hidePersonal
        afterCreateOrganizationUrl="/dashboard/new"
        afterSelectOrganizationUrl="/dashboard"
      />
      <UserButton />
    </div>
  ) : (
    <SignInButton />
  )
}
```

Replace `app/page.tsx`:

```tsx
import { auth } from '@clerk/nextjs/server'
import Link from 'next/link'

const PRIMARY =
  'tap-target inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-5 text-base font-medium text-white hover:bg-brand-700 sm:w-auto'

export default async function PartnerHome() {
  const { userId } = await auth()

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Manage your institute</h1>
      <p className="max-w-2xl text-base text-gray-600">
        List your institute, keep your details current and publish upcoming batches for students.
      </p>
      {userId ? (
        <Link href="/dashboard" className={PRIMARY}>
          Go to dashboard
        </Link>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className={PRIMARY}>
            List your institute
          </Link>
          <Link
            href="/sign-in"
            className="tap-target inline-flex w-full items-center justify-center rounded-lg border border-brand-500 px-5 text-base font-medium text-brand-700 sm:w-auto"
          >
            Sign in
          </Link>
        </div>
      )}
    </section>
  )
}
```

(The old copy promised "track enquiries", which does not exist yet.)

- [ ] **Step 5: Dashboard redirect and empty state**

In `app/dashboard/page.tsx`:

- At the top of `DashboardPage`: `const { orgId } = await auth(); if (!orgId) redirect('/onboarding')` (import `auth` from `@clerk/nextjs/server`, `redirect` from `next/navigation`).
- Replace the `403` branch of the `catch` with a `503` branch showing `partnerErrorMessage(error)` in the same amber card, headed "Setup didn't finish".
- Replace the empty-state paragraph with:

```tsx
<div className="rounded-lg border border-gray-200 bg-white p-4">
  <p className="text-sm text-gray-600">You have not added an institute yet.</p>
  <Link
    href="/dashboard/new"
    className="tap-target mt-3 inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white sm:w-auto"
  >
    Add your institute
  </Link>
</div>
```

- When the list is not empty, add the same link below the list as a secondary button labelled "Add another branch".
- On each card, show `<Badge>Changes requested</Badge>` instead of the status badge when `listing.status === 'DRAFT' && listing.rejectionReason`.

- [ ] **Step 6: The create page**

`app/dashboard/new/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createListingBody, partnerListingDetail } from '@one/shared'
import { partnerApiSend, partnerErrorMessage } from '@/lib/api'
import type { ActionState } from '../[listingId]/actions'

export async function createListingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createListingBody.safeParse({
    name: String(formData.get('name') ?? ''),
    citySlug: String(formData.get('citySlug') ?? ''),
  })
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    }
  }

  let id: string
  try {
    id = (
      await partnerApiSend('/api/v1/partner/listings', 'POST', parsed.data, partnerListingDetail)
    ).id
  } catch (error) {
    return { status: 'error', message: partnerErrorMessage(error) }
  }
  // Outside the try: redirect() works by throwing.
  redirect(`/dashboard/${id}`)
}
```

`app/dashboard/new/NewListingForm.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import type { PartnerReferenceResponse } from '@one/shared'
import type { ActionState } from '../[listingId]/actions'
import { createListingAction } from './actions'

const INITIAL: ActionState = { status: 'idle' }
const FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

export function NewListingForm({ cities }: { cities: PartnerReferenceResponse['cities'] }) {
  const [state, formAction, pending] = useActionState(createListingAction, INITIAL)

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Institute name</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={200}
          autoComplete="organization"
          className={FIELD}
          placeholder="Alpha Academy"
        />
        {state.fieldErrors?.name?.[0] ? (
          <span className="block text-xs text-red-600">{state.fieldErrors.name[0]}</span>
        ) : null}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">City</span>
        <select name="citySlug" required defaultValue="" className={FIELD}>
          <option value="" disabled>
            Choose a city
          </option>
          {cities.map((city) => (
            <option key={city.slug} value={city.slug}>
              {city.name}, {city.state}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="tap-target w-full rounded-lg bg-brand-500 px-4 text-base font-medium text-white disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Creating…' : 'Continue'}
      </button>

      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
```

`app/dashboard/new/page.tsx`:

```tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { partnerReferenceResponse } from '@one/shared'
import { partnerApiGet } from '@/lib/api'
import { NewListingForm } from './NewListingForm'

export const metadata = { title: 'Add your institute' }

export default async function NewListingPage() {
  // Review Focus 5: a deep link without an organisation goes to onboarding,
  // not to the API's 403.
  const { orgId } = await auth()
  if (!orgId) redirect('/onboarding')

  const reference = await partnerApiGet('/api/v1/partner/reference', partnerReferenceResponse)

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Add your institute</h1>
      <p className="text-base text-gray-600">
        Start with the name and city. You can add the rest on the next screen.
      </p>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <NewListingForm cities={reference.cities} />
      </div>
    </section>
  )
}
```

- [ ] **Step 7: Typecheck, lint, build**

Run: `pnpm --filter @one/partner typecheck && pnpm --filter @one/partner lint && pnpm --filter @one/partner build`
Expected: all succeed.

- [ ] **Step 8: Run `pnpm verify` and commit**

```bash
git add apps/partner
git commit -m "feat(partner): sign-up, organisation onboarding and first draft"
```

---

## Task 11: Partner listing page — status banner and verification details

**Files:**

- Create: `apps/partner/src/app/dashboard/[listingId]/StatusBanner.tsx`, `apps/partner/src/app/dashboard/[listingId]/VerificationForm.tsx`
- Modify: `apps/partner/src/app/dashboard/[listingId]/page.tsx`, `apps/partner/src/app/dashboard/[listingId]/actions.ts`, `apps/partner/.env.example`

**Interfaces:**

- Consumes: `missingForSubmission`, `SUBMISSION_FIELDS`, `SUBMISSION_FIELD_LABELS`, `normalizePhone`, `updateListingBody`, `partnerReferenceResponse`, `PartnerListingDetail`.
- Produces: `updateVerificationAction(prev, formData): Promise<ActionState>`.

- [ ] **Step 1: The update action**

Append to `actions.ts` (add `normalizePhone`, `updateListingBody` to the `@one/shared` import and `import { z } from 'zod'`):

```ts
export async function updateVerificationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const listingId = String(formData.get('listingId') ?? '')
  const text = (key: string) => {
    const value = formData.get(key)
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
  }
  const examSlugs = formData.getAll('examSlugs').map(String)
  const phone = text('contactPhone')

  const raw = {
    ...(text('address') ? { address: text('address') } : {}),
    // Review Focus 1: "+91 98765 43210" is how people type it.
    ...(phone ? { contactPhone: normalizePhone(phone) } : {}),
    ...(examSlugs.length > 0 ? { examSlugs } : {}),
    // A disabled select is not submitted, so city is only sent while editable.
    ...(text('citySlug') ? { citySlug: text('citySlug') } : {}),
  }

  const parsed = updateListingBody.safeParse(raw)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    }
  }

  try {
    await partnerApiSend(
      `/api/v1/partner/listings/${listingId}`,
      'PATCH',
      parsed.data,
      partnerListingDetail,
    )
    revalidatePath(`/dashboard/${listingId}`)
    return { status: 'success', message: 'Details saved.' }
  } catch (error) {
    return { status: 'error', message: partnerErrorMessage(error) }
  }
}
```

- [ ] **Step 2: The status banner**

`StatusBanner.tsx` (server component):

```tsx
import {
  missingForSubmission,
  SUBMISSION_FIELD_LABELS,
  SUBMISSION_FIELDS,
  type PartnerListingDetail,
} from '@one/shared'
import { ActionButton } from './ActionButton'
import { submitListingAction } from './actions'

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3000'

export function StatusBanner({ listing }: { listing: PartnerListingDetail }) {
  if (listing.status === 'PUBLISHED') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-gray-700">
        Live on One Academy.{' '}
        <a
          href={`${WEB_BASE_URL}/institutes/${listing.slug}`}
          className="font-medium text-brand-700 underline"
        >
          View your public page
        </a>
      </div>
    )
  }

  if (listing.status === 'PENDING_REVIEW') {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-gray-700">
        We&apos;re reviewing your institute. This usually takes 1–2 working days.
      </p>
    )
  }

  if (listing.status === 'SUSPENDED') {
    return (
      <p className="rounded-lg border border-gray-300 bg-gray-100 p-3 text-sm text-gray-700">
        This listing is suspended. Contact One Academy.
      </p>
    )
  }

  const missing = missingForSubmission({
    name: listing.name,
    cityName: listing.cityName,
    address: listing.address,
    contactPhone: listing.contactPhone,
    exams: listing.exams,
  })

  return (
    <div className="space-y-3">
      {listing.rejectionReason ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-medium text-red-700">Changes requested</p>
          <p className="mt-1 text-gray-700">{listing.rejectionReason}</p>
          <p className="mt-1 text-gray-700">Fix the details below and submit again.</p>
        </div>
      ) : null}

      <ul className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-3 text-sm">
        {SUBMISSION_FIELDS.map((field) => {
          const done = !missing.includes(field)
          return (
            <li key={field} className={done ? 'text-gray-700' : 'text-gray-500'}>
              <span aria-hidden="true">{done ? '✓' : '○'}</span>{' '}
              <span className="sr-only">{done ? 'Done:' : 'To do:'}</span>
              {SUBMISSION_FIELD_LABELS[field]}
            </li>
          )
        })}
      </ul>

      {missing.length === 0 ? (
        <ActionButton
          action={submitListingAction}
          label="Submit for review"
          pendingLabel="Submitting…"
          variant="primary"
          hidden={{ listingId: listing.id }}
        />
      ) : (
        <p className="text-sm text-gray-600">Complete the items above to submit for review.</p>
      )}
    </div>
  )
}
```

Add `WEB_BASE_URL=http://localhost:3000` to `apps/partner/.env.example` with the comment `# The public site, for "View your public page" links.`

- [ ] **Step 3: The verification form**

`VerificationForm.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import type { PartnerListingDetail, PartnerReferenceResponse } from '@one/shared'
import { updateVerificationAction, type ActionState } from './actions'

const INITIAL: ActionState = { status: 'idle' }
const FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100'

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null
  return <span className="block text-xs text-red-600">{errors[0]}</span>
}

export function VerificationForm({
  listing,
  reference,
}: {
  listing: PartnerListingDetail
  reference: PartnerReferenceResponse
}) {
  const [state, formAction, pending] = useActionState(updateVerificationAction, INITIAL)
  const cityEditable = listing.status === 'DRAFT'

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="listingId" value={listing.id} />

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">City</span>
        <select
          name="citySlug"
          defaultValue={listing.citySlug}
          disabled={!cityEditable}
          className={FIELD}
        >
          {reference.cities.map((city) => (
            <option key={city.slug} value={city.slug}>
              {city.name}, {city.state}
            </option>
          ))}
        </select>
        {cityEditable ? null : (
          <span className="block text-xs text-gray-500">
            The city is fixed once a listing has been submitted.
          </span>
        )}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Full address</span>
        <textarea
          name="address"
          rows={3}
          maxLength={300}
          autoComplete="street-address"
          defaultValue={listing.address ?? ''}
          className={FIELD}
          placeholder="Building, street, area, city, PIN code"
        />
        <FieldError errors={state.fieldErrors?.address} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Contact phone</span>
        <input
          name="contactPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          defaultValue={listing.contactPhone ?? ''}
          className={FIELD}
          placeholder="98765 43210"
        />
        <span className="block text-xs text-gray-500">Private — only One Academy sees this</span>
        <FieldError errors={state.fieldErrors?.contactPhone} />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Exams you coach for</legend>
        <div className="flex flex-wrap gap-2">
          {reference.exams.map((exam) => (
            <label key={exam.slug} className="tap-target inline-flex cursor-pointer">
              <input
                type="checkbox"
                name="examSlugs"
                value={exam.slug}
                defaultChecked={listing.exams.includes(exam.slug)}
                className="peer sr-only"
              />
              <span className="inline-flex items-center rounded-full border border-gray-300 px-4 text-sm peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-100">
                {exam.label}
              </span>
            </label>
          ))}
        </div>
        <FieldError errors={state.fieldErrors?.examSlugs} />
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="tap-target w-full rounded-lg border border-brand-500 px-4 text-sm font-medium text-brand-700 disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Saving…' : 'Save details'}
      </button>

      {state.message ? (
        <p
          role={state.status === 'error' ? 'alert' : undefined}
          className={state.status === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-700'}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
```

Exam chips are checkbox inputs styled as chips: inside a form, the native checked state carries what `aria-pressed` would. Record this wording change in the spec in Task 14.

- [ ] **Step 4: Wire the page**

In `page.tsx`: load both in parallel, replace the header's DRAFT submit block and PENDING_REVIEW paragraph with `<StatusBanner listing={listing} />`, and add a section before "Batches":

```tsx
const [listing, reference] = await Promise.all([
  partnerApiGet(`/api/v1/partner/listings/${listingId}`, partnerListingDetail),
  partnerApiGet('/api/v1/partner/reference', partnerReferenceResponse),
])
```

```tsx
<section className="space-y-3">
  <h2 className="text-lg font-semibold">Verification details</h2>
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <VerificationForm listing={listing} reference={reference} />
  </div>
</section>
```

Remove the now-unused `submitListingAction` import from `page.tsx`.

- [ ] **Step 5: Typecheck, lint, build; run `pnpm verify`; commit**

```bash
pnpm --filter @one/partner typecheck && pnpm --filter @one/partner lint && pnpm --filter @one/partner build
git add apps/partner
git commit -m "feat(partner): verification details form and listing status banner"
```

---

## Task 12: Admin review screens

**Files:**

- Create: `apps/partner/src/app/admin/layout.tsx`, `apps/partner/src/app/admin/page.tsx`, `apps/partner/src/app/admin/review/page.tsx`, `apps/partner/src/app/admin/review/[listingId]/{page.tsx,ReviewActions.tsx,actions.ts}`

**Interfaces:**

- Consumes: `isAdmin` (Task 10); `adminListingQueueResponse`, `adminListingDetail`, `adminListingSummary`, `rejectListingBody` (Task 7).
- Produces: `approveAction`, `rejectAction`.

- [ ] **Step 1: Gate and index**

`app/admin/layout.tsx`:

```tsx
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { isAdmin } from '@/lib/admin'

/// A 404 rather than a 403, so a non-admin learns nothing about this area.
/// The API's requireAdmin is the real enforcement.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!(await isAdmin())) notFound()
  return <div className="space-y-5">{children}</div>
}
```

`app/admin/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

export default function AdminIndex() {
  redirect('/admin/review')
}
```

- [ ] **Step 2: The queue**

`app/admin/review/page.tsx`:

```tsx
import Link from 'next/link'
import { Badge } from '@one/ui'
import { adminListingQueueResponse } from '@one/shared'
import { partnerApiGet } from '@/lib/api'

export const metadata = { title: 'Review queue' }

const NOTICES: Record<string, string> = {
  published: 'Published. It will appear on the site within 5 minutes.',
  rejected: 'Rejected. The institute will see your reason on their dashboard.',
  already: 'This listing was already reviewed',
}

const RELATIVE = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' })

function waited(iso: string | null): string {
  if (!iso) return 'submission time unknown'
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000)
  return `submitted ${RELATIVE.format(days, 'day')}`
}

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>
}) {
  const { done } = await searchParams
  const queue = await partnerApiGet(
    '/api/v1/admin/listings?status=PENDING_REVIEW&limit=50',
    adminListingQueueResponse,
  )
  const notice = done ? NOTICES[done] : undefined

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Review queue</h1>

      {notice ? (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
          {notice}
        </p>
      ) : null}

      {queue.items.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          Nothing waiting for review.
        </p>
      ) : (
        <ul className="space-y-3">
          {queue.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/admin/review/${item.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 active:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold leading-snug text-brand-700">
                    {item.name}
                  </h2>
                  {item.newInstitute ? <Badge>New institute</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {item.organizationName} · {item.cityName}
                </p>
                <p className="mt-2 text-xs text-gray-500">{waited(item.submittedAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Actions**

`app/admin/review/[listingId]/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { adminListingSummary, rejectListingBody } from '@one/shared'
import { PartnerApiError, partnerApiSend, partnerErrorMessage } from '@/lib/api'
import type { ActionState } from '@/app/dashboard/[listingId]/actions'

async function decide(path: string, body: unknown, done: string): Promise<ActionState> {
  try {
    await partnerApiSend(path, 'POST', body, adminListingSummary)
  } catch (error) {
    // Another tab or admin decided first.
    if (error instanceof PartnerApiError && error.status === 409)
      redirect('/admin/review?done=already')
    return { status: 'error', message: partnerErrorMessage(error) }
  }
  redirect(`/admin/review?done=${done}`)
}

export async function approveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const listingId = String(formData.get('listingId') ?? '')
  return decide(`/api/v1/admin/listings/${listingId}/publish`, {}, 'published')
}

export async function rejectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const listingId = String(formData.get('listingId') ?? '')
  const parsed = rejectListingBody.safeParse({ reason: String(formData.get('reason') ?? '') })
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Give a reason of 10 to 500 characters.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    }
  }
  return decide(`/api/v1/admin/listings/${listingId}/reject`, parsed.data, 'rejected')
}
```

(`redirect()` works by throwing. Calling it from the `catch` block is safe because nothing catches that second throw; calling it inside the `try` would be swallowed by the `catch`.)

- [ ] **Step 4: Detail page and actions UI**

`app/admin/review/[listingId]/ReviewActions.tsx`:

```tsx
'use client'

import { useActionState, useState } from 'react'
import type { ActionState } from '@/app/dashboard/[listingId]/actions'
import { approveAction, rejectAction } from './actions'

const INITIAL: ActionState = { status: 'idle' }

export function ReviewActions({
  listingId,
  approveLabel,
}: {
  listingId: string
  approveLabel: string
}) {
  const [approveState, approve, approving] = useActionState(approveAction, INITIAL)
  const [rejectState, reject, rejecting] = useActionState(rejectAction, INITIAL)
  const [rejectOpen, setRejectOpen] = useState(false)

  return (
    <div className="space-y-4">
      <form action={approve} className="space-y-2">
        <input type="hidden" name="listingId" value={listingId} />
        <button
          type="submit"
          disabled={approving}
          className="tap-target w-full rounded-lg bg-brand-500 px-4 text-base font-medium text-white disabled:opacity-60 sm:w-auto"
        >
          {approving ? 'Publishing…' : approveLabel}
        </button>
        {approveState.message ? (
          <p role="alert" className="text-sm text-red-600">
            {approveState.message}
          </p>
        ) : null}
      </form>

      {rejectOpen ? (
        <form action={reject} className="space-y-2">
          <input type="hidden" name="listingId" value={listingId} />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Reason (the institute sees this)</span>
            <textarea
              name="reason"
              rows={3}
              required
              minLength={10}
              maxLength={500}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
          </label>
          <button
            type="submit"
            disabled={rejecting}
            className="tap-target w-full rounded-lg border border-red-600 px-4 text-base font-medium text-red-700 disabled:opacity-60 sm:w-auto"
          >
            {rejecting ? 'Rejecting…' : 'Reject with this reason'}
          </button>
          {rejectState.message ? (
            <p role="alert" className="text-sm text-red-600">
              {rejectState.message}
            </p>
          ) : null}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setRejectOpen(true)}
          className="tap-target w-full rounded-lg border border-gray-300 px-4 text-base font-medium text-gray-700 sm:w-auto"
        >
          Reject…
        </button>
      )}
    </div>
  )
}
```

`app/admin/review/[listingId]/page.tsx`:

```tsx
import { adminListingDetail } from '@one/shared'
import { partnerApiGet } from '@/lib/api'
import { ReviewActions } from './ReviewActions'

export const metadata = { title: 'Review listing' }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-base text-gray-900">{children}</dd>
    </div>
  )
}

export default async function ReviewListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>
}) {
  const { listingId } = await params
  const listing = await partnerApiGet(`/api/v1/admin/listings/${listingId}`, adminListingDetail)
  const approveLabel = listing.newInstitute
    ? `Approve & publish (also verifies ${listing.organizationName})`
    : 'Approve & publish'

  return (
    <section className="space-y-5">
      <h1 className="text-xl font-bold leading-tight sm:text-2xl">{listing.name}</h1>

      <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-4">
        <Row label="Organisation">
          {listing.organizationName}
          {listing.newInstitute ? ' — new institute' : ''}
        </Row>
        <Row label="City">
          {listing.locality ? `${listing.locality}, ` : ''}
          {listing.cityName}
        </Row>
        <Row label="Address">{listing.address ?? '—'}</Row>
        <Row label="Contact phone">
          {listing.contactPhone ? (
            <a
              href={`tel:+91${listing.contactPhone}`}
              className="tap-target inline-flex items-center font-medium text-brand-700 underline"
            >
              {listing.contactPhone}
            </a>
          ) : (
            '—'
          )}
        </Row>
        <Row label="Website">
          {listing.website ? (
            <a
              href={listing.website}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-brand-700 underline"
            >
              {listing.website}
            </a>
          ) : (
            '—'
          )}
        </Row>
        <Row label="Exams">{listing.exams.map((exam) => exam.toUpperCase()).join(', ') || '—'}</Row>
        <Row label="Modes">{listing.modes.join(', ') || '—'}</Row>
        <Row label="Batches">{listing.batchCount}</Row>
        {listing.about ? <Row label="About">{listing.about}</Row> : null}
      </dl>

      <ReviewActions listingId={listing.id} approveLabel={approveLabel} />
    </section>
  )
}
```

- [ ] **Step 5: Typecheck, lint, build; run `pnpm verify`; commit**

```bash
pnpm --filter @one/partner typecheck && pnpm --filter @one/partner lint && pnpm --filter @one/partner build
git add apps/partner
git commit -m "feat(partner): admin review queue with approve and reject"
```

---

## Task 13: End-to-end — self-registration through publication

**Files:**

- Modify: `e2e/tests/moderation.spec.ts`

- [ ] **Step 1: Add the test**

Append to `moderation.spec.ts`:

```ts
test('a self-registered institute is rejected once, then published and verified', async ({
  request,
  page,
}) => {
  // Stands in for the organization.created webhook; the e2e API has no Clerk.
  const org = await prisma.organization.create({
    data: { name: 'Gamma Group', slug: 'gamma-group', clerkOrgId: 'co_e2e_gamma' },
  })
  const headers = {
    'x-test-auth': JSON.stringify({
      userId: 'e2e-gamma',
      orgId: 'co_e2e_gamma',
      globalRole: 'USER',
    }),
    'content-type': 'application/json',
  }
  const adminHeaders = { 'x-test-auth': ADMIN, 'content-type': 'application/json' }
  const name = `Gamma Classes ${Date.now()}`

  const created = await request.post(`${API}/api/v1/partner/listings`, {
    headers,
    data: { name, citySlug: 'mumbai', status: 'PUBLISHED' },
  })
  expect(created.status()).toBe(201)
  const listing = await created.json()
  expect(listing.status).toBe('DRAFT')

  const incomplete = await request.post(`${API}/api/v1/partner/listings/${listing.id}/submit`, {
    headers,
  })
  expect(incomplete.status()).toBe(409)
  expect((await incomplete.json()).error.details.missing).toEqual([
    'address',
    'contactPhone',
    'exams',
  ])

  const filled = await request.patch(`${API}/api/v1/partner/listings/${listing.id}`, {
    headers,
    data: {
      address: '7 Hill Road, Bandra West, Mumbai 400050',
      contactPhone: '9988776655',
      examSlugs: ['neet'],
    },
  })
  expect(filled.status()).toBe(200)

  expect(
    (
      await request.post(`${API}/api/v1/partner/listings/${listing.id}/submit`, { headers })
    ).status(),
  ).toBe(200)

  const rejected = await request.post(`${API}/api/v1/admin/listings/${listing.id}/reject`, {
    headers: adminHeaders,
    data: { reason: 'The phone number did not answer.' },
  })
  expect(rejected.status()).toBe(200)

  const asPartner = await request.get(`${API}/api/v1/partner/listings/${listing.id}`, { headers })
  expect(await asPartner.json()).toMatchObject({
    status: 'DRAFT',
    rejectionReason: 'The phone number did not answer.',
  })

  expect(
    (
      await request.post(`${API}/api/v1/partner/listings/${listing.id}/submit`, { headers })
    ).status(),
  ).toBe(200)

  const published = await request.post(`${API}/api/v1/admin/listings/${listing.id}/publish`, {
    headers: adminHeaders,
  })
  expect(published.status()).toBe(200)

  const verified = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })
  expect(verified.verifiedAt).not.toBeNull()
  expect(verified.verifiedByClerkUserId).toBe('e2e-admin')

  await page.goto(`/institutes/${listing.slug}`)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByText('7 Hill Road, Bandra West, Mumbai 400050')).toBeVisible()
  expect(await page.content()).not.toContain('9988776655')
})
```

- [ ] **Step 2: Run e2e**

Run: `pnpm e2e`
Expected: every spec passes, including both moderation tests.

- [ ] **Step 3: Commit**

```bash
git add e2e
git commit -m "test(e2e): self-registration, rejection, resubmission and verification"
```

---

## Task 14: Documentation, final verification and the phone walkthrough

**Files:**

- Create: `docs/flows/partner-onboarding.md`, `docs/decisions/0016-self-registration-with-merged-verification.md`
- Modify: `docs/flows/listing-lifecycle.md`, `docs/domain/business-rules.md`, `docs/domain/glossary.md`, `docs/decisions/0006-clerk-for-auth-and-organisations.md`, `docs/runbooks/local-setup.md`, `docs/README.md`, `docs/superpowers/specs/2026-10-19-p2a-self-registration-design.md`, `CLAUDE.md` (Definition of done stays; nothing else), `apps/api/CLAUDE.md`

- [ ] **Step 1: Business rules**

Append to `docs/domain/business-rules.md`, in the existing format:

```markdown
## BR-011 — A partner creates listings only for their own organisation, always as DRAFT

The create body carries no status or organisation; both come from the server. A client that
sends them changes nothing.

- Implemented: `createListingBody`, `institutes.service.createForOrg`
- Tested: `institutes.partner.routes.test.ts`, `e2e/tests/moderation.spec.ts`

## BR-012 — A listing is submitted for review only with the details needed to verify it

Name, city, address, contact phone and at least one exam. Otherwise 409
`LISTING_INCOMPLETE` with `details.missing`. `missingForSubmission` in `@one/shared` is the
single definition, used by the API and by the partner checklist.

- Implemented: `packages/shared/src/submission.ts`, `institutes.service.submitForReviewForOrg`
- Tested: `submission.test.ts`, `institutes.partner.routes.test.ts`, e2e

## BR-013 — Publishing a listing of an unverified organisation also verifies it

Same transaction; `verifiedAt` and `verifiedByClerkUserId` are never overwritten.

- Implemented: `listings.repository.publishAndVerify`
- Tested: `listings.admin.routes.test.ts`, e2e

## BR-014 — Rejection needs a 10–500 character reason and only applies to PENDING_REVIEW

The listing returns to DRAFT so the partner can fix and resubmit.

- Implemented: `rejectListingBody`, `listings.service.rejectAsAdmin`
- Tested: `contracts.test.ts`, `listings.admin.routes.test.ts`, e2e
```

Also amend BR-007's paragraph: the lead inbox moved from P2 to slice P2d.

- [ ] **Step 2: ADR 0016 and ADR 0006**

Create `docs/decisions/0016-self-registration-with-merged-verification.md` with sections Context / Decision / Alternatives rejected / Consequences, recording: institutes self-register (claiming pre-listed institutes rejected — no supply to claim, ownership transfer and disputes); verification is admin review of details (OTP and document upload rejected — providers, DLT registration, document storage); verification merged into the first listing review (a separate organisation gate rejected — a second queue for one listing per institute at current volume; consequence: a rejected first listing leaves the organisation unverified, by design); organisations match only by `clerkOrgId` (slug linking removed as an account takeover); unknown Clerk organisations are provisioned on demand from Clerk's Backend API.

In ADR 0006: replace the consequence "a Clerk organisation that One Academy has not onboarded is a 403" with "is provisioned on demand (ADR 0016)"; replace "`User.globalRole = ADMIN` is never written…" paragraph's mechanism with: admin rights are read from the Clerk session's `metadata.globalRole`; `User.globalRole` is not used for authorization.

- [ ] **Step 3: Flows**

- `docs/flows/listing-lifecycle.md`: add the reject arrow to the state machine, a "Admin rejects" sequence (`/admin/review/<id>` → `actions.ts rejectAction` → `POST /api/v1/admin/listings/:id/reject` → `listings.service.rejectAsAdmin`), BR-012/013/014 in "Business rules invoked", the new failure rows from spec §10, and update the "Partner submits" sequence to mention `missingForSubmission`.
- Create `docs/flows/partner-onboarding.md` in the same structure (Purpose, Actors, Sequence with code anchors for every file in Tasks 4, 5, 10, 11, Business rules, Failure modes from spec §10, Related flows). Include the provisioning race and why it cannot duplicate.
- After committing the code, set `Last verified against commit:` in both files to the output of `git rev-parse HEAD`, and add `partner-onboarding.md` to the flows table in `docs/README.md`. Update "Where the project is" to say P2a is complete.

- [ ] **Step 4: Runbook, glossary, CLAUDE.md, spec**

- `docs/runbooks/local-setup.md` → Clerk section: replace the `UPDATE "User" SET "globalRole"` admin instructions with: in the Clerk dashboard set the user's public metadata to `{"globalRole":"ADMIN"}`, and under Sessions → Customize session token add `{"metadata": "{{user.public_metadata}}"}`; sign out and in again. Add: Organizations must be enabled in the Clerk dashboard. Keep the manual `clerkOrgId` link statement for seeded organisations and note it is the only way to link one (ADR 0016).
- `docs/domain/glossary.md`: add "Verified organisation — one whose first listing an admin has published (BR-013); `Organization.verifiedAt` is set."
- `apps/api/CLAUDE.md`: in "Clerk organisation ids are not local ids", replace "An organisation Clerk knows but One Academy has not onboarded is a 403, not a crash" with "An organisation Clerk knows but the mirror has not seen is provisioned on demand from Clerk (`lib/clerk.ts`); it is never matched by slug (ADR 0016)."
- Spec: set `Status: Approved`; in §8 change "exam chips (multi-select, `aria-pressed`)" to "exam chips (checkbox inputs styled as chips)".

- [ ] **Step 5: Final verification**

```bash
pnpm verify
pnpm e2e
./scripts/verify-lint-guardrails.sh
pnpm exec tsx scripts/check-docs-freshness.ts
pnpm --filter @one/shared gen:openapi && git diff --exit-code docs/api/openapi.json
```

Expected: all green; the OpenAPI diff is empty.

- [ ] **Step 6: Commit the docs**

```bash
git add docs CLAUDE.md apps/api/CLAUDE.md
git commit -m "docs(p2a): flows, BR-011–014, ADR 0016 and admin setup"
```

- [ ] **Step 7: Phone walkthrough with the owner (manual, required)**

Prerequisites (owner, in the Clerk dashboard): Organizations enabled; session token customised; the owner's user has `globalRole: ADMIN` in public metadata. Real test keys in `apps/partner/.env.local` and `apps/api/.env` (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`). Run `pnpm dev`; open `http://<laptop-ip>:3001` on a phone.

1. Signed out, the home page shows **List your institute**; it opens sign-up.
2. After sign-up, `/onboarding` shows Clerk's create-organisation form; creating one lands on `/dashboard/new`.
3. Create a listing with a name and city; the listing page shows the checklist with three items to do.
4. Enter the phone as `+91 98765 43210`; save; it shows as `9876543210`.
5. Fill address and one exam; **Submit for review** appears; submit; the amber banner appears.
6. As the admin (same phone or another), the header shows **Admin**; the queue lists the listing with **New institute**; the phone number is a tap-to-call link.
7. Reject with a reason; the queue confirms; the partner listing shows the red "Changes requested" banner with the reason, and the dashboard card shows "Changes requested".
8. Resubmit; approve; the queue says "Published. It will appear on the site within 5 minutes."; the partner banner links to the public page, which shows the address and no phone.
9. As a non-admin, `/admin/review` is a 404.
10. Signed in with no active organisation (create a second account and skip onboarding), opening `/dashboard/new` directly redirects to `/onboarding`.

Record the results (pass/fail per item, device and browser) in a new `docs/work/archive/` entry or the PR description, and fix any failure before merging.
