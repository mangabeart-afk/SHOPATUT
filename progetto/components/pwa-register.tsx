'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../lib/supabase-browser'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type PushManagerWithSubscription = PushManager & {
  getSubscription: () => Promise<PushSubscription | null>
}

const DISMISSED_INSTALL_KEY = 'shopatut-pwa-install-popup-date'
const DISMISSED_PUSH_KEY = 'shopatut-push-popup-date'

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export default function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPopup, setShowInstallPopup] = useState(false)
  const [showPushPopup, setShowPushPopup] = useState(false)
  const [pushMode, setPushMode] = useState<'activate' | 'blocked' | 'ios-install' | 'error'>('activate')
  const [busy, setBusy] = useState(false)
  const [pushError, setPushError] = useState('')

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
      if (localStorage.getItem(DISMISSED_INSTALL_KEY) !== todayKey()) {
        window.setTimeout(() => setShowInstallPopup(true), 1200)
      }
    }

    const handleAppInstalled = () => {
      setShowInstallPopup(false)
      setInstallEvent(null)
      localStorage.setItem(DISMISSED_INSTALL_KEY, todayKey())
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const prepareNotifications = async () => {
      if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) return

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled || profile?.role !== 'CLIENTE') return

      const registration = await navigator.serviceWorker.ready
      const subscription = await (registration.pushManager as PushManagerWithSubscription).getSubscription()
      if (subscription) {
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription }),
        }).catch(() => {})
        return
      }

      if (localStorage.getItem(DISMISSED_PUSH_KEY) === todayKey()) return

      if (isIOS() && !isStandalone()) {
        setPushMode('ios-install')
      } else if (Notification.permission === 'denied') {
        setPushMode('blocked')
      } else {
        setPushMode('activate')
      }

      window.setTimeout(() => {
        if (!cancelled) setShowPushPopup(true)
      }, 1400)
    }

    void prepareNotifications()
    return () => { cancelled = true }
  }, [])

  const closePushForToday = () => {
    localStorage.setItem(DISMISSED_PUSH_KEY, todayKey())
    setShowPushPopup(false)
  }

  const activateNotifications = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (isIOS() && !isStandalone()) {
        closePushForToday()
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushMode('blocked')
        return
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setPushError('Configurazione VAPID mancante nel server.')
        setPushMode('error')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const pushManager = registration.pushManager as PushManagerWithSubscription
      const subscription = await pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Registrazione notifiche non riuscita')
      }
      closePushForToday()
    } catch (error) {
      console.error('SHOPATUT push activation error', error)
      setPushError(
        error instanceof Error
          ? error.message
          : 'Errore durante l’attivazione delle notifiche.',
      )
      setPushMode('error')
    } finally {
      setBusy(false)
    }
  }

  const installApp = async () => {
    if (!installEvent || busy) return
    setBusy(true)
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      localStorage.setItem(DISMISSED_INSTALL_KEY, todayKey())
      setShowInstallPopup(false)
      if (choice.outcome === 'accepted') setInstallEvent(null)
    } catch {
      localStorage.setItem(DISMISSED_INSTALL_KEY, todayKey())
      setShowInstallPopup(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {showInstallPopup && installEvent && (
        <div className="pwa-install-overlay" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
          <div className="pwa-install-popup">
            <button type="button" className="pwa-install-close" onClick={() => { localStorage.setItem(DISMISSED_INSTALL_KEY, todayKey()); setShowInstallPopup(false) }} aria-label="Chiudi">×</button>
            <img src="/logo.png" alt="ShopaTüT" className="pwa-install-logo" />
            <p className="eyebrow">APP SHOPATÜT</p>
            <h2 id="pwa-install-title">Installa l'app sul tuo dispositivo</h2>
            <p className="pwa-install-text">Accedi a ShopaTüT dalla schermata principale e ricevi gli aggiornamenti anche quando l'app non è aperta.</p>
            <button type="button" className="pwa-install-button" onClick={installApp} disabled={busy}>{busy ? 'Installazione…' : 'INSTALLA APP'}</button>
            <button type="button" className="pwa-install-later" onClick={() => { localStorage.setItem(DISMISSED_INSTALL_KEY, todayKey()); setShowInstallPopup(false) }}>Non ora</button>
          </div>
        </div>
      )}

      {showPushPopup && (
        <div className="pwa-install-overlay" role="dialog" aria-modal="true" aria-labelledby="push-title">
          <div className="pwa-install-popup">
            <button type="button" className="pwa-install-close" onClick={closePushForToday} aria-label="Chiudi">×</button>
            <img src="/logo.png" alt="ShopaTüT" className="pwa-install-logo" />
            <p className="eyebrow">NOTIFICHE SHOPATÜT</p>
            <h2 id="push-title">
              {pushMode === 'ios-install'
                ? 'Attiva le notifiche'
                : pushMode === 'blocked'
                  ? 'Notifiche bloccate'
                  : pushMode === 'error'
                    ? 'Configurazione notifiche'
                    : 'Ricevi gli aggiornamenti'}
            </h2>
            <p className="pwa-install-text">
              {pushMode === 'ios-install'
                ? 'Su iPhone aggiungi prima ShopaTüT alla schermata Home. Dopo l’installazione potrai attivare le notifiche.'
                : pushMode === 'blocked'
                  ? 'Il browser sta bloccando le notifiche di ShopaTüT. Apri le impostazioni del sito e imposta Notifiche su Consenti.'
                  : pushMode === 'error'
                    ? `Il permesso è attivo, ma la registrazione del dispositivo non è riuscita. ${pushError}`
                    : 'Ti avviseremo quando un articolo arriva nella tua casella e quando tutti i tuoi articoli sono pronti per essere spediti.'}
            </p>
            {pushMode === 'ios-install' ? (
              <button type="button" className="pwa-install-button" onClick={closePushForToday}>HO CAPITO</button>
            ) : pushMode === 'blocked' ? (
              <button type="button" className="pwa-install-button" onClick={closePushForToday}>OK</button>
            ) : pushMode === 'error' ? (
              <button type="button" className="pwa-install-button" onClick={closePushForToday}>OK</button>
            ) : (
              <button type="button" className="pwa-install-button" onClick={activateNotifications} disabled={busy}>{busy ? 'Attivazione…' : 'ATTIVA NOTIFICHE'}</button>
            )}
            <button type="button" className="pwa-install-later" onClick={closePushForToday}>Non ora</button>
          </div>
        </div>
      )}
    </>
  )
}
