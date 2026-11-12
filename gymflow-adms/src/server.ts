import { buildApp } from './app.js'
import { loadConfig, type Config } from './config.js'

let config: Config
try {
  config = loadConfig(process.env)
} catch (err) {
  console.error((err as Error).message)
  process.exit(1)
}

const app = buildApp(config)
app.listen({ port: config.port, host: config.host, listenTextResolver: () => 'listening' }).catch((err) => {
  app.log.error({ code: (err as NodeJS.ErrnoException).code }, 'listen failed')
  process.exit(1)
})
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void app.close().then(() => process.exit(0)))
