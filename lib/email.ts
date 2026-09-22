import { createClient } from './supabase-server'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '')
const FROM = process.env.EMAIL_FROM || ''
const API_KEY = process.env.RESEND_API_KEY || ''

export type CustomerEmailEvent =
  | 'REGISTRAZIONE'
  | 'ACQUISTO'
  | 'PAGAMENTO'
  | 'SPEDIZIONE'
  | 'CREDITO'
  | 'ANNULLAMENTO'

function esc(value: unknown) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function money(value: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)
}

async function sendEmail(to: string, subject: string, html: string, eventType: CustomerEmailEvent | 'NUOVI_ARTICOLI', entityId?: string | null) {
  if (!API_KEY || !FROM || !to) return { ok: false, skipped: true }
  const supabase = await createClient()
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({}))
  await supabase.from('email_notifications').insert({
    recipient: to,
    event_type: eventType,
    entity_id: entityId || null,
    status: response.ok ? 'INVIATA' : 'ERRORE',
    provider_message_id: payload?.id || null,
    error_message: response.ok ? null : String(payload?.message || payload?.error || 'Errore invio email'),
  })
  return { ok: response.ok, skipped: false, data: payload }
}

async function customerContact(mailboxId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('mailboxes').select('id,mailbox_code,customer_id,customers(first_name,last_name,email)').eq('id', mailboxId).maybeSingle()
  const customer: any = Array.isArray((data as any)?.customers) ? (data as any).customers[0] : (data as any)?.customers
  return data ? { mailbox: data, customer } : null
}

export async function notifyCustomer(mailboxId: string, eventType: Exclude<CustomerEmailEvent, 'REGISTRAZIONE'>, title: string, details: string, entityId?: string | null) {
  const contact = await customerContact(mailboxId)
  const email = contact?.customer?.email
  if (!email) return
  const firstName = contact?.customer?.first_name || 'Cliente'
  const code = contact?.mailbox?.mailbox_code || ''
  const loginUrl = `${APP_URL}/login`
  await sendEmail(email, `${title} · ShopaTüT`, `<!doctype html><html lang="it"><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222"><div style="max-width:640px;margin:auto"><h2>${esc(title)}</h2><p>Ciao ${esc(firstName)},</p><p>${details}</p><p><b>Codice cliente:</b> ${esc(code)}</p><p><a href="${esc(loginUrl)}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Accedi a ShopaTüT</a></p></div></body></html>`, eventType, entityId)
}

export async function notifyRegistration(mailboxId: string) {
  const contact = await customerContact(mailboxId)
  const email = contact?.customer?.email
  if (!email) return
  const firstName = contact?.customer?.first_name || 'Cliente'
  const code = contact?.mailbox?.mailbox_code || ''
  await sendEmail(email, 'Benvenuto in ShopaTüT', `<!doctype html><html lang="it"><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222"><div style="max-width:640px;margin:auto"><h2>Benvenuto in ShopaTüT</h2><p>Ciao ${esc(firstName)},</p><p>la tua registrazione è stata completata.</p><p><b>Codice cliente:</b> ${esc(code)}</p><p>Puoi accedere alla tua area personale per controllare articoli, pagamenti, crediti, spedizioni e movimenti.</p><p><a href="${esc(`${APP_URL}/login`)}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Accedi alla tua area</a></p></div></body></html>`, 'REGISTRAZIONE', mailboxId)
}

export async function notifyNewArticleDigest() {
  if (!API_KEY || !FROM) return
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabase.from('email_notifications').select('id').eq('event_type', 'NUOVI_ARTICOLI').eq('status', 'INVIATA').gte('created_at', cutoff).limit(1)
  if ((recent || []).length) return

  const { data: articles } = await supabase.from('articles').select('id,article_code,series,detail,origin,photo_url,purchase_date').order('purchase_date', { ascending: false }).limit(6)
  const previewArticles = (articles || []).filter((a: any) => a.photo_url).slice(0, 4)
  if (!previewArticles.length) return

  const { data: customers } = await supabase.from('customers').select('id,first_name,email').not('email', 'is', null)
  const recipients = (customers || []).filter((c: any) => String(c.email || '').trim())
  if (!recipients.length) return

  const cards = previewArticles.map((a: any) => `<div style="display:inline-block;vertical-align:top;width:46%;margin:1%;box-sizing:border-box"><img src="${esc(a.photo_url)}" alt="${esc(a.article_code)}" style="width:100%;height:180px;object-fit:cover;border-radius:8px"><p><b>${esc(a.article_code)}</b><br>${esc(a.series || '')}${a.detail ? ` · ${esc(a.detail)}` : ''}</p></div>`).join('')
  const html = `<!doctype html><html lang="it"><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222"><div style="max-width:680px;margin:auto"><h2>Nuovi articoli in archivio</h2><p>Ciao, abbiamo inserito nuovi articoli in archivio.</p><div>${cards}</div><p>Queste sono solo alcune anteprime. Accedi alla tua area ShopaTüT per vedere tutti gli articoli disponibili e le relative informazioni.</p><p><a href="${esc(`${APP_URL}/login`)}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Accedi e scopri di più</a></p></div></body></html>`

  for (let i = 0; i < recipients.length; i += 5) {
    await Promise.allSettled(recipients.slice(i, i + 5).map((c: any) => sendEmail(String(c.email).trim(), 'Nuovi articoli in archivio · ShopaTüT', html.replace('Ciao,', `Ciao ${esc(c.first_name || '')},`), 'NUOVI_ARTICOLI', null)))
  }
}

export { money }
