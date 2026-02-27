import { useState, useEffect } from 'react'

/**
 * Captures the `beforeinstallprompt` event so we can show a custom install banner.
 * Returns { canInstall, promptInstall, dismissed, dismiss }
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('pwa_install_dismissed') === '1'
  )

  useEffect(() => {
    function handleBeforeInstall(e) {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  }, [])

  async function promptInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (outcome === 'dismissed') {
      setDismissed(true)
      sessionStorage.setItem('pwa_install_dismissed', '1')
    }
  }

  function dismiss() {
    setDismissed(true)
    sessionStorage.setItem('pwa_install_dismissed', '1')
  }

  return {
    canInstall: !!deferredPrompt && !dismissed,
    promptInstall,
    dismissed,
    dismiss,
  }
}
