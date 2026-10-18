import { networkInterfaces } from 'node:os'
import type { NextConfig } from 'next'

// The dev server refuses its own JS to any origin other than localhost, so a
// phone opening http://<laptop-ip>:3000 gets a server-rendered page that never
// hydrates (no CompareBar, nothing interactive). Allow this machine's current
// LAN addresses — read at startup because the IP changes between networks.
// Dev-only: production builds ignore allowedDevOrigins.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net?.family === 'IPv4' && !net.internal)
  .map((net) => net!.address)

const config: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: lanAddresses,
}

export default config
