'use server'

import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'

const num = (formData: FormData, key: string, fallback = 0) => {
  const value = Number(formData.get(key) ?? fallback)
  return Number.isFinite(value) ? value : fallback
}

const text = (formData: FormData, key: string) => String(formData.get(key) || '').trim()

async function resolveArticlePhotoUrl(value: string) {
  const input = value.trim()
  if (!input) return null
  try {
    const parsed = new URL(input)
    if (/\.(?:png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(parsed.pathname)) return parsed.toString()
    const response = await fetch(parsed.toString(), { headers: { 'user-agent': 'ShopaTüT article preview' }, cache: 'no-store' })
    if (!response.ok) return null
    const html = await response.text()
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i) || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    return match?.[1] ? new URL(match[1], parsed.toString()).toString() : null
  } catch {
    return null
  }
}

const calculateTotalEur = (formData: FormData) => {
  const quantity = num(formData, 'quantity_purchased')
  const purchaseCurrency = text(formData, 'currency') || 'EUR'
  const purchaseRate = num(formData, 'exchange_rate', 1)
  const purchaseBaseEur = num(formData, 'unit_price_foreign') * quantity / (purchaseCurrency === 'EUR' ? 1 : purchaseRate)

  const accessory = (modeKey: string, amountKey: string, percentKey: string, currencyKey: string, rateKey: string) => {
    const mode = text(formData, modeKey) || 'FIXED'
    if (mode === 'PERCENT') return purchaseBaseEur * Math.max(0, num(formData, percentKey)) / 100
    const amount = num(formData, amountKey)
    const currency = text(formData, currencyKey) || 'EUR'
    const rate = num(formData, rateKey, 1)
    return amount / (currency === 'EUR' ? 1 : rate)
  }

  return purchaseBaseEur +
    accessory('commission_mode', 'commission_cost', 'commission_percent', 'commission_currency', 'commission_exchange_rate') +
    accessory('customs_mode', 'customs_cost', 'customs_percent', 'customs_currency', 'customs_exchange_rate') +
    accessory('shipping_mode', 'shipping_cost', 'shipping_percent', 'shipping_currency', 'shipping_exchange_rate')
}


async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')
  return { supabase, user }
}

const articlePayload = (formData: FormData) => {
  const quantity = num(formData, 'quantity_purchased')
  const totalCostEur = calculateTotalEur(formData)
  return {
    purchase_date: text(formData, 'purchase_date') || new Date().toISOString().slice(0, 10),
    origin: text(formData, 'origin') || 'GIAPPONE',
    seller: text(formData, 'seller') || null,
    series: text(formData, 'series') || null,
    detail: text(formData, 'detail') || null,
    quantity_purchased: quantity,
    currency: text(formData, 'currency') || 'EUR',
    unit_price_foreign: num(formData, 'unit_price_foreign'),
    exchange_rate: num(formData, 'exchange_rate', 1),
    commission_cost: num(formData, 'commission_cost'),
    commission_percent: num(formData, 'commission_percent'),
    commission_currency: text(formData, 'commission_currency') || 'EUR',
    commission_exchange_rate: num(formData, 'commission_exchange_rate', 1),
    customs_cost: num(formData, 'customs_cost'),
    customs_percent: num(formData, 'customs_percent'),
    customs_currency: text(formData, 'customs_currency') || 'EUR',
    customs_exchange_rate: num(formData, 'customs_exchange_rate', 1),
    shipping_cost: num(formData, 'shipping_cost'),
    shipping_percent: num(formData, 'shipping_percent'),
    shipping_currency: text(formData, 'shipping_currency') || 'EUR',
    shipping_exchange_rate: num(formData, 'shipping_exchange_rate', 1),
    accessory_cost_eur: totalCostEur - (num(formData, 'unit_price_foreign') * quantity / ((text(formData, 'currency') || 'EUR') === 'EUR' ? 1 : num(formData, 'exchange_rate', 1))),
    total_cost_eur: totalCostEur,
    unit_cost_eur: quantity > 0 ? totalCostEur / quantity : 0,
    // photo_url viene gestito separatamente durante creazione/modifica
    notes: text(formData, 'notes') || null,
    status: text(formData, 'status') || 'IN_ARRIVO',
  }
}

export async function createArticle(formData: FormData) {
  const { supabase } = await assertAdmin()
  const quantity = num(formData, 'quantity_purchased')
  if (quantity <= 0) redirect('/admin/articoli/nuovo?error=La quantità deve essere maggiore di zero.')

  const payload = articlePayload(formData)
  const { data: article, error } = await supabase.from('articles').insert(payload).select('id,quantity_purchased,status').single()
  if (error || !article) redirect(`/admin/articoli/nuovo?error=${encodeURIComponent(error?.message || 'Impossibile registrare l articolo.')}`)

  const photo = formData.get('photo')
  const sellerPageUrl = text(formData, 'seller_page_url')
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith('image/')) redirect('/admin/articoli/nuovo?error=Il file selezionato non è una foto valida.')
    if (photo.size > 8 * 1024 * 1024) redirect('/admin/articoli/nuovo?error=La foto supera il limite di 8 MB.')
    const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${article.id}-${Date.now()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('article-photos').upload(path, photo, { contentType: photo.type, upsert: true })
    if (uploadError) redirect(`/admin/articoli/nuovo?error=${encodeURIComponent(uploadError.message)}`)
    const { data: publicData } = supabase.storage.from('article-photos').getPublicUrl(path)
    await supabase.from('articles').update({ photo_url: publicData.publicUrl }).eq('id', article.id)
  } else if (sellerPageUrl) {
    const photoUrl = await resolveArticlePhotoUrl(sellerPageUrl)
    if (photoUrl) await supabase.from('articles').update({ photo_url: photoUrl }).eq('id', article.id)
  }

  if (text(formData, 'sale_enabled') === 'on') {
    const customerCode = text(formData, 'sale_customer_code').toUpperCase()
    const saleQuantity = num(formData, 'sale_quantity')
    const salePrice = num(formData, 'sale_price')
    if (!customerCode || saleQuantity <= 0 || saleQuantity > quantity || salePrice < 0) {
      redirect('/admin/articoli/nuovo?error=Dati della vendita contestuale non validi.')
    }
    const { error: saleError } = await supabase.rpc('register_article_sales', {
      p_mailbox_code: customerCode,
      p_lines: [{ article_id: article.id, quantity: saleQuantity, price: salePrice }],
    })
    if (saleError) redirect(`/admin/articoli/nuovo?error=${encodeURIComponent(saleError.message)}`)
  }

  redirect('/admin/articoli/archivio?message=Articolo registrato correttamente.')
}

export async function updateArticle(formData: FormData) {
  const { supabase } = await assertAdmin()
  const id = text(formData, 'id')
  if (!id) redirect('/admin/articoli?error=ID articolo mancante.')

  const quantity = num(formData, 'quantity_purchased')
  if (quantity <= 0) redirect(`/admin/articoli/${id}?error=La quantità deve essere maggiore di zero.`)

  const payload = articlePayload(formData)
  const sellerPageUrl = text(formData, 'seller_page_url')
  const photo = formData.get('photo')
  let photoPatch: Record<string, string | null> = {}
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith('image/') || photo.size > 8 * 1024 * 1024) redirect(`/admin/articoli/${id}?error=Foto non valida o superiore a 8 MB.`)
    const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${id}-${Date.now()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('article-photos').upload(path, photo, { contentType: photo.type, upsert: true })
    if (uploadError) redirect(`/admin/articoli/${id}?error=${encodeURIComponent(uploadError.message)}`)
    const { data: publicData } = supabase.storage.from('article-photos').getPublicUrl(path)
    photoPatch = { photo_url: publicData.publicUrl }
  } else if (sellerPageUrl) {
    photoPatch = { photo_url: await resolveArticlePhotoUrl(sellerPageUrl) }
  }
  const { error } = await supabase.from('articles').update({ ...payload, ...photoPatch }).eq('id', id)
  if (error) redirect(`/admin/articoli/${id}?error=${encodeURIComponent(error.message)}`)

  redirect(`/admin/articoli/${id}?message=Modifiche salvate correttamente.`)
}
