# ADR 0006 — Clerk for authentication and organisations

Date: 2026-10-11
Status: Accepted

## Context

The partner product is multi-tenant: a user acts on behalf of one institute and must never
see another's listings or leads. Session handling, password flows and organisation
membership are the single most likely place for an agent to introduce a security hole, and
the consequences are not recoverable by a later fix.

## Decision

Clerk owns identity and organisation membership. `User`, `Organization` and `Membership`
exist locally as **mirrors**, synchronised by a signature-verified webhook, so
authorization is a database join rather than an API call on every request.

`User.globalRole = ADMIN` is never written by any endpoint or webhook. It is granted only
by a direct database statement.

## Alternatives rejected

**Better Auth, self-hosted with a Prisma adapter.** Open source, no vendor cost, data
stays local. Rejected because it means owning session security, email verification flows
and organisation/role logic — the exact code we most want agents not to write.

**JWT issued by the Express API.** Fullest control and zero dependencies, and the most
security-sensitive code in the project. Rejected for the same reason, more strongly.

## Consequences

- A whole class of vulnerability is outsourced; the trade is vendor coupling and cost
  above the free tier.
- Two identifier spaces now exist. `req.auth.orgId` is a Clerk id; every query uses the
  local `Organization.id`. `resolveOrganizationId()` translates, and a Clerk organisation
  that One Academy has not onboarded is a 403 rather than a crash.
- The mirror can drift if a webhook is missed. A reconcile script is a known follow-up.
- The webhook verifies its svix signature before touching the database, and tests assert
  that unsigned and tampered payloads write nothing.
- Integration tests cannot use live Clerk sessions, so `requireAuth` honours an
  `x-test-auth` header **only when `NODE_ENV=test`**. This is the one deliberate test seam
  in the API.
