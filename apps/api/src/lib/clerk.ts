import { clerkClient } from '@clerk/express'

export type ClerkOrganization = { id: string; name: string; slug: string | null }

/// The API's only call to Clerk's Backend API, isolated so tests can replace
/// it. Clerk is an external service; the database is never mocked.
///
/// Returns null when Clerk says the organisation does not exist (HTTP 404), so
/// callers do not depend on Clerk's error shape. Any other failure throws.
export async function fetchClerkOrganization(
  clerkOrgId: string,
): Promise<ClerkOrganization | null> {
  try {
    const org = await clerkClient.organizations.getOrganization({ organizationId: clerkOrgId })
    return { id: org.id, name: org.name, slug: org.slug ?? null }
  } catch (error) {
    if ((error as { status?: unknown } | null)?.status === 404) return null
    throw error
  }
}
