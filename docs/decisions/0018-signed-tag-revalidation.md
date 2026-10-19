# ADR 0018 — Public pages are refreshed by a signed tag revalidation

Date: 2026-10-19
Status: Accepted

## Context

Public pages cache API responses for 300 seconds. A suspension therefore took up to five
minutes to reach visitors — the moderation gap recorded in REQ-002, and the reason BR-009
held at the API but not at the edge. REQ-002 deferred the mechanism until hosting was
chosen; hosting is still open, and suspension (BR-015) made the gap real.

## Decision

**The API calls a secret-protected route handler on the web app after any change to what
the public sees, and the handler expires one cache tag.**

- Every public fetch in `apps/web/src/lib/api.ts` is tagged `listings` (`PUBLIC_CACHE_TAG`).
- `POST /api/revalidate` on the web app compares `x-revalidate-secret` with
  `REVALIDATE_SECRET` in constant time and calls `revalidateTag('listings', { expire: 0 })`.
  With no secret configured it refuses everything.
- `apps/api/src/lib/revalidate.ts` posts to `WEB_REVALIDATE_URL` after the write commits,
  with a 2-second timeout. It never throws and never fails the request; the 300-second TTL
  remains the backstop.
- Called after publish, suspend, reinstate, partner edits to a published listing, and
  batch updates on a published listing. Publish, suspend and reinstate return
  `publicCacheCleared`, and the admin screen says so when it is false.

The API still imports nothing from the web app: the coupling is one URL and one secret.

## Alternatives rejected

**`revalidateTag(tag, 'max')`, Next 16's recommended profile.** It serves the stale page
once more while revalidating — for a suspension, exactly the visit that must not happen.
The e2e suite was run with `'max'` and fails.

**Per-listing tags.** A suspension changes the detail page, search results, landing counts
and sibling rails, comparisons and the sitemap. Tracking which pages contain a listing is
not worth it at current volume; one tag over-invalidates cheaply.

**Waiting for the hosting decision (Vercel's revalidation API).** The route handler works
on any Next host, so there was nothing to wait for.

**`revalidatePath` per affected URL.** Same bookkeeping problem as per-listing tags, and
landing URLs are derived, not stored.

## Consequences

- Every moderation change empties the public cache; the next visitor to each page pays one
  uncached render.
- The e2e suite runs a second, caching web server (`API_CACHE_TTL=300`, its own
  `NEXT_DIST_DIR`) because the main e2e server disables caching, and a test against it
  would pass whether or not revalidation worked. A control test proves the cache is on.
- `REVALIDATE_SECRET` must match in the API and web environments; a mismatch shows up as
  `publicCacheCleared: false` and a logged warning, not as a failure.
