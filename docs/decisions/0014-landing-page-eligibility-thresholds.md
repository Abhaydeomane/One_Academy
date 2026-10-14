# ADR 0014 — A landing page exists at one listing, is indexable at three

Date: 2026-10-12
Status: Accepted

## Context

Cities × exams × modes generates far more combinations than there is content to fill, and
most would show one or two institutes. Google treats thin programmatic pages as doorway
pages, and that judgement is applied to a _site_, not only to the offending URLs — so
getting this wrong costs more than the pages are worth.

There is a second, sharper problem specific to mode variants. When Pune has one JEE
institute and it happens to be offline-only, `/jee-coaching-in-pune` and
`/offline-jee-coaching-in-pune` show **the same single listing**. That is not thin, it is
duplicate.

The owner asked for coverage at one listing, which is the right instinct for users and
internal linking and the wrong one for the index.

## Decision

Separate _existing_ from _being indexed_. One exported constant,
`LANDING_MIN_INDEXABLE = 3`:

| Published listings | Page         | Robots            | Sitemap |
| ------------------ | ------------ | ----------------- | ------- |
| 0                  | `notFound()` | —                 | absent  |
| 1–2                | renders      | `noindex, follow` | absent  |
| 3+                 | renders      | indexable         | present |

And **mode variants canonicalise to their parent when their result sets are identical.**

## Alternatives rejected

**Index everything at one listing.** Fastest possible coverage. Rejected because hundreds
of URLs each showing a single result, with identical structure, is precisely the doorway
pattern — and the downside is sitewide.

**Only create pages at three or more.** Simplest rule, no `noindex` logic at all. Rejected
because thin combinations then become dead ends: a user who filters to NEET in Mumbai, or
follows a sibling link, gets a 404 for a query that has a real answer.

## Consequences

- Full coverage for users and for internal links, with nothing thin exposed to the index.
- `follow` on thin pages matters: they still pass equity down to the institute pages, so
  the crawl budget spent reaching them is not wasted.
- **The canonical rule is a proof, not a heuristic.** A mode-filtered set is always a
  subset of the unfiltered set for the same exam and city, so equal cardinality entails
  equal membership. One integer comparison replaces any content diffing — which is why the
  API returns `parentTotal` alongside `total`.
- A mode variant that would canonicalise away is also **omitted from its parent's sibling
  links**, so no page links to a near-duplicate of itself.
- The sitemap contains only indexable pages. Listing a `noindex` URL there tells Google two
  contradictory things, which is worse than saying nothing.
- **The threshold is a judgement, not a measurement.** Three is a guess. It is one exported
  constant used by both the page's robots directive and the sitemap, so revisiting it is a
  one-line change — and it should be revisited from Search Console data rather than by
  instinct.
- Whether mode variants earn their keep at all remains an open empirical question. If none
  of them ever rank, deleting them is cheaper than maintaining them.
