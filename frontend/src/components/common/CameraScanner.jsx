import { useState, useEffect, useRef } from 'react'

const HAS_BARCODE_DETECTOR = 'BarcodeDetector' in window

export default function CameraScanner({ onScan, onClose, continuous = false }) {
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(true)
  const videoRef = useRef(null)
  const scannedRef = useRef(false)
  const lastCodeRef = useRef(null)

  useEffect(() => {
    if (!HAS_BARCODE_DETECTOR) return // handled by fallback branch
    let stopped = false
    let stream = null

    async function startNative() {
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return }

        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        setStarting(false)

        // Scan loop — detect directly from video element, no canvas
        async function scanLoop() {
          while (!stopped && !scannedRef.current) {
            try {
              const results = await detector.detect(video)
              if (results.length > 0 && !scannedRef.current) {
                const code = results[0].rawValue
                if (continuous) {
                  // Gun mode: skip duplicate consecutive scans, keep camera open
                  if (code !== lastCodeRef.current) {
                    lastCodeRef.current = code
                    onScan(code)
                  }
                  // Wait before next scan to avoid rapid-fire
                  await new Promise(r => setTimeout(r, 1500))
                  lastCodeRef.current = null
                } else {
                  scannedRef.current = true
                  onScan(code)
                  return
                }
              }
            } catch (_) {}
            await new Promise(r => setTimeout(r, 60))
          }
        }
        scanLoop()
      } catch (err) {
        if (stopped) return
        const msg = err?.message || String(err)
        if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
          setError('Camera permission denied. Please allow camera access and try again.')
        } else if (msg.includes('NotFoundError')) {
          setError('No camera found on this device.')
        } else if (msg.includes('NotReadableError')) {
          setError('Camera is in use by another app.')
        } else {
          setError(msg)
        }
        setStarting(false)
      }
    }

    startNative()

    return () => {
      stopped = true
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [onScan])

  // Desktop fallback — lazy-load html5-qrcode only when needed
  useEffect(() => {
    if (HAS_BARCODE_DETECTOR) return
    let cancelled = false
    let scanner = null
    const SCANNER_ID = 'html5qr-fallback'

    async function startFallback() {
      const { Html5Qrcode } = await import('html5-qrcode')
      if (cancelled) return

      // Wait for DOM element
      await new Promise(r => requestAnimationFrame(r))
      scanner = new Html5Qrcode(SCANNER_ID, {
        formatsToSupport: [0],
      })

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 250, height: 250 }, disableFlip: true },
          (text) => {
            if (scannedRef.current) return
            if (continuous) {
              if (text !== lastCodeRef.current) {
                lastCodeRef.current = text
                onScan(text)
                setTimeout(() => { lastCodeRef.current = null }, 1500)
              }
            } else {
              scannedRef.current = true
              scanner.stop().catch(() => {})
              onScan(text)
            }
          },
          () => {}
        )
        if (!cancelled) setStarting(false)
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Camera error')
          setStarting(false)
        }
      }
    }

    startFallback()

    return () => {
      cancelled = true
      if (scanner?.isScanning) {
        scanner.stop().then(() => scanner.clear()).catch(() => {
          try { scanner.clear() } catch (_) {}
        })
      } else if (scanner) {
        try { scanner.clear() } catch (_) {}
      }
    }
  }, [onScan])

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <span className="typo-data text-white">Scan QR Code</span>
        <button onClick={onClose} className="text-white/80 active:text-white p-2 -mr-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Native camera (mobile) */}
      {!error && HAS_BARCODE_DETECTOR && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />
      )}

      {/* html5-qrcode fallback (desktop) */}
      {!error && !HAS_BARCODE_DETECTOR && (
        <>
          <style>{`
            #html5qr-fallback video { object-fit: cover !important; height: 100vh !important; }
            #html5qr-fallback #qr-shaded-region { display: none !important; }
          `}</style>
          <div id="html5qr-fallback" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }} />
        </>
      )}

      {/* Scanning guide */}
      {!error && !starting && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 120px, rgba(0,0,0,0.45) 160px)' }} />
          <div className="relative" style={{ width: 240, height: 240 }}>
            <div className="absolute top-0 left-0 w-10 h-10 border-t-3 border-l-3 border-white rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-10 h-10 border-t-3 border-r-3 border-white rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-10 h-10 border-b-3 border-l-3 border-white rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-10 h-10 border-b-3 border-r-3 border-white rounded-br-lg" />
          </div>
        </div>
      )}

      {/* Loading */}
      {!error && starting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="typo-body text-white/80">{error}</p>
          <button onClick={onClose} className="px-4 py-2 bg-white/10 text-white rounded-lg typo-btn">
            Close
          </button>
        </div>
      )}

      {/* Footer */}
      {!error && (
        <div className="absolute bottom-0 left-0 right-0 z-20 py-5 text-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <p className="typo-caption text-white/60">Point camera at QR code</p>
        </div>
      )}
    </div>
  )
}
