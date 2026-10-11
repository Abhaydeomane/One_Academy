# apps/api

Express 5 REST API. Vertical slices in `src/modules/<module>/`, strictly layered inside
each slice. The only workspace that writes to Postgres.

## Adding an endpoint, in order

1. Define its Zod schemas in `packages/shared/src/contracts/<module>.ts` and export the
   inferred types.
2. Add the query to `<module>.repository.ts`. Return a plain row type, never a Prisma
   model type, so Prisma stays replaceable.
3. Put the business rule in `<module>.service.ts`. Throw `AppError` subclasses with a
   domain-specific code so the UI can explain the failure.
4. Add the route to `<module>.routes.ts` (or `.partner.routes.ts` / `.admin.routes.ts`),
   wrapped in `validate({ ... })`, reading input via `validated<T>(req, 'params')`.
5. Mount the router in `src/server.ts` if the module is new.
6. Write the integration test in `<module>.routes.test.ts` against real Postgres.
7. Register the path in `packages/shared/scripts/gen-openapi.ts` and regenerate, or CI
   fails on a stale spec.

## Routes group by resource, never by audience

A module has **one** service and **one** repository shared by its public, partner and
admin route files. Splitting by audience would put two callers of the same business rule in
different modules and guarantee they diverge. The admin moderation queue is therefore
`listings.admin.routes.ts`, not an `admin` module.

Because R4 bars a route from reaching into another module, a route that needs another
module's data calls a delegating function on its own service — see
`institutes.service.listPublishedBatchesBySlug`, which exists for exactly that reason.

## Clerk organisation ids are not local ids

`req.auth.orgId` is a **Clerk** organisation id. Translate it with each module service's
`resolveOrganizationId()` before any database query. An organisation Clerk knows but One
Academy has not onboarded is a 403, not a crash.

## Tests

Migrate the test database after every new migration, or integration tests run against a
stale schema:

    DATABASE_URL="postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test" \
      pnpm --filter @one/db exec prisma migrate deploy

`requireAuth` honours an `x-test-auth` header **only when `NODE_ENV=test`**, so tests
exercise the real authorization logic without depending on live Clerk sessions. This is
the one deliberate test seam in the API; never rely on it elsewhere.

The enquiry rate limit is raised under test so repeated suite runs are not throttled.
