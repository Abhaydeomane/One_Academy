# Runbook: local setup

Verified on macOS (Darwin 24.2) on 2026-10-11.

## Prerequisites

**Node 22.16+** — check with `node --version`.

**pnpm 12.11.2**, installed globally via npm:

```bash
npm install -g pnpm@12.11.2
```

**Do not use corepack.** pnpm 12 ships `bin/pnpm.mjs`; corepack 0.32 hardcodes `.cjs`, and
corepack 0.36 requires Node ≥ 22.22 while this machine runs 22.16. See ADR 0007.

**Postgres 17:**

```bash
brew install postgresql@17
brew services start postgresql@17
```

The formula is keg-only, so add its bin directory to `PATH` (already appended to
`~/.zshrc` on the owner's machine):

```bash
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
```

## Databases

A non-superuser role owns both databases, so the local connection string has the same
shape it will in production:

```bash
psql -d postgres -c "CREATE ROLE one_academy WITH LOGIN PASSWORD 'local_dev_only' CREATEDB;"
createdb -O one_academy one_academy_dev
createdb -O one_academy one_academy_test
```

The password is local-only and deliberately not a secret. It must never appear in a
deployed environment.

## Install and run

```bash
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/partner/.env.example apps/partner/.env.local   # needs real Clerk test keys

pnpm --filter @one/db db:migrate
pnpm --filter @one/db db:seed

# The test database needs the same migrations, or integration tests fail.
DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" \
  pnpm --filter @one/db exec prisma migrate deploy

pnpm dev
```

API on `:4000`, web on `:3000`, partner on `:3001`.

## Verify

```bash
pnpm verify                            # lint, typecheck, test, build — must be green
./scripts/verify-lint-guardrails.sh    # the architectural rules still fail the build
curl -s http://localhost:4000/health   # {"status":"ok"}
curl -s http://localhost:3000/institutes | grep -c "Alpha Academy"
```

## Clerk

The partner app ships a well-formed **placeholder** publishable key so `next build`
succeeds. Sign-in needs real test keys from the Clerk dashboard in both
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.

A partner also needs their Clerk organisation mirrored locally. The webhook does this
normally; to link one by hand:

```bash
psql "postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev" \
  -c "UPDATE \"Organization\" SET \"clerkOrgId\"='<clerk org id>' WHERE id='org-seed-alpha';"
```

To make yourself a platform admin, set `globalRole` directly — no endpoint grants it:

```bash
psql "postgresql://one_academy:local_dev_only@localhost:5432/one_academy_dev" \
  -c "UPDATE \"User\" SET \"globalRole\"='ADMIN' WHERE email='<your email>';"
```

## Troubleshooting

| Symptom                                             | Cause                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `ERR_PNPM_IGNORED_BUILDS`                           | pnpm 12 blocks post-install scripts. `pnpm approve-builds <pkg> -y`.          |
| `P1012` on `url` in the datasource                  | Prisma 7 moved the connection URL to `prisma.config.ts`.                      |
| `PrismaConfigEnvError: Cannot resolve DATABASE_URL` | Prisma 7 does not load `.env`; it is loaded explicitly in `prisma.config.ts`. |
| Integration tests fail on a missing column          | The test database is behind. Re-run `migrate deploy` against it.              |
| `Clerk: <SignedIn> is not available`                | Clerk Core 3 removed those components; read the session with `auth()`.        |
