'use client'

import { useMemo, useState } from 'react'
import CustomerSaleEditModal from './customer-sale-edit-modal'

export type CustomerArticleListRow = {
  id: string
  assignment_id: string | null
  article_code: string
  series: string | null
  detail: string | null
  origin: string | null
  date: string
  quantity: number
  unit_price_eur: number
  total: number
  paid: number
  residual: number
  notes: string | null
  article_arrival_status: 'IN ARRIVO' | 'IN STOCK'
  article_global_status: string
  assignment_status: string | null
  shipped_quantity: number
}

type Props = {
  rows: CustomerArticleListRow[]
  totalResidual: number
  customerId: string
  markInBox: (formData: FormData) => Promise<void>
  updateSale: (formData: FormData) => Promise<void>
  deleteSale: (formData: FormData) => Promise<void>
}

const money = (v: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(v || 0))

const date = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      }).format(new Date(v))
    : '—'

export default function CustomerArticlesList({
  rows,
  totalResidual,
  customerId,
  markInBox,
  updateSale,
  deleteSale,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const eligibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          Boolean(row.assignment_id) &&
          row.assignment_status === 'ATTIVA' &&
          row.shipped_quantity <= 0 &&
          row.article_arrival_status === 'IN STOCK',
      ),
    [rows],
  )

  const eligibleIds = useMemo(
    () => eligibleRows.map((row) => row.assignment_id!).filter(Boolean),
    [eligibleRows],
  )

  const toggle = (assignmentId: string) => {
    setSelectedIds((current) =>
      current.includes(assignmentId)
        ? current.filter((id) => id !== assignmentId)
        : [...current, assignmentId],
    )
  }

  const selectAll = () => {
    if (eligibleIds.length > 0 && selectedIds.length === eligibleIds.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(eligibleIds)
    }
  }

  return (
    <>
      <div className="customer-articles-toolbar">
        <div>
          <strong>Totale importi residui: {money(totalResidual)}</strong>
          <p className="muted">
            Seleziona gli articoli arrivati e ancora da spedire, quindi inserisci gli articoli in BOX.
          </p>
        </div>

        <form action={markInBox} className="customer-in-box-form">
          <input type="hidden" name="customer_id" value={customerId} />
          {selectedIds.map((assignmentId) => (
            <input
              key={assignmentId}
              type="hidden"
              name="assignment_id"
              value={assignmentId}
            />
          ))}
          <button
            type="submit"
            className="primary-button"
            disabled={selectedIds.length === 0}
          >
            IN BOX
          </button>
        </form>
      </div>

      <div className="customer-article-select-all">
        <label>
          <input
            type="checkbox"
            checked={eligibleIds.length > 0 && selectedIds.length === eligibleIds.length}
            onChange={selectAll}
            disabled={eligibleIds.length === 0}
          />
          Seleziona tutti gli articoli arrivati da mettere in BOX
        </label>
      </div>

      {(['active', 'shipped'] as const).map((section) => {
        const sectionRows =
          section === 'shipped'
            ? rows.filter((row) => row.shipped_quantity > 0)
            : rows.filter((row) => row.shipped_quantity <= 0)

        return (
          <section key={section} className="customer-article-section">
            <div className="section-heading">
              <div>
                <h3>{section === 'shipped' ? 'Articoli spediti' : 'Articoli nella casella'}</h3>
                <p className="muted">
                  {section === 'shipped'
                    ? 'Articoli già spediti: vengono mostrati qui e non tra quelli disponibili nella casella.'
                    : 'Stato della casella: IN ARRIVO, IN STOCK oppure IN BOX.'}
                </p>
              </div>
            </div>

            {sectionRows.length === 0 ? (
              <div className="empty">
                {section === 'shipped' ? 'Nessun articolo spedito.' : 'Nessun articolo presente nella casella.'}
              </div>
            ) : (
              <div className="movement-list">
                {sectionRows.map((row) => {
                  const selectable =
                    section === 'active' &&
                    Boolean(row.assignment_id) &&
                    row.assignment_status === 'ATTIVA' &&
                    row.article_arrival_status === 'IN STOCK'
                  const alreadyInBox = row.assignment_status === 'IN_BOX'
                  const selected = row.assignment_id ? selectedIds.includes(row.assignment_id) : false
                  const statusText =
                    section === 'shipped'
                      ? 'SPEDITO'
                      : alreadyInBox
                        ? 'IN BOX'
                        : row.article_arrival_status

                  return (
                    <div className="movement customer-article-admin-row" key={row.id}>
                      <div className="customer-article-admin-check">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => row.assignment_id && toggle(row.assignment_id)}
                          disabled={!selectable}
                          aria-label={`Seleziona ${row.article_code} per IN BOX`}
                        />
                      </div>

                      <div>
                        <b>{row.article_code}</b>
                        <span>
                          {date(row.date)} · Serie: {row.series || '—'} · Dettagli: {row.detail || '—'} · Provenienza: {row.origin || '—'}
                        </span>
                        <span>
                          Quantità: {row.quantity} · Prezzo unitario: {money(row.unit_price_eur)}
                        </span>
                        <span>Importo vendita: {money(row.total)}</span>
                        <span>
                          Importo pagato: {money(row.paid)} · Residuo: {money(row.residual)}
                        </span>
                        <span>
                          <b>Stato articolo:</b> {row.article_arrival_status}
                          {row.article_global_status === 'VENDUTO' && ' · Archivio: SOLD'}
                        </span>
                        <span>
                          <b>Stato gestione:</b> {statusText}
                          {row.shipped_quantity > 0 && ` · quantità spedita ${row.shipped_quantity}`}
                        </span>
                        {row.notes && <span>Note: {row.notes}</span>}
                        <CustomerSaleEditModal
                          action={updateSale}
                          deleteAction={deleteSale}
                          sale={row}
                        />
                      </div>

                      <strong>{money(row.residual)}</strong>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
