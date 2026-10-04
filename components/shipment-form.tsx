'use client'

import { useMemo, useState } from 'react'
import CustomerAutocomplete from './customer-autocomplete'

type Mailbox = { id: string; customer_code: string; customer_name: string }
type Article = { id: string; article_code: string; detail: string | null; mailbox_id: string; available: number }

export default function ShipmentForm({ action, mailboxes, articles }: { action: (formData: FormData) => void | Promise<void>; mailboxes: Mailbox[]; articles: Article[] }) {
  const [mailboxId, setMailboxId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const visible = useMemo(() => articles.filter((a) => a.mailbox_id === mailboxId && a.available > 0), [articles, mailboxId])
  return <form action={action} className="bulk-action-form">
    <input type="hidden" name="mailbox_id" value={mailboxId} />
    <label>Codice utente<CustomerAutocomplete value={customerSearch} onChange={(value) => { setCustomerSearch(value); const match=mailboxes.find((m)=>m.customer_code.toUpperCase()===value.trim().toUpperCase()); setMailboxId(match?.id || '') }} onSelect={(option) => { setCustomerSearch(option.code); setMailboxId(option.id) }} placeholder="Cerca per codice utente, nome o cognome..." required options={mailboxes.map((m) => ({ id:m.id, code:m.customer_code, name:m.customer_name }))} /></label>
    <div className="article-selection-list">
      {!mailboxId ? <div className="empty">Seleziona un cliente per visualizzare i suoi articoli IN STOCK assegnati.</div> : visible.length === 0 ? <div className="empty">Nessun articolo IN STOCK disponibile per questo cliente.</div> : visible.map((article) => <label className="article-select-row" key={article.id}><input type="checkbox" name="article_id" value={article.id} /><span><strong>{article.article_code}</strong><small>{article.detail || 'Articolo'} · IN STOCK · Disponibili: {article.available}</small></span><input type="number" name={`qty_${article.id}`} min="1" max={article.available} step="1" defaultValue="1" style={{ maxWidth: 100 }} /></label>)}
    </div>
    <div className="columns"><label>Corriere<select name="courier" required defaultValue=""><option value="">Seleziona corriere</option><option>GLS</option><option>DHL</option><option>UPS</option><option>POSTE ITALIANE</option><option>BRT</option><option>SDA</option><option>INPOST</option></select></label><label>Tracking number<input name="tracking" placeholder="Inserisci il tracking" autoComplete="off" /></label></div>
    <div className="shipment-compact-row"><label>Costo spedizione (€)<input type="number" name="shipping_cost_eur" min="0" step="0.01" defaultValue="0" /></label><label className="checkbox-inline"><input type="checkbox" name="shipping_paid" /> Pagato</label><label>Note<input name="notes" placeholder="Note opzionali" /></label></div>
    <button type="submit" disabled={!mailboxId || visible.length === 0}>Registra spedizione</button>
  </form>
}
