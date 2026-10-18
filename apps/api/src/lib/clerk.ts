import { clerkClient } from '@clerk/express'

export type ClerkOrganization = { id: string; name: string; slug: string | null }

/// The API's only call to Clerk's Backend API, isolated so tests can replace
/// it. Clerk is an external service; the database is never mocked.
export async function fetchClerkOrganization(clerkOrgId: string): Promise<ClerkOrganization> {
  const org = await clerkClient.organizations.getOrganization({ organizationId: clerkOrgId })
  return { id: org.id, name: org.name, slug: org.slug ?? null }
}
