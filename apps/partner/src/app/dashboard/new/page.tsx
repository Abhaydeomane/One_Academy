import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { partnerReferenceResponse } from '@one/shared'
import { partnerApiGet } from '@/lib/api'
import { NewListingForm } from './NewListingForm'

export const metadata = { title: 'Add your institute' }

export default async function NewListingPage() {
  // Review Focus 5: a deep link without an organisation goes to onboarding,
  // not to the API's 403.
  const { orgId } = await auth()
  if (!orgId) redirect('/onboarding')

  const reference = await partnerApiGet('/api/v1/partner/reference', partnerReferenceResponse)

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Add your institute</h1>
      <p className="text-base text-gray-600">
        Start with the name and city. You can add the rest on the next screen.
      </p>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <NewListingForm cities={reference.cities} />
      </div>
    </section>
  )
}
