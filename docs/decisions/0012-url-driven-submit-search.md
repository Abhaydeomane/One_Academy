# ADR 0012 — Submit-based, URL-driven search

Date: 2026-10-12
Status: Accepted

## Context

80–90% of One Academy's traffic is mobile, and Google is the acquisition channel. Those two
facts pull in the same direction: pages should be server-rendered, cheap to load, and
addressable.

## Decision

The search box is a plain `GET` form. Submitting navigates to `/institutes?q=…`, which is
server-rendered. Filters and sort are query parameters too, so **the URL is the entire
state of the page** — no client state, no hydration mismatch, and the back button works.

Active filters ride along as hidden inputs in the form, so searching narrows the current
view rather than silently resetting it.

## Alternatives rejected

**Instant search as you type.** The modern expectation and it feels faster. Rejected
because it requires a client component and an API call per keystroke — paid for by the user
on a mobile connection — and the results are not addressable, so neither a share nor a
crawler can reach them.

**Debounced instant search with the URL kept in sync.** Both benefits, at the cost of
careful history handling and meaningfully more client code. Worth revisiting once there is
evidence that submit-based search is costing conversions; not worth it on speculation.

## Consequences

- Every result set is shareable and server-rendered. The filter chips are ordinary links.
- The page ships no JavaScript for search or filtering.
- **Query result pages are `noindex, follow`.** The query space is unbounded, and these
  pages would otherwise compete with P1b's landing pages for the same terms. `follow`
  keeps link equity flowing to the institute pages. The unfiltered `/institutes` browse
  page stays indexable.
- Fee filtering uses preset buckets (`FEE_BUCKETS` in `@one/shared`) rather than a
  dual-handle slider, which is unusable with a thumb and could not be expressed as a link.
- Facet counts have to come from the API rather than the rendered page, since the page
  only holds one page of results.
- The response cache TTL is configurable via `API_CACHE_TTL` because the end-to-end suite
  seeds different data behind the same URLs; any caching there makes assertions depend on
  run order.
