---
id: REQ-001
title: Add a reconcile script for the Clerk account mirror
status: todo
created: 2026-10-11
---

## What I want

A script — `scripts/reconcile-clerk.ts` — that reads users and organisations from the
Clerk API and repairs the local `User`, `Organization` and `Membership` mirrors.

## Why

Authorization is a database join against mirrored rows rather than a Clerk API call per
request (ADR 0006), and the webhook is the only thing keeping those rows current. Webhooks
get missed: a deploy during delivery, a transient failure, or an event that predates the
endpoint existing. When that happens a real partner sees "No organisation selected" and
has no way to fix it themselves.

## Acceptance criteria

- [ ] Lists Clerk organisations and users, and upserts the local mirrors via
      `accounts.service`
- [ ] Reports what it changed rather than running silently
- [ ] Never writes `globalRole` — ADMIN stays a manual grant
- [ ] Safe to run repeatedly
- [ ] Documented in `docs/runbooks/`

## Constraints

Needs real Clerk credentials, so it cannot be completed or tested until test keys exist.
