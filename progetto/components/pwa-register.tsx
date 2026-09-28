'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISSED_KEY = 'shopatut-pwa-install-popup-date'

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

function todayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPopup, setShowInstallPopup] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }, [])

  useEffect(() => {
    if (isStandalone()) return

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      const installEvent = event as BeforeInstallPromptEvent
      setInstallEvent(installEvent)

      const alreadyShownToday = localStorage.getItem(DISMISSED_KEY) === todayKey()
      if (!alreadyShownToday) {
        window.setTimeout(() => setShowInstallPopup(true), 1200)
      }
    }

    const handleAppInstalled = () => {
      setShowInstallPopup(false)
      setInstallEvent(null)
      localStorage.setItem(DISMISSED_KEY, todayKey())
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const closeForToday = () => {
    localStorage.setItem(DISMISSED_KEY, todayKey())
    setShowInstallPopup(false)
  }

  const installApp = async () => {
    if (!installEvent || installing) return

    setInstalling(true)
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      localStorage.setItem(DISMISSED_KEY, todayKey())
      setShowInstallPopup(false)

      if (choice.outcome === 'accepted') {
        setInstallEvent(null)
      }
    } catch {
      localStorage.setItem(DISMISSED_KEY, todayKey())
      setShowInstallPopup(false)
    } finally {
      setInstalling(false)
    }
  }

  if (!showInstallPopup || !installEvent) return null

  return (
    <div className="pwa-install-overlay" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
      <div className="pwa-install-popup">
        <button
          type="button"
          className="pwa-install-close"
          onClick={closeForToday}
          aria-label="Chiudi"
        >
          ×
        </button>

        <img
          src="/logo.png"
          alt="ShopaTüT"
          className="pwa-install-logo"
        />

        <p className="eyebrow">APP SHOPATÜT</p>
        <h2 id="pwa-install-title">Installa l'app sul tuo dispositivo</h2>
        <p className="pwa-install-text">
          Accedi a ShopaTüT direttamente dalla tua schermata principale, senza dover passare ogni volta dal browser.
        </p>

        <button
          type="button"
          className="pwa-install-button"
          onClick={installApp}
          disabled={installing}
        >
          {installing ? 'Installazione…' : 'INSTALLA APP'}
        </button>

        <button
          type="button"
          className="pwa-install-later"
          onClick={closeForToday}
        >
          Non ora
        </button>
      </div>
    </div>
  )
}
