import crypto from 'crypto'

export class RequestLogger {
  private requestId: string
  private context: string
  private timings: Record<string, number> = {}
  private completedSteps: { name: string; duration: number }[] = []
  private requestStartTime: number

  constructor(context: string) {
    this.context = context.toUpperCase()
    this.requestId = crypto.randomUUID().slice(0, 8)
    this.requestStartTime = performance.now()
    console.error(`[${this.context}][${this.requestId}] START`)
  }

  start(stepName: string) {
    this.timings[stepName] = performance.now()
    console.error(`[${this.context}][${this.requestId}] ${stepName} START`)
  }

  end(stepName: string) {
    const startTime = this.timings[stepName]
    if (!startTime) {
      console.error(`[${this.context}][${this.requestId}] ${stepName} END (Unknown ms)`)
      return
    }
    const duration = Math.round(performance.now() - startTime)
    this.completedSteps.push({ name: stepName, duration })
    console.error(`[${this.context}][${this.requestId}] ${stepName} END (${duration}ms)`)
  }

  step(message: string) {
    console.error(`[${this.context}][${this.requestId}] ${message}`)
  }

  summary() {
    const totalDuration = Math.round(performance.now() - this.requestStartTime)
    console.error(`\n[${this.context}][${this.requestId}] SUMMARY`)
    this.completedSteps.forEach((step) => {
      console.error(`${step.name}: ${step.duration}ms`)
    })
    console.error(`Total: ${totalDuration}ms\n`)
  }

  error(message: string, error: any) {
    console.error(`[${this.context}][${this.requestId}] ${message}`)
    if (error instanceof Error) {
      console.error(`Message: ${error.message}`)
      console.error(`Stack: ${error.stack}`)
    } else {
      console.error(`Details:`, error)
    }
  }
}
