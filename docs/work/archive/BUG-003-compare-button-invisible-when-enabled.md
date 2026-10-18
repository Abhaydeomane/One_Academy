---
id: BUG-003
title: The Compare button disappears once a valid selection is made
status: done
created: 2026-10-18
---

## Symptom

On `/institutes` and the landing pages, ticking one institute shows the CompareBar with a
grey, disabled Compare button. Ticking a second — the moment the selection becomes valid
(BR-008, 2–4) — makes the button vanish. "N selected" stays visible; the button does not.
Expected: an enabled, brand-coloured button.

## Repro

1. Open `/institutes`, tick two institutes.
2. The bar reads "2 selected" with no visible button. The button is still in the DOM and
   still submits if you happen to tap the empty right-hand side of the bar.

## Root cause

`CompareBar`, `CompareCheckbox` and `CompareTable` used `brand-600`, but the theme in
`packages/ui/src/styles.css` defined only `brand-50/100/500/700`.

Tailwind 4 generates utilities from `@theme` tokens and **silently emits nothing** for a
class naming a token that does not exist — no build error, no warning. So `bg-brand-600`
produced no rule, and the enabled button was `text-white` on a transparent background over
a white bar. While disabled, `disabled:bg-gray-300` (a real token) painted it, which is
why it only disappeared once the selection became valid. The same gap left the checkboxes
on the browser's default accent colour and made the "Enquire" button in `CompareTable`
invisible too.

The misunderstanding: treating the brand scale as complete (Tailwind's default palettes
have every step from 50 to 950) when this repo's `@theme` defines a deliberately partial
one.

## Fix

Added `--color-brand-600` to `@theme`, between 500 and 700 (renders as `#0068b7`; white
text on it passes WCAG AA). Every `brand-*` step used in the apps is now defined.

No regression test. A cheap one would assert that every `brand-<n>` class in `apps/` has a
matching `--color-brand-<n>` token; worth adding the next time the theme changes.

## Outcome

Fixed in `3fdecc9`. Verified at 390px in Chromium: enabled button computes to the brand
background with white text, 92×44px, bottom-right of the bar. Confirmed by the owner on a
phone after BUG-004 was also fixed — on the phone, this bug was masked by that one.
