# ADR 0008 — Enforce module boundaries with import patterns, not a boundaries plugin

Date: 2026-10-11
Status: Accepted

## Context

The architecture depends on R1–R6 (see root `CLAUDE.md`) being mechanically enforced
rather than documented. R4 in particular — cross-module access must go through the other
module's service — is what lets an agent hold a single module in context and still be
correct, and it is the rule most likely to erode silently.

`eslint-plugin-boundaries` is the obvious tool: it models the module graph declaratively.

## Decision

Enforce R1–R6 with `no-restricted-imports` path patterns and one `no-restricted-syntax`
rule, in `packages/config/eslint/api.js`. No boundaries plugin.

The insight that makes this sufficient: within a module, siblings are imported as
`'./x.service.js'`. **Any import beginning `'../'` therefore crosses a module boundary.**
Path patterns express the whole rule set.

## Alternatives rejected

**`eslint-plugin-boundaries` v7.** Evaluated against the real config. Three problems:

1. The `element-types` rule and its `rules`/tuple-selector syntax are deprecated in favour
   of `dependencies`/`policies`, and the version installed emitted "unrecognised selector
   shape" warnings while silently not enforcing the rule we most cared about. The R4
   violation in the test fixture was caught by the `no-restricted-imports` fallback, not by
   the plugin.
2. Its `default: 'disallow'` stance requires explicitly allowing every external package
   before it stops reporting false positives on `express`, `zod` and `@one/shared`.
3. What it adds over path patterns here is marginal, because allowing cross-module
   _service_ calls is the design's intent — the graph it would model is nearly flat.

Fewer moving parts is worth more than a declarative graph an agent has to re-learn, and
plainer rules produce clearer error messages.

## Consequences

- Each file group carries one complete `no-restricted-imports` rule, because a later ESLint
  config block replaces an earlier one for the same rule rather than merging. Editing these
  blocks requires care.
- Error messages name the rule — "R4: go through the other module's service, not its
  repository" — so an agent learns the architecture from the failure.
- The rules are only as good as their coverage, so
  `scripts/verify-lint-guardrails.sh` lints five deliberate violations plus two legal files
  and asserts each verdict. It runs in CI. A config refactor that disables R1–R4 fails the
  build instead of passing unnoticed.
- Revisit if the module graph becomes genuinely layered — more than route/service/
  repository — where a declarative model would earn its complexity.
