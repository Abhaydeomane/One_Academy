# apps/partner

Authenticated Next.js dashboard that institutes use to manage their own listing. Never
indexed (`robots: { index: false }`).

## Authorization is the API's job

This app never decides who may edit what. It renders what the API returns and maps error
codes to copy in `src/lib/api.ts` (`partnerErrorMessage`). When you add a business rule to
the API, add its code to that map so the partner sees an explanation rather than
"something went wrong".

- `src/proxy.ts` protects every route except `/`, `/sign-in`, `/sign-up`. Next 16 renamed
  `middleware.ts` to `proxy.ts`.
- Clerk Core 3 removed `<SignedIn>` / `<SignedOut>`. Read the session server-side with
  `auth()` from `@clerk/nextjs/server`.
- All API calls use `src/lib/api.ts`, which attaches the Clerk bearer token and sets
  `cache: 'no-store'` — organisation-scoped data must never come from a shared cache.

## Conventions

- Mobile first, same baseline as `apps/web`: stacked forms, 44px targets, 16px inputs,
  `inputMode="numeric"` on seat and fee fields.
- Money is entered in rupees and converted to integer paise before the request (BR-005).
- Server actions need a `<form>`, not an `onClick`. `ActionButton` wraps that pattern and
  shows the result inline where the partner tapped.

## Clerk keys

`.env.local` ships a well-formed **placeholder** publishable key so `next build` succeeds.
Sign-in does not work until real test keys from the Clerk dashboard replace both
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.

A partner also needs their Clerk organisation mirrored locally. The webhook does this in
normal operation; to link one by hand during development:

    psql "$DATABASE_URL" -c "UPDATE \"Organization\" SET \"clerkOrgId\"='<clerk org id>' WHERE id='org-seed-alpha';"
