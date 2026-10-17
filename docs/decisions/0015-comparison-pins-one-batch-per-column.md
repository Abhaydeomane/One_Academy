# ADR 0015 — Comparison compares batches, one pinned per institute

Date: 2026-10-14
Status: Accepted

## Context

Comparison is where a student actually chooses, so it is where vagueness is most
expensive. An institute-level comparison is far easier to build — `instituteSummary`
already carries everything, and selection needs no second step — but its fee cell is a
range. "₹25,000 – ₹1,50,000" against "₹30,000 – ₹1,40,000" tells a student nothing while
appearing to tell them something, and two institutes with identical ranges look identical
when their actual offerings differ completely.

BR-008 (2–4 listings, one vertical) and ADR 0004 (comparison is a projection inside the
vertical module) were already settled. What was open was the unit being compared.

## Decision

**Columns are institutes; the rows that matter come from one pinned batch per column.**
A cell reads "₹50,000 — JEE Advanced 2027 Morning, starts 1 Apr, 18 of 60 seats" — a
commitment, not a shrug. Batch-level mode and exam are read from the batch, so a `HYBRID`
institute running an offline batch compares as offline for that batch.

The cost is a selection problem, paid for by splitting selection into two stages, both in
the URL:

1. `/compare?slug=a&slug=b` — checkboxes on results and landing pages. Repeated `slug`
   params are exactly what `<input type="checkbox" name="slug">` emits, so this stage needs
   no JavaScript.
2. `&batch=a:b1` — the page pre-pins the **cheapest upcoming** batch, so it is fully
   useful with zero further taps; each column's selector refines it.

Pins are explicit `slug:batchId` pairs, and the batch selector's `<option value>` **is**
that grammar, so picking a batch builds no URL at all.

## Alternatives rejected

**Institute-level comparison.** Simplest, no selection problem, and the fee column is a
range that cannot be acted on. Rejected for the reason the whole feature exists.

**Make the student pick a batch per institute first.** Precise, and four dropdowns before
the first useful pixel. That flow would not survive contact with a phone.

**Positional pins** (`?slug=a&slug=b&batch=b1&batch=b2`). Shorter. Corrupts silently the
moment slug order changes or one pin is absent, producing a page that is confidently wrong.

**A `localStorage` tray.** Would survive navigating into a detail page and back, which is
a genuinely nicer flow. Rejected for now: it would introduce the first client-owned state
in the app, bring hydration risk, be invisible to the server and unshareable, and it
contradicts ADR 0012. The compare URL is itself the shareable artefact. If selection
abandonment proves real, a tray gets its own ADR rather than arriving as a side effect.

**Comparing two batches of one institute.** That is "which batch should I join?", a
detail-page question. Including it would mean redefining BR-008 for no gain.

## Consequences

- **Rot and tampering are separated, and that is the central judgement.** A pin that is
  gone, has started, or was unpublished is the expected fate of a shared link: the column
  falls back to its default and sets `pinFellBack` so the page can say so. A pin naming a
  _published_ batch of a different institute cannot arise from the UI or from time passing,
  so it is a 400. A draft batch elsewhere is treated as rot rather than confirmed, because
  distinguishing it would leak the existence of unpublished content.
- **A stale slug is dropped and reported, not fatal**, until fewer than two survive. The
  `dropped[]` array exists so the UI can explain a link the student was sent; an API that
  silently answers a four-slug request with three columns forces the frontend to diff the
  request against the response to discover the truth.
- **This route never answers 301.** `fetch` follows redirects transparently, so a 301
  would be consumed by the transport and the browser would keep the stale URL — see
  BUG-001, found while specifying this. Canonical slugs come back as data and the page
  redirects. For a URL whose purpose is to be shared, correcting the address bar is the
  point.
- **Mounted at `/api/v1/compare`**, not under `/api/v1/institutes`, where
  `institutesRouter`'s `GET /:slug` would shadow it the moment a listing is slugged
  `compare`. ADR 0004 governs where the code lives, not what the URL looks like.
- **Comparison needs an upcoming-only batch query that the rest of the app lacks**
  (BUG-002). Search cards, landing cards and the detail page all say "upcoming" while
  counting every published batch. Tightening that predicate globally moves P1a/P1b fee
  expectations and can drop landing pages below `LANDING_MIN_INDEXABLE`, so comparison got
  its own query instead. A search card may therefore report more batches than the
  comparison does; the comparison is the correct one.
- **Superlatives are labelled, never judged.** The lowest fee and soonest start are tagged
  `lowest` and `soonest` — descriptions of the number. Not "best": a cheap batch may be
  cheap because it is large, remote or taught by juniors, and a marketplace implying
  otherwise misinforms a student about a decision that costs them a year. A tie gets no tag
  rather than an invented winner.
- `noindex, follow`. The combination space is binomial and nearly every page would be a
  thin near-duplicate of its neighbours and of the P1b landing page for the same city and
  exam — the doorway risk ADR 0014 exists to avoid. Indexable "X vs Y" pages are deferred;
  they need their own thresholds and canonical rules, which is a second P1b.
