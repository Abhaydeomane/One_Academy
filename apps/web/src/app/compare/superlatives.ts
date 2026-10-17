import type { CompareColumn } from '@one/shared'

/// Which column holds the lowest fee and which starts soonest. Scanning six
/// numbers across a horizontally scrolling table is exactly what a phone is
/// bad at, so these get a label.
///
/// They are labelled "lowest" and "soonest" — descriptions of the number —
/// never "best". The lowest fee is objectively the lowest and is not
/// objectively the best: a cheap batch may be cheap because it is large,
/// remote, or taught by juniors. Implying otherwise misinforms a student about
/// a decision that costs them a year.
export function superlatives(columns: CompareColumn[]): {
  lowestFeeSlug: string | null
  soonestStartSlug: string | null
} {
  const pinned = columns.filter(
    (column): column is CompareColumn & { pinned: NonNullable<CompareColumn['pinned']> } =>
      column.pinned !== null,
  )

  // Nothing to be superlative about with fewer than two candidates.
  if (pinned.length < 2) return { lowestFeeSlug: null, soonestStartSlug: null }

  const winner = (pick: (column: (typeof pinned)[number]) => number | string): string | null => {
    const best = pinned.map(pick).reduce((a, b) => (b < a ? b : a))
    const holders = pinned.filter((column) => pick(column) === best)
    // A tie has no winner: tagging one of them would invent a distinction the
    // data does not contain.
    return holders.length === 1 ? (holders[0]?.institute.slug ?? null) : null
  }

  return {
    lowestFeeSlug: winner((column) => column.pinned.feeAmount),
    // ISO-8601 strings sort chronologically as text, so no Date is needed.
    soonestStartSlug: winner((column) => column.pinned.startDate),
  }
}
