import { z } from 'zod'

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid timestamp').optional(),
  kind: z.enum(['all', 'app_open', 'page_view', 'action']).default('all'),
})
