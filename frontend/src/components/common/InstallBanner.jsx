import { useInstallPrompt } from '../../hooks/useInstallPrompt'

export default function InstallBanner() {
  const { canInstall, promptInstall, dismiss } = useInstallPrompt()

  if (!canInstall) return null

  return (
    <div className="bg-primary-600 text-white px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span className="text-xs font-medium truncate">Install app for faster access</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={promptInstall}
          className="px-3 py-1 bg-white text-primary-700 text-xs font-semibold rounded-lg hover:bg-primary-50 transition-colors"
        >
          Install
        </button>
        <button
          onClick={dismiss}
          className="p-1 text-white/70 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
