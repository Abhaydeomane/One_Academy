# ADR 0004 — Thin shared listing core with typed vertical modules

Date: 2026-10-11
Status: Accepted

## Context

One Academy starts with coaching institutes and plans hostels and PGs as a second
vertical. The owner asked for the architecture to anticipate that without building it now.
Search and filtering are the core product, so query shape matters more than storage
flexibility.

## Decision

A thin shared core — `Listing`, `Organization`, `User`, `Membership`, `City`,
`MediaAsset`, `Review`, `Enquiry`, `Tag`, `ListingRedirect` — carries identity, location,
media and leads for every vertical, discriminated by `Listing.vertical`. Per-vertical
tables (`InstituteProfile`, `Batch`) hold typed attributes and own their own module.

## Alternatives rejected

**One polymorphic `Listing` table with a JSONB attributes blob.** Maximum flexibility and
no new tables per vertical. Rejected because it destroys type safety exactly where the
product lives: filtered search. Querying "offline JEE batches in Pune under ₹1,00,000"
against JSONB is both awkward and unindexable, and an agent gets no compiler help about
what keys exist.

**Defer entirely — build institutes only, refactor when hostels arrive.** Honest YAGNI and
the fastest path to P1. Rejected because the refactor would touch every table and every
endpoint, and the seam costs almost nothing now: it is a discriminator column and a naming
discipline, not a framework.

## Consequences

- Adding hostels means `HostelProfile`, `Room` and a `hostels` module. Nothing in
  `Listing`, `Review`, `Enquiry` or `MediaAsset` changes.
- Shared concerns — moderation status, slugs and redirects, enquiries, reviews — are
  written once and inherited by every vertical.
- Comparison stays inside the vertical module as a projection of comparable attributes.
  A generic comparison engine does not pay for itself at two verticals.
- The core must stay thin. Anything institute-specific belongs in `InstituteProfile`, and
  a reviewer should push back on core columns that only one vertical uses.
