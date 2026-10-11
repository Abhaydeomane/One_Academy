import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import './globals.css'

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'One Academy — Find coaching institutes', template: '%s | One Academy' },
  description: 'Compare coaching institutes, upcoming batches and fees across India.',
}

// viewportFit lets sticky bars extend into the home-indicator area, which the
// safe-bottom utility then pads correctly.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-gray-50 text-gray-900 antialiased">
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="text-base font-semibold text-brand-700 sm:text-lg">
              One Academy
            </Link>
            <Link
              href="/institutes"
              className="tap-target inline-flex items-center rounded-md px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Institutes
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">{children}</main>

        <footer className="mx-auto max-w-5xl px-4 pb-10 pt-6 text-xs text-gray-500">
          One Academy — coaching institute discovery.
        </footer>
      </body>
    </html>
  )
}
