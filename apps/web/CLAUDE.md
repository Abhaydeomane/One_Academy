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
