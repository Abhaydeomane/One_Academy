# ADR 0013 — Root-level landing URLs parsed from a grammar

Date: 2026-10-12
Status: Accepted

## Context

Google is One Academy's acquisition channel, and people search "JEE coaching in Pune". The
URL should carry that phrasing, because it is both what users recognise in a result list
and what competitors in this category use.

That creates a parsing problem. Both exam and city slugs may contain hyphens, so
`/jee-advanced-coaching-in-new-delhi` is genuinely ambiguous to any pattern match: is the
exam `jee` and the city `advanced-coaching-in-new-delhi`, or the exam `jee-advanced` and the
city `new-delhi`?

## Decision

Flat, root-level URLs:

```
/{exam}-coaching-in-{city}
/{mode}-{exam}-coaching-in-{city}
```

Parsed by splitting on the `-coaching-in-` infix, which is the one unambiguous delimiter.
`parseLandingPath` in `packages/shared/src/landing.ts` returns **ranked candidates** rather
than one answer; the API resolves them against the database and takes the first whose exam
and city both exist.

## Alternatives rejected

**`/coaching/jee-coaching-in-pune`.** Namespaced, so it could never collide with another
route, and the parsing problem is unchanged. Rejected because the prefix adds nothing a
user or a search engine values and makes the URL less natural to share.

**`/pune/jee`.** By far the cleanest to reason about and to build hubs from, with no
parsing problem at all. Rejected because it loses the searched phrasing entirely, which is
the whole point of these pages.

## Consequences

- The grammar is pure and lives in `@one/shared`, so the web app builds links and the API
  parses requests from one definition. Its edge cases are unit-tested with no fixtures.
- **Resolution cannot be purely syntactic.** `online-jee` is probably mode `ONLINE` plus
  exam `jee`, but it could be an exam slugged exactly that. Only the database can decide,
  which is why the endpoint takes the raw path instead of pre-split parameters — otherwise
  the web app would have to try each reading in turn, two round trips to guess at something
  the API can answer directly.
- **`/[landing]` owns the root namespace.** Static segments win in Next's precedence, so
  `/institutes`, `/sitemap.xml` and `/robots.txt` are safe. But a future _dynamic_ root
  sibling would collide with it, and that constraint is recorded in a comment in the route
  file.
- Anything not matching the grammar exactly reaches this route and 404s, which is correct
  behaviour for an unknown root path.
