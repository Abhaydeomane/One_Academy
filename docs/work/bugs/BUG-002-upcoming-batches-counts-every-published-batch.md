---
id: BUG-002
title: '"Upcoming batches" counts every published batch, including ones that already started'
status: todo
created: 2026-10-14
---

## Symptom

Search result cards, landing page cards and the institute detail page all say "N upcoming
batches", and the detail page's fee range is described as coming from upcoming batches. The
underlying counts and aggregates include **every** `PUBLISHED` batch regardless of
`startDate`, so a batch that began two years ago is still counted as upcoming and its fee
still sets the displayed floor.

Expected: "upcoming" means `startDate >= now()`.

## Repro

1. Seed an institute with two published batches: one starting next year at ₹1,00,000 and
   one that started last year at ₹20,000.
2. Open `/institutes` and find the card. It reads "2 upcoming batches" and "from ₹20,000".
3. Both are wrong: there is one upcoming batch, and it costs ₹1,00,000.

Invisible in every existing test and in local development because
`packages/db/prisma/seed.ts` dates every batch in 2027–2028. The partner API does reject
creating a batch with a past `startDate` (`batches.service.ts:130`), which is why no past
batch exists to expose it — but that guard does not stop an existing batch's date from
simply passing.

## Root cause

There is no upcoming filter anywhere. `batches.repository.listPublishedByListing` filters
on `status` only, and every consumer inherited that:

- `batches.service.feeSummaryForListing` — detail page fee range and batch count
- `batches.service.countPublishedByListingIds` — list card counts
- `institutes.search.repository.ts` — the fee aggregate and `publishedBatchCount` in search
- `institutes.landing.repository.ts` — the landing page fee statistics

The word "upcoming" entered the UI copy as a description of intent and was never a
description of the query. Nothing diverged over time; the two never matched.

## Fix

Not yet fixed. The change is one predicate (`startDate >= now()`) in each of the four
places above, but it is deliberately **not** bundled into P1c:

- It changes fee minimums and batch counts, so P1a and P1b test expectations move with it.
- It can drop landing pages below `LANDING_MIN_INDEXABLE`, which changes which pages are
  indexable — a behavioural change that deserves its own review, not a corner of a
  comparison diff.

P1c therefore introduces `batches.repository.listUpcomingPublishedByListing` and uses it
for comparison only, because a comparison that defaults to a batch which already started
would break the one promise the feature makes — that the fee shown is attached to a batch
the student can actually join.

**Consequence until this is fixed:** a search card may say "4 upcoming batches" where the
comparison table says 2. Comparison is the correct one. Do not "fix" the divergence by
making comparison count past batches.
