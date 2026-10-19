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
createdb -O one_academy one_academy_e2e      # Playwright truncates tables
createdb -O one_academy one_academy_shadow   # prisma migrate diff replays history here
```

Four databases, each with a reason: `dev` for day-to-day work, `test` for the API's
integration suite, `e2e` because Playwright truncates tables and would otherwise fight the
integration suite, and `shadow` for `prisma migrate diff`.

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

Run each app either with `dev` (reloads on edit) or with `build` then `start` (the
production build) — not both on the same port. `start` serves the build it was launched
with, so after a code change rebuild and restart it; rebuilding underneath a running
`next start` makes its CSS answer `500`.

## Instant cache clearing (optional)

Public pages cache for 300 seconds. To have publish and suspend show immediately (ADR
0018), give the API and the web app the same secret of at least 32 characters:

```bash
# apps/api/.env
WEB_REVALIDATE_URL=http://localhost:3000/api/revalidate
REVALIDATE_SECRET=<32+ characters>

# apps/web/.env.local
REVALIDATE_SECRET=<the same value>
```

Without them everything works; changes simply take up to five minutes to reach the public
site, and the admin screen says so. `pnpm e2e` sets its own values and starts a second,
caching web server on port 3200 (build directory `.next-e2e-cached`) for
`revalidation.spec.ts`.

## Media storage

Uploaded logos and photos go to `apps/api/.media/` by default (`STORAGE_DRIVER=fs`) and the
API serves them at `http://localhost:4000/media/...`. Nothing to set up; the directory is
gitignored. The test suites use a temporary directory instead.

For `STORAGE_DRIVER=s3` set `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY` and point `MEDIA_PUBLIC_BASE_URL` at the bucket's public URL or CDN.

The s3 driver's test runs only when `S3_TEST_ENDPOINT` is set. Any S3-compatible server
works; Adobe's S3Mock needs no credentials:

```bash
docker run -d -p 9090:9090 -e initialBuckets=media adobe/s3mock:3.12.0
S3_TEST_ENDPOINT=http://localhost:9090 S3_BUCKET=media S3_REGION=us-east-1 \
  S3_ACCESS_KEY_ID=test S3_SECRET_ACCESS_KEY=test pnpm --filter @one/api test -- storage
```

## Testing on a phone

Most traffic is phones, and desktop devtools' mobile view is still `localhost`, so it
misses anything origin-specific. To test on a real device on the same Wi-Fi:

```bash
ipconfig getifaddr en0                 # the laptop's LAN IP
```

Open `http://<that-ip>:3000` on the phone. `apps/web/next.config.ts` allows the machine's
current LAN addresses as dev origins; they are read at startup, so **restart `pnpm dev`
after changing networks**. A page that renders but does nothing when tapped means its
JavaScript was refused — see BUG-004.

## Verify

```bash
pnpm verify                            # lint, typecheck, test, build — must be green
pnpm e2e                               # Playwright; starts its own servers on 3100/4100
./scripts/verify-lint-guardrails.sh    # the architectural rules still fail the build
pnpm exec tsx scripts/check-docs-freshness.ts
curl -s http://localhost:4000/health   # {"status":"ok"}
curl -s http://localhost:3000/institutes | grep -c "Alpha Academy"
```

`pnpm e2e` is deliberately outside `pnpm verify`: it launches real servers, which would
make the inner development loop slow and flaky. CI runs it as a separate job.

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

To make yourself a platform admin, use the Clerk dashboard — no endpoint or database
statement grants it, and `User.globalRole` is not used for authorization (ADR 0006):

1. Open your user and set its **public metadata** to `{"globalRole":"ADMIN"}`.
2. Under **Sessions → Customize session token**, add `{"metadata": "{{user.public_metadata}}"}`.
3. Sign out and in again so the new token is issued.

**Organizations must be enabled** in the Clerk dashboard, or `/onboarding` has nothing to
create. New organisations are mirrored by the webhook and, if a request beats it, provisioned
on demand from Clerk's Backend API. The manual `clerkOrgId` statement above is the **only**
way to link a seeded organisation; slugs are never matched (ADR 0016).

### Partner app environment

`WEB_BASE_URL` (public site origin, for the "View your public page" link) is **required in
production**. When unset there, the published banner omits the link rather than pointing at
localhost. `apps/partner/.env.example` sets it to `http://localhost:3000` for development.

## Troubleshooting

| Symptom                                                             | Cause                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_PNPM_IGNORED_BUILDS`                                           | pnpm 12 blocks post-install scripts. `pnpm approve-builds <pkg> -y`.                                                                                                                                                                                                |
| `P1012` on `url` in the datasource                                  | Prisma 7 moved the connection URL to `prisma.config.ts`.                                                                                                                                                                                                            |
| `PrismaConfigEnvError: Cannot resolve DATABASE_URL`                 | Prisma 7 does not load `.env`; it is loaded explicitly in `prisma.config.ts`.                                                                                                                                                                                       |
| Integration tests fail on a missing column                          | The test database is behind. Re-run `migrate deploy` against it.                                                                                                                                                                                                    |
| `Clerk: <SignedIn> is not available`                                | Clerk Core 3 removed those components; read the session with `auth()`.                                                                                                                                                                                              |
| API `FATAL ... EADDRINUSE`                                          | The port is taken, usually by a `dev` server. `lsof -nP -iTCP:4000`.                                                                                                                                                                                                |
| `Cannot find module '@prisma/client-runtime-utils'`                 | `@one/db` must declare it; pnpm hides transitive deps. See BUG-005.                                                                                                                                                                                                 |
| Page works on laptop, not interactive on phone                      | Dev server refused the phone's origin. Restart `pnpm dev`. See BUG-004.                                                                                                                                                                                             |
| A `brand-*` class has no effect                                     | That step is not defined in `packages/ui/src/styles.css`. See BUG-003.                                                                                                                                                                                              |
| API sees an old Prisma client (missing new columns) after a rebuild | Before P2a, `cp -R generated dist/generated` nested the client into `dist/generated/generated` when the folder already existed (e.g. restored by turbo's cache). The build now deletes `dist/generated` first; if it recurs, `rm -rf packages/db/dist` and rebuild. |
