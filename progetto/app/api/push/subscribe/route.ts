import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const subscription = body?.subscription
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: 'Subscription non valida.' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: String(subscription.endpoint),
    p256dh: String(subscription.keys.p256dh),
    auth: String(subscription.keys.auth),
    user_agent: request.headers.get('user-agent'),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
