'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Camera, CheckCircle2, XCircle, Loader2, QrCode, Trash2 } from 'lucide-react'
import { parseUPIQRCode } from '@/lib/upi'
import type { UPIParsedData } from '@/lib/upi'
import { saveUPIConfig, deleteUPIConfig } from '@/app/account/upi-actions'
import type { UPIConfig } from '@/app/account/upi-actions'

interface Props {
  /** Pre-loaded config (null if not set up yet) */
  initialConfig: UPIConfig | null
  /** Callback after successful save/delete */
  onConfigChange?: (config: UPIConfig | null) => void
}

type Status = 'idle' | 'scanning' | 'parsed' | 'saved' | 'error'

/**
 * UPI QR Setup component.
 *
 * Allows the gym owner to:
 *  1. Upload an image of their merchant UPI QR code, OR
 *  2. Scan using the device camera
 *
 * The QR is decoded client-side using jsQR, then parsed via parseUPIQRCode().
 * Only normalized merchant data is stored in the database.
 */
export default function UPIQRSetup({ initialConfig, onConfigChange }: Props) {
  const [status, setStatus] = useState<Status>(initialConfig ? 'saved' : 'idle')
  const [parsed, setParsed] = useState<UPIParsedData | null>(null)
  const [error, setError] = useState('')
  const [config, setConfig] = useState<UPIConfig | null>(initialConfig)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  function stopCamera() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  // ── Decode QR from ImageData using jsQR ──────────────────────────────────
  async function decodeQRFromImageData(imageData: ImageData): Promise<string | null> {
    const jsQR = (await import('jsqr')).default
    const result = jsQR(imageData.data, imageData.width, imageData.height)
    return result?.data ?? null
  }

  // ── Handle file upload ───────────────────────────────────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('scanning')
    setError('')
    setParsed(null)

    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      const decoded = await decodeQRFromImageData(imageData)
      if (!decoded) {
        setError('Could not detect a QR code in the image. Please try a clearer image.')
        setStatus('error')
        return
      }

      processDecodedString(decoded)
    } catch (err) {
      setError('Failed to process the image. Please try another file.')
      setStatus('error')
    }

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Handle camera scan ───────────────────────────────────────────────────
  async function startCamera() {
    setStatus('scanning')
    setError('')
    setParsed(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        scanFrame()
      }
    } catch {
      setError('Camera access denied or not available.')
      setStatus('error')
    }
  }

  function scanFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanFrame)
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // Async decode
    decodeQRFromImageData(imageData).then(decoded => {
      if (decoded) {
        stopCamera()
        processDecodedString(decoded)
      } else {
        animFrameRef.current = requestAnimationFrame(scanFrame)
      }
    })
  }

  // ── Process decoded QR string ────────────────────────────────────────────
  function processDecodedString(decoded: string) {
    const result = parseUPIQRCode(decoded)
    if (!result.success) {
      setError(result.error)
      setStatus('error')
      return
    }
    setParsed(result.data)
    setStatus('parsed')
  }

  // ── Save parsed config ───────────────────────────────────────────────────
  async function handleSave() {
    if (!parsed) return
    setSaving(true)

    const result = await saveUPIConfig({
      upiId: parsed.upiId,
      merchantName: parsed.merchantName,
      merchantCode: parsed.merchantCode,
      currency: parsed.currency,
      rawParams: parsed.rawParams,
    })

    if (!result.success) {
      setError(result.error ?? 'Failed to save')
      setSaving(false)
      setStatus('error')
      return
    }

    setSaving(false)
    setStatus('saved')
    const newConfig = {
      id: '',
      gym_id: '',
      upi_id: parsed.upiId,
      merchant_name: parsed.merchantName,
      merchant_code: parsed.merchantCode,
      currency: parsed.currency,
      raw_params: parsed.rawParams,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as UPIConfig
    setConfig(newConfig)
    onConfigChange?.(newConfig)
  }

  // ── Delete config ────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!confirm('Remove your UPI payment setup? Members will no longer be able to pay via generated QR code.')) return
    setDeleting(true)
    const result = await deleteUPIConfig()
    setDeleting(false)
    if (result.success) {
      setConfig(null)
      setParsed(null)
      setStatus('idle')
      onConfigChange?.(null)
    }
  }

  // ── Render: Saved state ──────────────────────────────────────────────────
  if (status === 'saved' || (status === 'idle' && config)) {
    const displayConfig = config
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-800">UPI Payment Configured</p>
            <p className="text-xs text-emerald-700 mt-0.5 truncate">
              {displayConfig?.merchant_name} &middot; {displayConfig?.upi_id}
            </p>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            title="Remove UPI config"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => { setStatus('idle'); setConfig(null); setParsed(null) }}
          className="text-xs font-semibold text-brand-600 hover:underline"
        >
          Re-scan / Upload new QR
        </button>
      </div>
    )
  }

  // ── Render: Parsed preview ───────────────────────────────────────────────
  if (status === 'parsed' && parsed) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-brand-50 border border-brand-200 rounded-xl space-y-2">
          <p className="text-xs font-bold text-brand-700 uppercase tracking-wide">Detected Merchant</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">UPI ID</p>
              <p className="font-bold text-slate-900 break-all">{parsed.upiId}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Name</p>
              <p className="font-bold text-slate-900">{parsed.merchantName || '(not set)'}</p>
            </div>
            {parsed.merchantCode && (
              <div>
                <p className="text-xs text-slate-500">Merchant Code</p>
                <p className="font-bold text-slate-900">{parsed.merchantCode}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500">Currency</p>
              <p className="font-bold text-slate-900">{parsed.currency}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Confirm & Save
          </button>
          <button
            onClick={() => { setStatus('idle'); setParsed(null); setError('') }}
            className="px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Render: Scanning with camera ─────────────────────────────────────────
  if (status === 'scanning' && streamRef.current) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-black aspect-[4/3]">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-white/60 rounded-2xl" />
          </div>
          <div className="absolute bottom-3 left-0 right-0 text-center">
            <span className="text-xs font-bold text-white/80 bg-black/50 px-3 py-1 rounded-full">
              Point camera at UPI QR code
            </span>
          </div>
        </div>
        <button
          onClick={() => { stopCamera(); setStatus('idle') }}
          className="w-full py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  // ── Render: Default (idle / error) ───────────────────────────────────────
  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {status === 'scanning' && !streamRef.current && (
        <div className="flex items-center justify-center gap-2 p-6 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Processing...</span>
        </div>
      )}

      <p className="text-sm text-slate-600 font-medium">
        Upload your merchant UPI QR code image or scan it with your camera. We'll extract your UPI ID automatically.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-2 p-5 bg-white border-2 border-dashed border-slate-200 rounded-xl hover:border-brand-400 hover:bg-brand-50/30 transition-all group"
        >
          <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center group-hover:bg-brand-100 transition-colors">
            <Upload className="w-5 h-5 text-brand-600" />
          </div>
          <span className="text-sm font-bold text-slate-700">Upload Image</span>
          <span className="text-[10px] text-slate-400">JPG, PNG</span>
        </button>

        <button
          onClick={startCamera}
          className="flex flex-col items-center gap-2 p-5 bg-white border-2 border-dashed border-slate-200 rounded-xl hover:border-brand-400 hover:bg-brand-50/30 transition-all group"
        >
          <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center group-hover:bg-brand-100 transition-colors">
            <Camera className="w-5 h-5 text-brand-600" />
          </div>
          <span className="text-sm font-bold text-slate-700">Scan with Camera</span>
          <span className="text-[10px] text-slate-400">Use device camera</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Hidden elements for camera scanning */}
      <video ref={videoRef} className="hidden" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
