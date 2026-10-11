# One Academy — P0 Foundation & Standards

**Date:** 2026-10-11
**Status:** Approved design, pending implementation plan
**Scope:** P0 only. P1–P4 are sketched for context and will get their own specs.

---

## 1. Context

One Academy is a discovery marketplace for coaching institutes — the RedBus/JustDial
pattern applied to education. Students browse institutes, compare them, view upcoming
batches, and eventually apply. Institutes receive a separate product for managing their
own listing. Hostels and PGs become a second vertical later.

This makes it a three-sided system from day one:

| Side | Surface | Characteristics |
|---|---|---|
| Consumer | Public discovery site | SEO-critical, mostly anonymous, read-heavy |
| Partner | Institute dashboard | Authenticated, org-scoped, write-heavy |
| Internal | Admin/moderation | Small, high-privilege |

Nearly all code will be written by AI agents, under the direction of a single person.
Agents start each session without memory of prior sessions and may be swapped between
vendors. The architecture is therefore optimized for a specific property:

> **An agent arriving cold should be able to make a correct change to one part of the
> system without reading the rest of it — and should be unable to violate the
> architecture without a check failing.**

Every decision below serves that property. Where a rule can be expressed as tooling
instead of prose, it is expressed as tooling, because agents comply with failing checks
far more reliably than with documentation.

## 2. Goals

1. One standard structure that survives agent and vendor changes.
2. Cross-stack changes (API + UI + docs) land atomically in one commit.
3. The API contract cannot silently drift between frontend and backend.
4. Durable records of *why* decisions were made, not just what changed.
5. A second vertical (hostels/PG) is additive, not a migration.
6. Independent deployment of each app.

## 3. Non-goals for P0

- Building consumer search, filtering, or comparison features (P1).
- Full partner onboarding, claim-and-verify flows (P2).
- Payments, applications, admissions (P3).
- Any hostel/PG implementation. P0 only leaves the seam (P4).
- Dedicated search infrastructure. Postgres full-text until relevance demonstrably hurts.
- A generic multi-vertical abstraction framework. Two concrete verticals do not justify it.

## 4. Decisions

Each becomes an ADR in `docs/decisions/`.

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| 0001 | Single monorepo, three deployable apps | Atomic cross-stack commits; shared types type-checked in CI; docs change in the same PR as code | Three repos (docs and contracts drift, cross-stack change spans 3 PRs); 2 repos (docs still drift) |
| 0002 | Separate `web` and `partner` Next.js apps | SEO pages avoid shipping dashboard JS and auth middleware; partner is a distinct product | Route groups in one app (couples bundles and caching) |
| 0003 | Zod contracts in `packages/shared`, OpenAPI generated | Server validation and client types derive from one definition; drift structurally impossible | Hand-written OpenAPI (diverges from validator); tRPC (welds UI to backend, blocks third-party API consumers) |
| 0004 | Thin shared listing core + typed vertical modules | Hostels become a new module, not a schema migration; filtered search stays type-safe | Polymorphic listings with JSONB attributes (loses type safety where search is the product); defer entirely (refactor would touch every table and endpoint) |
| 0005 | Postgres + Prisma | A typed schema is the strongest available guard against agents inventing columns | Mongo (weak constraints); raw SQL (more agent surface for error) |
| 0006 | Clerk for authentication and organizations | Session and org/role handling is the most likely place for an agent-introduced security hole | Better Auth / self-issued JWT (more security-sensitive code to own) |
| 0007 | pnpm + Turborepo | pnpm's strict `node_modules` makes phantom dependencies impossible; Turborepo gives path-aware CI | npm/yarn workspaces (permit undeclared imports) |

## 5. Repository layout

```
One_Academy/
├── apps/
│   ├── web/                    Next.js — public discovery (SSG/ISR, no auth)
│   ├── partner/                Next.js — institute dashboard (authed, no SEO)
│   └── api/                    Express — REST API
├── packages/
│   ├── shared/                 Zod contracts, inferred types, error codes, constants
│   ├── ui/                     design system: components, tokens, Tailwind preset
│   ├── db/                     Prisma schema, migrations, client, seed
│   └── config/                 base eslint / tsconfig / prettier
├── docs/                       see §10
├── scripts/                    check-openapi, check-docs-freshness, reconcile-clerk
├── .github/workflows/ci.yml
├── CLAUDE.md                   root agent contract
├── pnpm-workspace.yaml
└── turbo.json
```

### Existing repositories

Three repos exist and are effectively empty: `One_Academy_UI` (no commits),
`One_Academy_Backend` (one commit), `One_Academy_Docs` (one commit).

**Resolved 2026-10-11.** `One_Academy_Backend` was renamed to `One_Academy` on GitHub and
is the monorepo. The local clone's `origin` now points at
`git@github.com:Abhaydeomane/One_Academy.git`. `One_Academy_UI` and `One_Academy_Docs` are
**left as they are** — not archived, not deleted — by the owner's decision. They hold no
commits of substance and are not referenced by this design.

The local directory is still named `One_Academy_Backend`; renaming it to `One_Academy` is
cosmetic and optional.

### Workspace dependencies

Six `package.json` files. The root declares tooling only — no application dependencies —
plus `"packageManager": "pnpm@12.11.2"` and `"engines": { "node": ">=22.16" }`.

| Workspace | Dependencies |
|---|---|
| root | turbo, typescript, eslint, typescript-eslint, eslint-plugin-boundaries, prettier, husky, lint-staged |
| `apps/web` | next, react, `@one/ui`, `@one/shared` |
| `apps/partner` | next, react, react-hook-form, @clerk/nextjs, `@one/ui`, `@one/shared` |
| `apps/api` | express, pino, zod, @clerk/express, `@one/shared`, `@one/db` |
| `packages/shared` | zod |
| `packages/db` | prisma, @prisma/client |
| `packages/ui` | react (peer), tailwindcss |

Every workspace is named under the `@one/` scope — `@one/web`, `@one/partner`,
`@one/api`, `@one/shared`, `@one/ui`, `@one/db`, `@one/config` — so Turborepo filters and
deploy commands reference them uniformly.

Internal packages are depended on as `"@one/shared": "workspace:*"` — symlinked, no
publish step, TypeScript resolves to source.

Shared dependency **versions** are pinned once via the pnpm catalog, so `web` and
`partner` cannot drift onto different React versions:

```yaml
# pnpm-workspace.yaml
packages: ['apps/*', 'packages/*']
catalog:
  react: 19.3.0
  react-dom: 19.3.0
  next: 16.4.0
  express: 5.3.0
  '@types/express': 5.0.6
  zod: 4.6.5
  prisma: 7.10.0
  '@prisma/client': 7.10.0
  typescript: 6.0.3
  vitest: 5.0.3
  supertest: 7.3.1
  tailwindcss: 4.3.3
  pino: 10.4.0
  '@clerk/nextjs': 7.9.14
  '@clerk/express': 2.1.78
```

Workspaces write `"react": "catalog:"`.

### Version pins and why they are exact

All versions above are verified as of 2026-10-11 and pinned exactly rather than
caret-ranged. Agents install what the catalog says; a floating range lets two sessions
produce different lockfiles. Three pins are load-bearing and must not be "upgraded to
latest" without reading this:

- **Prisma 7.10.0, not 8.** The npm `latest` dist-tag for `prisma` currently points at
  `8.0.0-rc.22`, a release candidate, while `@prisma/client` latest is `7.10.0`. An agent
  running `pnpm add prisma` would silently install an RC and desynchronize CLI from
  client. Always pin.
- **TypeScript 6.0.3, not 7.** `typescript-eslint@8.71.1` declares
  `typescript: ">=4.8.4 <6.1.0"`. TypeScript 7 (the native compiler) is stable and
  current, but adopting it would disable typescript-eslint — and therefore the R1–R6
  enforcement in §6, which is the backbone of this design. 6.0.3 is the newest version
  inside the supported window. Revisit when typescript-eslint supports 7.
- **Express 5.3.0.** Express 5 forwards rejected promises from async handlers to the
  error middleware automatically, so R6 needs no `asyncHandler` wrapper. Express 4
  examples found online will add one; it is unnecessary and should be rejected in review.

ESLint 10.12.0, typescript-eslint 8.71.1 (peer `eslint: ^10`) and
eslint-plugin-boundaries 7.2.0 (peer `eslint: >=6`) are mutually compatible. ESLint 10 is
flat-config only; `packages/config` ships flat config, and no `.eslintrc` may exist.

### Standard scripts

Every workspace exposes exactly these five, with identical names. This uniformity is
load-bearing: any agent in any workspace knows the command without exploring, and
Turborepo depends on it.

| Script | Meaning |
|---|---|
| `dev` | run in watch mode |
| `build` | produce the deployable artifact |
| `lint` | eslint, zero warnings tolerated |
| `typecheck` | `tsc --noEmit` |
| `test` | that workspace's tests |

Root adds `verify` = `turbo lint typecheck test build`. **`pnpm verify` green is the
definition of a finished change.**

## 6. Backend architecture — `apps/api`

Vertical slices, strictly layered inside each slice.

```
src/
├── server.ts                        express app assembly only
├── config/index.ts                  Zod-validated env → typed config object
├── middleware/                      auth, validate, errorHandler, requestId, rateLimit
├── modules/
│   ├── listings/                    shared core
│   ├── institutes/
│   │   ├── institutes.routes.ts            public HTTP
│   │   ├── institutes.partner.routes.ts    org-scoped HTTP
│   │   ├── institutes.service.ts           business rules, no req/res
│   │   ├── institutes.repository.ts        the only file importing Prisma
│   │   ├── institutes.service.test.ts      unit
│   │   └── institutes.routes.test.ts       integration
│   ├── batches/
│   ├── enquiries/
│   └── reviews/                     schema only in P0, endpoints in P2
├── lib/                             logger, storage, mailer, AppError
└── index.ts
```

**Routes are grouped by the resource they own, never by audience.** A module exposes up
to three route files — `*.routes.ts` (public), `*.partner.routes.ts` (org-scoped), and
`*.admin.routes.ts` (privileged) — all sharing one service and one repository. There is
deliberately no top-level `admin` or `partner` module: splitting by audience would put
two callers of the same business rule in different modules and guarantee divergence. The
admin moderation queue is therefore `listings.admin.routes.ts`.

P0 implements the `listings`, `institutes`, `batches`, and `enquiries` modules. `reviews`
exists in the database schema (§7) but gets no endpoints until P2.

### Architectural rules

These are enforced by `eslint-plugin-boundaries`, not by documentation alone.

| # | Rule | Enforcement |
|---|---|---|
| R1 | Routes must not import Prisma or `@one/db` | eslint boundary |
| R2 | Services must not reference `req`, `res`, or HTTP status codes | eslint restricted-imports + review |
| R3 | Only `*.repository.ts` may import the Prisma client | eslint boundary |
| R4 | Cross-module access goes through the other module's **service** — never its repository, never its tables | eslint boundary |
| R5 | Every route input is validated by a Zod schema from `@one/shared` | integration test asserts 400 on malformed input |
| R6 | Errors are thrown as `AppError` subclasses; only `errorHandler` maps to HTTP | eslint restricted-syntax on `res.status(5..)` |

R4 is the rule that makes single-module context sufficient, and the one most likely to
erode without mechanical enforcement.

### Conventions

- A service file approaching 300 lines is split by use case.
- Repositories return domain objects, never Prisma types, so Prisma stays replaceable.
- All money is integer minor units (paise) plus an explicit currency code.
- All list endpoints are paginated: `page`, `limit` (max 50), returning `{ items, total, page, limit }`.

## 7. Data model

Prisma schema in `packages/db/prisma/schema.prisma`.

### Shared core

```
Organization   id, name, slug, clerkOrgId, status, createdAt
User           id, clerkUserId, email, name, globalRole(USER|ADMIN), createdAt
Membership     id, organizationId, userId, role(OWNER|MANAGER|VIEWER)
City           id, slug, name, state
Listing        id, vertical(INSTITUTE|HOSTEL), slug⊙, name, status, organizationId,
               cityId, locality, lat, lng, shortDescription,
               ratingAvg, ratingCount, publishedAt, createdAt, updatedAt
ListingRedirect id, oldSlug⊙, listingId
MediaAsset     id, listingId, kind(IMAGE|VIDEO|BROCHURE), url, alt, sortOrder
Review         id, listingId, authorUserId, rating, title, body, status, createdAt
Enquiry        id, listingId, vertical, batchId?, name, phone, email, message,
               status(NEW|CONTACTED|CONVERTED|CLOSED), source, createdAt
Tag            id, slug⊙, label, kind(EXAM|AMENITY|FACILITY)
ListingTag     listingId, tagId
```

`⊙` = unique. `ListingStatus = DRAFT | PENDING_REVIEW | PUBLISHED | SUSPENDED`.

### Institute vertical

```
InstituteProfile  id, listingId⊙, establishedYear, facultyCount, modes(Mode[]),
                  website, about
Batch             id, listingId, title, exam, mode(ONLINE|OFFLINE|HYBRID),
                  startDate, endDate, scheduleText, seatsTotal, seatsAvailable,
                  feeAmount(Int, minor units), feeCurrency,
                  status(DRAFT|PUBLISHED|ARCHIVED), createdAt
```

`Mode = ONLINE | OFFLINE | HYBRID`, shared by `InstituteProfile.modes` and `Batch.mode`.

Hostels later add `HostelProfile` and `Room` against the same core. Nothing in `Listing`,
`Review`, `Enquiry`, or `MediaAsset` changes — that is the seam this design buys.

`Review`, `Listing.ratingAvg`, and `Listing.ratingCount` are created in P0 so the core is
complete and seedable, but no endpoint reads or writes them until P2. `User.globalRole` is
set only by seed script or a manual database statement in P0 — there is deliberately no
endpoint that grants ADMIN.

### Clerk and the local mirror

Clerk is the source of truth for identity and organization membership. `User`,
`Organization`, and `Membership` are **local mirrors**, needed so authorization can be a
database join rather than an API call on every request. Synchronization is by Clerk
webhook, with `scripts/reconcile-clerk.ts` for drift repair — webhooks are not reliable
enough to be the only path.

### Indexes

`Listing(status, vertical, cityId)`, `Listing(slug)`, `Batch(listingId, status, startDate)`,
`Enquiry(listingId, createdAt)`, GIN index on the listing search vector.

## 8. Business rules

Numbered, and referenced by ID from tests and from the single permitted code comment.
`grep BR-003` returns the rule, its test, and its implementation.

| ID | Rule |
|---|---|
| BR-001 | A Listing transitions to PUBLISHED only by a global ADMIN |
| BR-002 | A PUBLISHED Listing's slug is immutable; a change creates a ListingRedirect |
| BR-003 | A Batch cannot be PUBLISHED with a `startDate` in the past |
| BR-004 | A Batch cannot be PUBLISHED unless its parent Listing is PUBLISHED |
| BR-005 | Monetary values are integer minor units with an explicit currency code |
| BR-006 | Reviews are PENDING until moderated |
| BR-007 | Enquiries are readable only by the owning Organization and global ADMINs |
| BR-008 | Comparison accepts 2–4 listings, all of the same vertical |
| BR-009 | Only PUBLISHED listings appear in public search or detail routes |
| BR-010 | `seatsAvailable` is always between 0 and `seatsTotal` inclusive |

## 9. API contract

### Mechanism

Each endpoint's query, body, and response schemas live in
`packages/shared/src/contracts/<module>.ts` as Zod objects, with types inferred from
them. Express validates with the schema; both frontends import the inferred type. One
definition means drift is structurally impossible rather than merely discouraged.

```ts
// packages/shared/src/contracts/institutes.ts
export const listInstitutesQuery = z.object({
  city: z.string().optional(),
  exam: z.string().optional(),
  mode: z.enum(['ONLINE', 'OFFLINE', 'HYBRID']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type ListInstitutesQuery = z.infer<typeof listInstitutesQuery>
```

`pnpm gen:openapi` emits `docs/api/openapi.json` via
`@asteasolutions/zod-to-openapi@9.1.0`, whose peer range is `zod: ^4.0.0` and so matches
the pinned Zod 4.6.5. **CI regenerates and fails on any diff**, so API documentation
cannot rot. Zod 4's built-in `z.toJSONSchema()` is deliberately not used: it produces JSON
Schema, not the OpenAPI 3.1 document with path, parameter and response metadata that the
generated spec needs.

### Conventions

- All routes under `/api/v1`. A breaking change takes a new path; the old one is
  deprecated with a date recorded in `docs/decisions/`.
- Uniform error envelope: `{ error: { code, message, details? } }`, codes enumerated in
  `@one/shared`.
- The UI parses responses with the shared schema in development, so a contract violation
  fails loudly at the boundary rather than as a downstream `undefined`.

### P0 endpoints

Public:
```
GET  /api/v1/institutes                    list, filter, paginate
GET  /api/v1/institutes/:slug              detail
GET  /api/v1/institutes/:slug/batches      published batches
POST /api/v1/enquiries                     create lead (10 per hour per IP)
```
Partner (authed, org-scoped):
```
GET   /api/v1/partner/listings
PATCH /api/v1/partner/listings/:id
POST  /api/v1/partner/listings/:id/batches
PATCH /api/v1/partner/batches/:id
POST  /api/v1/partner/listings/:id/submit        DRAFT → PENDING_REVIEW
```
Admin:
```
GET  /api/v1/admin/listings?status=PENDING_REVIEW
POST /api/v1/admin/listings/:id/publish          BR-001
```

## 10. Documentation system

### Principle

Docs hold what git cannot. Git records what changed, when, and by whom — exactly. It
records nothing about intent, rejected alternatives, or how a flow spans three apps.
Docs cover only the second category.

**Explicitly excluded:** any hand-maintained log of files changed, and any mirror of the
code's structure. Both duplicate `git log` and the code itself, rot within weeks, and
then actively mislead the next agent. This replaces the "files changed during changes"
idea from the original plan — `git log --follow`, `git blame`, and ADRs cover it better
and stay true for free.

### Structure

```
docs/
├── README.md               map of the docs — agents read this first
├── architecture.md         the three apps, data flow, deploy topology
├── flows/                  the living system map
│   ├── institute-discovery.md
│   ├── listing-lifecycle.md
│   ├── partner-onboarding.md
│   └── enquiry-to-admission.md
├── domain/
│   ├── glossary.md         exact meaning of Listing vs Institute vs Batch vs Org
│   └── business-rules.md   §8, canonical
├── decisions/              ADRs, NNNN-kebab-title.md
├── api/openapi.json        generated, never hand-edited
├── runbooks/               deploy, rollback, migration, incident
├── work/
│   ├── requests/           one file per ask
│   ├── bugs/
│   └── archive/            finished, with outcomes
└── superpowers/specs/      design specs (this file)
```

### Flow document template

Fixed, so agents update them as reliably as they read them.

~~~markdown
# Flow: <name>
Last verified against commit: <sha>

## Purpose
## Actors and entry points
## Sequence
apps/web/app/institutes/[slug]/page.tsx
  → GET /api/v1/institutes/:slug
  → institutes.service.getBySlug()
  → institutes.repository: Listing ⋈ InstituteProfile ⋈ Batch

## Diagram
A mermaid sequence or flowchart block.

## Business rules invoked
BR-002, BR-009

## Failure modes
| Condition | API response | What the user sees |

## Related flows
~~~

The code anchors and the verified-sha line enable a **drift detector**:
`scripts/check-docs-freshness.ts` reads each flow's anchors and compares
`git log -1 --format=%H -- <anchor>` against the recorded sha. Stale flows are flagged in
CI — a warning initially, promoted to a hard failure once the docs are trusted. Without
this, "keep flows updated" is a hope rather than a mechanism.

### ADRs

One per structural decision: Context / Decision / Alternatives rejected and why /
Consequences. Numbered and **immutable** — superseded by a new ADR, never edited. These
are the agent-switch insurance: a fresh agent reads them and stops re-litigating settled
choices.

### Work intake

`docs/work/requests/REQ-NNN-slug.md`:

```markdown
---
id: REQ-014
title: Add exam-category filter to institute search
status: todo | in-progress | done
created: 2026-10-11
---
## What I want
## Why
## Acceptance criteria
- [ ] …
## Constraints
```

Bugs use `BUG-NNN` with the same shape plus **Root cause** — the one irreplaceable field,
since git shows the fix but never the misunderstanding behind it.

On completion the file moves to `docs/work/archive/` with an appended **Outcome**: what
shipped, PR link, what was learned, follow-ups. No file lists.

## 11. Agent guardrails

### Layered `CLAUDE.md`

Root — deliberately short, because agents read short files:
1. What this is (5 lines) and the three apps.
2. The five standard commands.
3. The non-negotiable rules (R1–R6, contract-first, money as minor units).
4. Where to read first: `docs/README.md`, then the relevant flow doc.
5. The definition of done.

Per-workspace adds recipes:
- `apps/api/CLAUDE.md` — ordered steps to add a module; where contracts go.
- `apps/web/CLAUDE.md` — server vs client components, data fetching, SEO requirements.
- `apps/partner/CLAUDE.md` — Clerk org scoping, how authorization is asserted.
- `packages/db/CLAUDE.md` — migration workflow, never edit applied migrations.

**Prose is the weakest guardrail.** Anything expressible as a failing check belongs in
ESLint, TypeScript, or CI. `CLAUDE.md` should mostly point at checks that fail.

### Definition of done

1. `pnpm verify` green.
2. Integration test for any new or changed endpoint.
3. Contract schema added or updated in `packages/shared` if the API changed.
4. Flow doc updated and its verified-sha bumped if behavior changed.
5. ADR added if a structural decision was made.
6. Work item moved to `archive/` with an Outcome block.
7. Conventional commit message referencing the work item ID.

## 12. Enforcement

**Local:** husky pre-commit → lint-staged (`eslint --fix`, `prettier`). Pre-push →
`typecheck` + unit tests.

**CI** (`.github/workflows/ci.yml`), path-filtered per workspace via Turborepo:

| Job | Fails when |
|---|---|
| lint | any eslint error or warning |
| typecheck | any TS error |
| unit | a service test fails |
| integration | an endpoint test fails against real Postgres |
| build | any app fails to build |
| openapi-fresh | regenerated `openapi.json` differs from committed |
| prisma-drift | schema does not match the migration history |
| docs-fresh | a flow doc's anchors moved past its verified sha (warning in P0) |

Branch protection on `main` requires all jobs except `docs-fresh`.

### Testing strategy

| Layer | Scope | Requirement |
|---|---|---|
| Unit | Services, business rules | One test per BR ID, named with the ID |
| Integration | Every endpoint, real Postgres | Required for every route; covers authz and status filtering |
| E2E | Playwright, two paths only | search → detail → enquiry; partner creates batch → appears publicly |

**The database is never mocked.** Integration tests run against a real Postgres service
container. The mistakes agents actually make — wrong joins, missed status filters,
unscoped org queries — are invisible to mocked tests and caught immediately here. This
layer gets the effort.

### Branching

Trunk-based. Short-lived `feat/REQ-014-exam-filter` branches, squash merge, PR body
referencing the work item. Conventional commits so the changelog is generated, never
hand-written.

## 13. Deployment

| App | Host | Configuration |
|---|---|---|
| `apps/web` | Vercel | Root directory `apps/web`; ignored build step `git diff --quiet HEAD^ HEAD -- apps/web packages/ui packages/shared` |
| `apps/partner` | Vercel | Root directory `apps/partner`, same pattern |
| `apps/api` | Render | Root directory `apps/api`; `pnpm install --filter @one/api...` |
| Postgres | Deferred | Local only for now; see below |

Hosting is **not yet chosen** and does not block M1–M7. The table above is the intended
shape, not a commitment.

Each app validates its environment at boot with a Zod schema in `config/`, failing fast on
a missing variable. `.env.example` is committed; real values live only in `.env.local`
(git-ignored) and, later, host dashboards. Migrations run as an explicit deploy step,
never automatically at boot.

### Local development environment

Provisioned and verified on 2026-10-11:

| Component | Version | Notes |
|---|---|---|
| Node | 22.16.0 | via nvm |
| pnpm | 12.11.2 | installed globally via npm; corepack 0.36 is incompatible with Node 22.16 and must not be used |
| Postgres | 17.11 | Homebrew `postgresql@17`, running as a `brew services` daemon on port 5432 |

Two databases owned by a non-superuser role `one_academy`, mirroring the production shape
so the connection string format never changes:

```
postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev
postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test
```

The password is local-only and intentionally not a secret; it must never appear in a
deployed environment. `postgresql@17` is keg-only, so
`/opt/homebrew/opt/postgresql@17/bin` was appended to `PATH` in `~/.zshrc`.

Integration tests (§12) run against `one_academy_test` locally and against a Postgres 17
service container in CI, so **Docker is not required for local development.**

Observability for P0: `pino` structured logs with a request ID per request. Error
tracking deferred to P1.

## 14. P0 milestones

One end-to-end slice proving every layer: **a public institute detail page, and a partner
creating a batch that appears on it.** That exercises both frontends, the API, Clerk auth,
the moderation state machine, and the contract.

| M | Deliverable | Done when |
|---|---|---|
| M1 | Workspace and tooling | `pnpm verify` green on an empty skeleton; eslint boundary rules reject a deliberate R1 violation; CI runs on PR |
| M2 | `packages/db` | Core + institute schema migrated; seed creates 10 institutes, 3 cities, 20 batches; drift check green |
| M3 | `packages/shared` | Contracts for all §9 endpoints; error codes; `gen:openapi` produces a valid spec |
| M4 | `apps/api` | All §9 endpoints implemented; integration tests pass against real Postgres; BR-001–005, BR-007, BR-009, BR-010 unit-tested (BR-006 lands with reviews in P2, BR-008 with comparison in P1) |
| M5 | `apps/web` | Institute list and detail pages render from the API; ISR configured; metadata, sitemap, JSON-LD present |
| M6 | `apps/partner` | Clerk sign-in, org scoping enforced, create-batch screen writes through the API |
| M7 | `docs/` | README, architecture, 2 flow docs with anchors, ADRs 0001–0007, business-rules, work templates, runbooks |
| M8 | Deploys — **deferred** | Hosting undecided (§17). P0 completes without it; all three apps run locally against local Postgres |

### P0 acceptance

Running locally: a partner signs in, creates a batch on their DRAFT listing, and submits
it for review; an admin publishes it; the batch appears on the public detail page; a
student submits an enquiry the partner can see. `pnpm verify` green, CI green on the
pull request, every flow doc current.

## 15. Risks

| Risk | Mitigation |
|---|---|
| Clerk webhooks drop, mirrors drift | `scripts/reconcile-clerk.ts`, run on a schedule and after incidents |
| Docs freshness check produces false positives and gets ignored | Warning-only in P0; promote to blocking only once the signal is trusted |
| Agents bypass R4 in ways eslint cannot see | Integration tests assert org scoping; code review on cross-module changes |
| Slug changes break SEO | BR-002 plus the redirect table, enforced in the service layer |
| Scope creep from P0 into P1 search features | §3 non-goals are explicit; new asks become `REQ-` files, not P0 additions |
| Vercel/Render monorepo configuration friction | Accepted; one-time cost, documented in the deploy runbook |

## 16. Roadmap beyond P0

| Phase | Scope |
|---|---|
| P1 | Consumer discovery: search, filters, city and exam landing pages, comparison, reviews, SEO depth |
| P2 | Partner portal and admin: claim-and-verify, media upload, moderation queue, lead inbox, analytics |
| P3 | Leads → admissions → payments |
| P4 | Hostels/PG vertical via the §7 seam |

Each phase gets its own spec, implementation plan, and cycle.

## 17. Open items

- **Hosting for all three apps and Postgres** — deferred by decision. Does not block
  M1–M7; revisit at M8. Until then everything runs locally.
- **Clerk account and keys** — needed before M6 can be completed, not before.
- **typescript-eslint support for TypeScript 7** — revisit the TS 6.0.3 pin once
  available.

Resolved since first draft: repository consolidation (§5), local Postgres provisioning
(§13), and exact dependency versions (§5).
