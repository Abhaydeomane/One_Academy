# packages/db

The only workspace that talks to Postgres. Prisma 7 with the `pg` driver adapter.

## Migrations

    pnpm --filter @one/db db:migrate          # create + apply in development
    pnpm --filter @one/db db:migrate:deploy   # apply existing migrations
    pnpm --filter @one/db db:reset            # drop, re-apply, re-seed (destructive)

Then apply to the test database too, or integration tests run against a stale schema:

    DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" \
      pnpm --filter @one/db exec prisma migrate deploy

- **Never edit an applied migration.** Add a new one.
- A data invariant that must hold regardless of application code belongs in a CHECK
  constraint, created with `--create-only` and hand-written SQL.
  `Batch_seats_invariant` is the worked example (BR-010).

## Prisma 7 differences from older examples

1. **`url` is not allowed in the `datasource` block.** The connection string lives in
   `prisma.config.ts`. A schema with `url = env(...)` fails validation with `P1012`.
2. **The client requires a driver adapter** — `@prisma/adapter-pg` wrapping `pg`,
   constructed in `src/client.ts`. There is no implicit engine connection.
3. **`.env` is not loaded automatically.** `prisma.config.ts` calls Node's
   `process.loadEnvFile()`; `db:seed` runs `tsx --env-file=.env`. An existing environment
   variable still wins, which is how the test database gets migrated.

Prisma is pinned to **7.10.0**. `pnpm add prisma` would install an 8.0 release candidate,
because that is what the `latest` dist-tag currently points at.

## Conventions

- Repositories convert rows to plain types before returning them, so no service ever
  depends on a Prisma model shape.
- The generated client lands in `generated/` (git-ignored). `build` runs `prisma generate`,
  compiles `src`, and copies `generated` into `dist` so the emitted relative import
  resolves at runtime.
- The seed is **idempotent** and uses fixed IDs (`listing-alpha`, `listing-draft`) that
  tests and manual checks depend on. `listing-draft` exists so BR-009 can be verified.
