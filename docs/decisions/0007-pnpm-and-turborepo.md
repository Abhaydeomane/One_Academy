# ADR 0007 — pnpm with Turborepo

Date: 2026-10-11
Status: Accepted

## Context

A monorepo needs a package manager and a task runner. The specific failure to prevent is
an agent importing a package the workspace never declared — which works locally because a
hoisted `node_modules` happens to contain it, and breaks in CI or production.

## Decision

pnpm 12 workspaces with a version catalog, and Turborepo for the task graph.

## Alternatives rejected

**npm or Yarn workspaces.** Both hoist dependencies into a flat `node_modules`, so an
undeclared import resolves successfully. That is precisely the phantom-dependency failure
we want to be impossible.

## Consequences

- An undeclared import fails immediately. This surfaced during implementation:
  `@types/express-serve-static-core` had to be declared explicitly because the middleware
  augments its `Request` interface. pnpm was right to refuse it.
- Shared dependency versions are pinned once in the `catalog:` block, so `web` and
  `partner` cannot drift onto different React versions.
- Turborepo's `dependsOn: ["^build"]` orders package builds before app builds, which is
  what makes the `dist`-emitting shared packages work.
- Every workspace must expose the same five scripts (`dev`, `build`, `lint`, `typecheck`,
  `test`). That uniformity is load-bearing: an agent in any workspace knows the command
  without exploring.
- pnpm 12 blocks post-install build scripts and records approvals as an `allowBuilds` map
  in `pnpm-workspace.yaml` — not the older `onlyBuiltDependencies` array. Manage it with
  `pnpm approve-builds <pkg> -y`.
- **Do not use corepack on this machine.** pnpm 12 ships `bin/pnpm.mjs`; corepack 0.32
  hardcodes `.cjs`, and 0.36 requires Node ≥ 22.22 while this machine runs 22.16. pnpm is
  installed globally via npm instead.
