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
  quantity_purchased: number
  total_cost_eur: number | null
  unit_cost_eur: number | null
  status: string
  statusLabel: string
  statusClass: string
  photo_url: string | null
  sold: number
  available: number
}

type Props = {
  articles: ArticleOption[]
  registerArrival: (formData: FormData) => Promise<void>
  registerSale: (formData: FormData) => Promise<void>
}

type SaleLine = { quantity: string; price: string }

const money = (value: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)

export default function ArchiveArticleActions({ articles, registerArrival, registerSale }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [modal, setModal] = useState<'arrival' | 'sale' | 'photo' | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [arrivalDate, setArrivalDate] = useState('')
  const [customerCode, setCustomerCode] = useState('')
  const [saleTotal, setSaleTotal] = useState('')
  const [saleLines, setSaleLines] = useState<Record<string, SaleLine>>({})

  const selected = useMemo(() => articles.filter((a) => selectedIds.includes(a.id)), [articles, selectedIds])
  const summary = useMemo(() => {
    const purchase = selected.reduce((s, a) => s + Number(a.total_cost_eur || 0), 0)
    const sales = selected.reduce((s, a) => {
      const line = saleLines[a.id]
      return s + Number(line?.quantity || 0) * Number(line?.price || 0)
    }, 0)
    return { quantity: selected.reduce((s, a) => s + a.available, 0), purchase, sales, margin: sales - purchase }
  }, [selected, saleLines])

  const toggle = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
    setSaleLines((current) => ({ ...current, [id]: current[id] || { quantity: '1', price: '' } }))
  }

  const toggleAll = () => {
    if (selectedIds.length === articles.length) setSelectedIds([])
    else setSelectedIds(articles.map((a) => a.id))
  }

  const updateLine = (id: string, field: keyof SaleLine, value: string) => {
    setSaleLines((current) => ({ ...current, [id]: { quantity: current[id]?.quantity || '1', price: current[id]?.price || '', [field]: value } }))
  }

  const distribute = () => {
    const total = Number(saleTotal)
    const base = selected.reduce((s, a) => s + Number(a.total_cost_eur || 0), 0)
    if (!total || total <= 0 || base <= 0) return
    setSaleLines((current) => {
      const next = { ...current }
      selected.forEach((a) => { next[a.id] = { quantity: String(Math.min(a.available, Math.max(1, Number(current[a.id]?.quantity || 1)))), price: (total * Number(a.total_cost_eur || 0) / base / Math.max(1, Number(current[a.id]?.quantity || 1))).toFixed(2) } })
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
        <button type="button" className="archive-action-button" disabled={!selected.length} onClick={() => setModal('arrival')}>REGISTRA ARRIVO</button>
        <button type="button" className="archive-action-button" disabled={!selected.length} onClick={() => setModal('sale')}>REGISTRA VENDITA</button>
        <button type="button" className="archive-action-button" disabled={selected.length !== 1} onClick={() => { if (selected.length === 1) window.location.href = `/admin/articoli/${selected[0].id}` }}>MODIFICA</button>
      </div>

      <div className="results-row">
        <span className="results-count">{articles.length} articoli</span>
        <label><input type="checkbox" checked={articles.length > 0 && selectedIds.length === articles.length} onChange={toggleAll} /> Seleziona tutti</label>
      </div>

      {selected.length > 0 && <div className="selected-operation-panel">
        <strong>{selected.length} articolo/i selezionato/i</strong>
        <div className="selected-summary-grid">
          <div><span>Quantità residua</span><strong>{summary.quantity}</strong></div>
          <div><span>Valore acquisto</span><strong>{money(summary.purchase)}</strong></div>
          <div><span>Valore vendita</span><strong>{money(summary.sales)}</strong></div>
          <div><span>Margine stimato</span><strong>{money(summary.margin)}</strong></div>
        </div>
      </div>}

      <div className="articles-table-wrapper">
        <table className="articles-table">
          <thead><tr><th>CODICE</th><th>DATA</th><th>SERIE</th><th>DETTAGLIO</th><th>Q</th><th>S</th><th>€€</th><th>€</th><th>STATO</th><th>UTENTI</th></tr></thead>
          <tbody>{articles.map((a) => <tr key={a.id}>
            <td><div className="article-code-cell"><strong>{a.article_code}</strong><label><input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggle(a.id)} /> <ArticlePhotoButton articleId={a.id} photoUrl={a.photo_url} onOpen={() => { setPhotoUrl(a.photo_url); setModal('photo') }} /></label></div></td>
            <td>{a.purchase_date}</td><td>{a.series || '—'}</td><td><div className="article-detail-cell"><strong>{a.detail || '—'}</strong>{a.seller && <small>{a.seller}</small>}</div></td>
            <td>{a.quantity_purchased}</td><td>{a.sold}</td><td>{money(Number(a.total_cost_eur || 0))}</td><td>{money(Number(a.unit_cost_eur || 0))}</td><td><span className={a.statusClass}>{a.statusLabel}</span></td><td><a href={`/admin/articoli/${a.id}`} className="table-action">{a.origin || 'Utenti'}</a></td>
          </tr>)}</tbody>
        </table>
      </div>

      {modal === 'arrival' && <div className="archive-modal"><div className="archive-modal-content"><h2>Registra arrivo</h2>{selected.map((a) => <p key={a.id}><strong>{a.article_code}</strong> · {a.series || '—'} · {a.detail || '—'}</p>)}<label>Data di arrivo<input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} required /></label><div className="archive-modal-actions"><button type="button" onClick={() => setModal(null)}>Annulla</button><form action={registerArrival}><input type="hidden" name="arrival_date" value={arrivalDate} />{selected.map((a) => <input key={a.id} type="hidden" name="article_id" value={a.id} />)}<button type="submit" disabled={!arrivalDate}>Conferma arrivo</button></form></div></div></div>}

      {modal === 'sale' && <div className="archive-modal"><div className="archive-modal-content archive-sale-modal"><h2>Registra vendita</h2><label>Codice casella cliente<input value={customerCode} onChange={(e) => setCustomerCode(e.target.value.toUpperCase())} placeholder="0000AAA" /></label><label>Totale vendita €<input type="number" min="0" step="0.01" value={saleTotal} onChange={(e) => setSaleTotal(e.target.value)} /></label><button type="button" onClick={distribute}>Distribuisci proporzionalmente</button>{selected.map((a) => { const line = saleLines[a.id] || { quantity: '1', price: '' }; return <div className="sale-line" key={a.id}><div><strong>{a.article_code}</strong><p>{a.series || '—'} · {a.detail || '—'}</p><small>Acquisto unitario: {money(Number(a.unit_cost_eur || 0))} · Residuo: {a.available}</small></div><label>Quantità<input type="number" min="1" max={a.available} value={line.quantity} onChange={(e) => updateLine(a.id, 'quantity', e.target.value)} /></label><label>Prezzo vendita unitario €<input type="number" min="0.01" step="0.01" value={line.price} onChange={(e) => updateLine(a.id, 'price', e.target.value)} /></label></div>})}<div className="archive-modal-actions"><button type="button" onClick={() => setModal(null)}>Annulla</button><form action={registerSale}><input type="hidden" name="customer_code" value={customerCode} />{selected.map((a) => <span key={a.id}><input type="hidden" name="sale_article_id" value={a.id} /><input type="hidden" name={`qty_${a.id}`} value={saleLines[a.id]?.quantity || '1'} /><input type="hidden" name={`price_${a.id}`} value={saleLines[a.id]?.price || ''} /></span>)}<button type="submit" disabled={!saleReady}>Conferma vendita</button></form></div></div></div>}

      {modal === 'photo' && photoUrl && <div className="image-modal" onClick={() => setModal(null)}><div className="image-modal-content" onClick={(e) => e.stopPropagation()}><button type="button" className="modal-close" onClick={() => setModal(null)}>×</button><img src={photoUrl} alt="Immagine articolo" /></div></div>}
    </>
  )
}
