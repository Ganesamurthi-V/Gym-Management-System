import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiSuccess } from '@/lib/api/withAuth'
import { apiLogger } from '@/lib/logger'
import { ackCommands } from '@/lib/devices/commands'
import { authenticateDeviceRequest, serialSchema } from '@/lib/devices/routeAuth'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  serial: serialSchema,
  results: z.array(z.object({ id: z.number().int(), ret: z.number().int() })).max(50),
})

/**
 * POST /api/devices/commands/ack
 *
 * The Worker reports what the device answered for each command (ret >= 0 success). Only commands of the
 * device identified by the serial can change; unknown ids are ignored.
 */
export async function POST(req: NextRequest) {
  const log = apiLogger('DEVICE_COMMANDS_ACK')
  const auth = await authenticateDeviceRequest(req, 'DEVICE_COMMANDS_ACK', bodySchema)
  if (auth.res) return auth.res
  if (auth.unknown) return apiSuccess({ updated: 0 })

  try {
    const { updated } = await ackCommands(auth.db, auth.device.id, auth.body.results)
    return apiSuccess({ updated })
  } catch (err) {
    log.error('device command ack failed', err)
    return apiError(500, 'DATABASE_ERROR', 'Database error')
  }
}
