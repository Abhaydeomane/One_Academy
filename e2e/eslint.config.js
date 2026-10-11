import base from '@one/config/eslint/base'

export default [
  ...base,
  { ignores: ['test-results/**', 'playwright-report/**'] },
  { rules: { 'no-console': 'off' } },
]
