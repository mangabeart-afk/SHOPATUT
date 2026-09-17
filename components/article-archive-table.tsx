'use client'

import { useState } from 'react'

type ArticleRow = {
  id: string
  article_code: string
  purchase_date: string | null
  series?: string | null
  detail?: string | null
  total_cost_eur?: number | null
  quantity_purchased: number
  sales_revenue?: number | null
  remaining_quantity: number
  mailbox_codes: string[]
}

type Props = {
  rows: ArticleRow[]
  initialSearch: string
  registerSale: (
    formData: FormData,
  ) => void | Promise<void>
}

export default function ArticleArchiveTable({
  rows,
  initialSearch,
  registerSale,
}: Props) {
  const [search, setSearch] = useState(initialSearch)
  const [saleArticleId, setSaleArticleId] = useState<
    string | null
  >(null)

  const selectedArticle = rows.find(
    (row) => row.id === saleArticleId,
  )

  return (
    <section className="panel">
      <form className="search-form" method="get">
        <input
          name="search"
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Cerca per codice, serie, descrizione o provenienza"
        />

        <button type="submit">Cerca</button>

        {search && (
          <a
            className="back-button"
            href="/admin/articoli/archivio"
          >
            Azzera
          </a>
        )}
      </form>

      <div className="archive-table-wrap table-wrap">
        <table>
          <thead>
            <tr>
              <th>Codice</th>
              <th>Data</th>
              <th>Serie</th>
              <th>Dettaglio</th>
              <th>Valore acquisto</th>
              <th>Quantità</th>
              <th>Vendite complessive</th>
              <th>Residue</th>
              <th>Codici utenti</th>
              <th>Azioni</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <a href={`/admin/articoli/${row.id}`}>
                    {row.article_code}
                  </a>
                </td>

                <td>
                  {row.purchase_date
                    ? new Date(
                        row.purchase_date,
                      ).toLocaleDateString('it-IT')
                    : '—'}
                </td>

                <td>{row.series || '—'}</td>

                <td>{row.detail || '—'}</td>

                <td>
                  € {Number(
                    row.total_cost_eur || 0,
                  ).toFixed(2)}
                </td>

                <td>{row.quantity_purchased}</td>

                <td>
                  € {Number(
                    row.sales_revenue || 0,
                  ).toFixed(2)}
                </td>

                <td>{row.remaining_quantity}</td>

                <td>
                  {row.mailbox_codes?.length
                    ? row.mailbox_codes.join(', ')
                    : '—'}
                </td>

                <td>
                  <button
                    type="button"
                    disabled={row.remaining_quantity <= 0}
                    onClick={() =>
                      setSaleArticleId(row.id)
                    }
                  >
                    Vendi
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!rows.length && (
        <p className="muted">
          Nessun articolo trovato.
        </p>
      )}

      {selectedArticle && (
        <div
          className="image-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sale-dialog-title"
          onClick={() => setSaleArticleId(null)}
        >
          <div
            className="image-modal-content"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="modal-close"
              onClick={() =>
                setSaleArticleId(null)
              }
              aria-label="Chiudi"
            >
              ×
            </button>

            <h2 id="sale-dialog-title">
              Registra vendita
            </h2>

            <p className="muted">
              Articolo:{' '}
              <strong>
                {selectedArticle.article_code}
              </strong>
            </p>

            <p className="muted">
              Quantità disponibile:{' '}
              <strong>
                {selectedArticle.remaining_quantity}
              </strong>
            </p>

            <form
              action={registerSale}
              className="sale-form"
            >
              <input
                type="hidden"
                name="sale_article_id"
                value={selectedArticle.id}
              />

              <label htmlFor="customer_code">
                Cliente registrato o nuovo cliente
              </label>

              <input
                id="customer_code"
                name="customer_code"
                type="text"
                placeholder="Nome o codice cliente"
                required
              />

              <label
                htmlFor={`qty_${selectedArticle.id}`}
              >
                Quantità
              </label>

              <input
                id={`qty_${selectedArticle.id}`}
                name={`qty_${selectedArticle.id}`}
                type="number"
                min="1"
                max={
                  selectedArticle.remaining_quantity
                }
                defaultValue="1"
                required
              />

              <label
                htmlFor={`price_${selectedArticle.id}`}
              >
                Prezzo di vendita totale €
              </label>

              <input
                id={`price_${selectedArticle.id}`}
                name={`price_${selectedArticle.id}`}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                required
              />

              <div className="sale-form-actions">
                <button type="submit">
                  Conferma vendita
                </button>

                <button
                  type="button"
                  className="back-button"
                  onClick={() =>
                    setSaleArticleId(null)
                  }
                >
                  Annulla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
