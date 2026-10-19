import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Photo uploads pass through a server action. The browser shrinks them to
    // well under the API's 8 MB cap first; this leaves room for that cap plus
    // multipart overhead (P2c spec §5).
    serverActions: { bodySizeLimit: '9mb' },
  },
}

export default config
