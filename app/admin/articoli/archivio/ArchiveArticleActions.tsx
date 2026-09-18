'use client'

import { useState } from 'react'
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
}

type Props = {
  articles: ArticleOption[]
  registerArrival: (formData: FormData) => void
  registerSale: (formData: FormData) => void
}

type SaleData = {
  quantity: string
  price: string
}

export default function ArchiveArticleActions({
  articles,
  registerArrival,
  registerSale,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [customerCode, setCustomerCode] = useState('')
  const [saleData, setSaleData] = useState<
    Record<string, SaleData>
  >({})

  const hasSelection = selectedIds.length > 0

  const selectedArticles = articles.filter((article) =>
    selectedIds.includes(article.id),
  )

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
        quantity:
          current[articleId]?.quantity || '1',
        price:
          current[articleId]?.price || '',
        [field]: value,
      },
    }))
  }

  const saleIsReady =
    hasSelection &&
    customerCode.trim().length > 0 &&
    selectedArticles.every((article) => {
      const data = saleData[article.id]

      return (
        Number(data?.quantity || 0) > 0 &&
        Number(data?.price || 0) > 0
      )
    })

  function formatMoney(value: number | null) {
    if (value === null || value === undefined) {
      return '—'
    }

    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(Number(value))
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            ARCHIVIO
          </p>

          <h2>
            Lista articoli
          </h2>
        </div>

        <span className="results-count">
          {articles.length} articoli
        </span>
      </div>

      <div className="archive-toolbar">
        <form action={registerArrival}>
          {selectedIds.map((articleId) => (
            <input
              key={articleId}
              type="hidden"
              name="article_id"
              value={articleId}
            />
          ))}

          <button
            type="submit"
            className="archive-action-button"
            disabled={!hasSelection}
          >
            REGISTRA ARRIVO
          </button>
        </form>

        <form action={registerSale}>
          {selectedIds.map((articleId) => (
            <input
              key={articleId}
              type="hidden"
              name="sale_article_id"
              value={articleId}
            />
          ))}

          <input
            type="hidden"
            name="customer_code"
            value={customerCode}
          />

          {selectedIds.map((articleId) => (
            <div key={articleId}>
              <input
                type="hidden"
                name={`qty_${articleId}`}
                value={
                  saleData[articleId]?.quantity || '1'
                }
              />

              <input
                type="hidden"
                name={`price_${articleId}`}
                value={
                  saleData[articleId]?.price || ''
                }
              />
            </div>
          ))}

          <button
            type="submit"
            className="archive-action-button"
            disabled={!saleIsReady}
          >
            REGISTRA VENDITA
          </button>
        </form>

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

      {hasSelection && (
        <div className="selected-operation-panel">
          <div>
            <strong>
              {selectedIds.length} articolo/i selezionato/i
            </strong>

            <p>
              Inserisci il codice cliente, la quantità
              e il prezzo per registrare la vendita.
            </p>
          </div>

          <div className="sale-customer-field">
            <label htmlFor="archive-customer-code">
              Codice cliente
            </label>

            <input
              id="archive-customer-code"
              type="text"
              value={customerCode}
              onChange={(event) =>
                setCustomerCode(
                  event.target.value.toUpperCase(),
                )
              }
              placeholder="Es. A26"
            />
          </div>

          <div className="sale-lines">
            {selectedArticles.map((article) => (
              <div
                key={article.id}
                className="sale-line"
              >
                <div className="sale-line-title">
                  <strong>
                    {article.article_code}
                  </strong>

                  <span>
                    {article.detail || 'Senza dettaglio'}
                  </span>
                </div>

                <label>
                  Quantità

                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={
                      saleData[article.id]?.quantity ||
                      '1'
                    }
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
                  Prezzo €

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={
                      saleData[article.id]?.price ||
                      ''
                    }
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
              </div>
            ))}
          </div>
        </div>
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

                <th>
                  IMMAGINE
                </th>

                <th>
                  CODICE
                </th>

                <th>
                  DATA
                </th>

                <th>
                  SERIE
                </th>

                <th>
                  DETTAGLIO
                </th>

                <th>
                  Q
                </th>

                <th>
                  S
                </th>

                <th>
                  €€
                </th>

                <th>
                  €
                </th>

                <th>
                  STATO
                </th>

                <th>
                  UTENTI
                </th>
              </tr>
            </thead>

            <tbody>
              {articles.map((article) => (
                <tr key={article.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(
                        article.id,
                      )}
                      onChange={() =>
                        toggleArticle(article.id)
                      }
                      aria-label={`Seleziona ${article.article_code}`}
                    />
                  </td>

                  <td>
                    <ArticlePhotoButton
                      articleId={article.id}
                    />
                  </td>

                  <td>
                    <a
                      href={`/admin/articoli/${article.id}`}
                      className="article-code-link"
                    >
                      {article.article_code}
                    </a>
                  </td>

                  <td>
                    {article.purchase_date}
                  </td>

                  <td>
                    {article.series || '—'}
                  </td>

                  <td>
                    <div className="article-detail-cell">
                      <strong>
                        {article.detail || '—'}
                      </strong>

                      {article.seller && (
                        <small>
                          {article.seller}
                        </small>
                      )}

                      {article.origin && (
                        <small>
                          {article.origin}
                        </small>
                      )}
                    </div>
                  </td>

                  <td>
                    {article.quantity_purchased}
                  </td>

                  <td>
                    —
                  </td>

                  <td>
                    {formatMoney(
                      article.total_cost_eur,
                    )}
                  </td>

                  <td>
                    {formatMoney(
                      article.unit_cost_eur,
                    )}
                  </td>

                  <td>
                    <span
                      className={article.statusClass}
                    >
                      {article.statusLabel}
                    </span>
                  </td>

                  <td>
                    <a
                      href={`/admin/articoli/${article.id}`}
                      className="table-action"
                    >
                      Utenti
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .archive-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
        }

        .archive-toolbar form {
          margin: 0;
        }

        .archive-action-button {
          min-height: 42px;
          padding: 0 16px;
          border: 0;
          border-radius: 9px;
          background: #70443f;
          color: #ffffff;
          font-weight: 700;
          cursor: pointer;
        }

        .archive-action-button:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .selected-operation-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 20px;
          padding: 16px;
          border: 1px solid #d8c09a;
          border-radius: 12px;
          background: #f8f0e4;
        }

        .selected-operation-panel p {
          margin: 5px 0 0;
          color: #806b61;
          font-size: 13px;
        }

        .sale-customer-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-width: 280px;
        }

        .sale-customer-field label,
        .sale-line label {
          color: #70443f;
          font-size: 12px;
          font-weight: 700;
        }

        .sale-customer-field input,
        .sale-line input {
          min-height: 38px;
          padding: 7px 9px;
          border: 1px solid #cdbba3;
          border-radius: 7px;
          background: #ffffff;
        }

        .sale-lines {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .sale-line {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 110px 130px;
          gap: 12px;
          align-items: end;
          padding: 12px;
          border: 1px solid #e3d8ce;
          border-radius: 9px;
          background: #fffdf9;
        }

        .sale-line-title {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .sale-line-title strong {
          color: #70443f;
        }

        .sale-line-title span {
          overflow: hidden;
          color: #8c7770;
          font-size: 13px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sale-line label {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .articles-table-wrapper {
          width: 100%;
          overflow-x: auto;
        }

        .articles-table {
          width: 100%;
          min-width: 1120px;
          border-collapse: collapse;
          font-size: 13px;
        }

        .articles-table th {
          padding: 11px 9px;
          border-bottom: 2px solid #d8c09a;
          color: #70443f;
          font-size: 11px;
          letter-spacing: 0.4px;
          text-align: left;
          white-space: nowrap;
        }

        .articles-table td {
          padding: 12px 9px;
          border-bottom: 1px solid #eee4da;
          vertical-align: middle;
        }

        .articles-table tbody tr:hover {
          background: #fff8ef;
        }

        .articles-table input[type='checkbox'] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .articles-table th:first-child,
        .articles-table td:first-child {
          width: 42px;
          text-align: center;
        }

        .articles-table th:nth-child(2),
        .articles-table td:nth-child(2) {
          width: 70px;
          text-align: center;
        }

        .article-code-link {
          color: #70443f;
          font-weight: 800;
          text-decoration: none;
        }

        .article-code-link:hover,
        .table-action:hover {
          text-decoration: underline;
        }

        .article-detail-cell {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 160px;
        }

        .article-detail-cell strong {
          color: #493532;
        }

        .article-detail-cell small {
          color: #8c7770;
        }

        .article-status {
          display: inline-flex;
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }

        .status-arrivo {
          background: #fff0c2;
          color: #8a5a00;
        }

        .status-stock {
          background: #d9f2df;
          color: #276749;
        }

        .status-venduto {
          background: #eadcf8;
          color: #68408b;
        }

        .table-action {
          color: #70443f;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
        }

        .results-count {
          color: #8c7770;
          font-size: 13px;
          white-space: nowrap;
        }

        .empty {
          padding: 24px 0;
          color: #8c7770;
        }

        @media (max-width: 700px) {
          .archive-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .archive-toolbar form,
          .archive-action-button {
            width: 100%;
          }

          .sale-line {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  )
}
