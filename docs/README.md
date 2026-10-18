# One Academy documentation

Docs hold what git cannot. Git records what changed, when and by whom — exactly. It
records nothing about intent, rejected alternatives, or how a flow spans three apps. Only
the second category belongs here.

**Deliberately absent:** any hand-maintained log of files changed, and any mirror of the
code's structure. Both duplicate `git log` and the code itself, rot within weeks, and then
mislead the next agent. Use `git log --follow`, `git blame` and the ADRs instead.

| Path                       | What it holds                                   | Read it when                         |
| -------------------------- | ----------------------------------------------- | ------------------------------------ |
| `architecture.md`          | The three apps, data flow, deploy topology      | Orienting for the first time         |
| `flows/`                   | End-to-end flows with code anchors              | Changing behaviour that crosses apps |
| `domain/business-rules.md` | The numbered BR-### rules                       | Implementing or testing a rule       |
| `domain/glossary.md`       | Exact meaning of Listing, Institute, Batch, Org | A term is ambiguous                  |
| `decisions/`               | ADRs: the decision, and what was rejected       | Tempted to re-litigate a choice      |
| `api/openapi.json`         | Generated API spec — never hand-edit            | Checking the contract                |
| `runbooks/`                | Local setup, migrations                         | Operating the system                 |
| `work/`                    | Requests, bugs, and completed outcomes          | Picking up or recording work         |
| `superpowers/specs/`       | Design specs, one per phase                     | Starting a phase                     |
| `superpowers/plans/`       | Implementation plans                            | Executing a phase                    |

## The flows

| Flow                           | Covers                                                         |
| ------------------------------ | -------------------------------------------------------------- |
| `flows/listing-lifecycle.md`   | Draft → review → published, and what publication makes visible |
| `flows/partner-onboarding.md`  | Sign-up, organisation, first draft, Clerk provisioning         |
| `flows/institute-discovery.md` | Browse, search, filter, detail page, enquiry                   |
| `flows/seo-landing-pages.md`   | `/jee-coaching-in-pune`, canonicals, sibling rails, sitemap    |
| `flows/comparison.md`          | Checkbox selection, pinned batches, stale-link degradation     |

## Keeping flows true

Each flow records `Last verified against commit: <sha>` plus the code anchors it
describes. `pnpm exec tsx scripts/check-docs-freshness.ts` flags any flow whose anchors
have commits newer than that sha. CI runs it advisory-only for now; promote it to blocking
once the flows have proven trustworthy.

When you change behaviour, update the flow and bump its sha in the same pull request.

## Where the project is

P0 (foundation and one end-to-end slice) is complete: the API, both frontends, the
documentation system and the moderation gate. P1a (search, filters and facets), P1b
(programmatic SEO landing pages) and P1c (comparison) are complete on top of it, and so
is P2a (institute self-registration and verification). P2b onward are sketched in
`superpowers/specs/2026-10-11-one-academy-foundation-design.md` §16 and each gets its own
spec before any code.
