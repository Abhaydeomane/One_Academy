import Link from 'next/link'

type Option = { label: string; value: string | undefined }

const EXAMS: Option[] = [
  { label: 'All exams', value: undefined },
  { label: 'JEE', value: 'jee' },
  { label: 'NEET', value: 'neet' },
]

const MODES: Option[] = [
  { label: 'Any mode', value: undefined },
  { label: 'Offline', value: 'OFFLINE' },
  { label: 'Online', value: 'ONLINE' },
  { label: 'Hybrid', value: 'HYBRID' },
]

function hrefWith(
  current: { city?: string; exam?: string; mode?: string },
  patch: Record<string, string | undefined>,
) {
  const params = new URLSearchParams()
  const merged = { ...current, ...patch }
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return query ? `/institutes?${query}` : '/institutes'
}

function Chip({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={[
        'tap-target inline-flex shrink-0 snap-start items-center rounded-full border px-4 text-sm font-medium',
        active
          ? 'border-brand-500 bg-brand-500 text-white'
          : 'border-gray-300 bg-white text-gray-700',
      ].join(' ')}
    >
      {label}
    </Link>
  )
}

/// A horizontally scrollable rail rather than a sidebar: on a phone a sidebar
/// either eats the viewport or hides behind a second tap.
export function FilterRail({
  current,
}: {
  current: { city?: string; exam?: string; mode?: string }
}) {
  return (
    <div className="-mx-4 space-y-2 px-4">
      <div className="scroll-rail scroll-rail-hide-bar -mx-4 flex gap-2 px-4 pb-1">
        {EXAMS.map((option) => (
          <Chip
            key={option.label}
            label={option.label}
            active={current.exam === option.value}
            href={hrefWith(current, { exam: option.value, page: undefined })}
          />
        ))}
      </div>

      <div className="scroll-rail scroll-rail-hide-bar -mx-4 flex gap-2 px-4 pb-1">
        {MODES.map((option) => (
          <Chip
            key={option.label}
            label={option.label}
            active={current.mode === option.value}
            href={hrefWith(current, { mode: option.value, page: undefined })}
          />
        ))}
      </div>
    </div>
  )
}
