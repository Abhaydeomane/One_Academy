const FEE_FORMAT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/// Fees arrive as integer minor units (BR-005); convert only for display.
export function formatFee(minorUnits: number, currency: string): string {
  const major = minorUnits / 100
  if (currency !== 'INR') return `${currency} ${major.toLocaleString('en-IN')}`
  // Intl separates the symbol from the digits with a non-breaking space, which
  // \s matches in JavaScript.
  return FEE_FORMAT.format(major).replace(/\s/g, '')
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso))
}

export function formatDateRange(startIso: string, endIso: string | null): string {
  const start = formatDate(startIso)
  if (!endIso) return `From ${start}`
  return `${start} – ${formatDate(endIso)}`
}

/// Short form for narrow screens, where a full range would wrap.
export function formatSeats(available: number, total: number): string {
  if (available === 0) return 'Full'
  return `${available} of ${total} seats left`
}

/// Fees arrive as integer minor units (BR-005). Returns null rather than a
/// half-range so the caller can omit the line entirely.
export function formatFeeRange(min: number | null, max: number | null): string | null {
  if (min === null || max === null) return null
  if (min === max) return formatFee(min, 'INR')
  return `${formatFee(min, 'INR')} – ${formatFee(max, 'INR')}`
}
