---
id: BUG-001
title: A renamed institute's old slug serves canonical content instead of moving the browser
status: todo
created: 2026-10-14
---

## Symptom

Visiting `/institutes/<old-slug>` after a published listing was renamed shows the
institute's page correctly, but the browser's address bar keeps the old slug. Expected: the
browser lands on `/institutes/<canonical-slug>`.

BR-002 and the API are both doing the right thing — `GET /api/v1/institutes/<old-slug>`
genuinely answers `301` with the canonical path. The redirect just never reaches anyone who
can act on it.

## Repro

1. Publish a listing, then rename it (a published slug is immutable, so this needs a
   `ListingRedirect` row — the P0 partner flow creates one).
2. `curl -i /api/v1/institutes/<old-slug>` → `301`, canonical `Location`. Correct.
3. Open `/institutes/<old-slug>` in a browser → page renders, URL unchanged. Wrong.

No failing test exists yet; `institutes.routes.test.ts` asserts the API's 301 and passes,
which is why this survived P0.

## Root cause

`fetch` follows redirects transparently by default. `apps/web/src/lib/api.ts` therefore
receives the _final_ JSON response and never observes that a redirect happened, so the
Server Component has nothing to react to and cannot call `redirect()`.

The misunderstanding is at the layer boundary: an HTTP 301 is the right answer for an API
whose client is an HTTP cache or a crawler, but the web app is not that client. For a
server-rendered page, the canonical identity has to arrive as **data** the renderer can
read, not as a status code its transport silently consumes.

Found while specifying P1c §7, which hit the same wall for a multi-slug URL and resolved it
by returning `canonicalSlugs` in the body rather than redirecting. That is the shape the
fix here should take.

## Fix

Not yet fixed. Likely shape: have the API include the canonical slug in the detail response
(or set `redirect: 'manual'` in the api client and surface the `Location`), then have
`/institutes/[slug]/page.tsx` call `redirect()` when the canonical slug differs from the
requested one. Regression test belongs in e2e, since the defect is invisible at the API
layer — the existing unit test passes today.

SEO impact is low but not nil: the canonical `<link>` already points at the right URL, so
Google consolidates correctly. The cost is users and shared links sitting on dead slugs.
