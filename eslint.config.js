import base from './packages/config/eslint/base.js'

export default [
  ...base,
  // Workspaces lint themselves with their own eslint.config.js; the root config
  // covers only root-level scripts and configuration files.
  { ignores: ['apps/**', 'packages/**', 'e2e/**'] },
]
