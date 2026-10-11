import { z } from 'zod'

// Query values arrive as strings, hence coerce. The 50 ceiling is a hard
// contract limit, not a default to be raised per endpoint.
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type PaginationQuery = z.infer<typeof paginationQuery>

export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(50),
  })
}

export type Paginated<T> = { items: T[]; total: number; page: number; limit: number }
