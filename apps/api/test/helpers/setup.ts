process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??=
  'postgresql://one_academy:local_dev_only@localhost:5432/one_academy_test'
