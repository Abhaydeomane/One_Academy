# One Academy — P1c: Institute comparison

Date: 2026-10-14
Status: Approved
Phase: P1c
Depends on: P0 (foundation), P1a (search and filters), P1b (landing pages)

---

## 1. Context

A student who has found four plausible JEE institutes in Pune now has the hard part:
choosing. The search results page answers "what exists"; the detail page answers "what is
this one". Neither answers "which of these four, and why".

Comparison is the step where the product either earns the enquiry or loses the student to
a WhatsApp group. It is also where vagueness is most expensive: a page that says Allen
costs "₹25,000 – ₹1,50,000" and Aakash costs "₹30,000 – ₹1,40,000" has told the student
nothing while appearing to have told them something.

Three P0/P1a decisions constrain this phase and are not reopened:

- **BR-008** — comparison accepts 2–4 listings of a single vertical.
- **ADR 0004** — comparison is a projection of comparable attributes inside the vertical
  module. A generic comparison engine does not pay for itself at two verticals.
- **ADR 0012** — state lives in the URL.

### The decision that shaped this spec

Comparison could compare institutes or batches. Institutes are easier: the
`instituteSummary` contract already carries everything, and selection needs no second
step. We are comparing **batches**, pinned one per institute, because an institute-level
fee is a range and a range is not a fact a student can act on. A cell reading
"₹50,000 — JEE Advanced 2027 Morning, starts 1 Apr" is a commitment; "₹25,000–₹1,50,000"
is a shrug.

The cost of that choice is a selection problem, and §5 is how it is paid for.

## 2. Goals

- Compare 2–4 published institutes side by side on a 390px screen, with the attribute
  names always visible.
- Every fee cell names a specific batch, its exam, its start date and its seat count.
- Selection and pinning live entirely in the URL, so a comparison is shareable and the
  back button works.
- A shared comparison URL degrades honestly as listings and batches change, instead of
  404ing or silently lying.
- A comparison carries its pinned batch into the enquiry, so the lead records which batch
  the student was actually looking at.

## 3. Non-goals

- **Indexable "X vs Y" pages.** `noindex, follow`. See §11.
- **Comparing two batches of the same institute.** That is "which batch should I join?",
  a detail-page question. Folding it in would mean redefining BR-008 for no gain.
- **A persistent cross-page selection tray.** Deferred, with reasoning in §5.
- **Reviews, ratings or any quality signal.** `ratingAvg` is still inert until P1d; a
  comparison row showing 0.0 for every column would be worse than its absence.
- **Saved or named comparisons.** Requires student accounts (P1d).
- **Hostels.** The projection is institute-specific by ADR 0004.

## 4. Decisions

| #   | Decision                                                                    |
| --- | --------------------------------------------------------------------------- |
| D1  | Columns are institutes; rows mix pinned-batch facts and institute facts     |
| D2  | Each column pins one published upcoming batch, defaulting to the cheapest   |
| D3  | Selection is repeated `slug` params from a plain checkbox GET form          |
| D4  | Pins are explicit `slug:batchId` pairs, never positional                    |
| D5  | A stale slug is dropped and reported, not fatal, until fewer than 2 survive |
| D6  | A stale pin falls back to the default and is reported                       |
| D7  | A pin naming another institute's batch is a 400                             |
| D8  | `noindex, follow`                                                           |
| D9  | Superlatives are labelled neutrally ("lowest", "soonest"), never "best"     |

## 5. Selection: two stages, both in the URL

Batch-level comparison appears to require the student to choose a batch per institute
before seeing anything — four institutes, four dropdowns, before the first useful pixel.
That flow would not survive contact with a phone.

It is split instead:

**Stage 1 — pick institutes.** Checkboxes on the results page, submitted by a plain GET
form:

```
/compare?slug=allen-kothrud&slug=aakash-shivaji
```

Repeated `slug` params are not a style choice. `<input type="checkbox" name="slug">` emits
exactly this, so stage 1 needs no JavaScript, matching how `exams` already works in
`listInstitutesQuery`.

The results page already contains a `GET` form for search, and nesting forms is invalid
HTML. The checkboxes therefore sit outside it and associate by id:

```html
<form id="compare" action="/compare" method="get">…</form>
<input type="checkbox" name="slug" value="allen-kothrud" form="compare" />
```

**Stage 2 — refine the pin.** The compare page pins the **cheapest** upcoming published
batch per institute, so the page is fully useful with zero additional taps. Each column
header carries a batch selector; changing it appends a pin:

```
/compare?slug=allen-kothrud&slug=aakash-shivaji&batch=allen-kothrud:ckb1
```

Cheapest rather than soonest because fee is the dominant axis in this market and the
student arrived from a fee-filtered search. It is one function, `defaultPin`, and should be
revisited when there is behavioural data rather than by argument.

### Why pins are pairs, not positions

`?slug=a&slug=b&batch=b1&batch=b2` relies on positional alignment, which corrupts silently
the moment slug order changes or one pin is absent — producing a page that is confidently
wrong. `slug:batchId` is self-describing and order-independent, and an unparseable pin is
detectable rather than merely misaligned.

### Why not a persistent tray

A `localStorage` tray would survive navigating into a detail page and back, which is the
nicer flow. It would also introduce the first client-owned state in the app, bring
hydration risk, be invisible to the server, and be unshareable — and it contradicts
ADR 0012. The compare URL is itself the shareable artefact, which covers the case the tray
was for. If selection abandonment shows up as a real problem, a tray gets its own ADR
rather than arriving as a side effect of this phase.

## 6. Rows

| Row              | Source       | Note                                                             |
| ---------------- | ------------ | ---------------------------------------------------------------- |
| Fee              | pinned batch | `feeAmount` + currency, paise formatted at the boundary (BR-005) |
| Exam             | pinned batch | the batch's own exam, not the institute's exam tags              |
| Mode             | pinned batch | a hybrid institute may run an offline batch                      |
| Starts           | pinned batch | `startDate`, and `endDate` when present                          |
| Schedule         | pinned batch | `scheduleText`, nullable                                         |
| Seats            | pinned batch | `seatsAvailable` of `seatsTotal`                                 |
| Locality         | institute    | with city, since columns may span cities                         |
| Established      | institute    | nullable                                                         |
| Faculty          | institute    | nullable                                                         |
| Upcoming batches | institute    | count of published future batches                                |

Mode and exam are read from the **batch**, not the institute. An institute tagged
`HYBRID` running a specific offline batch should compare as offline for that batch, and
reading the institute's tags there would state something false about the thing being
compared.

### Superlatives

The lowest fee and the soonest start are tagged, because scanning six numbers across a
scrolling table is exactly what a phone is bad at. They are labelled `lowest` and
`soonest` — descriptions of the number.

They are **not** labelled "Best value" or given a winner's badge. The lowest fee is
objectively the lowest and is not objectively the best; a cheap batch may be cheap because
it is large, remote or taught by juniors. A marketplace that implies otherwise is
misinforming a student about a decision that costs them a year.

Nullable rows get no superlative, and a row where every value ties gets none either.

## 7. API surface

### `GET /api/v1/institutes/compare`

Query:

```
slug   repeated, 2-4 after de-duplication, required
batch  repeated, `slug:batchId`, optional
```

Response:

```ts
{
  columns: [{
    institute: {
      id, slug, name,
      city: { slug, name },
      locality, establishedYear, facultyCount,
      batchCount,
    },
    pinned: BatchSummary | null,       // null when the institute has no upcoming batch
    pinFellBack: boolean,              // the requested pin no longer qualified
    batches: BatchSummary[],           // options for the selector
  }],
  dropped: [{ slug, reason: 'NOT_FOUND' | 'UNPUBLISHED' }],
  canonicalSlugs: string[],            // former names resolved, in request order
}
```

`dropped` and `pinFellBack` exist so the UI can tell the student what happened to a link
they were sent. An API that silently returns three columns for a four-slug request forces
the frontend to diff the request against the response to discover the truth.

### Module ownership

Lives in `institutes.compare.{routes,service,repository}.ts`, per ADR 0004. The service
reaches batch data through `batches.service` — `listPublishedForListing` and
`belongsToListing` already exist — because R4 bars a route from another module's internals.
No new raw SQL: the compare repository projects by slug through Prisma, and the P1a
search query is not involved because there is no ranking, filtering or pagination here.

### Slug resolution, and why this route does not 301

Each slug resolves through `listings.service.resolvePublishedSlug`, the same path the
detail route uses, so BR-002 and BR-009 hold without restating them.

Unlike `/institutes/:slug`, this route **never answers 301**. It returns the resolved set
as `canonicalSlugs`, and the _page_ compares that to what it was asked for and issues a
Next.js `redirect()` when they differ.

The reason is mechanical. `fetch` follows redirects transparently, so when the API 301s,
the web app receives the final JSON and never learns the canonical slug — the browser's
address bar keeps the stale URL regardless. For the detail page that is a cosmetic wart.
Here it would defeat the feature: the whole point of a comparison URL is that it gets
shared, and a shared URL that silently serves canonical content under a dead slug set
accumulates stale links forever. Returning the canonical set as _data_ is the only way the
browser's URL can actually be corrected.

Pins are rewritten onto the canonical slugs as part of that redirect, so a pin does not
detach from its column when an institute is renamed.

## 8. Degradation

A shared comparison URL rots. Institutes get unpublished, batches fill, start dates pass.
Failing the whole page because one of four columns went stale is the wrong trade.

| Condition                           | Behaviour                                                             |
| ----------------------------------- | --------------------------------------------------------------------- |
| Slug unknown or unpublished         | dropped, reported in `dropped[]`                                      |
| Fewer than 2 slugs survive          | 404 — there is no comparison left to show                             |
| Slug is a former name               | resolved; page redirects to the canonical set, pins rewritten         |
| Pin unpublished, full or past       | falls back to the default, `pinFellBack: true`                        |
| Pin names another institute's batch | 400 `VALIDATION_FAILED`                                               |
| Pin unparseable (no `:`)            | 400 `VALIDATION_FAILED`                                               |
| Institute has no upcoming batch     | column renders, `pinned: null`, batch rows read "No upcoming batches" |
| Fewer than 2 or more than 4 slugs   | 400 `VALIDATION_FAILED` (BR-008)                                      |
| Duplicate slugs                     | de-duplicated before the count is validated                           |

The split between _rot_ and _tampering_ is deliberate. A pin that no longer qualifies is
the expected fate of any shared link and must not be an error. A pin naming a batch that
belongs to a different institute cannot arise from the UI or from the passage of time, so
it is rejected — the same reasoning the enquiries module already applies to `batchId`.

## 9. Mobile layout

390px, four columns. The attribute column is sticky; institute columns scroll
horizontally with snap, two visible at a time.

```
┌──────────┬─────────┬─────────┐→
│          │ Allen   │ Aakash  │
│          │ Kothrud │ Shivaji │
├──────────┼─────────┼─────────┤
│ Fee from │ ₹50,000 │ ₹72,000 │
│          │ lowest  │         │
├──────────┼─────────┼─────────┤
│ Starts   │ 1 Apr   │ 15 May  │
└──────────┴─────────┴─────────┘
  ▲ sticky     ▲ snap
```

Two institutes visible at once is the point: comparison is a pairwise act, and a layout
showing one column at a time is a list with extra steps.

Rejected: stacked cards, which remove the scroll but require the student to hold ₹50,000 in
their head while scrolling to the next card; and an attribute accordion, where fee and mode
can never be on screen together.

The table is a real `<table>` with `<th scope="row">` on the attribute column, so the
relationship between a cell and its attribute survives a screen reader. A div grid would
look identical and announce as noise.

**Known risk.** A `position: sticky` first column inside an `overflow-x: auto` container is
the layout iOS Safari is most likely to render wrongly, and this project has never had its
mobile layout opened in a real browser — every mobile claim so far rests on class names and
structural assertions. Playwright can verify the DOM and the scroll container; it cannot
verify that the sticky column does not shear on an actual iPhone. This phase should be the
one where that is checked on a device.

## 10. Entry points

- **Results page** (`/institutes`) — a checkbox per card plus a sticky bottom
  `CompareBar`. The bar is the one new client component: it reads the checked count,
  disables submission outside 2–4, and names the limit. Without it the UI can submit a
  request guaranteed to 400, which is a worse trade than a few lines of client state.
  The checkboxes themselves stay server-rendered and work without it.
- **Landing pages** (`/jee-coaching-in-pune`) — the same checkbox and bar. These pages
  are where high-intent traffic lands (P1b), so omitting comparison there would waste the
  phase.
- **Detail page** — out of scope. Comparing from a single institute requires a tray to
  accumulate a second one, which §5 defers.

## 11. SEO

`noindex, follow`, matching P1a's treatment of query result pages.

The combination space is combinatorial: three institutes in one city is 3 pairs plus 1
triple, ten institutes is 45 pairs alone, and nearly every one would be a thin
near-duplicate of its neighbours and of the P1b landing page covering the same city and
exam. That is precisely the doorway-page risk ADR 0014 was written to avoid, and this time
the page count grows as a binomial rather than linearly.

`follow` is kept, so comparison pages pass equity to the institute pages they link to.
Comparison URLs are absent from the sitemap.

Indexable "X vs Y" pages are a real high-intent opportunity and are deliberately deferred:
they need their own eligibility thresholds, canonical rules and sitemap logic, which is a
second P1b rather than a corner of P1c. Revisit once P1b's pages have Search Console data.

## 12. Caching and rendering

`export const revalidate = 300`, like every other public page, with TTL honouring
`API_CACHE_TTL` so the e2e suite can set it to 0 (the same staleness filed as REQ-002).

Pins make the URL space larger than the landing pages', but each response is small and the
query is a projection by id with no ranking, so there is nothing to pre-render and no
reason to. The page is dynamic by virtue of its query string, exactly like `/institutes`.

## 13. Testing

**Shared, pure, no fixtures** — the pin grammar: `slug:batchId` round-trips,
`buildComparePath` idempotence, a pin with no colon, a pin with an empty side, a colon
inside a batch id, de-duplication, and the 2–4 boundaries at 1, 2, 4 and 5.

**API integration, real Postgres** — every row of the §8 table. Specifically: a dropped
unpublished slug still returns a usable page; two dropped slugs out of three is a 404; a
former slug comes back resolved in `canonicalSlugs` while the response stays 200; a pin
whose slug was renamed is rewritten onto the canonical slug; a pin for another
institute's batch is a 400; a
pin that is past falls back and sets `pinFellBack`; an institute with no upcoming batches
returns `pinned: null`; and 5 slugs is a 400. A DRAFT listing must never appear in a
column (BR-009).

**Web** — the table renders a `<th scope="row">` per attribute; superlative tags land on
the lowest fee and soonest start; a tied row carries no tag; `pinned: null` renders "No
upcoming batches" rather than an empty cell; the metadata carries `noindex, follow`.

**E2E** — the whole flow on a 390px viewport: select three institutes on `/institutes`,
submit, land on `/compare`, assert the sticky attribute column and the horizontal scroll
container, change one column's batch and assert the URL gained a pin, then follow the CTA
and assert the enquiry form arrives with that `batchId`. Plus the same selection flow from
a landing page, and a stale-slug URL landing on the canonical one.

## 14. What this leaves for the rest of P1

P1d — reviews and student accounts — adds a rating row to this table and makes saved
comparisons possible. The row is deliberately absent now rather than stubbed, because a
column of `0.0` is a worse answer than no column.

## 15. Open items

- **The sticky column on a real iPhone.** §9. The one thing in this spec that cannot be
  settled from the repository.
- **Cheapest as the default pin.** A guess, isolated in `defaultPin`. Revisit against
  behaviour, not opinion.
- **Whether four columns is right.** BR-008 allows four; two fit a phone screen. If the
  data shows nobody compares more than three, the limit is one constant.
- **REQ-002 applies here too.** A comparison can show a batch that was unpublished
  minutes ago, until public pages are revalidated on moderation events.
- **The detail page's 301 never reaches the browser.** Found while specifying §7: because
  `fetch` follows redirects, `/institutes/<old-slug>` serves canonical content under the
  old URL instead of moving the address bar. Filed as BUG-001; out of scope here, and the
  fix should take the same shape §7 settled on.
