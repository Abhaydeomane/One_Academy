# Flow: Partner onboarding

Last verified against commit: 48b81f2ee7b7b5d519053a5c70c63093eb1597d9

## Purpose

How an institute that has never heard of One Academy goes from the partner home page to a
listing submitted for review, with no contact with the owner. Self-registration opens no
path to another organisation's data, which is why organisation linking and provisioning
are described in detail below.

## Actors and entry points

- Visitor — signed out, at `/` in the partner app
- Partner — a Clerk user creating an organisation, then a draft listing
- Clerk — owns sign-up, organisations and membership; mirrors to the API by webhook

## Sequence

**Sign up and create the organisation**

```
apps/partner/src/app/page.tsx                      "List your institute" (signed out)
  → apps/partner/src/app/sign-up/[[...sign-up]]/page.tsx    Clerk <SignUp/>
  → apps/partner/src/app/onboarding/page.tsx         Clerk <CreateOrganization/>; an
                                                     active organisation skips to /dashboard
  → apps/partner/src/proxy.ts                        everything but /, /sign-in, /sign-up
                                                     requires a session
```

Clerk creates the organisation and fires `organization.created`, which
`apps/api/src/modules/accounts/accounts.routes.ts` verifies (svix) and passes to
`accounts.service.syncOrganization`.

**Create the first draft** (BR-011)

```
apps/partner/src/app/dashboard/new/page.tsx         name + city; city options from
                                                    GET /api/v1/partner/reference
  → apps/partner/src/app/dashboard/new/actions.ts    createListingAction (shared schema first)
  → apps/partner/src/lib/api.ts                      attaches the Clerk bearer token
  → POST /api/v1/partner/listings
  → apps/api/src/modules/institutes/institutes.partner.routes.ts
  → apps/api/src/modules/accounts/accounts.service.ts    resolveLocalOrgId: Clerk id → local id
  → apps/api/src/modules/institutes/institutes.service.ts createForOrg — DRAFT, slug from
                                                    name + city, suffixed on collision
```

**Provide the verification details**

```
apps/partner/src/app/dashboard/[listingId]/page.tsx   StatusBanner checklist from
                                                      missingForSubmission
  → apps/partner/src/app/dashboard/[listingId]/VerificationForm.tsx
  → apps/partner/src/app/dashboard/[listingId]/actions.ts
  → PATCH /api/v1/partner/listings/:listingId
  → apps/api/src/modules/institutes/institutes.service.ts updateForOrg
```

`updateForOrg` validates everything (city and exam slugs, and that city is unchanged on a
published listing) before writing, then writes the fields in one transaction. Changing a
DRAFT's city regenerates its slug inside that same transaction. The phone is normalised by
the shared `phoneSchema`; `website` must be http or https, and `safeHttpUrl` guards every
place a stored website is rendered. On a failed save the form keeps what the partner typed;
address, phone and exams cannot be cleared once set (the form returns a field error).
Exam chips are checkbox inputs styled as chips. Submission is in `listing-lifecycle.md`.

**Provisioning an unseen organisation**

```
apps/api/src/modules/accounts/accounts.service.ts   resolveLocalOrgId
  → repo.findOrgByClerkId                           the normal case: the webhook won
  → apps/api/src/lib/clerk.ts                       fetchClerkOrganization (Backend API,
                                                    server secret)
  → createOrgOnce                                   slug uniquified; insert
```

The partner can reach the API before the webhook does. The organisation's name and slug come
from Clerk, never from the request; only the id comes from the verified session.

_Why a race cannot duplicate:_ `Organization.clerkOrgId` is unique. When the webhook and an
on-demand provision insert together, one insert fails; `createOrgOnce` catches that, re-reads
by `clerkOrgId`, and returns the winner's row. Organisations are linked **only** by
`clerkOrgId` — never by slug (ADR 0016) — so naming a Clerk organisation after an existing
institute yields a new organisation with a suffixed slug, not access to the existing one.

**Admin identity in the partner app**

```
apps/partner/src/lib/admin.ts                       isAdmin: session claim metadata.globalRole
apps/partner/src/app/admin/layout.tsx               notFound() for non-admins
```

The API's `requireAdmin` is the real enforcement; the layout only hides the area's existence.

## Business rules invoked

BR-011, BR-012, BR-013 (at the end of the journey, in `listing-lifecycle.md`)

## Failure modes

| Condition                                | API response                         | What the user sees                                          |
| ---------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| Submit with required details missing     | 409 `LISTING_INCOMPLETE` + `missing` | The checklist items still unticked                          |
| City changed after publication           | 409 `CITY_IMMUTABLE`                 | "A published listing's city cannot be changed."             |
| Unknown city or exam slug                | 400 `VALIDATION_FAILED`              | Unreachable from the UI, which only offers reference values |
| Clerk API unreachable while provisioning | 503 `UPSTREAM_UNAVAILABLE`           | "We couldn't set up your institute. Please try again."      |
| Signed in with no active organisation    | none (redirect)                      | `/dashboard` and `/dashboard/new` redirect to `/onboarding` |
| Listing owned by another organisation    | 403 `FORBIDDEN`                      | "You do not have permission to change this listing."        |
| `WEB_BASE_URL` unset in production       | none                                 | Published banner shows no public-page link                  |

## Related flows

`listing-lifecycle.md` — submit, review, publish and reject.
