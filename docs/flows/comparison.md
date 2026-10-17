# Flow: Institute comparison

Last verified against commit: REPLACE_AFTER_COMMIT

## Purpose

How a student goes from a list of plausible institutes to a side-by-side comparison on a
phone, where every fee is a real number attached to a named batch. This is the step that
either earns the enquiry or loses the student, so the two things it must never do are be
vague and be wrong.

The decision that shapes the whole flow: comparison compares **batches**, pinned one per
institute, because an institute-level fee is a range and a range cannot be acted on
(ADR 0015).

## Actors and entry points

- Anonymous visitor checking boxes on `/institutes` or on a P1b landing page
- Anyone opening a `/compare?...` URL someone shared with them — the case the degradation
  rules exist for
- No crawler: the page is `noindex, follow` and absent from the sitemap

## Sequence

**Stage one — pick institutes, no JavaScript**

```
apps/web/src/app/institutes/page.tsx          <form id="compare" action="/compare">
apps/web/src/app/[landing]/page.tsx           the same, on landing pages
  → apps/web/src/app/CompareCheckbox.tsx      name="slug" form="compare"
  → apps/web/src/app/CompareBar.tsx           live count; disables outside 2-4
  → GET /compare?slug=alpha&slug=beta
```

The checkbox is a **sibling** of the card's `<Link>`, not a child: inside an anchor it
would navigate instead of toggling. It associates with the form by `id` because the
results page already has a search form and nesting forms is invalid HTML. `form.elements`
still collects inputs that associate that way, which is what lets `CompareBar` count them.

`CompareBar` is the only client component. It exists so the UI cannot submit a selection
guaranteed to be rejected; the checkboxes are server-rendered and submit without it.

**Stage two — render and refine**

```
apps/web/src/app/compare/page.tsx
  → packages/shared/src/compare.ts            parseBatchPins, dedupeSlugs, bounds
  → apps/web/src/lib/api.ts                   apiGetOptional(compareResponse)
  → GET /api/v1/compare?slug=...&batch=slug:batchId
  → apps/api/src/modules/institutes/institutes.compare.routes.ts
  → apps/api/src/modules/institutes/institutes.compare.service.ts
      resolve slugs → drop or keep → resolve pins → assemble columns
  → apps/api/src/modules/institutes/institutes.compare.repository.ts
  → apps/api/src/modules/batches/batches.service.ts
      listUpcomingPublishedForListing, belongsToListing, findPublishedById
  → apps/web/src/app/compare/CompareTable.tsx
  → apps/web/src/app/compare/BatchPicker.tsx
  → apps/web/src/app/compare/superlatives.ts
```

Slugs resolve through `listings.service.resolvePublishedSlug`, the same path the detail
route uses, so BR-002 and BR-009 hold without restating them. Batch data is reached only
through `batches.service` — R4 keeps the institutes module out of the batches repository.

The default pin is the **cheapest upcoming** batch, which is simply element `[0]` of
`listUpcomingPublishedForListing` — the repository orders by fee then start date so no
caller re-sorts.

`BatchPicker` is a `GET` form whose `<option value>` is the pin grammar itself
(`slug:batchId`), so refining a column builds no URL. The other columns' pins ride along
as hidden inputs, the way the search form carries its active filters, so changing one
column does not reset the rest.

**Canonical slugs, and why there is no 301**

```
institutes.compare.service.ts    returns canonicalSlugs: string[]
  → apps/web/src/app/compare/page.tsx
      survived = requested slugs minus dropped
      renamed  = survived differs from canonicalSlugs, in order
      renamed → redirect(buildComparePath(canonical, rewritten pins))
```

The API deliberately does not redirect. `fetch` follows redirects transparently, so a 301
is consumed by the transport and the browser keeps the stale URL (BUG-001). A comparison
URL exists to be shared, so the canonical set comes back as data and the page moves the
address bar.

The redirect fires **only for a rename, never for a drop.** Comparing `canonicalSlugs`
against every requested slug would also fire when one was dropped, bouncing to a tidier URL
and silently losing the "left out" notice — which would defeat the reason `dropped` is
returned at all.

## Diagram

A funnel then a fan: many cards collapse to 2–4 checked slugs in one URL; the service fans
out to one slug resolution and one upcoming-batch query per column, then collapses back
into a single response whose `pinned`, `pinFellBack` and `dropped` fields are already
resolved — so the page makes no judgement of its own beyond formatting and superlatives.

## Business rules invoked

BR-002, BR-005, BR-008, BR-009

## Failure modes

| Condition                           | API response                      | What the user sees                                                      |
| ----------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Fewer than 2 or more than 4 slugs   | 400 `VALIDATION_FAILED`           | 404 — the page rejects the bounds before requesting                     |
| Duplicate slugs                     | de-duplicated, then counted       | A doubled checkbox value cannot consume a slot                          |
| Slug unknown or unpublished         | 200, listed in `dropped[]`        | "… is no longer listed and was left out."                               |
| Fewer than 2 slugs survive          | 404 `NOT_FOUND`                   | 404                                                                     |
| Slug is a former name               | 200, resolved in `canonicalSlugs` | Redirected to the canonical URL, pins rewritten                         |
| Pin unpublished, past, or gone      | 200, `pinFellBack: true`          | "That batch is no longer available — showing the cheapest instead."     |
| Pin names another institute's batch | 400 `VALIDATION_FAILED`           | 404                                                                     |
| Pin unparseable (no `:`)            | 400 `VALIDATION_FAILED`           | 404                                                                     |
| Institute has no upcoming batch     | 200, `pinned: null`               | Column renders; fee cell reads "No upcoming batches"                    |
| Every value in a row ties           | —                                 | No superlative tag, rather than an invented winner                      |
| JavaScript disabled                 | —                                 | Checkboxes and selectors still submit; `<noscript>` supplies the button |

## Known gap

The sticky attribute column inside a horizontally scrolling container is the layout iOS
Safari is most likely to render wrongly, and it has **never been opened in a real browser**
— every mobile claim in this project rests on class names plus structural assertions.
`e2e/tests/compare.spec.ts` asserts the computed `position: sticky`, `left: 0` and that the
container genuinely overflows at 390px, which is the most Playwright can do. It cannot
prove the column does not shear on an actual iPhone.

## Related flows

`institute-discovery.md` — where the selection is made, and where the search card's batch
count disagrees with this page's (BUG-002; comparison is the correct one).

`seo-landing-pages.md` — the other entry point, and where most high-intent traffic lands.
