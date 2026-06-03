'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, Camera } from 'lucide-react'
import { readBarcodesFromImageData } from 'zxing-wasm/reader'

interface BarcodeScannerModalProps {
  onScan: (decodedText: string) => void
  onClose: () => void
}

export default function BarcodeScannerModal({ onScan, onClose }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const isDetectingRef = useRef(false)

  useEffect(() => {
    let isMounted = true;
    const videoElement = videoRef.current;
    
    let lastScan = '';
    let scanCount = 0;
    let scanTimeout: NodeJS.Timeout | null = null;
    let rafId: number;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setError("Camera access requires HTTPS or localhost.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });

        if (videoElement) {
          videoElement.srcObject = stream;
          videoElement.setAttribute('playsinline', 'true');
          videoElement.play();
          rafId = requestAnimationFrame(tick);
        }
      } catch (err: any) {
        console.error("Camera error:", err);
        setError("Failed to access camera. Please allow camera permissions.");
      }
    };

    const tick = async () => {
      if (!isMounted) return;
      
      const canvasElement = canvasRef.current;
      if (videoElement && videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && canvasElement) {
        const width = videoElement.videoWidth;
        const height = videoElement.videoHeight;
        canvasElement.width = width;
        canvasElement.height = height;
        const ctx = canvasElement.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(videoElement, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          
          try {
            const results = await readBarcodesFromImageData(imageData, {
              tryHarder: true,
              formats: ["EAN13", "EAN8", "Code128", "Code39", "UPCA", "UPCE", "QRCode", "DataMatrix"],
            });
            
            if (results && results.length > 0) {
              if (!isDetectingRef.current) {
                isDetectingRef.current = true;
                setIsDetecting(true);
              }
              
              const text = results[0].text;
              if (text === lastScan) {
                scanCount++;
                if (scanCount >= 2) {
                  isMounted = false; // Prevent further triggers immediately
                  onScan(text);
                  return;
                }
              } else {
                lastScan = text;
                scanCount = 1;
              }
              
              // Clear previous timeout and set a new one to reset detecting state if lost
              if (scanTimeout) clearTimeout(scanTimeout);
              scanTimeout = setTimeout(() => {
                if (isMounted) {
                  isDetectingRef.current = false;
                  setIsDetecting(false);
                }
              }, 500);
            }
          } catch (err) {
            // readBarcodesFromImageData throws if it fails to load wasm or decode, 
            // but we ignore decode errors to keep polling.
          }
        }
      }
      
      if (isMounted) {
        rafId = requestAnimationFrame(tick);
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (scanTimeout) clearTimeout(scanTimeout);
      
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
      }
    }
  }, [onScan])

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Scan Barcode</h3>
            <p className="text-xs text-slate-500">Position the barcode inside the frame</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 flex-1 flex flex-col items-center justify-center min-h-[300px] bg-slate-50 relative">
          <div className="w-full max-w-[300px] rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-black min-h-[250px] flex items-center justify-center relative">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Overlay framing lines */}
            <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center">
               <div className={`w-3/4 h-32 border-2 rounded-lg relative transition-colors duration-200 ${isDetecting ? 'border-green-500/50' : 'border-red-500/50'}`}>
                 <div className={`absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 transition-colors duration-200 ${isDetecting ? 'border-green-500' : 'border-red-500'}`}></div>
                 <div className={`absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 transition-colors duration-200 ${isDetecting ? 'border-green-500' : 'border-red-500'}`}></div>
                 <div className={`absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 transition-colors duration-200 ${isDetecting ? 'border-green-500' : 'border-red-500'}`}></div>
                 <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 transition-colors duration-200 ${isDetecting ? 'border-green-500' : 'border-red-500'}`}></div>
               </div>
               {isDetecting && (
                 <div className="mt-4 bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full animate-pulse">
                   Hold steady...
                 </div>
               )}
            </div>

            {/* Fallback UI while camera is loading or if it fails */}
            {!error && (
              <div className="text-slate-400 flex flex-col items-center gap-2 z-0">
                <Camera className="w-8 h-8 animate-pulse" />
                <span className="text-xs font-medium">Align it center...</span>
              </div>
            )}
          </div>
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
