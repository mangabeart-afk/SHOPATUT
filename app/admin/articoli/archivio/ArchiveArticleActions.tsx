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
  photo_url: string | null
  quantity_purchased: number
  total_cost_eur: number | null
  unit_cost_eur: number | null
  status: string
  statusLabel: string
  statusClass: string
  sold: number
  available: number
}

type Props = {
  articles: ArticleOption[]
  registerArrival: (formData: FormData) => Promise<void>
  registerSale: (formData: FormData) => Promise<void>
}

type SaleData = {
  quantity: string
  price: string
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—'
  }

  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value))
}

function toNumber(value: string | number | null | undefined) {
  const number = Number(value || 0)

  return Number.isFinite(number) ? number : 0
}

export default function ArchiveArticleActions({
  articles,
  registerArrival,
  registerSale,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saleCustomerCode, setSaleCustomerCode] = useState('')
  const [saleData, setSaleData] = useState<Record<string, SaleData>>({})
  const [arrivalDate, setArrivalDate] = useState('')
  const [arrivalError, setArrivalError] = useState('')
  const [saleError, setSaleError] = useState('')
  const [showArrivalModal, setShowArrivalModal] = useState(false)
  const [showSaleModal, setShowSaleModal] = useState(false)
  const [showPhotoModal, setShowPhotoModal] = useState<string | null>(null)
  const [saleTotal, setSaleTotal] = useState('')

  const selectedArticles = useMemo(
    () =>
      articles.filter((article) =>
        selectedIds.includes(article.id),
      ),
    [articles, selectedIds],
  )

  const selectedSummary = useMemo(() => {
    const quantity = selectedArticles.reduce(
      (total, article) => total + article.available,
      0,
    )

    const purchaseValue = selectedArticles.reduce(
      (total, article) =>
        total + toNumber(article.total_cost_eur),
      0,
    )

    const salesValue = selectedArticles.reduce(
      (total, article) => {
        const data = saleData[article.id]

        if (!data) return total

        return (
          total +
          toNumber(data.quantity) * toNumber(data.price)
        )
      },
      0,
    )

    return {
      quantity,
      purchaseValue,
      salesValue,
      margin: salesValue - purchaseValue,
    }
  }, [saleData, selectedArticles])

  const hasSelection = selectedIds.length > 0

  function toggleArticle(articleId: string) {
    setSelectedIds((current) =>
      current.includes(articleId)
        ? current.filter((id) => id !== articleId)
        : [...current, articleId],
    )

    setSaleData((current) => ({
      ...current,
      [articleId]: current[articleId] || {
        quantity: '1',
        price: '',
      },
    }))
  }

  function toggleAll() {
    if (selectedIds.length === articles.length) {
      setSelectedIds([])
      return
    }

    setSelectedIds(articles.map((article) => article.id))

    setSaleData((current) => {
      const next = { ...current }

      for (const article of articles) {
        if (!next[article.id]) {
          next[article.id] = {
            quantity: '1',
            price: '',
          }
        }
      }

      return next
    })
  }

  function updateSaleData(
    articleId: string,
    field: keyof SaleData,
    value: string,
  ) {
    setSaleData((current) => ({
      ...current,
      [articleId]: {
        quantity: current[articleId]?.quantity || '1',
        price: current[articleId]?.price || '',
        [field]: value,
      },
    }))
  }

  function openArrivalModal() {
    setArrivalError('')
    setArrivalDate('')
    setShowArrivalModal(true)
  }

  function openSaleModal() {
    setSaleError('')
    setSaleTotal('')
    setShowSaleModal(true)
  }

  function distributeSaleTotal() {
    const total = toNumber(saleTotal)

    if (total <= 0 || selectedArticles.length === 0) {
      return
    }

    const totalPurchaseValue = selectedArticles.reduce(
      (sum, article) =>
        sum + toNumber(article.total_cost_eur),
      0,
    )

    if (totalPurchaseValue <= 0) {
      return
    }

    setSaleData((current) => {
      const next = { ...current }

      for (const article of selectedArticles) {
        const purchaseValue = toNumber(
          article.total_cost_eur,
        )

        const distributedPrice =
          total * (purchaseValue / totalPurchaseValue)

        next[article.id] = {
          quantity: String(
            Math.min(
              Math.max(article.available, 0),
              toNumber(current[article.id]?.quantity || 1),
            ),
          ),
          price: distributedPrice.toFixed(2),
        }
      }

      return next
    })
  }

  const saleIsReady =
    hasSelection &&
    saleCustomerCode.trim().length > 0 &&
    selectedArticles.every((article) => {
      const data = saleData[article.id]
      const quantity = toNumber(data?.quantity)
      const price = toNumber(data?.price)

      return (
        quantity > 0 &&
        quantity <= article.available &&
        price > 0
      )
    })

  return (
    <>
      <div className="heading-actions">
        <button
          type="button"
          className="archive-action-button"
          disabled={!hasSelection}
          onClick={openArrivalModal}
        >
          REGISTRA ARRIVO
        </button>

        <button
          type="button"
          className="archive-action-button"
          disabled={!hasSelection}
          onClick={openSaleModal}
        >
          REGISTRA VENDITA
        </button>

        <button
          type="button"
          className="archive-action-button"
          disabled={selectedIds.length !== 1}
          onClick={() => {
            if (selectedIds.length !== 1) return

            window.location.href =
              `/admin/articoli/${selectedIds[0]}`
          }}
        >
          MODIFICA
        </button>
      </div>

      <div className="results-row">
        <span className="results-count">
          {articles.length} articoli
        </span>

        <label className="select-all-label">
          <input
            type="checkbox"
            checked={
              articles.length > 0 &&
              selectedIds.length === articles.length
            }
            onChange={toggleAll}
          />
          Seleziona tutti
        </label>
      </div>

      {hasSelection && (
        <section className="selected-operation-panel">
          <div className="selected-operation-heading">
            <div>
              <strong>
                {selectedIds.length} articolo/i selezionato/i
              </strong>

              <p>
                La selezione rimane attiva anche quando cambi
                i filtri o la ricerca.
              </p>
            </div>

            <button
              type="button"
              className="clear-selection-button"
              onClick={() => setSelectedIds([])}
            >
              Deseleziona
            </button>
          </div>

          <div className="selected-summary-grid">
            <div>
              <span>Quantità residua</span>
              <strong>{selectedSummary.quantity}</strong>
            </div>

            <div>
              <span>Valore acquisto</span>
              <strong>
                {formatMoney(selectedSummary.purchaseValue)}
              </strong>
            </div>

            <div>
              <span>Valore vendita</span>
              <strong>
                {formatMoney(selectedSummary.salesValue)}
              </strong>
            </div>

            <div>
              <span>Margine stimato</span>
              <strong>
                {formatMoney(selectedSummary.margin)}
              </strong>
            </div>
          </div>
        </section>
      )}

      {articles.length === 0 ? (
        <div className="empty">
          Nessun articolo trovato.
        </div>
      ) : (
        <div className="articles-table-wrapper">
          <table className="articles-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={
                      articles.length > 0 &&
                      selectedIds.length === articles.length
                    }
                    onChange={toggleAll}
                    aria-label="Seleziona tutti gli articoli"
                  />
                </th>
                <th>CODICE</th>
                <th>DATA</th>
                <th>SERIE</th>
                <th>DETTAGLIO</th>
                <th>Q</th>
                <th>S</th>
                <th>€€</th>
                <th>€</th>
                <th>STATO</th>
                <th>UTENTI</th>
              </tr>
            </thead>

            <tbody>
              {articles.map((article) => (
                <tr key={article.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(article.id)}
                      onChange={() => toggleArticle(article.id)}
                      aria-label={`Seleziona ${article.article_code}`}
                    />
                  </td>

                  <td>
                    <strong className="article-code-text">
                      {article.article_code}
                    </strong>
                  </td>

                  <td>{article.purchase_date}</td>

                  <td>{article.series || '—'}</td>

                  <td>
                    <div className="article-detail-cell">
                      <strong>
                        {article.detail || '—'}
                      </strong>

                      {article.seller && (
                        <small>{article.seller}</small>
                      )}
                    </div>
                  </td>

                  <td>{article.quantity_purchased}</td>

                  <td>{article.sold}</td>

                  <td>
                    {formatMoney(article.total_cost_eur)}
                  </td>

                  <td>
                    {formatMoney(article.unit_cost_eur)}
                  </td>

                  <td>
                    <span className={article.statusClass}>
                      {article.statusLabel}
                    </span>
                  </td>

                  <td>
                    <ArticlePhotoButton
                      articleId={article.id}
                      photoUrl={article.photo_url}
                      onOpen={() =>
                        setShowPhotoModal(article.photo_url)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showArrivalModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Registra arrivo</h2>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowArrivalModal(false)}
              >
                ×
              </button>
            </div>

            <p>
              Stai registrando l'arrivo di{' '}
              <strong>{selectedIds.length}</strong> articolo/i.
            </p>

            <form
              action={async (formData) => {
                if (!arrivalDate) {
                  setArrivalError(
                    'Inserisci la data di arrivo.',
                  )
                  return
                }

                setArrivalError('')

                for (const articleId of selectedIds) {
                  formData.append('article_id', articleId)
                }

                formData.set('arrival_date', arrivalDate)

                await registerArrival(formData)
              }}
            >
              <label htmlFor="arrival-date">
                Data arrivo
              </label>

              <input
                id="arrival-date"
                name="arrival_date"
                type="date"
                value={arrivalDate}
                onChange={(event) =>
                  setArrivalDate(event.target.value)
                }
                required
              />

              {arrivalError && (
                <p className="error">{arrivalError}</p>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setShowArrivalModal(false)
                  }
                >
                  Annulla
                </button>

                <button
                  type="submit"
                  className="archive-action-button"
                >
                  Conferma arrivo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSaleModal && (
        <div className="modal-backdrop">
          <div className="modal-card sale-modal-card">
            <div className="modal-header">
              <h2>Registra vendita</h2>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowSaleModal(false)}
              >
                ×
              </button>
            </div>

            <div className="sale-customer-field">
              <label htmlFor="sale-customer-code">
                Codice cliente
              </label>

              <input
                id="sale-customer-code"
                type="text"
                value={saleCustomerCode}
                onChange={(event) =>
                  setSaleCustomerCode(
                    event.target.value.toUpperCase(),
                  )
                }
                placeholder="Es. A26"
              />
            </div>

            <div className="sale-total-tools">
              <label htmlFor="sale-total">
                Totale vendita complessivo €
              </label>

              <div className="sale-total-row">
                <input
                  id="sale-total"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={saleTotal}
                  onChange={(event) =>
                    setSaleTotal(event.target.value)
                  }
                  placeholder="0,00"
                />

                <button
                  type="button"
                  className="secondary-button"
                  onClick={distributeSaleTotal}
                >
                  Distribuisci
                </button>
              </div>
            </div>

            <div className="sale-lines">
              {selectedArticles.map((article) => {
                const data = saleData[article.id] || {
                  quantity: '1',
                  price: '',
                }

                const quantity = toNumber(data.quantity)
                const price = toNumber(data.price)
                const lineTotal = quantity * price

                return (
                  <div
                    key={article.id}
                    className="sale-line"
                  >
                    <div className="sale-line-title">
                      <strong>
                        {article.article_code}
                      </strong>

                      <span>
                        {article.series || 'Serie non indicata'}
                      </span>

                      <span>
                        {article.detail || 'Senza dettaglio'}
                      </span>

                      <small>
                        Residuo: {article.available}
                      </small>

                      <small>
                        Prezzo acquisto unitario:{' '}
                        {formatMoney(article.unit_cost_eur)}
                      </small>
                    </div>

                    <label>
                      Quantità
                      <input
                        type="number"
                        min="1"
                        max={article.available}
                        step="1"
                        value={data.quantity}
                        onChange={(event) =>
                          updateSaleData(
                            article.id,
                            'quantity',
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Prezzo unitario €
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={data.price}
                        onChange={(event) =>
                          updateSaleData(
                            article.id,
                            'price',
                            event.target.value,
                          )
                        }
                        placeholder="0,00"
                      />
                    </label>

                    <div className="sale-line-total">
                      <span>Totale</span>
                      <strong>
                        {formatMoney(lineTotal)}
                      </strong>
                    </div>
                  </div>
                )
              })}
            </div>

            {saleError && (
              <p className="error">{saleError}</p>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowSaleModal(false)}
              >
                Annulla
              </button>

              <form
                action={async (formData) => {
                  if (!saleIsReady) {
                    setSaleError(
                      'Controlla cliente, quantità e prezzi.',
                    )
                    return
                  }

                  formData.set(
                    'customer_code',
                    saleCustomerCode.trim(),
                  )

                  for (const article of selectedArticles) {
                    const data = saleData[article.id]

                    formData.append(
                      'sale_article_id',
                      article.id,
                    )

                    formData.append(
                      `qty_${article.id}`,
                      data.quantity,
                    )

                    formData.append(
                      `price_${article.id}`,
                      data.price,
                    )
                  }

                  await registerSale(formData)
                }}
              >
                <button
                  type="submit"
                  className="archive-action-button"
                  disabled={!saleIsReady}
                >
                  Conferma vendita
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {showPhotoModal && (
        <div className="modal-backdrop">
          <div className="modal-card photo-modal-card">
            <div className="modal-header">
              <h2>Immagine articolo</h2>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowPhotoModal(null)}
              >
                ×
              </button>
            </div>

            <img
              src={showPhotoModal}
              alt="Immagine articolo"
              className="article-photo-large"
            />
          </div>
        </div>
      )}
    </>
  )
}
