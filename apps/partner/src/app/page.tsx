import Link from 'next/link'

export default function PartnerHome() {
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Manage your institute</h1>
      <p className="max-w-2xl text-base text-gray-600">
        Update your profile, publish batches and track enquiries from students.
      </p>
      <Link
        href="/dashboard"
        className="tap-target inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-5 text-base font-medium text-white hover:bg-brand-700 sm:w-auto"
      >
        Go to dashboard
      </Link>
    </section>
  )
}
