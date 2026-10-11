import base from './base.js'

const DB_PATHS = [
  { name: '@one/db', message: 'Frontends must call the API, never the database.' },
  { name: '@prisma/client', message: 'Frontends must call the API, never the database.' },
]

export default [
  ...base,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { paths: DB_PATHS }] },
  },
]
