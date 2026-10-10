'use client'

import { useMemo, useState } from 'react'
import CustomerSaleEditModal from './customer-sale-edit-modal'
import CustomerAssignmentEditModal from './customer-assignment-edit-modal'

export type CustomerArticleListRow = {
  id: string
  article_id: string | null
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
  shipment_codes: string[]
  section_status: 'IN BOX' | 'IN STOCK' | 'IN ARRIVO' | 'SPEDITO'
  canEdit: boolean
}

type Props = {
  rows: CustomerArticleListRow[]
  totalResidual: number
  customerId: string
  markInBox: (formData: FormData) => Promise<void>
  updateSale: (formData: FormData) => Promise<void>
  deleteSale: (formData: FormData) => Promise<void>
  updateAssignment: (formData: FormData) => Promise<void>
}

const money = (v: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0))
const sectionOrder: CustomerArticleListRow['section_status'][] = ['IN BOX', 'IN STOCK', 'IN ARRIVO', 'SPEDITO']

export default function CustomerArticlesList({ rows, totalResidual, customerId, markInBox, updateSale, deleteSale, updateAssignment }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const eligibleRows = useMemo(() => rows.filter(row => Boolean(row.assignment_id) && row.assignment_status === 'ATTIVA' && row.shipped_quantity <= 0 && row.section_status === 'IN STOCK'), [rows])
  const eligibleIds = useMemo(() => eligibleRows.map(row => row.assignment_id!).filter(Boolean), [eligibleRows])
  const toggle = (id: string) => setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const selectAll = () => setSelectedIds(eligibleIds.length > 0 && selectedIds.length === eligibleIds.length ? [] : eligibleIds)

  return <>
    <div className="customer-articles-toolbar">
      <div><strong>Totale importi residui: {money(totalResidual)}</strong><p className="muted">Seleziona gli articoli IN STOCK da spostare in BOX, pronti per la spedizione al saldo.</p></div>
      <form action={markInBox} className="customer-in-box-form">
        <input type="hidden" name="customer_id" value={customerId}/>
        {selectedIds.map(id => <input key={id} type="hidden" name="assignment_id" value={id}/>)}
        <button type="submit" className="primary-button" disabled={!selectedIds.length}>IN BOX</button>
      </form>
    </div>
    <div className="customer-article-select-all"><label><input type="checkbox" checked={eligibleIds.length > 0 && selectedIds.length === eligibleIds.length} onChange={selectAll} disabled={!eligibleIds.length}/> Seleziona tutti gli articoli IN STOCK da mettere in BOX</label></div>

    {sectionOrder.map(section => {
      const sectionRows = rows.filter(row => row.section_status === section)
      const copies = sectionRows.reduce((sum, row) => sum + Math.max(0, Number(row.quantity || 0)), 0)
      const descriptions: Record<CustomerArticleListRow['section_status'], string> = {
        'IN BOX': 'Pronti per essere spediti al saldo.',
        'IN STOCK': 'Articoli arrivati, da gestire.',
        'IN ARRIVO': 'Ordine effettuato o articolo in viaggio.',
        'SPEDITO': 'Tutti gli articoli già spediti.',
      }
      return <section key={section} className={`customer-article-section customer-article-section-${section.toLowerCase().replaceAll(' ', '-')}`}>
        <div className="section-heading"><div><h3>{section}{section !== 'SPEDITO' ? ` (${copies} ${copies === 1 ? 'copia' : 'copie'})` : ''}</h3><p className="muted">{descriptions[section]}</p></div></div>
        {!sectionRows.length ? <div className="empty">Nessun articolo in questa sezione.</div> : <div className="movement-list">
          {sectionRows.map(row => {
            const selectable = section === 'IN STOCK' && Boolean(row.assignment_id) && row.assignment_status === 'ATTIVA' && row.shipped_quantity <= 0
            const selected = row.assignment_id ? selectedIds.includes(row.assignment_id) : false
            return <div className="movement customer-article-admin-row customer-article-compact" key={row.id}>
              {selectable ? <div className="customer-article-admin-check"><input type="checkbox" checked={selected} onChange={() => row.assignment_id && toggle(row.assignment_id)} aria-label={`Seleziona ${row.article_code} per IN BOX`}/></div> : <div className="customer-article-admin-check customer-article-check-empty"/>}
              <div className="customer-article-lines">
                <div className="customer-article-line-one"><b>{row.article_code}</b><span>{row.series || '—'}</span><strong>{money(row.total)}</strong></div>
                <div className="customer-article-line-two"><span>{row.quantity}</span><span>{row.detail || '—'}</span><span className={`customer-article-state state-${section.toLowerCase().replaceAll(' ', '-')}`}>{section}</span></div>
                <div className="customer-article-line-three">
                  {section === 'SPEDITO' ? <span className="customer-shipment-code">{row.shipment_codes.length ? row.shipment_codes.join(', ') : '—'}</span> : <>
                    <span>PAGATO: {money(row.paid)}</span><span>RESIDUO: {money(row.residual)}</span>
                    {row.canEdit ? <CustomerSaleEditModal action={updateSale} deleteAction={deleteSale} sale={{id: row.id, article_code: row.article_code, date: row.date, quantity: row.quantity, unit_price_eur: row.unit_price_eur, notes: row.notes}}/> : row.assignment_id ? <CustomerAssignmentEditModal action={updateAssignment} assignment={{id: row.assignment_id, quantity: row.quantity, status: row.assignment_status || 'ATTIVA', notes: row.notes, customerId, articleCode: row.article_code}}/> : null}
                  </>}
                </div>
                {row.notes && <small className="customer-article-notes">{row.notes}</small>}
              </div>
            </div>
          })}
        </div>}
      </section>
    })}
  </>
}
