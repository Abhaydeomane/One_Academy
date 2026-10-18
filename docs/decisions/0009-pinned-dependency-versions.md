# ADR 0009 — Exact version pins, and three that are load-bearing

Date: 2026-10-11
Status: Accepted

## Context

Agents install what configuration tells them to. A caret range lets two sessions resolve
different versions and produce different lockfiles, and "upgrade to latest" is a tempting,
plausible-looking change that an agent may make unprompted.

## Decision

Every dependency is pinned to an exact version in the `catalog:` block of
`pnpm-workspace.yaml`. Three pins must not be raised without reading this ADR.

## The three pins

**Prisma 7.10.0, not 8.** The npm `latest` dist-tag for `prisma` points at
`8.0.0-rc.22` — a release candidate — while `@prisma/client` latest is `7.10.0`. An agent
running `pnpm add prisma` installs an RC and desynchronises the CLI from the client.
The pin covers every `@prisma/*` package in the catalog, including
`@prisma/client-runtime-utils`, which `@one/db` declares directly because the generated
client imports it and pnpm would otherwise hide it (BUG-005). Move them together.

**TypeScript 6.0.3, not 7.** `typescript-eslint@8.71.1` declares
`typescript: ">=4.8.4 <6.1.0"`. TypeScript 7, the native compiler, is stable and current,
but adopting it disables typescript-eslint — and with it the R1–R6 enforcement that the
whole architecture rests on (ADR 0008). 6.0.3 is the newest version inside the supported
window. Revisit when typescript-eslint supports 7.

**Express 5.3.0.** Express 5 forwards rejected promises from async handlers to the error
middleware automatically. Express 4 examples found online add an `asyncHandler` wrapper;
it is unnecessary here and should be rejected in review. A test asserts the behaviour
holds.

## Alternatives rejected

**Caret ranges with a committed lockfile.** The lockfile does pin resolution, so this is
defensible. Rejected because the manifest is what an agent reads and reasons about, and a
range invites `pnpm update` to drift the project silently.

## Consequences

- Upgrades are deliberate, reviewable commits rather than a side effect.
- Versions go stale, and the catalog needs periodic intentional maintenance.
- "Newest" is explicitly not the goal. TypeScript stays a major version behind on purpose,
  because enforcement outranks novelty.
