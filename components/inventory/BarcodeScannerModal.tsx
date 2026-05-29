'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, Camera } from 'lucide-react'
import { BrowserMultiFormatReader, NotFoundException, DecodeHintType, BarcodeFormat } from '@zxing/library'

interface BarcodeScannerModalProps {
  onScan: (decodedText: string) => void
  onClose: () => void
}

export default function BarcodeScannerModal({ onScan, onClose }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const isDetectingRef = useRef(false)

  useEffect(() => {
    let isMounted = true;
    const videoElement = videoRef.current; // Capture ref for reliable cleanup
    
    // Add hints to improve accuracy but include QR code for testing
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX
    ]);
    // Removed TRY_HARDER because it can cause severe lag on some devices
    
    let lastScan = '';
    let scanCount = 0;
    const codeReader = new BrowserMultiFormatReader(hints);

    const requestCameraPermission = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        throw new Error("SECURE_CONTEXT_REQUIRED");
      }
      try {
        if (navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          stream.getTracks().forEach(track => track.stop());
        }
      } catch (err) {
        console.warn("Permission request error:", err);
      }
      return codeReader.listVideoInputDevices();
    };

    requestCameraPermission().then((videoInputDevices) => {
      if (!isMounted) return;
      
      if (videoInputDevices.length === 0) {
        setError("No camera found on this device.");
        return;
      }
      
      let selectedDeviceId = videoInputDevices[0].deviceId;
      // Try to prioritize the back/environment camera
      const backCamera = videoInputDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
      if (backCamera) {
        selectedDeviceId = backCamera.deviceId;
      }

      if (videoElement) {
        codeReader.decodeFromVideoDevice(selectedDeviceId, videoElement, (result, err) => {
          if (result && isMounted) {
            if (!isDetectingRef.current) {
              isDetectingRef.current = true;
              setIsDetecting(true);
            }
            const text = result.getText();
            if (text === lastScan) {
              scanCount++;
              if (scanCount >= 2) {
                isMounted = false; // Prevent further triggers immediately
                onScan(text);
              }
            } else {
              lastScan = text;
              scanCount = 1;
            }
          }
          if (err) {
            if (err instanceof NotFoundException) {
              if (isDetectingRef.current) {
                isDetectingRef.current = false;
                setIsDetecting(false);
              }
            } else {
              console.error(err);
            }
          }
        }).catch((err: any) => {
          console.error("Camera start error:", err);
          setError("Failed to access camera. Please allow camera permissions in your browser settings.");
        });
      }
    }).catch((err: any) => {
      console.error("List devices error:", err);
      if (err.message === "SECURE_CONTEXT_REQUIRED") {
        setError("Camera access requires HTTPS or localhost.");
      } else {
        setError("Failed to access camera. Please allow camera permissions in your browser settings.");
      }
    });

    return () => {
      isMounted = false;
      codeReader.reset();
      
      // Ensure camera light turns off by stopping tracks manually using the captured element
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          track.stop();
        });
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
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
            
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

  // Only render on client to avoid hydration mismatch
  if (typeof document === 'undefined') return null

  return createPortal(modalContent, document.body)
}
