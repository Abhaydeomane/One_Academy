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
- Search has **no typo tolerance** — "Alen" will not find "Allen" (ADR 0010). If that
  becomes a real complaint, the fix is a `pg_trgm` fallback in the API, not client-side
  fuzzing.
