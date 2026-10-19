import next from '@one/config/eslint/next'

export default [...next, { ignores: ['.next/**', '.next-e2e-cached/**', 'next-env.d.ts'] }]
