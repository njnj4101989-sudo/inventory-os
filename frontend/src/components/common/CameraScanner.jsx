import { useEffect, useRef, useState } from 'react'

const SCANNER_ID = 'qr-camera-scanner'

/**
 * Camera-based QR scanner using html5-qrcode.
 * Works on mobile browsers (Chrome/Safari) and desktop webcam.
 * Props:
 *   onScan(decodedText) — called when QR is successfully decoded
 *   onClose()           — called when user closes scanner
 */
export default function CameraScanner({ onScan, onClose }) {
  const [error, setError] = useState(null)
  const [started, setStarted] = useState(false)
  const scannerRef = useRef(null)

  useEffect(() => {
    let scanner = null

    async function startScanner() {
      try {
        // Dynamically import to avoid SSR issues
        const { Html5Qrcode } = await import('html5-qrcode')
        scanner = new Html5Qrcode(SCANNER_ID)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' }, // rear camera on mobile
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            // QR decoded — stop scanner and notify parent
            scanner.stop().catch(() => {})
            onScan(decodedText)
          },
          () => {} // ignore per-frame decode failures
        )
        setStarted(true)
      } catch (err) {
        setError(err?.message || 'Could not access camera. Please allow camera permission.')
      }
    }

    startScanner()

    return () => {
      if (scannerRef.current && started) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-black/80">
        <span className="text-white font-semibold text-sm">Scan Roll QR Code</span>
        <button
          onClick={() => {
            if (scannerRef.current && started) {
              scannerRef.current.stop().catch(() => {})
            }
            onClose()
          }}
          className="text-white/80 hover:text-white p-1"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Camera viewfinder */}
      {!error && (
        <div
          id={SCANNER_ID}
          style={{ width: '300px', height: '300px' }}
          className="rounded-xl overflow-hidden"
        />
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center gap-4 px-8 text-center">
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

      {/* Instruction */}
      {!error && (
        <p className="absolute bottom-8 text-white/60 text-xs text-center px-8">
          Point camera at the QR code on the roll label
        </p>
      )}
    </div>
  )
}
