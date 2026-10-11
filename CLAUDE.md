# One Academy

A discovery marketplace for coaching institutes. Three deployable apps in one monorepo:
`apps/web` (public, SEO-critical), `apps/partner` (institute dashboard), `apps/api`
(Express REST). Shared code in `packages/{shared,db,ui,config}`.

## Commands

Every workspace exposes `dev`, `build`, `lint`, `typecheck`, `test` under the same names.

| Command                                         | Purpose                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm verify`                                   | lint + typecheck + test + build. **A change is not done until this is green.**      |
| `pnpm e2e`                                      | Playwright end-to-end specs. Separate from `verify` because it starts real servers. |
| `pnpm --filter @one/api test`                   | API tests (needs local Postgres running)                                            |
| `pnpm --filter @one/db db:migrate`              | create and apply a migration                                                        |
| `pnpm --filter @one/shared gen:openapi`         | regenerate `docs/api/openapi.json`                                                  |
| `./scripts/verify-lint-guardrails.sh`           | prove the architectural rules still fail the build                                  |
| `pnpm exec tsx scripts/check-docs-freshness.ts` | flag flow docs whose code has moved                                                 |

Local setup, including the Postgres role and the four databases, is in
`docs/runbooks/local-setup.md`.

## Non-negotiable rules

Enforced by ESLint in `packages/config/eslint/api.js` — you will see a failing check, not a
review comment:

- **R1 / R3** Only `*.repository.ts` may import `@one/db`. Routes never touch the database.
- **R2** Services and repositories must not import `express`.
- **R4** Cross-module access goes through the other module's **service**. A route may only
  call its own module's service.
- **R5** Every route input is validated by a Zod schema from `@one/shared`; read it with
  `validated<T>(req, 'body')`, which throws if `validate()` was omitted.
- **R6** Throw `AppError` subclasses. Only `middleware/errorHandler.ts` maps to HTTP.

Also true, and easy to get wrong:

- **Money is integer minor units (paise)** with an explicit currency. Never a float.
  The UI collects rupees and converts at the boundary.
- **Versions are pinned exactly** in `pnpm-workspace.yaml`'s catalog. Three pins are
  load-bearing — read `docs/decisions/0009-pinned-dependency-versions.md` before changing
  Prisma, TypeScript or Express.
- **Express 5 catches async rejections.** Never add an `asyncHandler` wrapper.
- **Never mock the database.** Integration tests run against real Postgres.
- **Do not use corepack on this machine.** pnpm is installed globally via npm.
- **Mobile first.** 80–90% of traffic is phones. Single column is the base case; `sm:`/`lg:`
  add columns. See `apps/web/CLAUDE.md`.

## Read first

1. `docs/README.md` — the map of the documentation
2. The relevant file in `docs/flows/` — how a feature actually works across the apps
3. `docs/domain/business-rules.md` — the BR-### rules that tests reference

## Definition of done

1. `pnpm verify` green.
2. Integration test for any new or changed endpoint.
3. Contract updated in `packages/shared` if the API changed.
4. Flow doc updated and its verified-sha bumped if behaviour changed.
5. ADR added in `docs/decisions/` if a structural decision was made.
6. Work item moved to `docs/work/archive/` with an Outcome block.
7. Conventional commit referencing the work item ID.
