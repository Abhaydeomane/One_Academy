import Link from 'next/link'

export default function HomePage() {
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
        Find the right coaching institute
      </h1>
      <p className="max-w-2xl text-base text-gray-600">
        Browse institutes, compare upcoming batches, fees and schedules in one place.
      </p>
      <Link
        href="/institutes"
        className="tap-target inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-5 text-base font-medium text-white hover:bg-brand-700 sm:w-auto"
      >
        Browse institutes
      </Link>
    </section>
  )
}
