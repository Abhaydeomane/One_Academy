import { prisma } from '@one/db'

export async function findUserByClerkId(clerkUserId: string) {
  return prisma.user.findUnique({ where: { clerkUserId }, select: { id: true } })
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } })
}

export async function createUser(data: {
  clerkUserId: string
  email: string
  name?: string
}): Promise<string> {
  const user = await prisma.user.create({ data, select: { id: true } })
  return user.id
}

export async function updateUser(
  id: string,
  data: { clerkUserId?: string; name?: string | null },
): Promise<void> {
  await prisma.user.update({ where: { id }, data })
}

export async function findOrgByClerkId(clerkOrgId: string) {
  return prisma.organization.findUnique({ where: { clerkOrgId }, select: { id: true } })
}

export async function findOrgBySlug(slug: string) {
  return prisma.organization.findUnique({ where: { slug }, select: { id: true } })
}

export async function createOrg(data: {
  clerkOrgId: string
  name: string
  slug: string
}): Promise<string> {
  const org = await prisma.organization.create({ data, select: { id: true } })
  return org.id
}

export async function updateOrg(
  id: string,
  data: { clerkOrgId?: string; name?: string },
): Promise<void> {
  await prisma.organization.update({ where: { id }, data })
}

export async function upsertMembership(data: {
  organizationId: string
  userId: string
  role: 'OWNER' | 'MANAGER' | 'VIEWER'
}): Promise<void> {
  await prisma.membership.upsert({
    where: {
      organizationId_userId: { organizationId: data.organizationId, userId: data.userId },
    },
    create: data,
    update: { role: data.role },
  })
}
