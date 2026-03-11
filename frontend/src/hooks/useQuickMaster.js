import { useEffect, useState, useCallback } from 'react'

/**
 * useQuickMaster — Shift+M to open inline master create form
 *
 * Reads `data-master` attribute from the focused element.
 * If no `data-master` → silent no-op.
 *
 * Supported master types: color, fabric, supplier, product_type, value_addition
 *
 * Usage:
 *   const { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated } = useQuickMaster(refreshCallbacks)
 *
 *   <select data-master="color" ...>
 *   <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
 */
export default function useQuickMaster(onCreated) {
  const [quickMasterType, setQuickMasterType] = useState(null)
  const [quickMasterOpen, setQuickMasterOpen] = useState(false)
  const [triggerElement, setTriggerElement] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      if (e.key.toLowerCase() === 'm' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const el = document.activeElement
        if (!el) return
        const masterType = el.getAttribute('data-master')
        if (!masterType) return // silent no-op — no master on this field
        e.preventDefault()
        e.stopPropagation()
        setTriggerElement(el)
        setQuickMasterType(masterType)
        setQuickMasterOpen(true)
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [])

  const closeQuickMaster = useCallback(() => {
    setQuickMasterOpen(false)
    // Re-focus the original field after modal closes
    if (triggerElement) {
      setTimeout(() => triggerElement.focus(), 50)
    }
  }, [triggerElement])

  const onMasterCreated = useCallback((masterType, newItem) => {
    if (onCreated) onCreated(masterType, newItem, triggerElement)
    setQuickMasterOpen(false)
    // Re-focus original field
    if (triggerElement) {
      setTimeout(() => triggerElement.focus(), 50)
    }
  }, [onCreated, triggerElement])

  return { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated }
}
