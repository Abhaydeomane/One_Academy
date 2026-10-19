---
id: REQ-002
title: Revalidate public pages on publish and suspend
status: done
created: 2026-10-11
---

## What I want

When an admin publishes or suspends a listing, the affected public pages should update
immediately rather than waiting for ISR to expire.

## Why

Public pages are cached with `revalidate = 300` (ADR 0002's SEO posture needs caching), so
a status change takes up to five minutes to reach visitors. Found while writing the
end-to-end moderation spec: the spec initially read a stale 200 for a listing that was only
`PENDING_REVIEW`, because Next's fetch cache still held the published response from an
earlier run.

Two consequences, one benign and one not:

- **Publishing is slow to appear.** A partner is told their listing is live and sees
  nothing for a few minutes. Annoying, not harmful.
- **Suspending is slow to take effect.** A listing suspended for cause — bad content, a
  fraudulent institute — stays publicly reachable for up to five minutes. That is a real
  moderation gap, and the reason BR-009 is not fully delivered by the API alone.

## Acceptance criteria

- [x] Publishing a listing makes `/institutes/<slug>` and `/institutes` reflect it without
      waiting for revalidation
- [x] Suspending a listing removes it from both within the same request cycle
- [x] Works without the API importing anything from the web app — a revalidation webhook or
      a signed endpoint the API calls, not a shared module
- [x] End-to-end coverage for the suspend case specifically
- [x] `docs/flows/listing-lifecycle.md` updated, and its verified commit bumped

## Constraints

The API must not depend on the web app. Next's `revalidatePath` runs inside the Next
process, so this needs an endpoint on `apps/web` that the API calls, authenticated with a
shared secret — or Vercel's revalidation API once hosting is chosen. Deployment is still
deferred (§17 of the P0 spec), so pick the mechanism after that decision.

## Outcome

Delivered in P2b (`docs/superpowers/specs/2026-10-19-p2b-moderation-tooling-design.md`),
mechanism recorded in ADR 0018: every public fetch is tagged `listings`, and the API posts
to the web app's secret-protected `POST /api/revalidate`, which calls
`revalidateTag('listings', { expire: 0 })`, after publish, suspend, reinstate, and edits to
a live listing or its batches. The API imports nothing from the web app. A failed call
never fails the admin's action; publish/suspend/reinstate return `publicCacheCleared` and
the admin screen says when the change may lag.

Verified:

- `e2e/tests/revalidation.spec.ts` against a second, caching web server: a control test
  shows the cache is on (a direct database edit stays invisible), then a suspension 404s
  the detail page and drops the listing from `/institutes` on the very next request, and
  reinstating brings it back. With `'max'` instead of `{ expire: 0 }` the spec fails.
- Full e2e suite 35/35 and `pnpm verify` green.

Not verified: the partner and admin screens were not walked on a real phone. The sandbox
the work was done in has no signed-in Clerk session, so those screens were checked only
by typecheck, lint and production build. Before relying on them, walk: suspend → partner
sees the reason → fix → resubmit → approve; and a published edit appearing under
**Changed** → **Looks fine**.
