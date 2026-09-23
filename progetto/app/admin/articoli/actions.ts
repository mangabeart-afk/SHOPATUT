'use server'

import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'

const num = (formData: FormData, key: string, fallback = 0) => {
  const value = Number(formData.get(key) ?? fallback)
  return Number.isFinite(value) ? value : fallback
}

const text = (formData: FormData, key: string) => String(formData.get(key) || '').trim()


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
  const { data: article, error } = await supabase.from('articles').insert(payload).select('id,article_code,quantity_purchased,total_cost_eur,status').single()
  if (error || !article) redirect(`/admin/articoli/nuovo?error=${encodeURIComponent(error?.message || 'Impossibile registrare l articolo.')}`)

  await supabase.from('movements').insert({
    movement_type: 'ARTICOLO',
    reference_id: article.id,
    reference_code: article.article_code,
    article_id: article.id,
    quantity: quantity,
    total_amount_eur: Number(article.total_cost_eur || 0),
    description: 'Creazione',
    operator_user_id: (await supabase.auth.getUser()).data.user?.id || null,
  })

  const photo = formData.get('photo')
  const directPhotoUrl = text(formData, 'photo_url')
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith('image/')) redirect('/admin/articoli/nuovo?error=Il file selezionato non è una foto valida.')
    if (photo.size > 8 * 1024 * 1024) redirect('/admin/articoli/nuovo?error=La foto supera il limite di 8 MB.')
    const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${article.id}-${Date.now()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('article-photos').upload(path, photo, { contentType: photo.type, upsert: true })
    if (uploadError) redirect(`/admin/articoli/nuovo?error=${encodeURIComponent(`Caricamento foto non riuscito: ${uploadError.message}. Verifica che l'app punti al progetto Supabase corretto e che il bucket article-photos sia disponibile.`)}`)
    const { data: publicData } = supabase.storage.from('article-photos').getPublicUrl(path)
    await supabase.from('articles').update({ photo_url: publicData.publicUrl }).eq('id', article.id)
  } else if (directPhotoUrl) {
    await supabase.from('articles').update({ photo_url: directPhotoUrl }).eq('id', article.id)
  }

  if (text(formData, 'sale_enabled') === 'on') {
    const customerCode = text(formData, 'sale_customer_code').toUpperCase()
    const saleQuantity = num(formData, 'sale_quantity')
    const salePrice = num(formData, 'sale_price')
    if (!customerCode || saleQuantity <= 0 || saleQuantity > quantity || salePrice < 0) {
      redirect('/admin/articoli/nuovo?error=Dati della vendita contestuale non validi.')
    }
    const { error: saleError } = await supabase.rpc('register_article_sales', {
      p_customer_code: customerCode,
      p_lines: [{ article_id: article.id, quantity: saleQuantity, price: salePrice }],
      p_movement_date: text(formData, 'purchase_date') || new Date().toISOString().slice(0, 10),
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
  const directPhotoUrl = text(formData, 'photo_url')
  const photo = formData.get('photo')
  let photoPatch: Record<string, string | null> = {}
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith('image/') || photo.size > 8 * 1024 * 1024) redirect(`/admin/articoli/${id}?error=Foto non valida o superiore a 8 MB.`)
    const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${id}-${Date.now()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('article-photos').upload(path, photo, { contentType: photo.type, upsert: true })
    if (uploadError) redirect(`/admin/articoli/${id}?error=${encodeURIComponent(`Caricamento foto non riuscito: ${uploadError.message}. Verifica che l'app punti al progetto Supabase corretto e che il bucket article-photos sia disponibile.`)}`)
    const { data: publicData } = supabase.storage.from('article-photos').getPublicUrl(path)
    photoPatch = { photo_url: publicData.publicUrl }
  } else if (directPhotoUrl) {
    photoPatch = { photo_url: directPhotoUrl }
  }
  const { error } = await supabase.from('articles').update({ ...payload, ...photoPatch }).eq('id', id)
  if (error) redirect(`/admin/articoli/${id}?error=${encodeURIComponent(error.message)}`)

  await supabase.from('movements').insert({
    movement_type: 'MODIFICA',
    reference_id: id,
    reference_code: id,
    article_id: id,
    description: 'Articolo modificato',
    operator_user_id: (await supabase.auth.getUser()).data.user?.id || null,
  })

  redirect(`/admin/articoli/${id}?message=Modifiche salvate correttamente.`)
}


export async function updateSelectedArticles(formData: FormData) {
  const { supabase } = await assertAdmin()
  const ids = String(formData.get('article_ids') || '').split(',').map((x) => x.trim()).filter(Boolean)
  if (!ids.length) redirect('/admin/articoli/archivio?error=Nessun articolo selezionato.')

  const { data: sales } = await supabase.from('movements').select('article_id,quantity').eq('movement_type','VENDITA').in('article_id', ids)
  const soldById = new Map<string, number>()
  for (const row of sales || []) soldById.set(row.article_id, (soldById.get(row.article_id) || 0) + Number(row.quantity || 0))

  for (const id of ids) {
    const quantity = num(formData, `quantity_${id}`)
    const unitPrice = num(formData, `unit_price_${id}`)
    const exchangeRate = num(formData, `exchange_rate_${id}`, 1)
    const accessory = num(formData, `accessory_cost_${id}`)
    const sold = soldById.get(id) || 0
    if (quantity < Math.max(1, sold) || exchangeRate <= 0 || unitPrice < 0 || accessory < 0) {
      redirect(`/admin/articoli/archivio?error=${encodeURIComponent(`Dati non validi per l'articolo ${id}.`)}`)
    }

    const { data: current } = await supabase.from('articles').select('quantity_purchased,status').eq('id', id).maybeSingle()
    if (!current) redirect(`/admin/articoli/archivio?error=${encodeURIComponent(`Articolo ${id} non trovato.`)}`)

    const { error } = await supabase.from('articles').update({
      unit_price_foreign: unitPrice,
      exchange_rate: exchangeRate,
      quantity_purchased: quantity,
      accessory_cost_eur: accessory,
    }).eq('id', id)
    if (error) redirect(`/admin/articoli/archivio?error=${encodeURIComponent(error.message)}`)

    const photoUrl = String(formData.get(`photo_url_${id}`) || '').trim()
    const photo = formData.get(`photo_${id}`)
    if (photo instanceof File && photo.size > 0) {
      if (!photo.type.startsWith('image/') || photo.size > 8 * 1024 * 1024) redirect(`/admin/articoli/archivio?error=${encodeURIComponent('Foto non valida o superiore a 8 MB.')}`)
      const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${id}-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('article-photos').upload(path, photo, { contentType: photo.type, upsert: true })
      if (uploadError) redirect(`/admin/articoli/archivio?error=${encodeURIComponent(`Caricamento foto non riuscito: ${uploadError.message}. Verifica che l'app punti al progetto Supabase corretto e che il bucket article-photos sia disponibile.`)}`)
      const { data: publicData } = supabase.storage.from('article-photos').getPublicUrl(path)
      const { error: photoError } = await supabase.from('articles').update({ photo_url: publicData.publicUrl }).eq('id', id)
      if (photoError) redirect(`/admin/articoli/archivio?error=${encodeURIComponent(photoError.message)}`)
    } else if (photoUrl) {
      try { new URL(photoUrl) } catch { redirect(`/admin/articoli/archivio?error=${encodeURIComponent(`Link immagine non valido per l'articolo ${id}.`)}`) }
      const { error: photoError } = await supabase.from('articles').update({ photo_url: photoUrl }).eq('id', id)
      if (photoError) redirect(`/admin/articoli/archivio?error=${encodeURIComponent(photoError.message)}`)
    }
  }

  redirect('/admin/articoli/archivio?message=Articoli modificati correttamente.')
}

export async function deleteSelectedArticles(formData: FormData) {
  const { supabase } = await assertAdmin()
  const ids = String(formData.get('article_ids') || '').split(',').map((x) => x.trim()).filter(Boolean)
  if (!ids.length) redirect('/admin/articoli/archivio?error=Nessun articolo selezionato.')

  const { data: movements } = await supabase.from('movements').select('article_id').in('article_id', ids).limit(1)
  if ((movements || []).length) redirect('/admin/articoli/archivio?error=Non puoi cancellare articoli che hanno già movimenti registrati.')
  const { data: assignments } = await supabase.from('article_assignments').select('article_id').in('article_id', ids).eq('status','ATTIVA').limit(1)
  if ((assignments || []).length) redirect('/admin/articoli/archivio?error=Non puoi cancellare articoli già assegnati a un cliente.')
  const { data: shipmentItems } = await supabase.from('shipment_items').select('article_id').in('article_id', ids).limit(1)
  if ((shipmentItems || []).length) redirect('/admin/articoli/archivio?error=Non puoi cancellare articoli già presenti in una spedizione.')

  const { data: { user: operator } } = await supabase.auth.getUser()
  await supabase.from('movements').insert(ids.map((id) => ({ movement_type: 'ANNULLAMENTO', reference_id: id, reference_code: id, article_id: id, description: 'Articolo cancellato', operator_user_id: operator?.id || null })))
  const { error } = await supabase.from('articles').delete().in('id', ids)
  if (error) redirect(`/admin/articoli/archivio?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/articoli/archivio?message=Articoli cancellati correttamente.')
}
