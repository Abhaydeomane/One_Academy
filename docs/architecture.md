# Architecture

## Shape

One monorepo, three deployable apps, four shared packages.

```
apps/web      Next.js 16  public discovery — SSG/ISR, anonymous, SEO-critical, mobile-first
apps/partner  Next.js 16  institute dashboard — Clerk-authenticated, never indexed
apps/api      Express 5   REST API — the only writer to Postgres

packages/shared  Zod contracts: one definition serves server validation and client types
packages/db      Prisma schema, migrations, client singleton, seed
packages/ui      Design system shared by both frontends
packages/config  tsconfig, ESLint flat configs, Prettier
```

Both frontends call the API over HTTP. Neither may import `@one/db`, and lint enforces it.

## Why a monorepo with separate apps

Atomic cross-stack commits: one commit changes the Express route, the shared contract and
the component that calls it, and CI type-checks all three together. Separate Next.js apps
keep the SEO-critical public bundle free of dashboard JavaScript and auth middleware.
Deployment stays independent — each app has its own host and build. See ADR 0001 and 0002.

The shared packages emit `dist` builds rather than exporting TypeScript source, because
Turbopack cannot resolve another workspace package's source across the package boundary,
and compiled output is also what makes `node dist/index.js` viable. Turborepo orders this
through `dependsOn: ["^build"]`.

## Data model seam

A thin shared core carries identity, location, media and leads for every vertical,
discriminated by `Listing.vertical`:

```
Listing ── Organization ── Membership ── User
   │
   ├── City, MediaAsset, Review, Enquiry, Tag, ListingRedirect   (shared core)
   └── InstituteProfile, Batch                                   (institute vertical)
```

Per-vertical tables hold typed, queryable attributes. Adding hostels means new tables and
a new module; nothing in the core changes. See ADR 0004.

## Request path

```
Browser
  → Next.js Server Component
  → src/lib/api.ts            parses the response with the shared Zod schema
  → Express route             validate() with the same schema
  → service                   business rules, BR-###
  → repository                the only Prisma caller
  → Postgres
```

The same Zod object validates the request on the server and types the response on the
client, so the contract cannot drift. `pnpm --filter @one/shared gen:openapi` renders it as
OpenAPI 3.1 and CI fails if the committed document is stale.

## Authorization

Clerk owns identity and organisation membership. `User`, `Organization` and `Membership`
are local mirrors, so authorization is a database join rather than an API call per request;
a signature-verified webhook keeps them in sync. The API is the sole authority on who may
do what — the partner app renders what the API permits. Admin rights come from the Clerk
session token's `metadata.globalRole`, which is set in the user's Clerk public metadata and
exposed through the session-token template (see the Clerk section of
`runbooks/local-setup.md`). No endpoint or webhook grants it, and `User.globalRole` in the
database is not used for authorization. See ADR 0006.

## Moderation

Partner-submitted content is gated:

```
DRAFT ──submit──▶ PENDING_REVIEW ──publish (ADMIN only)──▶ PUBLISHED ──▶ SUSPENDED
```

Only a global ADMIN publishes (BR-001), only PUBLISHED listings appear in public routes
(BR-009), and a published slug is frozen so search traffic is never lost (BR-002). A batch
cannot be published while its listing is unpublished (BR-004), which closes the obvious way
around the gate.

## Environments

Local only for now; hosting is deferred. Postgres 17 runs as a Homebrew service with two
databases, `one_academy_dev` and `one_academy_test`, owned by a non-superuser role so the
connection string has the same shape it will in production. See
`runbooks/local-setup.md`.
