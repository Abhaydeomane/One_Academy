# apps/web

Public Next.js 16 App Router site. Google is the acquisition channel and phones are the
device, so SEO and mobile are features, not polish.

## Mobile first

80–90% of users are on mobile. Design at ~375px and add breakpoints upward.

- Single column is the base case. `sm:grid-cols-2` / `lg:grid-cols-3` add columns; never
  start wide and shrink.
- Filters are a snap-scrolling chip rail (`FilterRail`), not a sidebar. A sidebar on a
  phone either eats the viewport or hides behind an extra tap.
- The detail page carries a sticky bottom CTA, hidden from `sm:` up. Pad any fixed bottom
  bar with the `safe-bottom` utility so it clears the home indicator.
- Interactive elements use the `tap-target` utility (44px minimum).
- Inputs render at `text-base` (16px) — anything smaller makes iOS zoom the viewport on
  focus. Use `type="tel"`, `inputMode` and `autoComplete` on form fields.
- Keep the whole card tappable, not just its title.

## Data and contracts

- Server Components by default. `'use client'` only where there is interactivity.
- All data goes through `src/lib/api.ts`, which parses every response with the shared Zod
  schema. A contract violation must fail loudly there, not surface as `undefined` three
  components deep.
- `export const revalidate = 300` on cacheable pages. Never `cache: 'no-store'` on public
  data.
- Never import `@one/db`. The frontend talks to the API only, and lint enforces it.

## SEO

- Every indexable page exports `metadata` or `generateMetadata`.
- Detail pages embed JSON-LD (`EducationalOrganization`).
- `src/app/sitemap.ts` covers every public route and is `force-dynamic` **on purpose**: a
  build must never depend on the API being reachable. The fetch under it is still cached.
- A published slug is immutable (BR-002). The API answers an old slug with a 301.

## Search and filters

- The search box is a plain `GET` form. Results, filters and sort live entirely in the
  URL — no client state, no hydration mismatch, and the back button works (ADR 0012).
- Active filters ride along as hidden inputs in the form, so searching narrows the current
  view rather than silently resetting it.
- Exam chips are multi-select and toggle. Mode, fee and sort chips are single-select and
  toggle off when tapped again. Every chip carries `aria-pressed`.
- Fee uses the `FEE_BUCKETS` presets from `@one/shared`, never a dual-handle slider:
  sliders are unusable with a thumb and cannot be expressed as a link.
- Facet counts come from the API's `facets` object, not from the current page of results.
  They exist so a phone user can see a filter is empty before tapping it.
- The empty state names the filter most likely responsible and offers to clear just that
  one.
- **Query result pages set `robots: { index: false, follow: true }`.** The query space is
  unbounded and these pages must not compete with the landing pages for the same terms.
  The unfiltered `/institutes` browse page stays indexable.
- Response cache TTL comes from `API_CACHE_TTL` (seconds, default 300). The end-to-end
  suite sets it to 0, because its specs seed different data behind the same URLs.
- Search has **no typo tolerance**: "Alen" will not find "Allen" (ADR 0010). If that
  becomes a real complaint, the fix is a `pg_trgm` fallback in the API, not client-side
  fuzzing.

## Comparison

`src/app/compare/` plus `CompareCheckbox.tsx` and `CompareBar.tsx` at the app root. Read
`docs/flows/comparison.md` and ADR 0015 before changing them.

- **The checkbox is a sibling of the card's `<Link>`, never a child** — inside an anchor it
  navigates instead of toggling. It associates with the compare form via `form="compare"`,
  because the results page already has a search form and nesting forms is invalid HTML.
  Keep `relative` on the `<li>` and `pr-12` on the card.
- **`name="slug"` is load-bearing.** Repeated `slug` params are what a checkbox group
  emits, so selection needs no JavaScript. `CompareBar` is the only client component, and
  only so the UI cannot submit a selection guaranteed to be rejected.
- **`BatchPicker`'s `<option value>` is the pin grammar** (`slug:batchId`). Do not rebuild
  URLs there, and never pass a function into it — it is a Client Component.
- **The page redirects for a rename, never for a drop.** Compare `canonicalSlugs` against
  the slugs that _survived_; comparing against all of them bounces on a dropped slug and
  silently loses the "left out" notice.
- **An invalid comparison URL is a 404, not a 500.** `apiGetOptional` maps only 404, so
  the page checks the BR-008 bounds itself and treats a 400 as not-found.
- **Superlatives are `lowest` and `soonest`, never "best"**, and a tie gets no tag. The
  lowest fee is objectively the lowest and is not objectively the best.
- `noindex, follow`, and never in the sitemap. Do not add a title suffix — the root
  layout's template already appends " | One Academy".

## Landing pages

`src/app/[landing]/page.tsx` serves `/<exam>-coaching-in-<city>` and its mode variants
(ADR 0013). Read `docs/flows/seo-landing-pages.md` before changing it.

- **This route owns the root namespace.** Every unmatched root path reaches it and 404s.
  Static segments win Next's precedence, so `/institutes` and `/sitemap.xml` are safe, but
  **never add a second dynamic root segment** — it would collide.
- Parse with `parseLandingPath` from `@one/shared`. It returns ranked _candidates_, not one
  answer, because `online-jee` is ambiguous; only the API can resolve it. Use it in the web
  app purely as a cheap reject before spending a request.
- **The page makes no SEO decisions.** `indexable` and `canonicalPath` arrive from the API
  already resolved. Do not recompute a canonical or a threshold here.
- Thin pages (`indexable: false`) still render, and get `robots: { index: false, follow:
true }` — `follow` is deliberate, they pass equity to the institute pages (ADR 0014).
- `sitemap.ts` reads `/api/v1/landing/indexable`, which already excludes thin pages. Never
  list a `noindex` URL in the sitemap.
- The fee sentence degrades to nothing when `minFeeAmount` is `null`. Do not print a range
  you do not have.

## Images

Logos and photos are plain `<img>` (`InstituteLogo`, `PhotoStrip`), not `next/image`: the API
already serves sized WebP variants, and the optimiser would need `remotePatterns` for a
storage domain that does not exist until hosting is chosen (ADR 0019). Always pass the
asset's `width` and `height` so nothing shifts, `loading="lazy"` below the first image, and
a `srcset` when both variants exist.
