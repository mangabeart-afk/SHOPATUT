'use client'

import { useEffect } from 'react'
import { AdminDashboardSnapshot, writeAdminCache } from '../lib/admin-cache-client'

export default function AdminDashboardCacheWriter({ userId, snapshot }: { userId: string; snapshot: AdminDashboardSnapshot }) {
  useEffect(() => {
    if (!userId) return
    void writeAdminCache(userId, 'dashboard', snapshot, new Date().toISOString())
  }, [userId, snapshot.purchased, snapshot.purchaseValue, snapshot.incomingUnits, snapshot.sold, snapshot.revenue, snapshot.margin])

  return null
}
