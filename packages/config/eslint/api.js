import base from './base.js'

// Enforcement of the architectural rules R1-R6 from docs/decisions/0008.
//
// `no-restricted-imports` may appear only once per file group (a later block
// replaces an earlier one), so each group below carries its complete rule.
//
// Within a module, siblings are imported as './x.service.js'. Any import
// beginning '../' therefore crosses a module boundary, which is what makes
// these path patterns sufficient to express R4.

const DB = { name: '@one/db', message: 'R1/R3: only *.repository.ts may import @one/db.' }
const PRISMA = {
  name: '@prisma/client',
  message: 'R3: import the client through @one/db inside a repository.',
}
const EXPRESS = { name: 'express', message: 'R2: this layer must not know about HTTP.' }

const ANY_REPOSITORY = {
  group: ['./*.repository*', '../*/*.repository*'],
  message: 'R1: routes must not reach the database; call your module service.',
}
const FOREIGN_REPOSITORY = {
  group: ['../*/*.repository*'],
  message: "R4: go through the other module's service, not its repository.",
}
const FOREIGN_SERVICE = {
  group: ['../*/*.service*'],
  message: "R4: a route may only call its own module's service.",
}
const FOREIGN_MODULE = {
  group: ['../*/*'],
  message: 'R4: a repository must not reach into another module.',
}

export default [
  ...base,

  // R1: route files — no database, no foreign module internals.
  {
    files: ['src/modules/*/*.routes.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [DB, PRISMA], patterns: [ANY_REPOSITORY, FOREIGN_REPOSITORY, FOREIGN_SERVICE] },
      ],
    },
  },

  // R2 + R3 + R4: service files — HTTP-agnostic, no database, no foreign repositories.
  {
    files: ['src/modules/*/*.service.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [DB, PRISMA, EXPRESS], patterns: [FOREIGN_REPOSITORY] },
      ],
    },
  },

  // R3: repository files — the only layer allowed to import @one/db, and it
  // must not reach into another module at all.
  {
    files: ['src/modules/*/*.repository.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: [PRISMA, EXPRESS], patterns: [FOREIGN_MODULE] }],
    },
  },

  // R1: everything outside a module (middleware, lib, config, server) is also
  // barred from the database.
  {
    files: [
      'src/middleware/*.ts',
      'src/lib/*.ts',
      'src/config/*.ts',
      'src/server.ts',
      'src/index.ts',
    ],
    rules: { 'no-restricted-imports': ['error', { paths: [DB, PRISMA] }] },
  },

  // R6: only errorHandler turns an error into a 5xx response.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/middleware/errorHandler.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='status'] > Literal[value>=500][value<600]",
          message: 'R6: throw an AppError; errorHandler maps it to HTTP.',
        },
      ],
    },
  },

  // Tests legitimately reach past these boundaries to arrange state.
  {
    files: ['**/*.test.ts', 'test/**/*.ts', 'vitest.config.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
]
