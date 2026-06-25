import crypto from 'crypto'

export class RequestLogger {
  private requestId: string
  private context: string
  private timings: Record<string, number> = {}
  private completedSteps: { name: string; duration: number }[] = []
  private requestStartTime: number
  
  public cacheHit: boolean | null = null
  public payloadBytes: number = 0

  constructor(context: string) {
    this.context = context.toUpperCase()
    this.requestId = crypto.randomUUID().slice(0, 8)
    this.requestStartTime = performance.now()
  }

  start(stepName: string) {
    this.timings[stepName] = performance.now()
  }

  end(stepName: string) {
    const startTime = this.timings[stepName]
    if (!startTime) return
    const duration = Math.round(performance.now() - startTime)
    this.completedSteps.push({ name: stepName, duration })
  }

  step(message: string) {
    if (message === 'CACHE HIT') this.cacheHit = true
    if (message === 'CACHE MISS') this.cacheHit = false
  }

  setPayload(data: any) {
    try {
      this.payloadBytes = Buffer.byteLength(JSON.stringify(data), 'utf8')
    } catch (error) {
      // ignore
    }
  }

  summary() {
    const totalDuration = Math.round(performance.now() - this.requestStartTime)
    
    const authMs = this.completedSteps.find(s => s.name === 'AUTH')?.duration ?? 0
    const redisGetMs = this.completedSteps.find(s => s.name === 'REDIS GET')?.duration ?? 0
    const redisSetMs = this.completedSteps.find(s => s.name === 'REDIS SET')?.duration ?? 0
    
    const dataMs = this.completedSteps
      .filter(s => s.name === 'FETCHFN' || s.name.startsWith('QUERY') || s.name.startsWith('RPC') || s.name.startsWith('Promise.all'))
      .reduce((sum, step) => sum + step.duration, 0)

    const log = {
      requestId: this.requestId,
      page: this.context,
      cacheHit: this.cacheHit,
      authMs,
      redisGetMs,
      redisSetMs,
      dataMs,
      payloadKb: this.payloadBytes ? parseFloat((this.payloadBytes / 1024).toFixed(2)) : 0,
      totalMs: totalDuration,
      timestamp: new Date().toISOString()
    }

    // Log summary as error to bypass Vercel filters in production, use log in dev
    if (process.env.NODE_ENV === 'production') {
      console.error(JSON.stringify(log))
    } else {
      console.log(JSON.stringify(log))
    }
  }

  error(message: string, error: any) {
    console.error(JSON.stringify({
      requestId: this.requestId,
      page: this.context,
      level: 'ERROR',
      message: error instanceof Error ? error.message : String(error),
      stack: process.env.NODE_ENV === 'production' ? undefined : (error instanceof Error ? error.stack : undefined),
      timestamp: new Date().toISOString()
    }))
  }
}
