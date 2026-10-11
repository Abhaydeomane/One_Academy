import { ForbiddenError } from '../../lib/errors.js'
import * as repo from './accounts.repository.js'

// Clerk owns identity and organisation membership. These rows are a local
// mirror so authorization is a database join rather than an API call per
// request. Nothing here ever writes globalRole: ADMIN is granted only by a
// direct database write, never by an endpoint or a webhook.

export async function syncUser(input: {
  clerkUserId: string
  email: string
  name?: string
}): Promise<string> {
  const byClerk = await repo.findUserByClerkId(input.clerkUserId)
  if (byClerk) {
    await repo.updateUser(byClerk.id, { name: input.name ?? null })
    return byClerk.id
  }

  // A user may exist from a seed or an earlier email-only record; link rather
  // than fail on the unique email constraint.
  const byEmail = await repo.findUserByEmail(input.email)
  if (byEmail) {
    await repo.updateUser(byEmail.id, {
      clerkUserId: input.clerkUserId,
      ...(input.name ? { name: input.name } : {}),
    })
    return byEmail.id
  }

  return repo.createUser({
    clerkUserId: input.clerkUserId,
    email: input.email,
    ...(input.name ? { name: input.name } : {}),
  })
}

export async function syncOrganization(input: {
  clerkOrgId: string
  name: string
  slug: string
}): Promise<string> {
  const byClerk = await repo.findOrgByClerkId(input.clerkOrgId)
  if (byClerk) return byClerk.id

  const bySlug = await repo.findOrgBySlug(input.slug)
  if (bySlug) {
    await repo.updateOrg(bySlug.id, { clerkOrgId: input.clerkOrgId })
    return bySlug.id
  }

  return repo.createOrg(input)
}

/// Translates a Clerk organisation id into the local Organization.id. An
/// unprovisioned organisation is a 403 rather than a crash, because the partner
/// app can legitimately have a Clerk org that One Academy has not onboarded.
export async function resolveLocalOrgId(clerkOrgId: string): Promise<string> {
  const org = await repo.findOrgByClerkId(clerkOrgId)
  if (!org) throw new ForbiddenError('Organisation is not provisioned')
  return org.id
}

export async function linkMembership(input: {
  clerkOrgId: string
  clerkUserId: string
  email: string
  role: 'OWNER' | 'MANAGER' | 'VIEWER'
}): Promise<void> {
  const organizationId = await resolveLocalOrgId(input.clerkOrgId)
  const userId = await syncUser({ clerkUserId: input.clerkUserId, email: input.email })
  await repo.upsertMembership({ organizationId, userId, role: input.role })
}
