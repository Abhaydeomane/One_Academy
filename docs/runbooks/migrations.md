# Runbook: migrations

## Development

```bash
pnpm --filter @one/db db:migrate       # prompts for a name, applies to one_academy_dev
```

Then apply to the test database, or integration tests run against a stale schema and fail
in ways that look like application bugs:

```bash
DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" \
  pnpm --filter @one/db exec prisma migrate deploy
```

An existing environment variable wins over `packages/db/.env`, which is what makes that
override work.

## Data invariants

A rule that must hold regardless of which code path writes the row belongs in a CHECK
constraint, not only in a service:

```bash
pnpm --filter @one/db exec prisma migrate dev --create-only --name <name>
# hand-write the SQL in the generated migration.sql, then:
pnpm --filter @one/db db:migrate
```

`Batch_seats_invariant` is the worked example (BR-010). The service also checks it, so the
partner sees `SEATS_OUT_OF_RANGE` rather than a database error — the constraint is the
backstop for migrations, backfills and psql.

## Rules

- **Never edit an applied migration.** Add a new one.
- **Never let the API run migrations at boot.** It is an explicit deploy step.
- CI fails if `schema.prisma` and the migration history disagree, via
  `prisma migrate diff --exit-code`.

## Resetting local data

Destructive — drops and recreates the development database, then reseeds:

```bash
pnpm --filter @one/db db:reset
```

The seed is idempotent and uses fixed IDs that tests and manual checks depend on, so
running it twice is safe.
