import Link from 'next/link'

/// Lateral links between landing pages. Reused for exams, cities and modes —
/// the three axes differ only in their labels, so they share one component.
export function SiblingRail({
  title,
  links,
}: {
  title: string
  links: { label: string; count: number; path: string }[]
}) {
  if (links.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="scroll-rail scroll-rail-hide-bar -mx-4 flex gap-2 px-4 pb-1">
        {links.map((link) => (
          <Link
            key={link.path}
            href={link.path}
            className="tap-target inline-flex shrink-0 snap-start items-center gap-1 rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700"
          >
            <span>{link.label}</span>
            <span className="text-gray-500">({link.count})</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
