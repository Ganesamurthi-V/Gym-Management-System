import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiSuccess } from '@/lib/api/withAuth'
import { apiLogger } from '@/lib/logger'
import { claimNextCommands } from '@/lib/devices/commands'
import { authenticateDeviceRequest, serialSchema } from '@/lib/devices/routeAuth'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ serial: serialSchema })

/**
 * POST /api/devices/commands/next
 *
 * Called by the device-facing Worker on each device poll, authenticated by the same shared bearer secret as
 * /api/devices/punches. Hands out up to 5 queued commands. The gym comes only from the serial.
 */
export async function POST(req: NextRequest) {
  const log = apiLogger('DEVICE_COMMANDS_NEXT')
  const auth = await authenticateDeviceRequest(req, 'DEVICE_COMMANDS_NEXT', bodySchema)
  if (auth.res) return auth.res
  if (auth.unknown) return apiSuccess({ known: false, commands: [] })

  try {
    const commands = await claimNextCommands(auth.db, auth.device.id, auth.device.commandDialect)
    return apiSuccess({ known: true, commands })
  } catch (err) {
    log.error('device command claim failed', err)
    return apiError(500, 'DATABASE_ERROR', 'Database error')
  }
}
