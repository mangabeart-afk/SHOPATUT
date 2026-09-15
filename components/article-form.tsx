'use client'

import { useMemo, useState } from 'react'

type ArticleFormAction = (formData: FormData) => void | Promise<void>

type ArticleFormProps = {
  action: ArticleFormAction
  mode?: 'create' | 'edit'
  article?: Partial<{
    id: string
    article_code: string
    purchase_date: string
    origin: string
    seller: string | null
    series: string | null
    detail: string | null
    quantity_purchased: number
    currency: string
    unit_price_foreign: number
    exchange_rate: number
    commission_cost: number
    commission_mode: string
    commission_percent: number
    commission_currency: string
    commission_exchange_rate: number
    customs_cost: number
    customs_mode: string
    customs_percent: number
    customs_currency: string
    customs_exchange_rate: number
    shipping_cost: number
    shipping_mode: string
    shipping_percent: number
    shipping_currency: string
    shipping_exchange_rate: number
    notes: string | null
    photo_url: string | null
    seller_page_url: string | null
    status: string
  }>
}

const currencyOptions = ['JPY', 'USD', 'EUR']

const defaultCurrencyForOrigin = (origin: string) => {
  if (origin === 'GIAPPONE') return 'JPY'
  if (origin === 'VIETNAM') return 'USD'
  return 'EUR'
}

export default function ArticleForm({ action, mode = 'create', article }: ArticleFormProps) {
  const initialOrigin = article?.origin || 'GIAPPONE'
  const [origin, setOrigin] = useState(initialOrigin)
  const [currency, setCurrency] = useState(article?.currency || defaultCurrencyForOrigin(initialOrigin))
  const [quantity, setQuantity] = useState(Number(article?.quantity_purchased || 1))
  const [unitPrice, setUnitPrice] = useState(Number(article?.unit_price_foreign || 0))
  const [exchangeRate, setExchangeRate] = useState(Number(article?.exchange_rate || 1))
  const [commissionMode, setCommissionMode] = useState(article?.commission_mode || 'FIXED')
  const [commission, setCommission] = useState(Number(article?.commission_cost || 0))
  const [commissionPercent, setCommissionPercent] = useState(Number(article?.commission_percent || 0))
  const [commissionCurrency, setCommissionCurrency] = useState(article?.commission_currency || currency)
  const [commissionRate, setCommissionRate] = useState(Number(article?.commission_exchange_rate || 1))
  const [customsMode, setCustomsMode] = useState(article?.customs_mode || 'FIXED')
  const [customs, setCustoms] = useState(Number(article?.customs_cost || 0))
  const [customsPercent, setCustomsPercent] = useState(Number(article?.customs_percent || 0))
  const [customsCurrency, setCustomsCurrency] = useState(article?.customs_currency || currency)
  const [customsRate, setCustomsRate] = useState(Number(article?.customs_exchange_rate || 1))
  const [shippingMode, setShippingMode] = useState(article?.shipping_mode || 'FIXED')
  const [shipping, setShipping] = useState(Number(article?.shipping_cost || 0))
  const [shippingPercent, setShippingPercent] = useState(Number(article?.shipping_percent || 0))
  const [shippingCurrency, setShippingCurrency] = useState(article?.shipping_currency || currency)
  const [shippingRate, setShippingRate] = useState(Number(article?.shipping_exchange_rate || 1))
  const [saleEnabled, setSaleEnabled] = useState(false)
  const [saleQuantity, setSaleQuantity] = useState(1)
  const [salePrice, setSalePrice] = useState(0)

  const toEur = (amount: number, selectedCurrency: string, rate: number) => {
    if (!amount) return 0
    if (selectedCurrency === 'EUR') return amount
    return amount * (rate || 0)
  }

  const purchaseBaseEur = useMemo(() =>
    toEur(unitPrice * quantity, currency, exchangeRate),
    [unitPrice, quantity, currency, exchangeRate]
  )

  const accessoryEur = (mode: string, amount: number, percent: number, selectedCurrency: string, rate: number) =>
    mode === 'PERCENT'
      ? purchaseBaseEur * Math.max(0, percent) / 100
      : toEur(amount, selectedCurrency, rate)

  const purchaseTotalEur = useMemo(() => {
    const commissionEur = accessoryEur(commissionMode, commission, commissionPercent, commissionCurrency, commissionRate)
    const customsEur = accessoryEur(customsMode, customs, customsPercent, customsCurrency, customsRate)
    const shippingEur = accessoryEur(shippingMode, shipping, shippingPercent, shippingCurrency, shippingRate)
    return purchaseBaseEur + commissionEur + customsEur + shippingEur
  }, [purchaseBaseEur, commissionMode, commission, commissionPercent, commissionCurrency, commissionRate, customsMode, customs, customsPercent, customsCurrency, customsRate, shippingMode, shipping, shippingPercent, shippingCurrency, shippingRate])

  const unitCostEur = quantity > 0 ? purchaseTotalEur / quantity : 0
  const saleTotal = saleQuantity * salePrice

  const changeOrigin = (value: string) => {
    setOrigin(value)
    const nextCurrency = defaultCurrencyForOrigin(value)
    setCurrency(nextCurrency)
    if (!article) {
      setCommissionCurrency(nextCurrency)
      setCustomsCurrency(nextCurrency)
      setShippingCurrency(nextCurrency)
      setExchangeRate(nextCurrency === 'EUR' ? 1 : exchangeRate)
    }
  }

  return (
    <form action={action} className="article-create-form">
      {mode === 'edit' && article?.id && <input type="hidden" name="id" value={article.id} />}

      <section className="article-form-section article-origin-first">
        <h3>1. Origine del prodotto</h3>
        <p className="muted">Scegli prima la provenienza. La valuta di acquisto viene proposta automaticamente.</p>
        <div className="origin-choice-grid">
          {[
            ['GIAPPONE', '🇯🇵 JAP', 'JPY'],
            ['VIETNAM', '🇻🇳 VIET', 'USD'],
            ['EUROPA', '🇪🇺 EU', 'EUR'],
          ].map(([value, label, cur]) => (
            <label key={value} className={`origin-choice ${origin === value ? 'selected' : ''}`}>
              <input type="radio" name="origin" value={value} checked={origin === value} onChange={() => changeOrigin(value)} />
              <strong>{label}</strong>
              <small>{cur}</small>
            </label>
          ))}
        </div>
      </section>

      <div className="form-grid">
        <label>Data acquisto<input type="date" name="purchase_date" defaultValue={article?.purchase_date?.slice(0, 10) || new Date().toISOString().slice(0, 10)} required /></label>
        <label>Venditore<input type="text" name="seller" defaultValue={article?.seller || ''} /></label>
        <label>Serie<input type="text" name="series" defaultValue={article?.series || ''} /></label>
        <label>Descrizione<input type="text" name="detail" defaultValue={article?.detail || ''} /></label>
        <label>Quantità acquistata<input type="number" name="quantity_purchased" min="1" step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 0)} required /></label>
        <label>Valuta acquisto<select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>{currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label>Prezzo unitario<input type="number" name="unit_price_foreign" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value) || 0)} required /></label>
        <label>Cambio {currency} → EUR<input type="number" name="exchange_rate" min="0.00000001" step="0.00000001" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value) || 0)} required /></label>
      </div>

      <section className="article-form-section">
        <h3>2. Costi accessori</h3>
        <p className="muted">Per ogni voce scegli se inserire un importo con valuta oppure una percentuale calcolata sul valore di acquisto iniziale in EUR.</p>
        <div className="accessory-grid">
          <div className="accessory-row">
            <label>Commissioni modalità<select name="commission_mode" value={commissionMode} onChange={(e) => setCommissionMode(e.target.value)}><option value="FIXED">Importo + valuta</option><option value="PERCENT">Percentuale %</option></select></label>
            {commissionMode === 'PERCENT' ? (
              <label>Commissioni %<input type="number" name="commission_percent" min="0" step="0.01" value={commissionPercent} onChange={(e) => setCommissionPercent(Number(e.target.value) || 0)} placeholder="0,00" /></label>
            ) : (
              <>
                <label>Commissioni<input type="number" name="commission_cost" min="0" step="0.01" value={commission} onChange={(e) => setCommission(Number(e.target.value) || 0)} /></label>
                <label>Valuta<select name="commission_currency" value={commissionCurrency} onChange={(e) => setCommissionCurrency(e.target.value)}>{currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
                <label>Cambio → EUR<input type="number" name="commission_exchange_rate" min="0.00000001" step="0.00000001" value={commissionCurrency === 'EUR' ? 1 : commissionRate} onChange={(e) => setCommissionRate(Number(e.target.value) || 0)} disabled={commissionCurrency === 'EUR'} /></label>
              </>
            )}
          </div>

          <div className="accessory-row">
            <label>Dogana modalità<select name="customs_mode" value={customsMode} onChange={(e) => setCustomsMode(e.target.value)}><option value="FIXED">Importo + valuta</option><option value="PERCENT">Percentuale %</option></select></label>
            {customsMode === 'PERCENT' ? (
              <label>Dogana %<input type="number" name="customs_percent" min="0" step="0.01" value={customsPercent} onChange={(e) => setCustomsPercent(Number(e.target.value) || 0)} placeholder="0,00" /></label>
            ) : (
              <>
                <label>Dogana<input type="number" name="customs_cost" min="0" step="0.01" value={customs} onChange={(e) => setCustoms(Number(e.target.value) || 0)} /></label>
                <label>Valuta<select name="customs_currency" value={customsCurrency} onChange={(e) => setCustomsCurrency(e.target.value)}>{currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
                <label>Cambio → EUR<input type="number" name="customs_exchange_rate" min="0.00000001" step="0.00000001" value={customsCurrency === 'EUR' ? 1 : customsRate} onChange={(e) => setCustomsRate(Number(e.target.value) || 0)} disabled={customsCurrency === 'EUR'} /></label>
              </>
            )}
          </div>

          <div className="accessory-row">
            <label>Spedizione modalità<select name="shipping_mode" value={shippingMode} onChange={(e) => setShippingMode(e.target.value)}><option value="FIXED">Importo + valuta</option><option value="PERCENT">Percentuale %</option></select></label>
            {shippingMode === 'PERCENT' ? (
              <label>Spedizione %<input type="number" name="shipping_percent" min="0" step="0.01" value={shippingPercent} onChange={(e) => setShippingPercent(Number(e.target.value) || 0)} placeholder="0,00" /></label>
            ) : (
              <>
                <label>Spedizione<input type="number" name="shipping_cost" min="0" step="0.01" value={shipping} onChange={(e) => setShipping(Number(e.target.value) || 0)} /></label>
                <label>Valuta<select name="shipping_currency" value={shippingCurrency} onChange={(e) => setShippingCurrency(e.target.value)}>{currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
                <label>Cambio → EUR<input type="number" name="shipping_exchange_rate" min="0.00000001" step="0.00000001" value={shippingCurrency === 'EUR' ? 1 : shippingRate} onChange={(e) => setShippingRate(Number(e.target.value) || 0)} disabled={shippingCurrency === 'EUR'} /></label>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="article-cost-summary">
        <div><span>Totale acquisto in EUR</span><strong>€ {purchaseTotalEur.toFixed(2)}</strong></div>
        <div><span>Costo unitario EUR</span><strong>€ {unitCostEur.toFixed(2)}</strong></div>
      </section>

      <section className="article-form-section">
        <h3>3. Foto articolo</h3>
        <label>Link pagina del venditore<input type="url" name="seller_page_url" defaultValue={article?.seller_page_url || ''} placeholder="https://..." /></label>
      </section>

      <section className="article-form-section">
        <h3>4. Vendita contestuale</h3>
        <label className="checkbox-field"><input type="checkbox" name="sale_enabled" checked={saleEnabled} onChange={(e) => setSaleEnabled(e.target.checked)} /> Registra anche la vendita al salvataggio</label>
        {saleEnabled && (
          <div className="sale-inline-grid">
            <label>ID cliente<input type="text" name="sale_customer_code" placeholder="Es. 2608AAA" required /></label>
            <label>Quantità venduta<input type="number" name="sale_quantity" min="1" max={quantity} value={saleQuantity} onChange={(e) => setSaleQuantity(Math.min(quantity, Number(e.target.value) || 1))} /></label>
            <label>Prezzo vendita unitario EUR<input type="number" name="sale_price" min="0.01" step="0.01" value={salePrice} onChange={(e) => setSalePrice(Number(e.target.value) || 0)} /></label>
            <div className="sale-total-preview"><span>Totale vendita</span><strong>€ {saleTotal.toFixed(2)}</strong></div>
          </div>
        )}
      </section>

      <div className="form-grid">
        <label>Stato<select name="status" defaultValue={article?.status || 'IN_ARRIVO'}><option value="IN_ARRIVO">IN ARRIVO</option><option value="IN_STOCK">IN STOCK</option><option value="VENDUTO">VENDUTO</option></select></label>
        <label className="form-grid-wide">Note<textarea name="notes" rows={3} defaultValue={article?.notes || ''} /></label>
      </div>

      <button type="submit">{mode === 'edit' ? 'Salva modifiche' : 'Registra articolo'}</button>
    </form>
  )
}
