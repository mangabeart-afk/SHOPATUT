'use client'

import { useMemo, useState } from 'react'
import ArticlePhotoButton from './ArticlePhotoButton'
import CustomerAutocomplete from '../../../../components/customer-autocomplete'
import ArticleForm from '../../../../components/article-form'

type ArticleOption = {
  id: string
  article_code: string
  purchase_date: string
  purchase_date_iso: string
  article_type: string
  commission_mode: string
  commission_cost: number
  commission_percent: number
  commission_currency: string | null
  commission_exchange_rate: number
  customs_mode: string
  shipping_mode: string
  series: string | null
  detail: string | null
  origin: string
  seller: string | null
  notes: string | null
  quantity_purchased: number
  total_cost_eur: number | null
  unit_price_foreign: number
  exchange_rate: number
  currency: string
  accessory_cost_eur: number
  unit_cost_eur: number | null
  customs_cost: number
  customs_percent: number
  customs_currency: string | null
  customs_exchange_rate: number
  shipping_cost: number
  shipping_percent: number
  shipping_currency: string | null
  shipping_exchange_rate: number
  status: string
  statusLabel: string
  statusClass: string
  photo_url: string | null
  sold: number
  available: number
  soldRevenue: number
  userCodes: Array<{
    code: string
    customerId: string
    name: string
    quantity: number
    total: number
  }>
}

type Props = {
  articles: ArticleOption[]
  registerArrival: (formData: FormData) => Promise<void>
  registerSale: (formData: FormData) => Promise<void>
  updateArticle: (formData: FormData) => Promise<void>
  updateSelectedArticles: (formData: FormData) => Promise<void>
  deleteSelectedArticles: (formData: FormData) => Promise<void>
  customerOptions?: Array<{
    id: string
    mailbox_code: string
    first_name: string
    last_name: string
    email: string | null
  }>
}

type SaleLine = { quantity: string; price: string }
type BulkEdit = {
  commissionMode: string
  commissionCost: string
  commissionCurrency: string
  commissionPercent: string
  customsMode: string
  customsCost: string
  customsCurrency: string
  customsPercent: string
  shippingMode: string
  shippingCost: string
  shippingCurrency: string
  shippingPercent: string
  rateJpy: string
  rateUsd: string
}

const EMPTY_BULK_EDIT: BulkEdit = {
  commissionMode: '', commissionCost: '', commissionCurrency: '', commissionPercent: '',
  customsMode: '', customsCost: '', customsCurrency: '', customsPercent: '',
  shippingMode: '', shippingCost: '', shippingCurrency: '', shippingPercent: '',
  rateJpy: '', rateUsd: '',
}

const money = (value: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value || 0)

const plainNumber = (value: number) =>
  new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)

export default function ArchiveArticleActions({
  articles,
  registerArrival,
  registerSale,
  updateArticle,
  updateSelectedArticles,
  deleteSelectedArticles,
  customerOptions = [],
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [modal, setModal] = useState<
    'arrival' | 'sale' | 'edit' | 'delete' | 'photo' | 'users' | null
  >(null)
  const [usersArticle, setUsersArticle] = useState<ArticleOption | null>(null)
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
  const [bulkEdit, setBulkEdit] = useState<BulkEdit>(EMPTY_BULK_EDIT)

  const selected = useMemo(
    () => articles.filter((a) => selectedIds.includes(a.id)),
    [articles, selectedIds],
  )

  const summary = useMemo(() => {
    const totals = selected.reduce(
      (acc, a) => {
        const purchased = Number(a.quantity_purchased || 0)
        const sold = Number(a.sold || 0)
        const unitCost = Number(a.unit_cost_eur || 0)
        const revenue = Number(a.soldRevenue || 0)

        acc.finalPurchase += Number(a.total_cost_eur || 0)
        acc.quantity += purchased
        acc.residual += Number(a.available || 0)
        acc.exchangeRateSum += Number(a.exchange_rate || 0)
        acc.exchangeRateCount += 1

        const purchaseBaseEur =
          a.currency === 'EUR'
            ? Number(a.unit_price_foreign || 0) * purchased
            : (Number(a.unit_price_foreign || 0) * purchased) /
              Math.max(Number(a.exchange_rate || 1), 0.0001)
        const customsPercent = Number(a.customs_percent || 0)
        const customsEur =
          customsPercent > 0
            ? (purchaseBaseEur * customsPercent) / 100
            : Number(a.customs_cost || 0) /
              (a.customs_currency === 'EUR'
                ? 1
                : Math.max(Number(a.customs_exchange_rate || 1), 0.0001))
        const shippingPercent = Number(a.shipping_percent || 0)
        const shippingEur =
          shippingPercent > 0
            ? (purchaseBaseEur * shippingPercent) / 100
            : Number(a.shipping_cost || 0) /
              (a.shipping_currency === 'EUR'
                ? 1
                : Math.max(Number(a.shipping_exchange_rate || 1), 0.0001))

        acc.customs += customsEur
        acc.shipping += shippingEur
        acc.revenue += revenue
        acc.sold += sold
        acc.soldCost += sold * unitCost
        return acc
      },
      {
        finalPurchase: 0,
        quantity: 0,
        residual: 0,
        exchangeRateSum: 0,
        exchangeRateCount: 0,
        customs: 0,
        shipping: 0,
        revenue: 0,
        sold: 0,
        soldCost: 0,
      },
    )

    const margin = totals.revenue - totals.soldCost
    return {
      ...totals,
      averageExchangeRate:
        totals.exchangeRateCount > 0
          ? totals.exchangeRateSum / totals.exchangeRateCount
          : 0,
      margin,
    }
  }, [selected])

  const toggle = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    )
    setSaleLines((current) => ({
      ...current,
      [id]: current[id] || { quantity: '1', price: '' },
    }))
  }

  const toggleAll = () => {
    if (selectedIds.length === articles.length) setSelectedIds([])
    else setSelectedIds(articles.map((a) => a.id))
  }

  const commonValue = (values: string[]) => {
    const first = values[0] ?? ''
    return values.every((value) => value === first) ? first : ''
  }

  const commonRate = (currency: 'JPY' | 'USD') => {
    const fields: Array<[string, number]> = []
    selected.forEach((a) => {
      if ((a.currency || 'EUR').toUpperCase() === currency) fields.push([currency, Number(a.exchange_rate || 1)])
      if ((a.commission_currency || 'EUR').toUpperCase() === currency) fields.push([currency, Number(a.commission_exchange_rate || 1)])
      if ((a.customs_currency || 'EUR').toUpperCase() === currency) fields.push([currency, Number(a.customs_exchange_rate || 1)])
      if ((a.shipping_currency || 'EUR').toUpperCase() === currency) fields.push([currency, Number(a.shipping_exchange_rate || 1)])
    })
    const values = fields.map(([, rate]) => currency === 'JPY' ? String(Math.round(rate)) : String(rate))
    return values.length ? commonValue(values) : ''
  }

  const initialBulkAccessory = (prefix: 'commission' | 'customs' | 'shipping') => {
    const current = selected.map((article) => {
      const row = article as any
      const cost = Number(row[`${prefix}_cost`] || 0)
      const percent = Number(row[`${prefix}_percent`] || 0)
      const storedMode = String(row[`${prefix}_mode`] || 'FIXED').toUpperCase()
      const mode = storedMode !== 'PERCENT' && cost === 0 && percent > 0 ? 'PERCENT' : storedMode
      return { mode, cost: String(row[`${prefix}_cost`] ?? 0), percent: String(row[`${prefix}_percent`] ?? 0), currency: String(row[`${prefix}_currency`] || 'EUR') }
    })
    let mode = commonValue(current.map((item) => item.mode))
    const cost = commonValue(current.map((item) => item.cost))
    const currency = commonValue(current.map((item) => item.currency))
    const percent = commonValue(current.map((item) => item.percent))
    if (mode === 'FIXED' && (cost === '' || currency === '')) mode = ''
    if (mode === 'PERCENT' && percent === '') mode = ''
    return {
      mode,
      cost: mode === 'FIXED' ? cost : '',
      currency: mode === 'FIXED' ? currency : '',
      percent: mode === 'PERCENT' ? percent : '',
    }
  }

  const openEdit = () => {
    const commission = initialBulkAccessory('commission')
    const customs = initialBulkAccessory('customs')
    const shipping = initialBulkAccessory('shipping')
    setBulkEdit({
      commissionMode: commission.mode,
      commissionCost: commission.cost,
      commissionCurrency: commission.currency,
      commissionPercent: commission.percent,
      customsMode: customs.mode,
      customsCost: customs.cost,
      customsCurrency: customs.currency,
      customsPercent: customs.percent,
      shippingMode: shipping.mode,
      shippingCost: shipping.cost,
      shippingCurrency: shipping.currency,
      shippingPercent: shipping.percent,
      rateJpy: commonRate('JPY'),
      rateUsd: commonRate('USD'),
    })
    setModal('edit')
  }

  const updateLine = (id: string, field: keyof SaleLine, value: string) => {
    setSaleLines((current) => ({
      ...current,
      [id]: {
        quantity: current[id]?.quantity || '1',
        price: current[id]?.price || '',
        [field]: value,
      },
    }))
  }

  const distribute = () => {
    const total = Number(saleTotal)
    const base = selected.reduce((s, a) => s + Number(a.total_cost_eur || 0), 0)
    if (!total || total <= 0 || base <= 0) return
    setSaleLines((current) => {
      const next = { ...current }
      selected.forEach((a) => {
        const qty = Math.min(
          a.available,
          Math.max(1, Number(current[a.id]?.quantity || 1)),
        )
        const lineTotal = (total * Number(a.total_cost_eur || 0)) / base
        next[a.id] = {
          quantity: String(qty),
          price: (lineTotal / qty).toFixed(2),
        }
      })
      return next
    })
  }

  const saleReady =
    selected.length > 0 &&
    customerCode.trim() &&
    selected.every((a) => {
      const line = saleLines[a.id]
      return (
        Number(line?.quantity) >= 1 &&
        Number(line?.quantity) <= a.available &&
        Number(line?.price) > 0
      )
    })

  const editingArticle = selected.length === 1 ? selected[0] : null

  return (
    <>
      <div className="heading-actions archive-top-actions">
        <button
          type="button"
          className="archive-action-button"
          disabled={
            !selected.length ||
            selected.some((a) => a.available > 0 && a.status !== 'IN_STOCK') === false
          }
          onClick={() => {
            setArrivalDate('')
            setModal('arrival')
          }}
        >
          REGISTRA ARRIVO
        </button>
        <button
          type="button"
          className="archive-action-button"
          disabled={!selected.length || selected.every((a) => a.available <= 0)}
          onClick={() => setModal('sale')}
        >
          REGISTRA VENDITA
        </button>
        <button
          type="button"
          className="archive-action-button"
          disabled={!selected.length}
          onClick={openEdit}
        >
          MODIFICA
        </button>
        <button
          type="button"
          className="archive-action-button danger-button"
          disabled={!selected.length}
          onClick={() => setModal('delete')}
        >
          CANCELLA
        </button>
      </div>

      {selected.length > 0 && (
        <div className="selected-operation-panel">
          <div className="selected-summary-title">
            <strong>{selected.length} articolo/i selezionato/i</strong>
            <button
              type="button"
              className="link-button"
              onClick={() => setSelectedIds([])}
            >
              Deseleziona
            </button>
          </div>
          <div className="selected-summary-grid archive-cost-summary-grid">
            <div><span>€€€</span><strong>{money(summary.finalPurchase)}</strong></div>
            <div><span>Q</span><strong>{summary.quantity}</strong></div>
            <div><span>S</span><strong>{summary.residual}</strong></div>
            <div><span>Y/€</span><strong>{summary.averageExchangeRate ? Math.round(summary.averageExchangeRate) : '—'}</strong></div>
            <div><span>TAX</span><strong>{money(summary.customs)}</strong></div>
            <div><span>SPD</span><strong>{money(summary.shipping)}</strong></div>
            <div><span>SLD</span><strong>{money(summary.revenue)}</strong></div>
            <div><span>Q.SLD</span><strong>{summary.sold}</strong></div>
            <div><span>M.SLD</span><strong>{money(summary.margin)}</strong></div>
          </div>
        </div>
      )}

      <div className="results-row">
        <span className="results-count">{articles.length} articoli</span>
        <label>
          <input
            type="checkbox"
            checked={articles.length > 0 && selectedIds.length === articles.length}
            onChange={toggleAll}
          />{' '}
          Seleziona tutti
        </label>
      </div>

      <div className="articles-table-wrapper">
        <table className={`articles-table${articles.length === 1 ? ' single-article' : ''}`}>
          <thead>
            <tr>
              <th></th>
              <th>DATA</th>
              <th>CODICE</th>
              <th>FOTO</th>
              <th>SERIE</th>
              <th>DETTAGLI</th>
              <th>Q</th>
              <th>S</th>
              <th>€€€</th>
              <th className="archive-unit-cost-header">€</th>
              <th>STATO</th>
              <th>UTENTI</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a) => {
              const isSelected = selectedIds.includes(a.id)
              return (
                <tr
                  key={a.id}
                  className={isSelected ? 'archive-article-selected' : ''}
                >
                  <td className="archive-select-cell">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(a.id)}
                      aria-label={`Seleziona ${a.article_code}`}
                    />
                  </td>
                  <td className="archive-date-cell">{a.purchase_date}</td>
                  <td className="archive-code-cell"><strong>{a.article_code}</strong></td>
                  <td className="archive-photo-cell-visible">
                    <ArticlePhotoButton
                      articleId={a.id}
                      photoUrl={a.photo_url}
                      onOpen={() => {
                        setPhotoUrl(a.photo_url)
                        setModal('photo')
                      }}
                    />
                  </td>
                  <td className="archive-series-cell">
                    <div className="archive-description-line archive-series-line">
                      <strong>{(a.series || '—').toUpperCase()}</strong>
                    </div>
                  </td>
                  <td className="archive-details-cell">
                    <div className="article-detail-cell">
                      <div className="archive-description-line archive-detail-line">
                        <strong>{a.detail || '—'}</strong>
                      </div>
                      <div className="archive-description-line archive-context-line">
                        <strong>{[a.seller || '—', a.origin || '—', a.notes || '—'].join(' · ')}</strong>
                      </div>
                    </div>
                  </td>
                  <td className="archive-quantity-cell"><span className="archive-value-prefix">Q</span> {a.quantity_purchased}</td>
                  <td className="archive-stock-cell"><span className="archive-value-prefix">S</span> {a.available}</td>
                  <td className="archive-total-cost-cell"><span className="archive-value-prefix">€€€</span> {plainNumber(Number(a.total_cost_eur || 0))}</td>
                  <td className={`archive-unit-cost-cell${articles.length === 1 ? ' archive-unit-cost-hidden' : ''}`}><span className="archive-value-prefix">€</span> {plainNumber(Number(a.unit_cost_eur || 0))}</td>
                  <td className="archive-status-cell"><span className={a.statusClass}>{a.statusLabel}</span></td>
                  <td className="archive-users-cell">
                    <div className="article-users-cell">
                      {a.userCodes.length === 0 ? (
                        <span>—</span>
                      ) : a.userCodes.length === 1 ? (
                        <a href={`/admin/clienti/${a.userCodes[0].customerId}`}>{a.userCodes[0].code}</a>
                      ) : (
                        <button
                          type="button"
                          className="article-users-count"
                          onClick={() => {
                            setUsersArticle(a)
                            setModal('users')
                          }}
                        >
                          {a.userCodes.length} utenti
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal === 'arrival' && (
        <div className="archive-modal">
          <div className="archive-modal-content">
            <h2>Registra arrivo</h2>
            {selected.map((a) => (
              <p key={a.id}>
                <strong>{a.article_code}</strong> · {a.series || '—'} · {a.detail || '—'}
              </p>
            ))}
            <label>
              Data di arrivo
              <input
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
                required
              />
            </label>
            <div className="archive-modal-actions">
              <button type="button" onClick={() => setModal(null)}>Annulla</button>
              <form action={registerArrival}>
                <input type="hidden" name="arrival_date" value={arrivalDate} />
                {selected.map((a) => (
                  <input key={a.id} type="hidden" name="article_id" value={a.id} />
                ))}
                <button type="submit" disabled={!arrivalDate}>Conferma arrivo</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {modal === 'sale' && (
        <div className="archive-modal">
          <div className="archive-modal-content archive-sale-modal">
            <h2>Registra vendita</h2>
            <label>
              Codice casella cliente
              <CustomerAutocomplete
                value={customerCode}
                onChange={(value) => setCustomerCode(value.toUpperCase())}
                placeholder="Cerca codice, nome o cognome..."
                options={customerOptions.map((customer) => ({
                  id: customer.id,
                  code: customer.mailbox_code,
                  name: `${customer.first_name} ${customer.last_name}`.trim(),
                  email: customer.email,
                }))}
              />
            </label>
            <label>
              Data movimento
              <input type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} required />
            </label>
            <div className="sale-total-row">
              <label>Totale vendita €<input type="number" min="0" step="0.01" value={saleTotal} onChange={(e) => setSaleTotal(e.target.value)} /></label>
              <button type="button" onClick={distribute}>Distribuisci proporzionalmente</button>
            </div>
            {selected.map((a) => {
              const line = saleLines[a.id] || { quantity: '1', price: '' }
              return (
                <div className="sale-line" key={a.id}>
                  <div>
                    <strong>{a.article_code}</strong>
                    <p>{a.series || '—'} · {a.detail || '—'}</p>
                    <small>Acquisto unitario: {money(Number(a.unit_cost_eur || 0))} · Residuo: {a.available}</small>
                  </div>
                  <label>Quantità<input type="number" min="1" max={a.available} value={line.quantity} onChange={(e) => updateLine(a.id, 'quantity', e.target.value)} /></label>
                  <label>Prezzo vendita unitario €<input type="number" min="0.01" step="0.01" value={line.price} onChange={(e) => updateLine(a.id, 'price', e.target.value)} /></label>
                  <strong>{money(Number(line.quantity || 0) * Number(line.price || 0))}</strong>
                </div>
              )
            })}
            <section className="sale-payment-section">
              <label className="checkbox-inline">
                <input type="checkbox" checked={paymentEnabled} onChange={(e) => setPaymentEnabled(e.target.checked)} /> Registra pagamento contestuale
              </label>
              {paymentEnabled && (
                <div className="sale-inline-grid">
                  <label>Tipo pagamento<select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as 'ACCONTO' | 'SALDO')}><option value="ACCONTO">ACCONTO</option><option value="SALDO">SALDO</option></select></label>
                  <label>Importo €<input type="number" min="0.01" step="0.01" value={paymentMode === 'SALDO' ? saleTotal : paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} disabled={paymentMode === 'SALDO'} /></label>
                  <label>Data pagamento<input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required /></label>
                  <label>Metodo<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option>CONTANTI</option><option>BONIFICO</option><option>PAYPAL</option><option>ALTRO</option></select></label>
                </div>
              )}
            </section>
            <div className="archive-modal-actions">
              <button type="button" onClick={() => setModal(null)}>Annulla</button>
              <form action={registerSale}>
                <input type="hidden" name="customer_code" value={customerCode} />
                <input type="hidden" name="movement_date" value={movementDate} />
                <input type="hidden" name="payment_enabled" value={paymentEnabled ? 'on' : ''} />
                <input type="hidden" name="payment_mode" value={paymentMode} />
                <input type="hidden" name="payment_amount" value={paymentMode === 'SALDO' ? saleTotal : paymentAmount} />
                <input type="hidden" name="payment_date" value={paymentDate} />
                <input type="hidden" name="payment_method" value={paymentMethod} />
                {selected.map((a) => (
                  <span key={a.id}>
                    <input type="hidden" name="sale_article_id" value={a.id} />
                    <input type="hidden" name={`qty_${a.id}`} value={saleLines[a.id]?.quantity || '1'} />
                    <input type="hidden" name={`price_${a.id}`} value={saleLines[a.id]?.price || ''} />
                  </span>
                ))}
                <button type="submit" disabled={!saleReady}>Conferma vendita</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {modal === 'edit' && (
        <div className="archive-modal">
          <div className="archive-modal-content archive-sale-modal archive-article-edit-modal">
            <div className="archive-edit-modal-heading">
              <h2>{editingArticle ? `Modifica articolo ${editingArticle.article_code}` : `Modifica ${selected.length} articoli`}</h2>
              <button type="button" className="archive-edit-close" onClick={() => setModal(null)} aria-label="Chiudi">×</button>
            </div>

            {editingArticle ? (
              <ArticleForm
                action={updateArticle}
                mode="edit"
                returnTo="archive"
                showSaleSection={false}
                article={{
                  id: editingArticle.id,
                  article_code: editingArticle.article_code,
                  purchase_date: editingArticle.purchase_date_iso,
                  origin: editingArticle.origin,
                  article_type: editingArticle.article_type,
                  seller: editingArticle.seller,
                  series: editingArticle.series,
                  detail: editingArticle.detail,
                  quantity_purchased: editingArticle.quantity_purchased,
                  currency: editingArticle.currency,
                  unit_price_foreign: editingArticle.unit_price_foreign,
                  exchange_rate: editingArticle.exchange_rate,
                  commission_mode: editingArticle.commission_mode,
                  commission_cost: editingArticle.commission_cost,
                  commission_percent: editingArticle.commission_percent,
                  commission_currency: editingArticle.commission_currency || 'EUR',
                  commission_exchange_rate: editingArticle.commission_exchange_rate,
                  customs_mode: editingArticle.customs_mode,
                  customs_cost: editingArticle.customs_cost,
                  customs_percent: editingArticle.customs_percent,
                  customs_currency: editingArticle.customs_currency || 'EUR',
                  customs_exchange_rate: editingArticle.customs_exchange_rate,
                  shipping_mode: editingArticle.shipping_mode,
                  shipping_cost: editingArticle.shipping_cost,
                  shipping_percent: editingArticle.shipping_percent,
                  shipping_currency: editingArticle.shipping_currency || 'EUR',
                  shipping_exchange_rate: editingArticle.shipping_exchange_rate,
                  photo_url: editingArticle.photo_url,
                  notes: editingArticle.notes,
                  status: editingArticle.status,
                }}
              />
            ) : (
              <>
                <p className="muted">
                  Le modifiche si applicano a tutti gli articoli selezionati. Puoi scegliere per ciascun costo un importo con valuta oppure una percentuale. Il cambio è espresso come quantità di valuta estera per 1 EUR; lascia vuoto un campo cambio per mantenerlo invariato.
                </p>
                <form action={updateSelectedArticles} className="bulk-edit-form">
                  <input type="hidden" name="article_ids" value={selected.map((a) => a.id).join(',')} />

                  <div className="bulk-edit-sections">
                    <section className="bulk-edit-common bulk-edit-cost-group">
                      <h3>COMMISSIONE</h3>
                      <label>Modalità
                        <select name="bulk_commission_mode" value={bulkEdit.commissionMode} onChange={(e) => setBulkEdit((v) => ({ ...v, commissionMode: e.target.value, commissionCost: '', commissionCurrency: '', commissionPercent: '' }))}>
                          <option value="">Non modificare</option><option value="FIXED">Importo + valuta</option><option value="PERCENT">Percentuale %</option>
                        </select>
                      </label>
                      {bulkEdit.commissionMode === 'FIXED' && <>
                        <label>Importo commissione<input required name="bulk_commission_cost" type="number" min="0" step="0.01" value={bulkEdit.commissionCost} onChange={(e) => setBulkEdit((v) => ({ ...v, commissionCost: e.target.value }))} placeholder="Importo" /></label>
                        <label>Valuta commissione<select required name="bulk_commission_currency" value={bulkEdit.commissionCurrency} onChange={(e) => setBulkEdit((v) => ({ ...v, commissionCurrency: e.target.value }))}><option value="">Scegli valuta</option><option value="EUR">EUR</option><option value="JPY">JPY</option><option value="USD">USD</option></select></label>
                      </>}
                      {bulkEdit.commissionMode === 'PERCENT' && <label>Commissione %<input required name="bulk_commission_percent" type="number" min="0" step="0.01" value={bulkEdit.commissionPercent} onChange={(e) => setBulkEdit((v) => ({ ...v, commissionPercent: e.target.value }))} placeholder="Percentuale" /></label>}
                    </section>

                    <section className="bulk-edit-common bulk-edit-cost-group">
                      <h3>DOGANA</h3>
                      <label>Modalità
                        <select name="bulk_customs_mode" value={bulkEdit.customsMode} onChange={(e) => setBulkEdit((v) => ({ ...v, customsMode: e.target.value, customsCost: '', customsCurrency: '', customsPercent: '' }))}>
                          <option value="">Non modificare</option><option value="FIXED">Importo + valuta</option><option value="PERCENT">Percentuale %</option>
                        </select>
                      </label>
                      {bulkEdit.customsMode === 'FIXED' && <>
                        <label>Importo dogana<input required name="bulk_customs_cost" type="number" min="0" step="0.01" value={bulkEdit.customsCost} onChange={(e) => setBulkEdit((v) => ({ ...v, customsCost: e.target.value }))} placeholder="Importo" /></label>
                        <label>Valuta dogana<select required name="bulk_customs_currency" value={bulkEdit.customsCurrency} onChange={(e) => setBulkEdit((v) => ({ ...v, customsCurrency: e.target.value }))}><option value="">Scegli valuta</option><option value="EUR">EUR</option><option value="JPY">JPY</option><option value="USD">USD</option></select></label>
                      </>}
                      {bulkEdit.customsMode === 'PERCENT' && <label>Dogana %<input required name="bulk_customs_percent" type="number" min="0" step="0.01" value={bulkEdit.customsPercent} onChange={(e) => setBulkEdit((v) => ({ ...v, customsPercent: e.target.value }))} placeholder="Percentuale" /></label>}
                    </section>

                    <section className="bulk-edit-common bulk-edit-cost-group">
                      <h3>SPEDIZIONE</h3>
                      <label>Modalità
                        <select name="bulk_shipping_mode" value={bulkEdit.shippingMode} onChange={(e) => setBulkEdit((v) => ({ ...v, shippingMode: e.target.value, shippingCost: '', shippingCurrency: '', shippingPercent: '' }))}>
                          <option value="">Non modificare</option><option value="FIXED">Importo + valuta</option><option value="PERCENT">Percentuale %</option>
                        </select>
                      </label>
                      {bulkEdit.shippingMode === 'FIXED' && <>
                        <label>Importo spedizione<input required name="bulk_shipping_cost" type="number" min="0" step="0.01" value={bulkEdit.shippingCost} onChange={(e) => setBulkEdit((v) => ({ ...v, shippingCost: e.target.value }))} placeholder="Importo" /></label>
                        <label>Valuta spedizione<select required name="bulk_shipping_currency" value={bulkEdit.shippingCurrency} onChange={(e) => setBulkEdit((v) => ({ ...v, shippingCurrency: e.target.value }))}><option value="">Scegli valuta</option><option value="EUR">EUR</option><option value="JPY">JPY</option><option value="USD">USD</option></select></label>
                      </>}
                      {bulkEdit.shippingMode === 'PERCENT' && <label>Spedizione %<input required name="bulk_shipping_percent" type="number" min="0" step="0.01" value={bulkEdit.shippingPercent} onChange={(e) => setBulkEdit((v) => ({ ...v, shippingPercent: e.target.value }))} placeholder="Percentuale" /></label>}
                    </section>
                  </div>

                  <section className="bulk-edit-common bulk-edit-rates">
                    <h3>CAMBI VALUTA</h3>
                    <div className="bulk-edit-grid">
                      <label>EUR / €<input type="number" value="1" disabled readOnly /></label>
                      <label>Yen / € <small>1 EUR = JPY</small><input name="bulk_rate_jpy" type="number" min="1" step="1" value={bulkEdit.rateJpy} onChange={(e) => setBulkEdit((v) => ({ ...v, rateJpy: e.target.value }))} placeholder="Lascia invariato" /></label>
                      <label>$ / € <small>1 EUR = USD</small><input name="bulk_rate_usd" type="number" min="0.0001" step="0.0001" value={bulkEdit.rateUsd} onChange={(e) => setBulkEdit((v) => ({ ...v, rateUsd: e.target.value }))} placeholder="Lascia invariato" /></label>
                    </div>
                  </section>

                  <div className="archive-modal-actions">
                    <button type="button" onClick={() => setModal(null)}>Annulla</button>
                    <button type="submit">Salva modifiche</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {modal === 'delete' && (
        <div className="archive-modal" onClick={() => setModal(null)}>
          <div className="archive-modal-content delete-article-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Conferma cancellazione</h2>
            <p className="muted">
              Stai per cancellare {selected.length} articolo/i. Le assegnazioni attive verranno annullate e le vendite già registrate verranno neutralizzate con uno storno. Questa operazione non può essere annullata.
            </p>

            {selected.some((a) => a.userCodes.length > 0) && (
              <div className="delete-confirm-box">
                <strong>Articoli assegnati a clienti</strong>
                {selected.map((a) =>
                  a.userCodes.length > 0 ? (
                    <div className="delete-assigned-article" key={a.id}>
                      <strong>{a.article_code}</strong>
                      {a.userCodes.map((item) => (
                        <div className="delete-assigned-row" key={`${a.id}-${item.customerId}`}>
                          <a href={`/admin/clienti/${item.customerId}`}>{item.code}</a>
                          <span>{item.name || 'Cliente'}</span>
                          <span>Q {item.quantity}</span>
                          <strong>{money(item.total)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null,
                )}
              </div>
            )}

            {selected.some((a) => a.userCodes.length === 0) && (
              <div className="delete-confirm-box">
                <strong>Articoli non assegnati</strong>
                {selected
                  .filter((a) => a.userCodes.length === 0)
                  .map((a) => <div key={a.id}>{a.article_code}</div>)}
              </div>
            )}

            <form action={deleteSelectedArticles}>
              <input type="hidden" name="article_ids" value={selected.map((a) => a.id).join(',')} />
              <input type="hidden" name="confirm" value="1" />
              <div className="archive-modal-actions">
                <button type="button" onClick={() => setModal(null)}>Annulla</button>
                <button type="submit" className="danger-button">Conferma cancellazione</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'users' && usersArticle && (
        <div className="archive-modal" onClick={() => setModal(null)}>
          <div className="archive-modal-content users-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Clienti che hanno acquistato {usersArticle.article_code}</h2>
            <div className="article-users-list">
              {usersArticle.userCodes.map((item) => (
                <div className="article-user-row" key={item.customerId}>
                  <div>
                    <a href={`/admin/clienti/${item.customerId}`}>{item.code}</a>
                    <span>{item.name || 'Cliente'}</span>
                    <small>Quantità: {item.quantity}</small>
                  </div>
                  <strong>{money(item.total)}</strong>
                </div>
              ))}
            </div>
            <div className="archive-modal-actions"><button type="button" onClick={() => setModal(null)}>Chiudi</button></div>
          </div>
        </div>
      )}

      {modal === 'photo' && photoUrl && (
        <div className="image-modal" onClick={() => setModal(null)}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setModal(null)}>×</button>
            <img src={photoUrl} alt="Immagine articolo" onError={(e) => { e.currentTarget.alt = 'Immagine non disponibile'; e.currentTarget.style.display = 'none' }} />
          </div>
        </div>
      )}
    </>
  )
}
