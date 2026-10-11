# One Academy

A discovery marketplace for coaching institutes: students browse institutes, compare
upcoming batches and fees, and enquire. Institutes manage their own listing through a
separate partner product.

## Layout

| Path              | What it is                                                    |
| ----------------- | ------------------------------------------------------------- |
| `apps/web`        | Public discovery site (Next.js, SEO-critical)                 |
| `apps/partner`    | Institute dashboard (Next.js, Clerk-authenticated)            |
| `apps/api`        | REST API (Express) — the only writer to Postgres              |
| `packages/shared` | Zod contracts: one definition for server validation and types |
| `packages/db`     | Prisma schema, migrations, client                             |
| `packages/ui`     | Design system shared by both frontends                        |
| `packages/config` | tsconfig, ESLint flat configs, Prettier                       |
| `docs/`           | Architecture, flows, decisions, business rules, runbooks      |

## Getting started

See `docs/runbooks/local-setup.md`. In short:

```bash
pnpm install
pnpm --filter @one/db db:migrate
pnpm --filter @one/db db:seed
pnpm dev
```

## Working in this repo

Read `CLAUDE.md` first — it lists the commands, the architectural rules that are enforced
by lint, and the definition of done. `docs/README.md` maps the rest of the documentation.

```bash
pnpm verify    # lint, typecheck, test, build — a change is not done until this is green
```
