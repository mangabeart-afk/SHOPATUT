'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders dialogs at document.body so fixed overlays are anchored to the
 * viewport, not to a scrolling page/list or a transformed ancestor.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
