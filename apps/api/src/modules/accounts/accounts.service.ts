import { fetchClerkOrganization, type ClerkOrganization } from '../../lib/clerk.js'
import { ConflictError, ForbiddenError, UpstreamUnavailableError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { slugify } from '../../lib/slug.js'
import * as repo from './accounts.repository.js'

// Clerk owns identity and organisation membership. These rows are a local
// mirror so authorization is a database join rather than an API call per
// request. Nothing here writes User.globalRole: admin rights come from the
// Clerk session's metadata.globalRole (ADR 0006); User.globalRole is not used
// for authorization.

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

/// A Clerk organisation matches a local one only by clerkOrgId. Matching by
/// slug would let anyone who names a Clerk organisation after an existing
/// institute take over its listings (spec §6). Linking a seeded organisation
/// to Clerk is a manual database statement (runbooks/local-setup.md).
export async function syncOrganization(input: {
  clerkOrgId: string
  name: string
  slug: string
}): Promise<string> {
  const byClerk = await repo.findOrgByClerkId(input.clerkOrgId)
  if (byClerk) return byClerk.id
  return createOrgOnce(input)
}

const MAX_SLUG_ATTEMPTS = 100

async function availableOrgSlug(base: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`
    if (!(await repo.findOrgBySlug(candidate))) return candidate
  }
  throw new ConflictError('CONFLICT', 'Could not allocate an organisation slug')
}

/// Creates the organisation, tolerating a concurrent creator: the webhook and
/// an on-demand provision (Task 4) can race, and the unique clerkOrgId makes
/// the loser's insert fail. The loser then returns the winner's row.
async function createOrgOnce(input: {
  clerkOrgId: string
  name: string
  slug: string
}): Promise<string> {
  const slug = await availableOrgSlug(input.slug)
  try {
    return await repo.createOrg({ ...input, slug })
  } catch (error) {
    const existing = await repo.findOrgByClerkId(input.clerkOrgId)
    if (existing) return existing.id
    throw error
  }
}

/// Translates a Clerk organisation id into the local Organization.id. Under
/// self-registration every Clerk organisation is a legitimate institute, so an
/// unseen one is provisioned here rather than refused: the organization.created
/// webhook can arrive after the partner's first request. The name comes from
/// Clerk with the server secret, never from the request; the id comes from the
/// verified session.
export async function resolveLocalOrgId(clerkOrgId: string): Promise<string> {
  const org = await repo.findOrgByClerkId(clerkOrgId)
  if (org) return org.id
  return provisionFromClerk(clerkOrgId)
}

async function provisionFromClerk(clerkOrgId: string): Promise<string> {
  let remote: ClerkOrganization | null
  try {
    remote = await fetchClerkOrganization(clerkOrgId)
  } catch (error) {
    logger.warn({ err: error, clerkOrgId }, 'Clerk organisation lookup failed')
    throw new UpstreamUnavailableError('Could not reach Clerk to set up the organisation')
  }
  if (!remote) throw new ForbiddenError('Organisation not found in Clerk')
  const slug = slugify(remote.slug ?? remote.name) || `org-${slugify(clerkOrgId)}`
  return createOrgOnce({ clerkOrgId, name: remote.name, slug })
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
