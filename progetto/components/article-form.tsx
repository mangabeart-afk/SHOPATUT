'use client'

import { useMemo, useRef, useState } from 'react'
import CustomerAutocomplete from './customer-autocomplete'

type ArticleFormAction = (formData: FormData) => void | Promise<void>

type CustomerOption = { id: string; customer_code?: string | null; first_name: string; last_name: string; email: string | null }

type ArticleFormProps = {
  action: ArticleFormAction
  customers?: CustomerOption[]
  mode?: 'create' | 'edit'
  showSaleSection?: boolean
  returnTo?: 'archive' | 'detail'
  article?: Partial<{
    id: string
    article_code: string
    purchase_date: string
    origin: string
    purchase_source: string | null
    article_type: string
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
    status: string
  }>
}

const currencyOptions = ['JPY', 'USD', 'EUR']
const articleTypes = ['VARIANT', 'BOOKLET', 'ARTBOOK', 'TANKOBON', 'ALTRO'] as const
type AccessoryUnit = 'EUR' | 'JPY' | 'USD' | 'PERCENT'
const initialAccessoryUnit = (mode: 'create' | 'edit', storedMode: string | null | undefined, currency: string | null | undefined, amount: number | null | undefined, percent: number | null | undefined): AccessoryUnit => {
  if (mode === 'create' || storedMode === 'PERCENT' || (Number(percent || 0) > 0 && Number(amount || 0) === 0)) return 'PERCENT'
  const value = String(currency || 'EUR').toUpperCase()
  return value === 'JPY' || value === 'USD' ? value : 'EUR'
}
const defaultCustomsPercentForType = (type: string) =>
  ['VARIANT', 'BOOKLET', 'ARTBOOK', 'TANKOBON'].includes(type) ? 4 : 26.7

const defaultExchangeRateForCurrency = (currency: string) => currency === 'JPY' ? 160 : currency === 'USD' ? 1.17 : 1

const defaultCurrencyForOrigin = (origin: string) => {
  if (origin === 'GIAPPONE') return 'JPY'
  if (origin === 'VIETNAM') return 'USD'
  return 'EUR'
}

export default function ArticleForm({ action, mode = 'create', article, customers = [], showSaleSection = mode === 'create', returnTo = 'detail' }: ArticleFormProps) {
  const initialOrigin = article?.origin || 'GIAPPONE'
  const initialType = article?.article_type || 'ALTRO'
  const [origin, setOrigin] = useState(initialOrigin)
  const [articleType, setArticleType] = useState(initialType)
  const [currency, setCurrency] = useState(article?.currency || defaultCurrencyForOrigin(initialOrigin))
  const [quantity, setQuantity] = useState(Number(article?.quantity_purchased || 1))
  const [unitPrice, setUnitPrice] = useState(Number(article?.unit_price_foreign || 0))
  const [exchangeRate, setExchangeRate] = useState(Number(article?.exchange_rate || defaultExchangeRateForCurrency(article?.currency || defaultCurrencyForOrigin(initialOrigin))))
  const [commissionEntryUnit, setCommissionEntryUnit] = useState<AccessoryUnit>(initialAccessoryUnit(mode, article?.commission_mode, article?.commission_currency, article?.commission_cost, article?.commission_percent))
  const commissionMode = commissionEntryUnit === 'PERCENT' ? 'PERCENT' : 'FIXED'
  const [commission, setCommission] = useState(Number(article?.commission_cost || 0))
  const [commissionPercent, setCommissionPercent] = useState(Number(article?.commission_percent || 0))
  const [commissionCurrency, setCommissionCurrency] = useState(article?.commission_currency || 'EUR')
  const [commissionRate, setCommissionRate] = useState(Number(article?.commission_exchange_rate || 1))
  const [customsEntryUnit, setCustomsEntryUnit] = useState<AccessoryUnit>(initialAccessoryUnit(mode, article?.customs_mode, article?.customs_currency, article?.customs_cost, article?.customs_percent))
  const customsMode = customsEntryUnit === 'PERCENT' ? 'PERCENT' : 'FIXED'
  const [customs, setCustoms] = useState(Number(article?.customs_cost || 0))
  const [customsPercent, setCustomsPercent] = useState(Number(article?.customs_percent ?? defaultCustomsPercentForType(initialType)))
  const [customsCurrency, setCustomsCurrency] = useState(article?.customs_currency || 'EUR')
  const [customsRate, setCustomsRate] = useState(Number(article?.customs_exchange_rate || 1))
  const [shippingEntryUnit, setShippingEntryUnit] = useState<AccessoryUnit>(initialAccessoryUnit(mode, article?.shipping_mode, article?.shipping_currency, article?.shipping_cost, article?.shipping_percent))
  const shippingMode = shippingEntryUnit === 'PERCENT' ? 'PERCENT' : 'FIXED'
  const [shipping, setShipping] = useState(Number(article?.shipping_cost || 0))
  const [shippingPercent, setShippingPercent] = useState(Number(article?.shipping_percent || 0))
  const [shippingCurrency, setShippingCurrency] = useState(article?.shipping_currency || 'EUR')
  const [shippingRate, setShippingRate] = useState(Number(article?.shipping_exchange_rate || 1))
  const [saleEnabled, setSaleEnabled] = useState(false)
  const [saleQuantity, setSaleQuantity] = useState(1)
  const [salePrice, setSalePrice] = useState(0)
  const [photoError, setPhotoError] = useState('')
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const toEur = (amount: number, selectedCurrency: string, rate: number) => {
    if (!amount) return 0
    if (selectedCurrency === 'EUR') return amount
    return amount / (rate || 1)
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

  const accessoryRateFor = (selectedCurrency: string, nextPurchaseCurrency = currency, nextPurchaseRate = exchangeRate) => {
    if (selectedCurrency === 'EUR') return 1
    if (selectedCurrency === nextPurchaseCurrency) return nextPurchaseRate || 1
    return defaultExchangeRateForCurrency(selectedCurrency)
  }

  const changeOrigin = (value: string) => {
    setOrigin(value)
    const nextCurrency = defaultCurrencyForOrigin(value)
    setCurrency(nextCurrency)
    if (!article) {
      const nextRate = defaultExchangeRateForCurrency(nextCurrency)
      setExchangeRate(nextRate)
      if (commissionEntryUnit !== 'PERCENT') setCommissionRate(accessoryRateFor(commissionEntryUnit, nextCurrency, nextRate))
      if (customsEntryUnit !== 'PERCENT') setCustomsRate(accessoryRateFor(customsEntryUnit, nextCurrency, nextRate))
      if (shippingEntryUnit !== 'PERCENT') setShippingRate(accessoryRateFor(shippingEntryUnit, nextCurrency, nextRate))
    }
  }

  const changeArticleType = (value: string) => {
    setArticleType(value)
    setCustomsPercent(defaultCustomsPercentForType(value))
    // La modalità dogana resta indipendente dalla spedizione e dalla commissione.
    return
  }

  const changePurchaseExchangeRate = (value: number) => {
    setExchangeRate(value)
    if (commissionEntryUnit === currency && commissionEntryUnit !== 'PERCENT') setCommissionRate(value || 1)
    if (customsEntryUnit === currency && customsEntryUnit !== 'PERCENT') setCustomsRate(value || 1)
    if (shippingEntryUnit === currency && shippingEntryUnit !== 'PERCENT') setShippingRate(value || 1)
  }

  const changePurchaseCurrency = (value: string) => {
    setCurrency(value)
    if (mode === 'create') {
      const nextRate = defaultExchangeRateForCurrency(value)
      setExchangeRate(nextRate)
      if (commissionEntryUnit !== 'PERCENT') setCommissionRate(accessoryRateFor(commissionEntryUnit, value, nextRate))
      if (customsEntryUnit !== 'PERCENT') setCustomsRate(accessoryRateFor(customsEntryUnit, value, nextRate))
      if (shippingEntryUnit !== 'PERCENT') setShippingRate(accessoryRateFor(shippingEntryUnit, value, nextRate))
    }
  }

  const changeAccessoryUnit = (field: 'commission' | 'customs' | 'shipping', unit: AccessoryUnit) => {
    const nextRate = unit === 'PERCENT' ? 1 : accessoryRateFor(unit)
    if (field === 'commission') {
      setCommissionEntryUnit(unit)
      setCommissionCurrency(unit === 'PERCENT' ? 'EUR' : unit)
      setCommissionRate(nextRate)
    } else if (field === 'customs') {
      setCustomsEntryUnit(unit)
      setCustomsCurrency(unit === 'PERCENT' ? 'EUR' : unit)
      setCustomsRate(nextRate)
    } else {
      setShippingEntryUnit(unit)
      setShippingCurrency(unit === 'PERCENT' ? 'EUR' : unit)
      setShippingRate(nextRate)
    }
  }

  const renderAccessoryRow = (
    field: 'customs' | 'shipping' | 'commission',
    label: string,
    unit: AccessoryUnit,
    amount: number,
    percent: number,
    accessoryRate: number,
    onAmount: (value: number) => void,
    onPercent: (value: number) => void,
  ) => {
    const prefix = field
    const fixed = unit !== 'PERCENT'
    return (
      <div className="article-accessory-row" key={field}>
        <label className="article-accessory-name">{label}</label>
        {fixed ? (
          <>
            <input aria-label={`${label} importo ${unit}`} type="number" name={`${prefix}_cost`} min="0" step="0.01" value={amount} onChange={(event) => onAmount(Number(event.target.value) || 0)} />
            <input type="hidden" name={`${prefix}_percent`} value="0" />
          </>
        ) : (
          <>
            <input aria-label={`${label} percentuale`} type="number" name={`${prefix}_percent`} min="0" step="0.01" value={percent} onChange={(event) => onPercent(Number(event.target.value) || 0)} />
            <input type="hidden" name={`${prefix}_cost`} value="0" />
          </>
        )}
        <select aria-label={`Unità ${label}`} value={unit} onChange={(event) => changeAccessoryUnit(field, event.target.value as AccessoryUnit)}>
          <option value="EUR">€</option>
          <option value="JPY">¥</option>
          <option value="USD">$</option>
          <option value="PERCENT">%</option>
        </select>
        <input type="hidden" name={`${prefix}_mode`} value={unit === 'PERCENT' ? 'PERCENT' : 'FIXED'} />
        <input type="hidden" name={`${prefix}_currency`} value={fixed ? unit : 'EUR'} />
        <input type="hidden" name={`${prefix}_exchange_rate`} value={fixed ? String(unit === 'EUR' ? 1 : (accessoryRate || (unit === currency ? exchangeRate : customsRateForCurrency(unit)))) : '1'} />
      </div>
    )
  }

  const customsRateForCurrency = (value: string) => defaultExchangeRateForCurrency(value)

  return (
    <form
      action={action}
      className="article-create-form"
      encType="multipart/form-data"
      onSubmit={(event) => {
        const file = photoInputRef.current?.files?.[0]
        if (file && file.size > 8 * 1024 * 1024) {
          event.preventDefault()
          setPhotoError(`La foto selezionata supera il limite di 8 MB.\n\nDimensione file: ${(file.size / (1024 * 1024)).toFixed(2)} MB.`)
          return
        }
        setPhotoError('')
      }}
    >
      <input type="hidden" name="purchase_source" value={article?.purchase_source || 'ALTRO'} />
      {mode === 'edit' && article?.id && <input type="hidden" name="id" value={article.id} />}
      {mode === 'edit' && <input type="hidden" name="return_to" value={returnTo} />}

      <section className="article-form-section article-origin-first">
        <h3>1. Origine geografica</h3>
        <div className="origin-choice-grid">
          {[
            ['GIAPPONE', '🇯🇵 JAP', 'JPY'],
            ['VIETNAM', '🇻🇳 VIET', 'USD'],
            ['EUROPA', '🇪🇺 EU', 'EUR'],
            ['ALTRO', '🌐 ALTRO', 'EUR'],
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
        <label>Tipo<select name="article_type" value={articleType} onChange={(e) => changeArticleType(e.target.value)}>{articleTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label>Quantità acquistata<input type="number" name="quantity_purchased" min="1" step="0.00000001" value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 0)} required /></label>
        <label>Valuta acquisto<select name="currency" value={currency} onChange={(e) => changePurchaseCurrency(e.target.value)}>{currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label>Prezzo unitario<input type="number" name="unit_price_foreign" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value) || 0)} required /></label>
        <label>Cambio (1 EUR = {currency})<input type="number" name="exchange_rate" min="0.00000001" step="0.00000001" value={exchangeRate} onChange={(e) => changePurchaseExchangeRate(Number(e.target.value) || 0)} disabled={currency === 'EUR'} required /></label>
      </div>

      <section className="article-form-section article-accessory-section">
        <h3>2. Costi accessori</h3>
        <div className="article-accessory-table" role="group" aria-label="Costi accessori indipendenti">
          {renderAccessoryRow('customs', 'Dogana', customsEntryUnit, customs, customsPercent, customsRate, setCustoms, setCustomsPercent)}
          {renderAccessoryRow('shipping', 'Spedizione', shippingEntryUnit, shipping, shippingPercent, shippingRate, setShipping, setShippingPercent)}
          {renderAccessoryRow('commission', 'Commissione', commissionEntryUnit, commission, commissionPercent, commissionRate, setCommission, setCommissionPercent)}
        </div>
      </section>

      <section className="article-cost-summary">
        <div><span>Totale acquisto in EUR</span><strong>€ {purchaseTotalEur.toFixed(2)}</strong></div>
        <div><span>Costo unitario EUR</span><strong>€ {unitCostEur.toFixed(2)}</strong></div>
      </section>

      <section className="article-form-section">
        <h3>3. Foto articolo</h3>
        <label>Carica foto<input ref={photoInputRef} type="file" name="photo" accept="image/*" /></label>
        {photoError && (
          <div className="modal-overlay" role="presentation">
            <div className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="photo-size-error-title">
              <h3 id="photo-size-error-title">Foto troppo grande</h3>
              <p style={{ whiteSpace: 'pre-line' }}>{photoError}</p>
              <button type="button" onClick={() => { setPhotoError(''); photoInputRef.current?.focus() }}>OK</button>
            </div>
          </div>
        )}
        <label>Nuova immagine tramite link<input type="url" name="photo_url" defaultValue={article?.photo_url || ''} placeholder="https://.../immagine.jpg" /></label>
      </section>

      {showSaleSection && <section className="article-form-section">
        <h3>4. Vendita contestuale</h3>
        <label className="checkbox-field"><input type="checkbox" name="sale_enabled" checked={saleEnabled} onChange={(e) => setSaleEnabled(e.target.checked)} /> Registra anche la vendita al salvataggio</label>
        {saleEnabled && (
          <div className="sale-inline-grid">
            <label>ID utente<CustomerAutocomplete name="sale_customer_code" required placeholder="Nome, cognome o codice utente" options={customers.map((customer) => ({ id: customer.id, code: customer.customer_code?.trim() || '', name: `${customer.first_name} ${customer.last_name}`.trim(), email: customer.email }))} /></label>
            <label>Quantità venduta<input type="number" name="sale_quantity" min="1" max={quantity} value={saleQuantity} onChange={(e) => setSaleQuantity(Math.min(quantity, Number(e.target.value) || 1))} /></label>
            <label>Prezzo vendita unitario EUR<input type="number" name="sale_price" min="0.01" step="0.01" value={salePrice} onChange={(e) => setSalePrice(Number(e.target.value) || 0)} /></label>
            <div className="sale-total-preview"><span>Totale vendita</span><strong>€ {saleTotal.toFixed(2)}</strong></div>
          </div>
        )}
      </section>}

      <div className="form-grid">
        <label>Stato<select name="status" defaultValue={article?.status || 'IN_ARRIVO'}><option value="IN_ARRIVO">IN ARRIVO</option><option value="IN_STOCK">IN STOCK</option><option value="VENDUTO">VENDUTO</option></select></label>
        <label className="form-grid-wide">Note<textarea name="notes" rows={3} defaultValue={article?.notes || ''} /></label>
      </div>

      <button type="submit">{mode === 'edit' ? 'Salva modifiche' : 'Registra articolo'}</button>
    </form>
  )
}
