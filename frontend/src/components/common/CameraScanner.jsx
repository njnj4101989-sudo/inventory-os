import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

const SCANNER_ID = 'camera-scanner-region'

export default function CameraScanner({ onScan, onClose }) {
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(true)
  const scannedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const scanner = new Html5Qrcode(SCANNER_ID, {
      useBarCodeDetectorIfSupported: true,
      formatsToSupport: [0],
    })

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10 },
        (decodedText) => {
          if (scannedRef.current) return
          scannedRef.current = true
          scanner.stop().catch(() => {})
          onScan(decodedText)
        },
        () => {}
      )
      .then(() => {
        if (!cancelled) setStarting(false)
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err?.message || String(err)
        if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
          setError('Camera permission denied. Please allow camera access and try again.')
        } else if (msg.includes('NotFoundError') || msg.includes('Requested device not found')) {
          setError('No camera found on this device.')
        } else if (msg.includes('NotReadableError') || msg.includes('Could not start video source')) {
          setError('Camera is in use by another app. Close other camera apps and try again.')
        } else {
          setError(msg)
        }
        setStarting(false)
      })

    return () => {
      cancelled = true
      if (scanner.isScanning) {
        scanner.stop().then(() => scanner.clear()).catch(() => {
          try { scanner.clear() } catch (_) {}
        })
      } else {
        try { scanner.clear() } catch (_) {}
      }
    }
  }, [onScan])

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Override html5-qrcode inline styles — must use !important to beat inline */}
      <style>{`
        #${SCANNER_ID} {
          overflow: hidden !important;
        }
        #${SCANNER_ID} video {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        #${SCANNER_ID} canvas {
          display: none !important;
        }
      `}</style>

      {/* Header — floats on top */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <span className="text-white font-semibold text-sm">Scan QR Code</span>
        <button onClick={onClose} className="text-white/80 active:text-white p-2 -mr-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scanner — fills entire viewport */}
      {!error && (
        <div id={SCANNER_ID} className="absolute inset-0" />
      )}

      {/* Our own scanning guide — CSS corners, no library dependency */}
      {!error && !starting && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          {/* Semi-transparent overlay with clear center cutout */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 120px, rgba(0,0,0,0.5) 140px)' }} />
          {/* Corner brackets */}
          <div className="relative" style={{ width: 240, height: 240 }}>
            {/* Top-left */}
            <div className="absolute top-0 left-0 w-10 h-10 border-t-3 border-l-3 border-white rounded-tl-lg" />
            {/* Top-right */}
            <div className="absolute top-0 right-0 w-10 h-10 border-t-3 border-r-3 border-white rounded-tr-lg" />
            {/* Bottom-left */}
            <div className="absolute bottom-0 left-0 w-10 h-10 border-b-3 border-l-3 border-white rounded-bl-lg" />
            {/* Bottom-right */}
            <div className="absolute bottom-0 right-0 w-10 h-10 border-b-3 border-r-3 border-white rounded-br-lg" />
          </div>
        </div>
      )}

      {/* Loading spinner */}
      {!error && starting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-white/80 text-sm">{error}</p>
          <button onClick={onClose} className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm">
            Close
          </button>
        </div>
      )}

      {/* Footer — floats on top */}
      {!error && (
        <div className="absolute bottom-0 left-0 right-0 z-20 py-5 text-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <p className="text-white/60 text-xs">Align QR code within the frame</p>
        </div>
      )}
    </div>
  )
}
