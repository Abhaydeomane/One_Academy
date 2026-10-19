import type { ReactNode } from 'react'
import Link from 'next/link'
import type { CompareColumn } from '@one/shared'
import { formatDateRange, formatFee, formatSeats } from '@/lib/format'
import { BatchPicker } from './BatchPicker'
import { superlatives } from './superlatives'
import { InstituteLogo } from '../InstituteLogo'

function Tag({ children }: { children: string }) {
  return (
    <span className="mt-1 block w-fit rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
      {children}
    </span>
  )
}

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase()

/// A real <table> with <th scope="row">, not a div grid. The two look
/// identical and only one tells a screen reader which attribute a cell
/// belongs to.
///
/// The attribute column is sticky and the institute columns snap-scroll, so
/// two institutes are visible at 390px — comparison is a pairwise act, and a
/// layout showing one column at a time is a list with extra steps.
export function CompareTable({
  columns,
  slugs,
  pins,
}: {
  columns: CompareColumn[]
  slugs: string[]
  /// Already-encoded `slug:batchId` strings, so a column's picker can carry
  /// every other column's pin without rebuilding the grammar.
  pins: string[]
}) {
  const { lowestFeeSlug, soonestStartSlug } = superlatives(columns)

  const rows: { label: string; cell: (column: CompareColumn) => ReactNode }[] = [
    {
      label: 'Fee',
      cell: (column) =>
        column.pinned ? (
          <>
            <span className="font-semibold">
              {formatFee(column.pinned.feeAmount, column.pinned.feeCurrency)}
            </span>
            {column.institute.slug === lowestFeeSlug ? <Tag>lowest</Tag> : null}
          </>
        ) : (
          <span className="text-gray-500">No upcoming batches</span>
        ),
    },
    { label: 'Exam', cell: (column) => column.pinned?.exam ?? '—' },
    { label: 'Mode', cell: (column) => (column.pinned ? titleCase(column.pinned.mode) : '—') },
    {
      label: 'Starts',
      cell: (column) =>
        column.pinned ? (
          <>
            {formatDateRange(column.pinned.startDate, column.pinned.endDate)}
            {column.institute.slug === soonestStartSlug ? <Tag>soonest</Tag> : null}
          </>
        ) : (
          '—'
        ),
    },
    { label: 'Schedule', cell: (column) => column.pinned?.scheduleText ?? '—' },
    {
      label: 'Seats',
      cell: (column) =>
        column.pinned ? formatSeats(column.pinned.seatsAvailable, column.pinned.seatsTotal) : '—',
    },
    {
      label: 'Locality',
      cell: (column) =>
        [column.institute.locality, column.institute.city.name].filter(Boolean).join(', '),
    },
    { label: 'Established', cell: (column) => column.institute.establishedYear?.toString() ?? '—' },
    { label: 'Faculty', cell: (column) => column.institute.facultyCount?.toString() ?? '—' },
    { label: 'Upcoming batches', cell: (column) => column.institute.batchCount.toString() },
  ]

  return (
    <div className="scroll-rail -mx-4 px-4">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Comparison of {columns.length} coaching institutes</caption>
        <thead>
          <tr>
            <td className="sticky left-0 z-10 bg-gray-50" />
            {columns.map((column) => (
              <th
                key={column.institute.id}
                scope="col"
                className="min-w-36 snap-start border-b border-gray-200 p-2 text-left align-top"
              >
                <Link
                  href={`/institutes/${column.institute.slug}`}
                  className="flex items-start gap-2 font-semibold text-brand-700"
                >
                  <InstituteLogo url={column.institute.logoUrl} size={48} />
                  {column.institute.name}
                </Link>
                <BatchPicker
                  name={column.institute.name}
                  slug={column.institute.slug}
                  slugs={slugs}
                  otherPins={pins.filter((pin) => !pin.startsWith(`${column.institute.slug}:`))}
                  batches={column.batches}
                  pinnedId={column.pinned?.id ?? null}
                />
                {column.pinFellBack ? (
                  <p className="mt-1 text-xs font-normal text-amber-700">
                    That batch is no longer available — showing the cheapest instead.
                  </p>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-gray-100">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-gray-50 p-2 text-left align-top text-xs font-medium text-gray-600"
              >
                {row.label}
              </th>
              {columns.map((column) => (
                <td key={column.institute.id} className="min-w-36 snap-start p-2 align-top">
                  {row.cell(column)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row" className="sticky left-0 z-10 bg-gray-50">
              <span className="sr-only">Actions</span>
            </th>
            {columns.map((column) => (
              <td key={column.institute.id} className="p-2 align-top">
                {/* The enquiry contract already accepts and validates batchId,
                    so the pinned batch rides through to the lead instead of
                    being discarded at the last step. */}
                <Link
                  href={
                    column.pinned
                      ? `/institutes/${column.institute.slug}?batchId=${column.pinned.id}#enquire`
                      : `/institutes/${column.institute.slug}#enquire`
                  }
                  className="tap-target inline-flex items-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white"
                >
                  Enquire
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
