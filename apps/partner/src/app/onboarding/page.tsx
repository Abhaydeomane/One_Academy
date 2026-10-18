import { CreateOrganization } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Set up your institute' }

export default async function OnboardingPage() {
  const { orgId } = await auth()
  if (orgId) redirect('/dashboard')

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Set up your institute</h1>
      <p className="text-base text-gray-600">
        Your organisation is your institute or coaching group. If you have several branches, they
        all live under one organisation.
      </p>
      <CreateOrganization afterCreateOrganizationUrl="/dashboard/new" skipInvitationScreen />
    </section>
  )
}
