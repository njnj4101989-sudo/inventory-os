import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

const SCANNER_ID = 'camera-scanner-region'

export default function CameraScanner({ onScan, onClose }) {
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(true)
  const scannerRef = useRef(null)
  const scannedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const scanner = new Html5Qrcode(SCANNER_ID, {
      useBarCodeDetectorIfSupported: true,
      formatsToSupport: [0], // QR_CODE = 0
    })
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decodedText) => {
          if (scannedRef.current) return
          scannedRef.current = true
          scanner.stop().catch(() => {})
          onScan(decodedText)
        },
        () => {
          // ignore per-frame decode failures (expected when no QR in view)
        }
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
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ background: 'rgba(0,0,0,0.9)' }}>
        <span className="text-white font-semibold text-sm">Scan QR Code</span>
        <button onClick={onClose} className="text-white/80 active:text-white p-2 -mr-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Camera */}
      <div className="flex-1 relative overflow-hidden">
        {!error && (
          <div
            id={SCANNER_ID}
            style={{ width: '100%', height: '100%' }}
          />
        )}

        {!error && starting && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}

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
      </div>

      {/* Footer */}
      {!error && (
        <div className="shrink-0 py-5 text-center" style={{ background: 'rgba(0,0,0,0.9)' }}>
          <p className="text-white/60 text-xs">Align QR code within the frame</p>
        </div>
      )}
    </div>
  )
}
