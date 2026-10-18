import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function fetchAllRows<T>(queryForRange: (from: number, to: number) => any): Promise<{ data: T[]; error: any }> {
  const rows: T[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryForRange(from, from + pageSize - 1)
    if (error) return { data: [], error }
    const batch = (data || []) as T[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return { data: rows, error: null }
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Sessione non valida.' }, 401)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError) return json({ error: 'Impossibile verificare i permessi.' }, 500)
  if (profile?.role !== 'AMMINISTRATORE') return json({ error: 'Accesso riservato all’amministratore.' }, 403)

  const url = new URL(request.url)
  if (url.searchParams.get('verify') === '1') {
    return json({ authorized: true, userId: user.id })
  }

  const syncStartedAt = new Date()
  const sinceRaw = url.searchParams.get('since')
  const parsedSince = sinceRaw ? Date.parse(sinceRaw) : Number.NaN
  const ageMs = syncStartedAt.getTime() - parsedSince
  // Una sincronizzazione completa periodica riallinea anche eventuali cancellazioni definitive.
  const useDelta = Number.isFinite(parsedSince) && ageMs >= 0 && ageMs < 12 * 60 * 60 * 1000
  const since = useDelta ? new Date(parsedSince).toISOString() : null

  const customersResult = await fetchAllRows<any>((from, to) => {
    let query = supabase
      .from('customers')
      .select('id,customer_code,first_name,last_name,updated_at')
      .order('id', { ascending: true })
    if (since) query = query.gt('updated_at', since)
    return query.range(from, to)
  })

  const articlesResult = await fetchAllRows<any>((from, to) => {
    let query = supabase
      .from('articles')
      .select('id,article_code,series,detail,notes,origin,status,quantity_purchased,deleted_at,updated_at')
      .order('id', { ascending: true })
    if (since) query = query.gt('updated_at', since)
    return query.range(from, to)
  })

  if (customersResult.error || articlesResult.error) {
    return json({ error: customersResult.error?.message || articlesResult.error?.message || 'Sincronizzazione non riuscita.' }, 500)
  }

  const customers = customersResult.data.map((row: any) => ({
    id: String(row.id),
    customer_code: String(row.customer_code || ''),
    first_name: String(row.first_name || ''),
    last_name: String(row.last_name || ''),
    updated_at: row.updated_at || null,
  }))
  const articles = articlesResult.data.map((row: any) => ({
    id: String(row.id),
    article_code: String(row.article_code || ''),
    series: row.series || null,
    detail: row.detail || null,
    // Conserva solo gli identificativi fornitore cercabili, non le note libere.
    notes: (String(row.notes || '').match(/\b(?:asxn|gwvs)[a-z0-9_-]*\b/gi) || []).join(' ') || null,
    origin: row.origin || null,
    status: row.status || null,
    quantity_purchased: Number(row.quantity_purchased || 0),
    deleted_at: row.deleted_at || null,
    updated_at: row.updated_at || null,
  }))

  return json({
    authorized: true,
    userId: user.id,
    mode: useDelta ? 'delta' : 'snapshot',
    generatedAt: syncStartedAt.toISOString(),
    customers,
    articles,
  })
}
