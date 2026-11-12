export interface Config {
  port: number
  host: string
  ingestUrl: string
  ingestSecret: string
  tzMinutes: number
  logLevel: string
}

// Fails fast: a server that cannot forward must not start and silently answer OK to devices.
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const ingestUrl = env.APP_INGEST_URL?.trim()
  const ingestSecret = env.ADMS_INGEST_SECRET?.trim()
  if (!ingestUrl) throw new Error('APP_INGEST_URL is required')
  if (!ingestSecret) throw new Error('ADMS_INGEST_SECRET is required')
  const tzMinutes = Number(env.DEVICE_TZ_MINUTES?.trim() || 330)
  if (!Number.isInteger(tzMinutes) || tzMinutes < -720 || tzMinutes > 840) {
    throw new Error('DEVICE_TZ_MINUTES must be an integer between -720 and 840')
  }
  const port = Number(env.PORT?.trim() || 8081)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid')
  return {
    port,
    host: env.HOST?.trim() || '0.0.0.0',
    ingestUrl,
    ingestSecret,
    tzMinutes,
    logLevel: env.LOG_LEVEL?.trim() || 'info',
  }
}
