import { auth } from '@clerk/nextjs/server'
import Link from 'next/link'

const PRIMARY =
  'tap-target inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-5 text-base font-medium text-white hover:bg-brand-700 sm:w-auto'

export default async function PartnerHome() {
  const { userId } = await auth()

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Manage your institute</h1>
      <p className="max-w-2xl text-base text-gray-600">
        List your institute, keep your details current and publish upcoming batches for students.
      </p>
      {userId ? (
        <Link href="/dashboard" className={PRIMARY}>
          Go to dashboard
        </Link>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className={PRIMARY}>
            List your institute
          </Link>
          <Link
            href="/sign-in"
            className="tap-target inline-flex w-full items-center justify-center rounded-lg border border-brand-500 px-5 text-base font-medium text-brand-700 sm:w-auto"
          >
            Sign in
          </Link>
        </div>
      )}
    </section>
  )
}
