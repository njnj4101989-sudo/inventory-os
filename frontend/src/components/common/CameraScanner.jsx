import { useEffect, useRef, useState } from 'react'

const SCANNER_ID = 'qr-camera-scanner'

export default function CameraScanner({ onScan, onClose }) {
  const [error, setError] = useState(null)
  const scannerRef = useRef(null)
  const stoppedRef = useRef(false)

  useEffect(() => {
    stoppedRef.current = false

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false })
        scannerRef.current = scanner

        // Use full container as scan region — no qrbox constraint
        // This scans the ENTIRE camera frame, much better detection
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: undefined },
          (decodedText) => {
            if (stoppedRef.current) return
            stoppedRef.current = true
            scanner.stop().catch(() => {})
            onScan(decodedText)
          },
          () => {}
        )

        // Force the video element to fill container properly
        const container = document.getElementById(SCANNER_ID)
        if (container) {
          const video = container.querySelector('video')
          if (video) {
            video.style.objectFit = 'cover'
            video.style.width = '100%'
            video.style.height = '100%'
          }
        }
      } catch (err) {
        setError(err?.message || 'Could not access camera. Please allow camera permission.')
      }
    }

    startScanner()

    return () => {
      stoppedRef.current = true
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    stoppedRef.current = true
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {})
      scannerRef.current = null
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ background: 'rgba(0,0,0,0.9)' }}>
        <span className="text-white font-semibold text-sm">Scan QR Code</span>
        <button onClick={handleClose} className="text-white/80 active:text-white p-2 -mr-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Camera — single feed, no duplicate */}
      <div className="flex-1 relative overflow-hidden">
        {!error && (
          <div id={SCANNER_ID} className="absolute inset-0" />
        )}

        {/* Crosshair overlay */}
        {!error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-56 h-56 border-2 border-white/50 rounded-2xl" />
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
            <button onClick={handleClose} className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm">
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
