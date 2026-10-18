import { auth } from '@clerk/nextjs/server'

/// The same claim the API's requireAdmin trusts (spec §6): Clerk session
/// metadata, not the database. This only decides what to show; the API enforces.
export async function isAdmin(): Promise<boolean> {
  const { sessionClaims } = await auth()
  const metadata = sessionClaims?.metadata as { globalRole?: string } | undefined
  return metadata?.globalRole === 'ADMIN'
}
