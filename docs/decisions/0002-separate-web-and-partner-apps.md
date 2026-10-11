# ADR 0002 — Separate `web` and `partner` Next.js apps

Date: 2026-10-11
Status: Accepted

## Context

One Academy has two distinct audiences: anonymous students discovering institutes, and
institute staff managing their own listing. The student-facing site is SEO-critical —
Google is the acquisition channel, following the RedBus and JustDial pattern. The partner
surface is authenticated and must never be indexed. The owner also described the partner
product as something "we give to coaching institutes", implying it can evolve separately.

## Decision

Two Next.js applications: `apps/web` (public) and `apps/partner` (authenticated), sharing
`packages/ui` and `packages/shared`.

## Alternatives rejected

**Route groups inside one Next.js app.** Simpler to start and one deploy instead of two.
But the SEO-critical pages would ship dashboard JavaScript and Clerk middleware they never
use, which costs real money on mobile connections where most traffic arrives. Caching
policy also differs fundamentally: public pages want ISR, partner pages must be
`no-store`. Mixing them invites a cache mistake that leaks one organisation's data to
another.

## Consequences

- The public bundle stays free of auth and dashboard code.
- `robots: { index: false }` lives on the partner app as a whole, rather than per route.
- Two deploy targets to configure instead of one.
- Shared components must live in `packages/ui`, which is a discipline, not a default.
