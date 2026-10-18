'use client'

import { useState } from 'react'

type CustomerRow = {
  customerId: string
  customerCode: string
  firstName: string
  lastName: string
  debtRemaining: number
  stockUnits: number
  boxUnits: number
  incomingUnits: number
}

type Group = {
  id: 'debt' | 'incoming' | 'available'
  title: string
  tone: 'debt' | 'incoming' | 'available'
  customers: CustomerRow[]
  count: number
  mainLabel: string
  mainValue: string
  secondLabel?: string
  secondValue?: string
  thirdLabel?: string
  thirdValue?: string
}

const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0)

export default function AdminCustomerSituation({ groups }: { groups: Group[] }) {
  const [opened, setOpened] = useState<Group['id'] | null>(null)

  return (
    <div className="admin-customer-situation-groups">
      {groups.map((group) => {
        const isOpen = opened === group.id
        return (
          <section className={`admin-situation-card admin-situation-card-${group.tone}${isOpen ? ' is-open' : ''}`} key={group.id}>
            <button
              type="button"
              className="admin-situation-card-toggle"
              aria-expanded={isOpen}
              onClick={() => setOpened((current) => current === group.id ? null : group.id)}
            >
              <span className="admin-situation-card-copy">
                <strong>{group.title}</strong>
                <span className="admin-situation-card-values">
                  <span><b>{group.count}</b> {group.count === 1 ? 'utente' : 'utenti'}</span>
                  <span><b>{group.mainValue}</b> {group.mainLabel}</span>
                  {group.secondValue !== undefined && <span><b>{group.secondValue}</b> {group.secondLabel}</span>}
                  {group.thirdValue !== undefined && <span><b>{group.thirdValue}</b> {group.thirdLabel}</span>}
                </span>
              </span>
              <span className="admin-situation-chevron" aria-hidden="true">{isOpen ? '⌄' : '›'}</span>
            </button>
            {isOpen && (
              <div className="admin-situation-customer-list">
                {group.customers.length === 0 ? <p className="empty">Nessuna casella in questa situazione.</p> : group.customers.map((customer) => (
                  <a className="admin-situation-customer-row" key={`${group.id}-${customer.customerId}`} href={`/admin/clienti/${customer.customerId}`}>
                    <span className="admin-situation-customer-identity">
                      <strong>{[customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Utente'}</strong>
                      <b>{customer.customerCode || '—'}</b>
                    </span>
                    <span className="admin-situation-customer-metrics">
                      <span className="metric-debt"><small>Saldo</small><strong>{money(customer.debtRemaining)}</strong></span>
                      <span className="metric-incoming"><small>IN ARRIVO</small><strong>{customer.incomingUnits}</strong></span>
                      <span className="metric-stock"><small>IN STOCK</small><strong>{customer.stockUnits}</strong></span>
                      <span className="metric-box"><small>IN BOX</small><strong>{customer.boxUnits}</strong></span>
                    </span>
                  </a>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
