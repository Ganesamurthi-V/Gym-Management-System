declare module 'quagga' {
  interface QuaggaConfig {
    inputStream?: {
      name?: string
      type?: 'LiveStream' | 'ImageStream' | 'VideoStream'
      target?: HTMLElement | string
      constraints?: MediaTrackConstraints
      area?: { top?: string; right?: string; left?: string; bottom?: string }
      singleChannel?: boolean
    }
    locator?: {
      patchSize?: 'x-small' | 'small' | 'medium' | 'large' | 'x-large'
      halfSample?: boolean
    }
    numOfWorkers?: number
    frequency?: number
    decoder?: {
      readers?: string[]
      multiple?: boolean
    }
    locate?: boolean
    debug?: boolean | { drawBoundingBox?: boolean; showFrequency?: boolean; drawScanline?: boolean; showPattern?: boolean }
  }

  interface CodeResult {
    code: string
    format: string
    start: number
    end: number
    codeset: number
    startInfo: { error: number; code: number; start: number; end: number }
    decodedCodes: Array<{ error?: number; code: number; start: number; end: number }>
    endInfo: { error: number; code: number; start: number; end: number }
    direction: number
  }

  interface QuaggaResult {
    codeResult: CodeResult
    line: Array<{ x: number; y: number }>
    angle: number
    pattern: number[]
    box: number[][]
    boxes: number[][][]
  }

  interface QuaggaStatic {
    init(config: QuaggaConfig, callback?: (err: any) => void): void
    start(): void
    stop(): void
    onDetected(callback: (result: QuaggaResult) => void): void
    offDetected(callback?: (result: QuaggaResult) => void): void
    onProcessed(callback: (result: any) => void): void
    offProcessed(callback?: (result: any) => void): void
    decodeSingle(config: QuaggaConfig, callback?: (result: QuaggaResult) => void): void
    canvas: {
      dom: { overlay: HTMLCanvasElement; image: HTMLCanvasElement }
      ctx: { overlay: CanvasRenderingContext2D; image: CanvasRenderingContext2D }
    }
    CameraAccess: {
      getActiveTrack(): MediaStreamTrack | null
      release(): void
    }
    ImageDebug: {
      drawPath(path: any, def: any, ctx: CanvasRenderingContext2D, style: any): void
    }
  }

  const Quagga: QuaggaStatic
  export default Quagga
}
