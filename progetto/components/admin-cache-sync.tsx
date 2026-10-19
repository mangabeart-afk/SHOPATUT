'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '../lib/supabase-browser'
import {
  AdminDirectoryCache,
  CachedArticleOption,
  CachedCustomerOption,
  clearAllAdminCache,
  readAdminCache,
  writeAdminCache,
  adminCacheEventName,
} from '../lib/admin-cache-client'

type Status = {
  kind: 'loading' | 'syncing' | 'ready' | 'offline' | 'error'
  text: string
  detail?: string
  updatedAt?: string
  count?: number
}

type ApiCustomer = { id: string; customer_code: string; first_name: string; last_name: string; updated_at: string | null }
type ApiArticle = CachedArticleOption

type ApiResponse = {
  authorized?: boolean
  userId?: string
  mode?: 'snapshot' | 'delta'
  generatedAt?: string
  customers?: ApiCustomer[]
  articles?: ApiArticle[]
  error?: string
}

const EMPTY_STATUS: Status = { kind: 'loading', text: 'Preparo archivio locale', detail: 'Verifica sessione' }
const REFRESH_EVENT = 'shopatut:admin-cache-refresh'
const DIRTY_CACHE_KEY = 'shopatut-admin-cache-dirty'
const TWENTY_SECONDS = 20_000
const TWELVE_HOURS = 12 * 60 * 60 * 1000

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(date)
}

function mergeById<T extends { id: string }>(oldRows: T[], updates: T[]): T[] {
  const rows = new Map(oldRows.map((row) => [row.id, row]))
  for (const row of updates) rows.set(row.id, row)
  return [...rows.values()]
}

export default function AdminCacheSync() {
  const [status, setStatus] = useState<Status>(EMPTY_STATUS)
  const [expanded, setExpanded] = useState(false)
  const syncRef = useRef<((force?: boolean) => Promise<void>) | null>(null)

  const refresh = useCallback((force = true) => {
    void syncRef.current?.(force)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let disposed = false
    let activeUserId = ''
    let running = false
    let lastAttemptAt = 0
    let delayedRefresh: ReturnType<typeof setTimeout> | null = null

    const sync = async (force = false) => {
      if (disposed || running) return
      if (!force && Date.now() - lastAttemptAt < 20_000) return
      running = true
      lastAttemptAt = Date.now()
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user
        if (!user) {
          await clearAllAdminCache()
          activeUserId = ''
          if (!disposed) setStatus({ kind: 'error', text: 'Cache cancellata', detail: 'Accedi di nuovo per sincronizzare' })
          return
        }
        if (activeUserId && activeUserId !== user.id) {
          // Non mostrare mai l'indice appartenente alla sessione precedente.
          setStatus({ kind: 'loading', text: 'Preparo archivio locale', detail: 'Cambio sessione' })
        }
        activeUserId = user.id

        const stored = await readAdminCache<AdminDirectoryCache>(user.id, 'directory')
        if (disposed) return
        const existing = stored?.payload
        const since = existing?.syncedAt || stored?.updatedAt
        const sinceAge = since ? Date.now() - Date.parse(since) : Number.POSITIVE_INFINITY
        const hasMutationNotice = typeof window !== 'undefined' && (() => {
          const params = new URLSearchParams(window.location.search)
          return params.has('message') || params.has('error')
        })()
        let dirty = false
        try { dirty = typeof window !== 'undefined' && window.sessionStorage.getItem(DIRTY_CACHE_KEY) === '1' } catch {}

        if (!force && existing && sinceAge >= 0 && sinceAge < TWENTY_SECONDS && !dirty && !hasMutationNotice) {
          setStatus({
            kind: 'ready',
            text: 'Archivio locale aggiornato',
            detail: `${existing.customers.length} utenti · ${existing.articles.length} articoli`,
            updatedAt: since,
            count: existing.customers.length + existing.articles.length,
          })
          return
        }

        if (existing && existing.customers && existing.articles) {
          setStatus({
            kind: 'syncing',
            text: 'Archivio locale pronto',
            detail: 'Aggiornamento in corso',
            updatedAt: existing.syncedAt || stored?.updatedAt,
            count: existing.customers.length + existing.articles.length,
          })
        } else {
          setStatus({ kind: 'loading', text: 'Creo archivio locale', detail: 'Prima sincronizzazione' })
        }

        const recent = Boolean(existing && since && Date.now() - Date.parse(since) >= 0 && Date.now() - Date.parse(since) < TWELVE_HOURS)
        const endpoint = recent ? `/api/admin/cache?since=${encodeURIComponent(since!)}` : '/api/admin/cache'
        const response = await fetch(endpoint, { method: 'GET', cache: 'no-store', credentials: 'same-origin' })
        const body = await response.json().catch(() => ({})) as ApiResponse

        if (response.status === 401 || response.status === 403) {
          await clearAllAdminCache()
          if (!disposed) setStatus({ kind: 'error', text: 'Cache non disponibile', detail: body.error || 'Permessi amministratore non validi' })
          return
        }
        if (!response.ok || !body.generatedAt || !body.mode) throw new Error(body.error || 'Sincronizzazione non riuscita')
        if (disposed || activeUserId !== user.id) return

        const apiCustomers = body.customers || []
        const mappedCustomers: CachedCustomerOption[] = apiCustomers.map((customer) => ({
          id: customer.id,
          code: customer.customer_code || '',
          name: [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || 'Utente',
        }))
        const apiArticles = body.articles || []

        let nextCustomers = mappedCustomers
        let nextArticles = apiArticles.filter((article) => !article.deleted_at)
        if (body.mode === 'delta' && existing) {
          nextCustomers = mergeById(existing.customers || [], mappedCustomers)
          const mergedArticles = mergeById(existing.articles || [], apiArticles)
          nextArticles = mergedArticles.filter((article) => !article.deleted_at)
        }

        const nextPayload: AdminDirectoryCache = {
          customers: nextCustomers,
          articles: nextArticles,
          syncedAt: body.generatedAt,
        }
        await writeAdminCache(user.id, 'directory', nextPayload, body.generatedAt)
        try { if (typeof window !== 'undefined') window.sessionStorage.removeItem(DIRTY_CACHE_KEY) } catch {}
        if (disposed) return
        setStatus({
          kind: 'ready',
          text: 'Archivio locale aggiornato',
          detail: `${nextPayload.customers.length} utenti · ${nextPayload.articles.length} articoli`,
          updatedAt: body.generatedAt,
          count: nextPayload.customers.length + nextPayload.articles.length,
        })
      } catch (error) {
        const stored = activeUserId ? await readAdminCache<AdminDirectoryCache>(activeUserId, 'directory') : null
        if (!disposed) {
          if (stored?.payload) {
            setStatus({ kind: 'offline', text: 'Uso archivio locale', detail: 'Server non raggiungibile; dati potenzialmente non aggiornati', updatedAt: stored.payload.syncedAt || stored.updatedAt, count: stored.payload.customers.length + stored.payload.articles.length })
          } else {
            setStatus({ kind: 'error', text: 'Cache non sincronizzata', detail: error instanceof Error ? error.message : 'Errore di rete' })
          }
        }
      } finally {
        running = false
      }
    }

    syncRef.current = sync
    const initialUrl = typeof window !== 'undefined' ? new URL(window.location.href) : null
    let pendingMutation = false
    try { pendingMutation = typeof window !== 'undefined' && window.sessionStorage.getItem(DIRTY_CACHE_KEY) === '1' } catch {}
    const initialMutationNotice = Boolean(initialUrl?.searchParams.has('message') || initialUrl?.searchParams.has('error'))
    void sync(pendingMutation || initialMutationNotice)

    const onRefresh = () => { void sync(true) }
    const onFocus = () => { void sync(false) }
    const onVisibility = () => { if (document.visibilityState === 'visible') void sync(false) }
    const onSubmit = () => {
      try { window.sessionStorage.setItem(DIRTY_CACHE_KEY, '1') } catch {}
      if (delayedRefresh) clearTimeout(delayedRefresh)
      // Consente alla server action di concludersi prima di aggiornare l'indice locale.
      delayedRefresh = setTimeout(() => { void sync(true) }, 4000)
    }
    window.addEventListener(REFRESH_EVENT, onRefresh)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('submit', onSubmit, true)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void sync(false) }, 120_000)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        activeUserId = ''
        void clearAllAdminCache()
        if (!disposed) setStatus({ kind: 'error', text: 'Cache cancellata', detail: 'Sessione terminata' })
      } else if (activeUserId && session.user.id !== activeUserId) {
        activeUserId = ''
        void clearAllAdminCache()
        if (!disposed) setStatus({ kind: 'loading', text: 'Preparo archivio locale', detail: 'Cambio account' })
        void sync(true)
      }
    })

    return () => {
      disposed = true
      syncRef.current = null
      window.removeEventListener(REFRESH_EVENT, onRefresh)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('submit', onSubmit, true)
      window.clearInterval(timer)
      if (delayedRefresh) clearTimeout(delayedRefresh)
      authListener.subscription.unsubscribe()
    }
  }, [])

  return (
    <aside className={`admin-cache-status is-${status.kind}${expanded ? ' is-expanded' : ' is-compact'}`} role="status" aria-live="polite" aria-atomic="true">
      <button type="button" className="admin-cache-status-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label={expanded ? 'Riduci stato archivio' : 'Mostra stato archivio completo'}>
        <span className="admin-cache-status-dot" aria-hidden="true" />
        <span className="admin-cache-status-copy">
          <strong>{status.text}</strong>
          <small>{status.detail}{status.updatedAt ? ` · ${formatDate(status.updatedAt)}` : ''}</small>
        </span>
        <span className="admin-cache-status-chevron" aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      {(status.kind === 'offline' || status.kind === 'error') && expanded && (
        <button type="button" className="admin-cache-retry" onClick={() => refresh(true)}>Riprova</button>
      )}
    </aside>
  )
}
