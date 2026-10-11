import Link from 'next/link'

export default function InstituteNotFound() {
  return (
    <section className="space-y-3">
      <h1 className="text-xl font-bold sm:text-2xl">Institute not found</h1>
      <p className="text-sm text-gray-600">
        This institute may not be published yet, or the link may be out of date.
      </p>
      <Link
        href="/institutes"
        className="tap-target inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium"
      >
        Browse all institutes
      </Link>
    </section>
  )
}
