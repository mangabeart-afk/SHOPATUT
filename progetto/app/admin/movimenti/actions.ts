'use server'

import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'

export async function restoreDeletedArticle(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const articleId = String(formData.get('article_id') || '').trim()
  if (!articleId) redirect('/admin/movimenti?error=Articolo mancante.')

  const { error } = await supabase.rpc('admin_restore_article', { p_article_id: articleId })
  if (error) redirect(`/admin/movimenti?error=${encodeURIComponent(error.message)}`)

  redirect('/admin/movimenti?message=Elemento ripristinato correttamente.')
}


export async function restoreCancelledMovement(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')
  const movementId = String(formData.get('movement_id') || '').trim()
  if (!movementId) redirect('/admin/movimenti?error=Movimento mancante.')
  const { error } = await supabase.rpc('admin_restore_cancelled_movement', { p_movement_id: movementId })
  if (error) redirect(`/admin/movimenti?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/movimenti?message=Elemento ripristinato correttamente.')
}

export async function restoreShipment(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')
  const shipmentId = String(formData.get('shipment_id') || '').trim()
  if (!shipmentId) redirect('/admin/movimenti?error=Spedizione mancante.')
  const { error } = await supabase.rpc('admin_restore_shipment', { p_shipment_id: shipmentId })
  if (error) redirect(`/admin/movimenti?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/movimenti?message=Spedizione ripristinata correttamente.')
}
