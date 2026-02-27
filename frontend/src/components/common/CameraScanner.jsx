import { useState, useCallback, useEffect } from 'react'
import { Scanner, setZXingModuleOverrides } from '@yudiel/react-qr-scanner'

export default function CameraScanner({ onScan, onClose }) {
  const [error, setError] = useState(null)
  const [paused, setPaused] = useState(false)
  const [ready, setReady] = useState(false)

  // Load WASM from our own server instead of jsdelivr CDN
  useEffect(() => {
    setZXingModuleOverrides({
      locateFile: (path, prefix) => {
        if (path.endsWith('.wasm')) {
          return '/zxing_reader.wasm'
        }
        return prefix + path
      },
    })
    setReady(true)
  }, [])

  const handleScan = useCallback((detectedCodes) => {
    if (paused || !detectedCodes?.length) return
    const raw = detectedCodes[0].rawValue
    if (!raw) return
    setPaused(true)
    onScan(raw)
  }, [paused, onScan])

  const handleError = useCallback((err) => {
    const msg = err?.message || err?.toString?.() || 'Could not access camera. Please allow camera permission.'
    setError(msg)
  }, [])

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
        {!error && ready && (
          <Scanner
            onScan={handleScan}
            onError={handleError}
            constraints={{
              facingMode: 'environment',
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              focusMode: 'continuous',
            }}
            paused={paused}
            allowMultiple={false}
            scanDelay={200}
            sound={false}
            components={{ finder: true, torch: false }}
            styles={{
              container: { width: '100%', height: '100%' },
              video: { objectFit: 'cover' },
            }}
          />
        )}

        {!error && !ready && (
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
