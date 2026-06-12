export class PerformanceMetrics {
  private timings: Record<string, number> = {}
  private measurements: Record<string, number> = {}
  private context: string

  constructor(context: string) {
    this.context = context
  }

  start(label: string) {
    this.timings[label] = performance.now()
  }

  end(label: string) {
    const start = this.timings[label]
    if (!start) return
    const duration = performance.now() - start
    this.measurements[label] = duration
    console.log(`[PERF][${this.context}] ${label}: ${Math.round(duration)}ms`)
    return duration
  }

  getMeasurements() {
    return this.measurements
  }

  getServerTimingHeader(): string {
    return Object.entries(this.measurements)
      .map(([key, value]) => `${key.toLowerCase().replace(/\s+/g, '')};dur=${Math.round(value)}`)
      .join(', ')
  }

  logPayloadSize(label: string, data: any) {
    try {
      const sizeBytes = Buffer.byteLength(JSON.stringify(data), 'utf8')
      const sizeKb = (sizeBytes / 1024).toFixed(2)
      console.log(`[PERF][${this.context}] Payload [${label}]: ${sizeKb}KB`)
      
      // Basic heuristic identification
      if (sizeBytes > 100 * 1024) {
        console.warn(`[PERF-WARN][${this.context}] Large payload detected (${sizeKb}KB). Consider reducing data.`)
      }
    } catch (e) {
      console.warn(`[PERF-WARN][${this.context}] Failed to measure payload size for ${label}`)
    }
  }

  logTotal() {
    console.log(`[PERF][${this.context}] Server-Timing Header: ${this.getServerTimingHeader()}`)
  }
}
