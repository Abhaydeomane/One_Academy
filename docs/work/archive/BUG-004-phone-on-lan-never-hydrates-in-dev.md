---
id: BUG-004
title: Opening the dev server from a phone renders the page but nothing interactive works
status: done
created: 2026-10-18
---

## Symptom

With `pnpm dev` running, `http://<laptop-lan-ip>:3000/institutes` on a phone renders the
page fully, and checkboxes tick, but the CompareBar never appears for any number of
selections. The same page in the laptop's browser at `localhost:3000`, including in a
mobile-sized viewport, works.

Dev-only. Production builds are unaffected.

## Repro

1. `pnpm dev`; note the laptop's IP (`ipconfig getifaddr en0`).
2. From a phone on the same network, open `http://<ip>:3000/institutes` and tick two
   institutes. No bar.
3. On the laptop:
   `curl -H "Origin: http://<ip>:3000" -H "Sec-Fetch-Mode: no-cors" http://<ip>:3000/_next/static/chunks/<any>.js`
   → `403`. The same URL without those headers, or via `localhost`, → `200`.

## Root cause

Next 16's dev server refuses its own dev assets (JS chunks, HMR) to any origin other than
`localhost` unless the origin is listed in `allowedDevOrigins` — a guard against other
sites reading your dev bundle. Next 15 only warned; 16 blocks.

The phone therefore received the server-rendered HTML but none of the JavaScript, and the
page never hydrated. Everything that works without JS still worked — the checkboxes are
plain form inputs by design (see `flows/comparison.md`) — which made the page look healthy.
`CompareBar` is the one client component on the page and renders nothing until its effect
has counted a selection, so it simply never appeared.

The misleading part: "mobile view" in desktop devtools is still `localhost`, so it cannot
reproduce this. Only a real device on the LAN does.

## Fix

`apps/web/next.config.ts` sets `allowedDevOrigins` to the machine's non-internal IPv4
addresses, read from `os.networkInterfaces()` at startup. Read rather than hard-coded
because the laptop's IP changes between networks; restart `pnpm dev` after switching
networks. `allowedDevOrigins` has no effect on production builds.

`apps/partner` has the same default and was not changed; apply the same config if the
partner app ever needs testing on a device.

## Outcome

Fixed in `2a78301`. Confirmed by the owner on an Android phone at `172.25.92.9:3000`.
Phone testing is now documented in `runbooks/local-setup.md`.
