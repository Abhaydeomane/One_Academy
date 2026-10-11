import { ClerkProvider, SignInButton, UserButton } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'One Academy for Partners', template: '%s | One Academy Partners' },
  description: 'Manage your institute listing, batches and enquiries.',
  // The partner product must never be indexed.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Clerk Core 3 removed the <SignedIn>/<SignedOut> control components; the
  // session is read on the server instead.
  const { userId } = await auth()

  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-dvh bg-gray-50 text-gray-900 antialiased">
          <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
              <Link href="/dashboard" className="text-base font-semibold text-brand-700">
                One Academy Partners
              </Link>
              {userId ? <UserButton /> : <SignInButton />}
            </div>
          </header>

          <main className="mx-auto max-w-4xl px-4 py-5 sm:py-8">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  )
}
