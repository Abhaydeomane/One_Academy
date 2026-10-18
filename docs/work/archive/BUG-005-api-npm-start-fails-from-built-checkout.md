---
id: BUG-005
title: The API's production entry point (`npm start`) does not boot locally
status: done
created: 2026-10-18
---

## Symptom

`pnpm dev` works, but running the built API with `npm start` in `apps/api` failed in three
successive ways, each hidden behind the previous one:

1. `Invalid environment: {"DATABASE_URL":["... received undefined"]}`
2. `Cannot find module '@prisma/client-runtime-utils'` from `packages/db/dist/generated/client`
3. With port 4000 already taken, it logged `API listening` and **exited 0**.

## Repro

`pnpm build`, then `cd apps/api && npm start` — with `.env` present, and for (3) with
`pnpm dev` already running.

## Root cause

Three independent defects, all invisible under `pnpm dev`:

1. **`.env` was never loaded.** `dev` runs `tsx --env-file-if-exists=.env`; `start` ran
   bare `node`, which does not read `.env`. The variable existed; nothing loaded it.
2. **An undeclared transitive dependency.** The Prisma 7 generated client imports
   `@prisma/client-runtime-utils`, which is a dependency of `@prisma/client`, not of
   `@one/db`. pnpm's isolated layout only lets a package resolve what it declares, so the
   compiled `dist/` could not find it.
3. **Express 5 changed how `listen` reports failure.** It passes errors such as
   `EADDRINUSE` to the `listen` callback instead of throwing. `src/index.ts` ignored the
   argument, so it logged success, the server closed, and the process exited cleanly. A
   supervisor would read that as a normal shutdown.

## Fix

1. `start` is `node --env-file-if-exists=.env dist/index.js`. A no-op in production, where
   the platform supplies the environment and there is no `.env`.
2. `@one/db` declares `@prisma/client-runtime-utils`, pinned to `7.10.0` in the catalog
   alongside the other Prisma packages (ADR 0009).
3. The `listen` callback checks its error, logs `fatal` and exits `1`.

No automated test: the defects live in the boot path, which no suite exercises from a
built checkout. A deploy smoke test (`node dist/index.js` then `GET /health`) would cover
all three.

## Outcome

Fixed in `6ccb5ac`. Verified locally: `npm start` serves `/health` on a free port, and on
a busy port prints `FATAL ... EADDRINUSE` and exits `1`.
