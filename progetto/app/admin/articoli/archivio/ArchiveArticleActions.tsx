'use client'

import { useMemo, useState } from 'react'
import ArticlePhotoButton from './ArticlePhotoButton'

type ArticleOption = {
  id: string
  article_code: string
  purchase_date: string
  series: string | null
  detail: string | null
  origin: string
  seller: string | null
  notes: string | null
  quantity_purchased: number
  currency: string
  unit_price_foreign: number
  exchange_rate: number
  accessory_cost_eur: number
  total_cost_eur: number | null
  unit_cost_eur: number | null
  status: string
  statusLabel: string
  statusClass: string
  photo_url: string | null
  sold: number
  available: number
  soldRevenue: number
  userCodes: Array<{ code: string; customerId: string }>
}

type Props = {
  articles: ArticleOption[]
  registerArrival: (formData: FormData) => Promise<void>
  registerSale: (formData: FormData) => Promise<void>
  updateSelectedArticles: (formData: FormData) => Promise<void>
  deleteSelectedArticles: (formData: FormData) => Promise<void>
  customerOptions?: Array<{ id: string; mailbox_code: string; first_name: string; last_name: string; email: string | null }>
}

type SaleLine = { quantity: string; price: string }
type EditLine = { unitPrice: string; exchangeRate: string; quantity: string; accessoryCost: string }

const money = (value: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)

export default function ArchiveArticleActions({ articles, registerArrival, registerSale, updateSelectedArticles, deleteSelectedArticles, customerOptions = [] }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [modal, setModal] = useState<'arrival' | 'sale' | 'edit' | 'photo' | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [arrivalDate, setArrivalDate] = useState('')
  const [customerCode, setCustomerCode] = useState('')
  const [saleTotal, setSaleTotal] = useState('')
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentEnabled, setPaymentEnabled] = useState(false)
  const [paymentMode, setPaymentMode] = useState<'ACCONTO' | 'SALDO'>('ACCONTO')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState('CONTANTI')
  const [saleLines, setSaleLines] = useState<Record<string, SaleLine>>({})
  const [editLines, setEditLines] = useState<Record<string, EditLine>>({})

  const selected = useMemo(() => articles.filter((a) => selectedIds.includes(a.id)), [articles, selectedIds])

  const summary = useMemo(() => {
    const purchase = selected.reduce((s, a) => s + Number(a.total_cost_eur || 0), 0)
    const actualSales = selected.reduce((s, a) => s + Number(a.sold || 0) * Number(a.unit_cost_eur || 0), 0)
    const actualRevenue = selected.reduce((s, a) => s + Number(a.soldRevenue || 0), 0)
    const plannedRevenue = selected.reduce((s, a) => {
      const line = saleLines[a.id]
      return s + Number(line?.quantity || 0) * Number(line?.price || 0)
    }, 0)
    return {
      quantity: selected.reduce((s, a) => s + a.available, 0),
      purchase,
      actualRevenue,
      actualMargin: actualRevenue - actualSales,
      plannedRevenue,
      plannedMargin: plannedRevenue - purchase,
    }
  }, [selected, saleLines])

  const toggle = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
    setSaleLines((current) => ({ ...current, [id]: current[id] || { quantity: '1', price: '' } }))
  }

  const toggleAll = () => {
    if (selectedIds.length === articles.length) setSelectedIds([])
    else setSelectedIds(articles.map((a) => a.id))
  }

  const openEdit = () => {
    const next: Record<string, EditLine> = {}
    selected.forEach((a) => {
      next[a.id] = {
        unitPrice: String(a.unit_price_foreign ?? 0),
        exchangeRate: String(a.exchange_rate ?? 1),
        quantity: String(a.quantity_purchased ?? 1),
        accessoryCost: String(a.accessory_cost_eur ?? 0),
      }
    })
    setEditLines(next)
    setModal('edit')
  }

  const updateLine = (id: string, field: keyof SaleLine, value: string) => {
    setSaleLines((current) => ({ ...current, [id]: { quantity: current[id]?.quantity || '1', price: current[id]?.price || '', [field]: value } }))
  }

  const updateEditLine = (id: string, field: keyof EditLine, value: string) => {
    setEditLines((current) => ({ ...current, [id]: { ...(current[id] || { unitPrice: '', exchangeRate: '1', quantity: '1', accessoryCost: '0' }), [field]: value } }))
  }

  const distribute = () => {
    const total = Number(saleTotal)
    const base = selected.reduce((s, a) => s + Number(a.total_cost_eur || 0), 0)
    if (!total || total <= 0 || base <= 0) return
    setSaleLines((current) => {
      const next = { ...current }
      selected.forEach((a) => {
        const qty = Math.min(a.available, Math.max(1, Number(current[a.id]?.quantity || 1)))
        const lineTotal = total * Number(a.total_cost_eur || 0) / base
        next[a.id] = { quantity: String(qty), price: (lineTotal / qty).toFixed(2) }
      })
      return next
    })
  }

  const saleReady = selected.length > 0 && customerCode.trim() && selected.every((a) => {
    const line = saleLines[a.id]
    return Number(line?.quantity) >= 1 && Number(line?.quantity) <= a.available && Number(line?.price) > 0
  })

  return (
    <>
      <div className="heading-actions archive-top-actions">
        <button type="button" className="archive-action-button" disabled={!selected.length} onClick={() => { setArrivalDate(''); setModal('arrival') }}>REGISTRA ARRIVO</button>
        <button type="button" className="archive-action-button" disabled={!selected.length} onClick={() => setModal('sale')}>REGISTRA VENDITA</button>
        <button type="button" className="archive-action-button" disabled={!selected.length} onClick={openEdit}>MODIFICA</button>
      </div>

      {selected.length > 0 && <div className="selected-operation-panel">
        <div className="selected-summary-title"><strong>{selected.length} articolo/i selezionato/i</strong><button type="button" className="link-button" onClick={() => setSelectedIds([])}>Deseleziona</button></div>
        <div className="selected-summary-grid">
          <div><span>Quantità residua</span><strong>{summary.quantity}</strong></div>
          <div><span>Valore acquistato</span><strong>{money(summary.purchase)}</strong></div>
          <div><span>Ricavi già registrati</span><strong>{money(summary.actualRevenue)}</strong></div>
          <div><span>Margine già registrato</span><strong>{money(summary.actualMargin)}</strong></div>
        </div>
      </div>}

      <div className="results-row">
        <span className="results-count">{articles.length} articoli</span>
        <label><input type="checkbox" checked={articles.length > 0 && selectedIds.length === articles.length} onChange={toggleAll} /> Seleziona tutti</label>
      </div>

      <div className="articles-table-wrapper">
        <table className="articles-table">
          <thead><tr><th>CODICE</th><th>DATA</th><th>SERIE</th><th>DETTAGLIO</th><th>Q</th><th>S</th><th>€€</th><th>€</th><th>STATO</th><th>UTENTI</th></tr></thead>
          <tbody>{articles.map((a) => <tr key={a.id}>
            <td>
              <div className="article-code-cell">
                <strong>{a.article_code}</strong>
                <div className="article-row-tools">
                  <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggle(a.id)} aria-label={`Seleziona ${a.article_code}`} />
                  <ArticlePhotoButton articleId={a.id} photoUrl={a.photo_url} onOpen={() => { setPhotoUrl(a.photo_url); setModal('photo') }} />
                </div>
              </div>
            </td>
            <td>{a.purchase_date}</td>
            <td>{a.series || '—'}</td>
            <td><div className="article-detail-cell"><strong>{a.detail || '—'}</strong><small>Venditore: {a.seller || '—'} · Provenienza: {a.origin || '—'} · Note: {a.notes || '—'}</small></div></td>
            <td>{a.quantity_purchased}</td>
            <td>{a.sold}</td>
            <td>{money(Number(a.total_cost_eur || 0))}</td>
            <td>{money(Number(a.unit_cost_eur || 0))}</td>
            <td><span className={a.statusClass}>{a.statusLabel}</span></td>
            <td><div className="article-users-cell">{a.userCodes.length ? a.userCodes.map((item) => <a key={item.code} href={`/admin/clienti/${item.customerId}`}>{item.code}</a>) : <span>—</span>}</div></td>
          </tr>)}</tbody>
        </table>
      </div>

      {modal === 'arrival' && <div className="archive-modal"><div className="archive-modal-content"><h2>Registra arrivo</h2>{selected.map((a) => <p key={a.id}><strong>{a.article_code}</strong> · {a.series || '—'} · {a.detail || '—'}</p>)}<label>Data di arrivo<input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} required /></label><div className="archive-modal-actions"><button type="button" onClick={() => setModal(null)}>Annulla</button><form action={registerArrival}><input type="hidden" name="arrival_date" value={arrivalDate} />{selected.map((a) => <input key={a.id} type="hidden" name="article_id" value={a.id} />)}<button type="submit" disabled={!arrivalDate}>Conferma arrivo</button></form></div></div></div>}

      {modal === 'sale' && <div className="archive-modal"><div className="archive-modal-content archive-sale-modal"><h2>Registra vendita</h2>
        <label>Codice casella cliente<input list="archive-customer-options" value={customerCode} onChange={(e) => setCustomerCode(e.target.value.toUpperCase())} placeholder="Cerca codice, nome o cognome..." /><datalist id="archive-customer-options">{customerOptions.map((customer) => <option key={customer.id} value={customer.mailbox_code}>{customer.first_name} {customer.last_name}{customer.email ? ` — ${customer.email}` : ''}</option>)}</datalist></label>
        <label>Data movimento<input type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} required /></label>
        <div className="sale-total-row"><label>Totale vendita €<input type="number" min="0" step="0.01" value={saleTotal} onChange={(e) => setSaleTotal(e.target.value)} /></label><button type="button" onClick={distribute}>Distribuisci proporzionalmente</button></div>
        {selected.map((a) => { const line = saleLines[a.id] || { quantity: '1', price: '' }; return <div className="sale-line" key={a.id}><div><strong>{a.article_code}</strong><p>{a.series || '—'} · {a.detail || '—'}</p><small>Acquisto unitario: {money(Number(a.unit_cost_eur || 0))} · Residuo: {a.available}</small></div><label>Quantità<input type="number" min="1" max={a.available} value={line.quantity} onChange={(e) => updateLine(a.id, 'quantity', e.target.value)} /></label><label>Prezzo vendita unitario €<input type="number" min="0.01" step="0.01" value={line.price} onChange={(e) => updateLine(a.id, 'price', e.target.value)} /></label><strong>{money(Number(line.quantity || 0) * Number(line.price || 0))}</strong></div>})}
        <section className="sale-payment-section"><label className="checkbox-inline"><input type="checkbox" checked={paymentEnabled} onChange={(e) => setPaymentEnabled(e.target.checked)} /> Registra pagamento contestuale</label>{paymentEnabled && <div className="sale-inline-grid"><label>Tipo pagamento<select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as 'ACCONTO' | 'SALDO')}><option value="ACCONTO">ACCONTO</option><option value="SALDO">SALDO</option></select></label><label>Importo €<input type="number" min="0.01" step="0.01" value={paymentMode === 'SALDO' ? saleTotal : paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} disabled={paymentMode === 'SALDO'} /></label><label>Data pagamento<input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required /></label><label>Metodo<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option>CONTANTI</option><option>BONIFICO</option><option>PAYPAL</option><option>ALTRO</option></select></label></div>}</section>
        <div className="archive-modal-actions"><button type="button" onClick={() => setModal(null)}>Annulla</button><form action={registerSale}><input type="hidden" name="customer_code" value={customerCode} /><input type="hidden" name="movement_date" value={movementDate} /><input type="hidden" name="payment_enabled" value={paymentEnabled ? 'on' : ''} /><input type="hidden" name="payment_mode" value={paymentMode} /><input type="hidden" name="payment_amount" value={paymentMode === 'SALDO' ? saleTotal : paymentAmount} /><input type="hidden" name="payment_date" value={paymentDate} /><input type="hidden" name="payment_method" value={paymentMethod} />{selected.map((a) => <span key={a.id}><input type="hidden" name="sale_article_id" value={a.id} /><input type="hidden" name={`qty_${a.id}`} value={saleLines[a.id]?.quantity || '1'} /><input type="hidden" name={`price_${a.id}`} value={saleLines[a.id]?.price || ''} /></span>)}<button type="submit" disabled={!saleReady}>Conferma vendita</button></form></div>
      </div></div>}

      {modal === 'edit' && <div className="archive-modal"><div className="archive-modal-content archive-sale-modal"><h2>Modifica articoli</h2><p className="muted">Puoi modificare prezzo unitario, cambio, quantità, costi accessori e foto. Gli articoli già venduti non possono essere ridotti sotto la quantità venduta.</p><form action={updateSelectedArticles} encType="multipart/form-data"><input type="hidden" name="article_ids" value={selected.map((a) => a.id).join(',')} />{selected.map((a) => { const line = editLines[a.id]; return <div className="edit-article-line" key={a.id}><strong>{a.article_code}</strong><span>{a.series || '—'} · {a.detail || '—'} · venduti {a.sold}</span><div className="edit-grid"><label>Prezzo unitario<input name={`unit_price_${a.id}`} type="number" step="0.01" min="0" defaultValue={line?.unitPrice} /></label><label>Cambio<input name={`exchange_rate_${a.id}`} type="number" step="0.0001" min="0.0001" defaultValue={line?.exchangeRate} /></label><label>Quantità<input name={`quantity_${a.id}`} type="number" step="1" min={Math.max(1, a.sold)} defaultValue={line?.quantity} /></label><label>Costi accessori €<input name={`accessory_cost_${a.id}`} type="number" step="0.01" min="0" defaultValue={line?.accessoryCost} /></label><label className="edit-photo-field">Foto<input name={`photo_${a.id}`} type="file" accept="image/*" /></label><label className="edit-photo-field">Link nuova immagine<input name={`photo_url_${a.id}`} type="url" placeholder="https://.../immagine.jpg" /></label></div></div>})}<div className="archive-modal-actions"><button type="button" onClick={() => setModal(null)}>Annulla</button><button type="submit">Salva modifiche</button></div></form>{selected.length > 0 && <form action={deleteSelectedArticles} className="delete-selected-form"><input type="hidden" name="article_ids" value={selected.map((a) => a.id).join(',')} /><button type="submit" className="danger-button">Cancella articoli selezionati</button></form>}</div></div>}

      {modal === 'photo' && photoUrl && <div className="image-modal" onClick={() => setModal(null)}><div className="image-modal-content" onClick={(e) => e.stopPropagation()}><button type="button" className="modal-close" onClick={() => setModal(null)}>×</button><img src={photoUrl} alt="Immagine articolo" onError={(e) => { e.currentTarget.alt = 'Immagine non disponibile'; e.currentTarget.style.display = 'none' }} /></div></div>}
    </>
  )
}
