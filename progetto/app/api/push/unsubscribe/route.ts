import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const endpoint = String(body?.endpoint || '').trim()
  if (!endpoint) return NextResponse.json({ error: 'Endpoint mancante.' }, { status: 400 })

  const { error } = await supabase.from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
