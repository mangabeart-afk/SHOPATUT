'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type ArticleRow = {
  id: string
  article_code: string | null
  purchase_date: string | null
  series: string | null
  detail: string | null
  quantity_purchased: number | null
  total_cost_eur: number | null
  unit_cost_eur: number | null
  photo_url: string | null
  effective_status: string
  sold_quantity: number
  sales_revenue: number
  remaining_quantity: number
  mailbox_codes: string[]
}

type CustomerOption = {
  id: string
  name: string
  email: string
  mailboxCodes: string[]
}

type SaleLine = {
  article_id: string
  quantity: number
  price: number
}

type Props = {
  rows: ArticleRow[]
  initialSearch: string
  customers: CustomerOption[]
  updateArticleStatus: (
    articleIds: string[],
    status: string,
  ) => Promise<{
    success: boolean
    message: string
  }>
  registerArticleSale: (
    customerCode: string,
    lines: SaleLine[],
    customerId?: string | null,
  ) => Promise<{
    success: boolean
    message: string
    customerId: string | null
  }>
}

const formatMoney = (value: number | null | undefined) =>
  `€ ${Number(value || 0).toFixed(2)}`

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('it-IT').format(new Date(value))
    : '—'

export default function ArticleArchiveTable({
  rows,
  initialSearch,
  customers,
  updateArticleStatus,
  registerArticleSale,
}: Props) {
  const router = useRouter()

  const [search, setSearch] = useState(initialSearch)
  const [statusFilter, setStatusFilter] = useState('TUTTI')
  const [quantityFilter, setQuantityFilter] = useState('TUTTE')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [photo, setPhoto] = useState<string | null>(null)
  const [statusOpen, setStatusOpen] = useState(false)
  const [saleOpen, setSaleOpen] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState('IN STOCK')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerOption | null>(null)
  const [newCustomer, setNewCustomer] = useState('')
  const [saleMode, setSaleMode] = useState<'AUTO' | 'MANUAL'>('AUTO')
  const [manualTotal, setManualTotal] = useState('')
  const [salePrices, setSalePrices] = useState<Record<string, string>>({})
  const [saleQuantities, setSaleQuantities] = useState<
    Record<string, string>
  >({})
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      const statusMatch =
        statusFilter === 'TUTTI' ||
        row.effective_status === statusFilter

      const quantityMatch =
        quantityFilter === 'TUTTE' ||
        (quantityFilter === '0' && row.remaining_quantity === 0) ||
        (quantityFilter === '>0' && row.remaining_quantity > 0)

      return statusMatch && quantityMatch
    })
  }, [rows, statusFilter, quantityFilter])

  const selectedRows = rows.filter((row) =>
    selectedIds.includes(row.id),
  )

  const totalPurchaseValue = selectedRows.reduce(
    (total, row) => total + Number(row.total_cost_eur || 0),
    0,
  )

  const filteredCustomers = customers.filter((customer) => {
    const term = customerSearch.trim().toLowerCase()

    if (!term) return true

    return (
      customer.name.toLowerCase().includes(term) ||
      customer.email.toLowerCase().includes(term) ||
      customer.mailboxCodes.some((code) =>
        code.toLowerCase().includes(term),
      )
    )
  })

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  const toggleAllVisible = () => {
    const visibleIds = visibleRows.map((row) => row.id)
    const allSelected = visibleIds.every((id) =>
      selectedIds.includes(id),
    )

    setSelectedIds((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    )
  }

  const openSale = () => {
    if (!selectedRows.length) {
      setFeedback({
        type: 'error',
        text: 'Seleziona almeno un articolo da vendere.',
      })
      return
    }

    const initialPrices: Record<string, string> = {}
    const initialQuantities: Record<string, string> = {}

    for (const row of selectedRows) {
      initialPrices[row.id] = String(
        Number(row.unit_cost_eur || 0).toFixed(2),
      )
      initialQuantities[row.id] = String(row.remaining_quantity)
    }

    setSalePrices(initialPrices)
    setSaleQuantities(initialQuantities)
    setCustomerSearch('')
    setSelectedCustomer(null)
    setNewCustomer('')
    setManualTotal('')
    setSaleMode('AUTO')
    setFeedback(null)
    setSaleOpen(true)
  }

  const calculatedTotal = selectedRows.reduce((total, row) => {
    const quantity = Math.max(
      0,
      Number(saleQuantities[row.id] || 0),
    )

    const price = Math.max(
      0,
      Number(salePrices[row.id] || 0),
    )

    return total + quantity * price
  }, 0)

  const applyManualTotal = (value: string) => {
    setManualTotal(value)

    const target = Number(value)

    if (!target || target < 0 || totalPurchaseValue <= 0) {
      return
    }

    const nextPrices: Record<string, string> = {}

    for (const row of selectedRows) {
      const purchaseValue = Number(row.total_cost_eur || 0)
      const proportion = purchaseValue / totalPurchaseValue
      const quantity = Math.max(
        1,
        Number(saleQuantities[row.id] || 1),
      )

      const rowTotal = target * proportion
      const unitPrice = rowTotal / quantity

      nextPrices[row.id] = unitPrice.toFixed(2)
    }

    setSalePrices(nextPrices)
  }

  const confirmStatus = async () => {
    if (!selectedIds.length) return

    setBusy(true)
    setFeedback(null)

    try {
      const result = await updateArticleStatus(
        selectedIds,
        selectedStatus,
      )

      setFeedback({
        type: 'success',
        text: result.message,
      })

      setSelectedIds([])
      setStatusOpen(false)
      router.refresh()
    } catch (error: any) {
      setFeedback({
        type: 'error',
        text: error?.message || 'Errore durante l’aggiornamento.',
      })
    } finally {
      setBusy(false)
    }
  }

  const confirmSale = async () => {
    const customerCode =
      selectedCustomer?.mailboxCodes[0] || newCustomer.trim()

    if (!customerCode) {
      setFeedback({
        type: 'error',
        text: 'Seleziona un cliente oppure inserisci un nuovo nome/codice.',
      })
      return
    }

    const lines: SaleLine[] = []

    for (const row of selectedRows) {
      const quantity = Number(saleQuantities[row.id] || 0)
      const price = Number(salePrices[row.id] || 0)

      if (!Number.isInteger(quantity) || quantity <= 0) {
        setFeedback({
          type: 'error',
          text: `Quantità non valida per ${row.article_code || 'articolo'}.`,
        })
        return
      }

      if (quantity > row.remaining_quantity) {
        setFeedback({
          type: 'error',
          text: `Quantità superiore alla disponibilità per ${
            row.article_code || 'articolo'
          }.`,
        })
        return
      }

      if (price < 0 || !Number.isFinite(price)) {
        setFeedback({
          type: 'error',
          text: `Prezzo non valido per ${row.article_code || 'articolo'}.`,
        })
        return
      }

      lines.push({
        article_id: row.id,
        quantity,
        price,
      })
    }

    setBusy(true)
    setFeedback(null)

    try {
      const result = await registerArticleSale(
        customerCode,
        lines,
        selectedCustomer?.id || null,
      )

      setFeedback({
        type: 'success',
        text: result.message,
      })

      setSaleOpen(false)
      setSelectedIds([])

      if (result.customerId) {
        router.push(`/admin/clienti/${result.customerId}`)
      } else {
        router.refresh()
      }
    } catch (error: any) {
      setFeedback({
        type: 'error',
        text: error?.message || 'Errore durante la registrazione della vendita.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <div className="archive-toolbar">
        <form
          className="search-form"
          method="get"
        >
          <input
            name="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca codice, serie, dettaglio o provenienza"
          />

          <button type="submit">
            Cerca
          </button>

          {search ? (
            <a
              className="back-button"
              href="/admin/articoli/archivio"
            >
              Azzera
            </a>
          ) : null}
        </form>

        <div className="archive-filters">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="TUTTI">Tutti gli stati</option>
            <option value="IN ARRIVO">IN ARRIVO</option>
            <option value="IN STOCK">IN STOCK</option>
            <option value="SOLD">SOLD</option>
          </select>

          <select
            value={quantityFilter}
            onChange={(event) => setQuantityFilter(event.target.value)}
          >
            <option value="TUTTE">Tutte le quantità</option>
            <option value="0">In Stock = 0</option>
            <option value=">0">In Stock &gt; 0</option>
          </select>
        </div>
      </div>

      <div className="archive-actions">
        <button
          type="button"
          disabled={!selectedIds.length || busy}
          onClick={() => setStatusOpen(true)}
        >
          Stato
        </button>

        <button
          type="button"
          disabled={!selectedIds.length || busy}
          onClick={openSale}
        >
          Vendi
        </button>

        <span className="archive-selected-count">
          {selectedIds.length} selezionat
          {selectedIds.length === 1 ? 'o' : 'i'}
        </span>
      </div>

      {feedback ? (
        <div
          className={
            feedback.type === 'success'
              ? 'archive-feedback success'
              : 'archive-feedback error'
          }
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="archive-table-wrap table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={
                    visibleRows.length > 0 &&
                    visibleRows.every((row) =>
                      selectedIds.includes(row.id),
                    )
                  }
                  onChange={toggleAllVisible}
                  aria-label="Seleziona tutti gli articoli visibili"
                />
              </th>
              <th>Codice</th>
              <th>Data</th>
              <th>Serie</th>
              <th>Dettaglio</th>
              <th>Q.tà</th>
              <th>In Stock</th>
              <th>€€</th>
              <th>€</th>
              <th>Stato</th>
              <th>Vendite</th>
              <th>Utenti</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((row) => {
              const sold = row.effective_status === 'SOLD'

              return (
                <tr
                  key={row.id}
                  className={sold ? 'article-row-sold' : ''}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() => toggleSelected(row.id)}
                      aria-label={`Seleziona ${
                        row.article_code || 'articolo'
                      }`}
                    />
                  </td>

                  <td>
                    <div className="article-code-cell">
                      <strong>
                        {row.article_code || '—'}
                      </strong>

                      {row.photo_url ? (
                        <button
                          type="button"
                          className="article-photo-button"
                          title="Apri immagine"
                          aria-label="Apri immagine articolo"
                          onClick={() => setPhoto(row.photo_url)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <circle
                              cx="10.5"
                              cy="10.5"
                              r="6.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            />
                            <path
                              d="M16 16l5 5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </td>

                  <td>{formatDate(row.purchase_date)}</td>
                  <td>{row.series || '—'}</td>
                  <td>{row.detail || '—'}</td>
                  <td>{row.quantity_purchased ?? 0}</td>
                  <td>{row.remaining_quantity}</td>
                  <td>{formatMoney(row.total_cost_eur)}</td>
                  <td>{formatMoney(row.unit_cost_eur)}</td>

                  <td>
                    <span
                      className={`article-status article-status-${row.effective_status
                        .toLowerCase()
                        .replace(/\s+/g, '-')}`}
                    >
                      {row.effective_status}
                    </span>
                  </td>

                  <td>
                    <div>{formatMoney(row.sales_revenue)}</div>
                    <small>
                      Q.tà: {row.sold_quantity}
                    </small>
                  </td>

                  <td>
                    {row.mailbox_codes.length
                      ? row.mailbox_codes.join(', ')
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!visibleRows.length ? (
        <p className="muted">
          Nessun articolo trovato con i filtri selezionati.
        </p>
      ) : null}

      {statusOpen ? (
        <div
          className="archive-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-modal-title"
        >
          <div className="archive-modal-content">
            <button
              type="button"
              className="modal-close"
              onClick={() => setStatusOpen(false)}
            >
              ×
            </button>

            <h2 id="status-modal-title">
              Aggiorna stato
            </h2>

            <p>
              Articoli selezionati: {selectedIds.length}
            </p>

            <select
              value={selectedStatus}
              onChange={(event) =>
                setSelectedStatus(event.target.value)
              }
            >
              <option value="IN ARRIVO">IN ARRIVO</option>
              <option value="IN STOCK">IN STOCK</option>
              <option value="SOLD">SOLD</option>
            </select>

            <div className="archive-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setStatusOpen(false)}
              >
                Annulla
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={confirmStatus}
              >
                {busy ? 'Salvataggio...' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {saleOpen ? (
        <div
          className="archive-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sale-modal-title"
        >
          <div className="archive-modal-content archive-sale-modal">
            <button
              type="button"
              className="modal-close"
              onClick={() => setSaleOpen(false)}
            >
              ×
            </button>

            <h2 id="sale-modal-title">
              Registra vendita
            </h2>

            <label>
              Cerca cliente o casella
              <input
                value={customerSearch}
                onChange={(event) => {
                  setCustomerSearch(event.target.value)
                  setSelectedCustomer(null)
                }}
                placeholder="Codice casella, nome o email"
              />
            </label>

            {customerSearch && !selectedCustomer ? (
              <div className="customer-search-results">
                {filteredCustomers.slice(0, 8).map((customer) => (
                  <button
                    type="button"
                    key={customer.id}
                    className="customer-search-result"
                    onClick={() => {
                      setSelectedCustomer(customer)
                      setCustomerSearch(
                        customer.mailboxCodes[0] ||
                          customer.name,
                      )
                      setNewCustomer('')
                    }}
                  >
                    <strong>{customer.name}</strong>
                    <span>
                      {customer.mailboxCodes.length
                        ? customer.mailboxCodes.join(', ')
                        : 'Nessuna casella'}
                    </span>
                    {customer.email ? (
                      <small>{customer.email}</small>
                    ) : null}
                  </button>
                ))}

                {!filteredCustomers.length ? (
                  <p className="muted">
                    Nessun cliente trovato. Puoi usare un nuovo cliente.
                  </p>
                ) : null}
              </div>
            ) : null}

            <label>
              Nuovo cliente o codice manuale
              <input
                value={newCustomer}
                onChange={(event) => {
                  setNewCustomer(event.target.value)
                  setSelectedCustomer(null)
                }}
                placeholder="Nome o codice cliente"
              />
            </label>

            {selectedCustomer ? (
              <div className="selected-customer">
                Cliente selezionato:{' '}
                <strong>{selectedCustomer.name}</strong>
                {selectedCustomer.mailboxCodes.length
                  ? ` — ${selectedCustomer.mailboxCodes[0]}`
                  : ''}
              </div>
            ) : null}

            <div className="sale-mode">
              <label>
                <input
                  type="radio"
                  checked={saleMode === 'AUTO'}
                  onChange={() => setSaleMode('AUTO')}
                />
                Totale automatico
              </label>

              <label>
                <input
                  type="radio"
                  checked={saleMode === 'MANUAL'}
                  onChange={() => setSaleMode('MANUAL')}
                />
                Totale manuale
              </label>
            </div>

            {saleMode === 'MANUAL' ? (
              <label>
                Totale vendita
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualTotal}
                  onChange={(event) =>
                    applyManualTotal(event.target.value)
                  }
                  placeholder="0.00"
                />
              </label>
            ) : null}

            <div className="sale-lines">
              {selectedRows.map((row) => (
                <div
                  className="sale-line"
                  key={row.id}
                >
                  <div className="sale-line-info">
                    <strong>{row.article_code || '—'}</strong>
                    <span>{row.series || '—'}</span>
                    <small>{row.detail || '—'}</small>
                    <small>
                      Acquisto: {formatMoney(row.total_cost_eur)}
                    </small>
                  </div>

                  <label>
                    Q.tà
                    <input
                      type="number"
                      min="1"
                      max={row.remaining_quantity}
                      value={saleQuantities[row.id] || ''}
                      onChange={(event) =>
                        setSaleQuantities((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    € vendita
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={salePrices[row.id] || ''}
                      onChange={(event) =>
                        setSalePrices((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              ))}
            </div>

            <div className="sale-total">
              Totale vendita:{' '}
              <strong>
                {formatMoney(
                  saleMode === 'MANUAL' && manualTotal
                    ? Number(manualTotal)
                    : calculatedTotal,
                )}
              </strong>
            </div>

            <div className="archive-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSaleOpen(false)}
              >
                Annulla
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={confirmSale}
              >
                {busy ? 'Registrazione...' : 'Conferma vendita'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {photo ? (
        <div
          className="image-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setPhoto(null)}
        >
          <div
            className="image-modal-content"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setPhoto(null)}
            >
              ×
            </button>

            <img
              src={photo}
              alt="Foto articolo"
            />
          </div>
        </div>
      ) : null}
    </section>
  )
}
