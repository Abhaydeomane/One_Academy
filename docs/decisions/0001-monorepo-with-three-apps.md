# ADR 0001 — Single monorepo with three deployable apps

Date: 2026-10-11
Status: Accepted

## Context

Nearly all code is written by AI agents directed by one person, and agents may be swapped
between vendors. An agent starts every session without memory of the last one. The project
began as three separate GitHub repositories — UI, backend, and a documentation repo meant
to hold system flows and a record of changes.

Three repositories make a cross-stack change span three pull requests, and make it
impossible for a documentation update to land in the same commit as the code it describes.

## Decision

One monorepo containing `apps/web`, `apps/partner`, `apps/api`, four shared packages, and
`docs/`. pnpm workspaces with Turborepo.

## Alternatives rejected

**Three repositories (the original plan).** The API contract and the documentation both
drift, because neither can be changed atomically with the code. Nothing mechanically
prevents the frontend and backend from disagreeing about a response shape. A separate docs
repo is the worst case: the doc update is always a second, forgettable step.

**Two repositories — code monorepo plus a docs repo.** Fixes the contract problem but not
documentation drift, which was the specific thing the owner asked to solve.

## Consequences

- A single commit can change an Express route, the shared contract, the component calling
  it, and the flow document — and CI type-checks all of it together.
- Deployment stays independent: each app has its own host, root directory and build. A
  monorepo does not imply a monolithic deploy.
- CI must be path-filtered or every push rebuilds everything. Turborepo handles this.
- `One_Academy_Backend` was renamed to `One_Academy` and is the monorepo. The other two
  repositories are left in place, unused.
