'use client'

export type CachedCustomerOption = {
  id: string
  code: string
  name: string
}

export type CachedArticleOption = {
  id: string
  article_code: string
  series: string | null
  detail: string | null
  notes: string | null
  origin: string | null
  status: string | null
  quantity_purchased: number
  deleted_at: string | null
  updated_at: string | null
}

export type AdminDirectoryCache = {
  customers: CachedCustomerOption[]
  articles: CachedArticleOption[]
  syncedAt: string
}

export type AdminDashboardSnapshot = {
  purchased: number
  purchaseValue: number
  incomingUnits: number
  sold: number
  revenue: number
  margin: number
}

type CacheRecord<T = unknown> = {
  key: string
  userId: string
  slot: string
  updatedAt: string
  payload: T
}

const DB_NAME = 'shopatut-admin-cache'
const DB_VERSION = 1
const STORE = 'records'
const CACHE_EVENT = 'shopatut:admin-cache-updated'

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function recordKey(userId: string, slot: string) {
  return `${userId}:${slot}`
}

export async function readAdminCache<T>(userId: string, slot: string): Promise<{ payload: T; updatedAt: string } | null> {
  if (!userId) return null
  const db = await openCacheDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).get(recordKey(userId, slot))
      request.onsuccess = () => {
        const value = request.result as CacheRecord<T> | undefined
        resolve(value?.payload !== undefined ? { payload: value.payload, updatedAt: value.updatedAt } : null)
      }
      request.onerror = () => resolve(null)
      transaction.oncomplete = () => db.close()
      transaction.onerror = () => { db.close(); resolve(null) }
    } catch {
      db.close()
      resolve(null)
    }
  })
}

export async function writeAdminCache<T>(userId: string, slot: string, payload: T, updatedAt = new Date().toISOString()): Promise<boolean> {
  if (!userId) return false
  const db = await openCacheDb()
  if (!db) return false
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put({
        key: recordKey(userId, slot),
        userId,
        slot,
        updatedAt,
        payload,
      } satisfies CacheRecord<T>)
      transaction.oncomplete = () => {
        db.close()
        window.dispatchEvent(new CustomEvent(CACHE_EVENT, { detail: { userId, slot } }))
        resolve(true)
      }
      transaction.onerror = () => { db.close(); resolve(false) }
      transaction.onabort = () => { db.close(); resolve(false) }
    } catch {
      db.close()
      resolve(false)
    }
  })
}

export async function clearAdminCacheForUser(userId: string): Promise<void> {
  if (!userId) return
  const db = await openCacheDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite')
      const store = transaction.objectStore(STORE)
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if ((cursor.value as CacheRecord).userId === userId) cursor.delete()
        cursor.continue()
      }
      transaction.oncomplete = () => { db.close(); resolve() }
      transaction.onerror = () => { db.close(); resolve() }
      transaction.onabort = () => { db.close(); resolve() }
    } catch {
      db.close()
      resolve()
    }
  })
}

export async function clearAllAdminCache(): Promise<void> {
  const db = await openCacheDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).clear()
      transaction.oncomplete = () => { db.close(); resolve() }
      transaction.onerror = () => { db.close(); resolve() }
      transaction.onabort = () => { db.close(); resolve() }
    } catch {
      db.close()
      resolve()
    }
  })
}

export function adminCacheEventName() {
  return CACHE_EVENT
}
