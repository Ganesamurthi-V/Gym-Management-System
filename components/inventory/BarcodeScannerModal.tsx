'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Camera, Flashlight, FlashlightOff } from 'lucide-react'

interface BarcodeScannerModalProps {
  onScan: (decodedText: string) => void
  onClose: () => void
}

/* ------------------------------------------------------------------ */
/*  High-accuracy confidence filter                                    */
/*  Calculates average error across decoded segments and rejects       */
/*  anything above threshold — the main trick for reliable scanning.   */
/* ------------------------------------------------------------------ */
function isHighConfidence(result: any): boolean {
  const codes = result?.codeResult?.decodedCodes
  if (!codes || codes.length === 0) return false

  const errors = codes
    .filter((c: any) => typeof c.error === 'number')
    .map((c: any) => c.error)

  if (errors.length === 0) return false

  const avgError = errors.reduce((s: number, e: number) => s + e, 0) / errors.length
  return avgError < 0.12
}

export default function BarcodeScannerModal({ onScan, onClose }: BarcodeScannerModalProps) {
  const scannerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [lastDetected, setLastDetected] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const quaggaRef = useRef<any>(null)
  const confirmedRef = useRef(false)

  // Track consecutive identical reads for multi-match confirmation
  const matchBuffer = useRef<{ code: string; count: number }>({ code: '', count: 0 })
  const REQUIRED_MATCHES = 3

  const handleClose = useCallback(() => {
    if (quaggaRef.current) {
      try { quaggaRef.current.stop() } catch {}
    }
    onClose()
  }, [onClose])

  const toggleTorch = useCallback(async () => {
    try {
      const track = document.querySelector('#quagga-scanner video')
      if (!track) return
      const videoEl = track as HTMLVideoElement
      const stream = videoEl.srcObject as MediaStream
      if (!stream) return
      const videoTrack = stream.getVideoTracks()[0]
      if (!videoTrack) return

      const newState = !torchOn
      await (videoTrack as any).applyConstraints({
        advanced: [{ torch: newState } as any]
      })
      setTorchOn(newState)
    } catch {}
  }, [torchOn])

  useEffect(() => {
    let isMounted = true

    const initQuagga = async () => {
      try {
        // Dynamic import — QuaggaJS is browser-only
        const Quagga = (await import('quagga')).default
        quaggaRef.current = Quagga

        if (!scannerRef.current || !isMounted) return

        Quagga.init(
          {
            inputStream: {
              name: 'Live',
              type: 'LiveStream',
              target: scannerRef.current,
              constraints: {
                facingMode: 'environment',
                width: { min: 640, ideal: 1280, max: 1920 },
                height: { min: 480, ideal: 720, max: 1080 },
              },
            },
            locator: {
              patchSize: 'medium',   // medium = best balance accuracy/speed
              halfSample: false,     // full resolution for the locator — slower but much more accurate
            },
            numOfWorkers: navigator.hardwareConcurrency
              ? Math.min(navigator.hardwareConcurrency, 4)
              : 2,
            frequency: 10,
            decoder: {
              readers: [
                'ean_reader',
                'ean_8_reader',
                'code_128_reader',
                'code_39_reader',
                'upc_reader',
                'upc_e_reader',
                'codabar_reader',
                'i2of5_reader',
                'code_93_reader',
              ],
              multiple: false,
            },
            locate: true,
          },
          (err: any) => {
            if (err) {
              console.error('Quagga init error:', err)
              if (isMounted) setError('Failed to access camera. Please allow camera permissions.')
              return
            }

            if (!isMounted) return
            Quagga.start()

            // Check torch capability
            try {
              const videoTrack = Quagga.CameraAccess.getActiveTrack()
              if (videoTrack) {
                const capabilities = (videoTrack as any).getCapabilities?.()
                if (capabilities?.torch) {
                  setHasTorch(true)
                }
              }
            } catch {}
          }
        )

        // Visual feedback on every frame where a barcode region is located
        Quagga.onProcessed((result: any) => {
          if (!isMounted) return

          const drawingCanvas = Quagga.canvas?.dom?.overlay
          const drawingCtx = Quagga.canvas?.ctx?.overlay

          if (!drawingCanvas || !drawingCtx) return

          // Clear previous drawings
          drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height)

          if (result) {
            // Draw located barcode boxes
            if (result.boxes && result.boxes.length > 0) {
              result.boxes.forEach((box: any) => {
                drawingCtx.strokeStyle = 'rgba(99, 102, 241, 0.5)'
                drawingCtx.lineWidth = 2
                Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, { color: 'rgba(99, 102, 241, 0.5)', lineWidth: 2 })
              })
            }

            // Draw the decoded barcode line in green
            if (result.box) {
              Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, { color: 'rgba(16, 185, 129, 0.8)', lineWidth: 3 })
            }

            // Draw scan line
            if (result.codeResult && result.line) {
              Quagga.ImageDebug.drawPath(result.line, { x: 'x', y: 'y' }, drawingCtx, { color: 'rgba(239, 68, 68, 0.9)', lineWidth: 3 })
            }
          }
        })

        // Barcode detected — apply confidence filter + multi-match gate
        Quagga.onDetected((result: any) => {
          if (!isMounted || confirmedRef.current) return

          // Reject low-confidence reads
          if (!isHighConfidence(result)) return

          const code = result.codeResult?.code
          if (!code) return

          setIsDetecting(true)
          setLastDetected(code)

          // Multi-match confirmation
          if (matchBuffer.current.code === code) {
            matchBuffer.current.count++
          } else {
            matchBuffer.current = { code, count: 1 }
          }

          if (matchBuffer.current.count >= REQUIRED_MATCHES) {
            confirmedRef.current = true
            try { Quagga.stop() } catch {}
            onScan(code)
          }
        })
      } catch (err: any) {
        console.error('Scanner init error:', err)
        if (isMounted) {
          setError(err?.message?.includes('getUserMedia')
            ? 'Camera access requires HTTPS or localhost.'
            : 'Failed to initialize barcode scanner.')
        }
      }
    }

    initQuagga()

    return () => {
      isMounted = false
      if (quaggaRef.current) {
        try {
          quaggaRef.current.offDetected()
          quaggaRef.current.offProcessed()
          quaggaRef.current.stop()
        } catch {}
      }
    }
  }, [onScan])

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Scan Barcode</h3>
            <p className="text-xs text-slate-500">Position the barcode inside the frame</p>
          </div>
          <div className="flex items-center gap-2">
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                  torchOn
                    ? 'bg-amber-100 text-amber-600'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                }`}
              >
                {torchOn
                  ? <Flashlight className="w-4 h-4" />
                  : <FlashlightOff className="w-4 h-4" />
                }
              </button>
            )}
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scanner viewport */}
        <div className="p-4 flex-1 flex flex-col items-center justify-center min-h-[300px] bg-slate-50 relative">
          <div className="w-full max-w-[300px] rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-black min-h-[250px] flex items-center justify-center relative">
            {/* QuaggaJS mounts its video + canvas here */}
            <div
              ref={scannerRef}
              id="quagga-scanner"
              className="absolute inset-0 w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:w-full [&>canvas]:h-full"
            />

            {/* Overlay framing lines */}
            <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center">
              <div className={`w-3/4 h-32 border-2 rounded-lg relative transition-colors duration-200 ${isDetecting ? 'border-green-500/50' : 'border-red-500/50'}`}>
                <div className={`absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 transition-colors duration-200 ${isDetecting ? 'border-green-500' : 'border-red-500'}`}></div>
                <div className={`absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 transition-colors duration-200 ${isDetecting ? 'border-green-500' : 'border-red-500'}`}></div>
                <div className={`absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 transition-colors duration-200 ${isDetecting ? 'border-green-500' : 'border-red-500'}`}></div>
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 transition-colors duration-200 ${isDetecting ? 'border-green-500' : 'border-red-500'}`}></div>
              </div>
              {isDetecting && (
                <div className="mt-3 flex flex-col items-center gap-1">
                  <div className="bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full animate-pulse">
                    Hold steady...
                  </div>
                  {lastDetected && (
                    <div className="bg-emerald-600/90 text-white text-[10px] font-mono font-bold px-2 py-1 rounded-md">
                      {lastDetected}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Loading state */}
            {!error && (
              <div className="text-slate-400 flex flex-col items-center gap-2 z-0">
                <Camera className="w-8 h-8 animate-pulse" />
                <span className="text-xs font-medium">Initializing camera...</span>
              </div>
            )}
          </div>

          {/* Scan accuracy indicator */}
          {isDetecting && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <div className="flex gap-0.5">
                {[...Array(REQUIRED_MATCHES)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors duration-150 ${
                      i < matchBuffer.current.count ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
              <span className="font-medium">Confirming scan...</span>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-3">
                <X className="w-6 h-6" />
              </div>
              <p className="text-sm text-red-600 font-semibold">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null

  return createPortal(modalContent, document.body)
}
