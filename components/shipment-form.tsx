'use client'

import { useMemo, useState } from 'react'

type Mailbox = { id: string; mailbox_code: string; customer_name: string }
type Article = { id: string; article_code: string; detail: string | null; mailbox_id: string; available: number }

export default function ShipmentForm({ action, mailboxes, articles }: { action: (formData: FormData) => void | Promise<void>; mailboxes: Mailbox[]; articles: Article[] }) {
  const [mailboxId, setMailboxId] = useState('')
  const visible = useMemo(() => articles.filter((a) => a.mailbox_id === mailboxId && a.available > 0), [articles, mailboxId])
  return <form action={action} className="bulk-action-form">
    <label>Casella cliente<select name="mailbox_id" value={mailboxId} onChange={(e) => setMailboxId(e.target.value)} required><option value="">Seleziona casella</option>{mailboxes.map((m) => <option key={m.id} value={m.id}>{m.mailbox_code} — {m.customer_name}</option>)}</select></label>
    <div className="article-selection-list">
      {!mailboxId ? <div className="empty">Seleziona una casella per visualizzare solo i suoi articoli IN STOCK.</div> : visible.length === 0 ? <div className="empty">Nessun articolo IN STOCK disponibile per questa casella.</div> : visible.map((article) => <label className="article-select-row" key={article.id}><input type="checkbox" name="article_id" value={article.id} /><span><strong>{article.article_code}</strong><small>{article.detail || 'Articolo'} · IN STOCK · Disponibili: {article.available}</small></span><input type="number" name={`qty_${article.id}`} min="1" max={article.available} step="1" defaultValue="1" style={{ maxWidth: 100 }} /></label>)}
    </div>
    <div className="columns"><label>Corriere<select name="courier" required defaultValue=""><option value="">Seleziona corriere</option><option>GLS</option><option>DHL</option><option>UPS</option><option>POSTE ITALIANE</option><option>BRT</option><option>SDA</option><option>INPOST</option></select></label><label>Tracking number<input name="tracking" placeholder="Inserisci il tracking" autoComplete="off" /></label></div>
    <div className="shipment-compact-row"><label>Costo spedizione (€)<input type="number" name="shipping_cost_eur" min="0" step="0.01" defaultValue="0" /></label><label className="checkbox-inline"><input type="checkbox" name="shipping_paid" /> Pagato</label><label>Note<input name="notes" placeholder="Note opzionali" /></label></div>
    <button type="submit" disabled={!mailboxId || visible.length === 0}>Registra spedizione</button>
  </form>
}
