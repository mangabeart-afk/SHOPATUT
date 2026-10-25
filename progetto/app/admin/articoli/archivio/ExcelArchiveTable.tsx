'use client'

import { useState } from 'react'

type ExcelArchiveRow = {
  id: string
  key: string
  source: string
  date: string
  rawDate: string
  series: string
  type: string
  detail: string
  qty: number
  available: number
  total: string
  unit: string
  sold: string
  status: string
  customers: string[]
  photoUrl: string | null
  origin: string
}

type Props = {
  rows: ExcelArchiveRow[]
  resultCount: number
  sort: string
  sortLinks: Record<string, string>
}

const statusClass = (value: string) => {
  const state = value.toUpperCase()
  if (state === 'IN ARRIVO') return 'excel-archive-status excel-archive-status-incoming'
  if (state === 'IN STOCK' || state === 'STOCK') return 'excel-archive-status excel-archive-status-stock'
  if (state === 'IN BOX') return 'excel-archive-status excel-archive-status-box'
  if (state === 'SPEDITO') return 'excel-archive-status excel-archive-status-shipped'
  if (state === 'VENDUTO' || state === 'SOLD') return 'excel-archive-status excel-archive-status-sold'
  return 'excel-archive-status'
}

export default function ExcelArchiveTable({ rows, resultCount, sort, sortLinks }: Props) {
  const [details, setDetails] = useState<ExcelArchiveRow | null>(null)
  const sortHeader = (key: string, label: string, className = '') => (
    <th className={className} key={key} scope="col">
      <a href={sortLinks[key] || '#'} className={`excel-archive-sort${sort.startsWith(`${key}_`) ? ' is-active' : ''}`}>
        {label}{sort === `${key}_asc` ? ' ↑' : sort === `${key}_desc` ? ' ↓' : ''}
      </a>
    </th>
  )

  return (
    <>
      <p className="excel-archive-scroll-hint">Su smartphone scorri la tabella orizzontalmente per vedere tutte le colonne →</p>
      <div className="excel-archive-table-wrapper">
        <table className={`excel-archive-table${resultCount === 1 ? ' single-result' : ''}`}>
          <thead>
            <tr>
              {sortHeader('date', 'DATA', 'excel-archive-date-col')}
              {sortHeader('code', 'CODICE', 'excel-archive-code-col')}
              {sortHeader('series', 'SERIE', 'excel-archive-series-col')}
              {sortHeader('detail', 'DETTAGLI', 'excel-archive-detail-col')}
              {sortHeader('quantity', 'Q', 'excel-archive-number-col')}
              {sortHeader('available', 'S', 'excel-archive-number-col')}
              {sortHeader('total_cost', '€€€', 'excel-archive-number-col')}
              {sortHeader('unit_cost', '€', 'excel-archive-number-col excel-archive-unit-col')}
              {sortHeader('users', 'UTENTI', 'excel-archive-users-col')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td className="excel-archive-empty" colSpan={9}>Nessun articolo corrisponde ai filtri selezionati.</td></tr> : rows.map((row) => (
              <tr key={row.id}>
                <td className="excel-archive-date-col"><span>{row.date}</span><small>{row.source}</small></td>
                <td className="excel-archive-code-col">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
                    <div className="excel-archive-code-wrap">
                      <button type="button" className="excel-archive-code-button" onClick={() => setDetails(row)} aria-label={`Apri dettagli di ${row.key}`}>{row.key}</button>
                      {row.photoUrl ? <a className="excel-archive-photo-link" href={row.photoUrl} target="_blank" rel="noreferrer" title="Apri immagine originale" aria-label={`Apri immagine originale di ${row.key}`}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 17 5-5 3 3 2-2 4 4"/></svg></a> : null}
                    </div>
                    <span className={statusClass(row.status)}>{row.status || '—'}</span>
                  </div>
                </td>
                <td className="excel-archive-series-col"><strong>{row.series || '—'}</strong></td>
                <td className="excel-archive-detail-col">
                  <div className="excel-archive-detail-main"><span>{row.type || 'ALTRO'}</span><b>{row.detail || '—'}</b></div>
                  <small>{row.origin || row.source}</small>
                </td>
                <td className="excel-archive-number-col"><span className="excel-archive-value-prefix">Q</span> {row.qty}</td>
                <td className="excel-archive-number-col"><span className="excel-archive-value-prefix">S</span> {row.available}</td>
                <td className="excel-archive-number-col">{row.total}</td>
                <td className="excel-archive-number-col excel-archive-unit-col">{row.unit}</td>
                <td className="excel-archive-users-col">{row.customers.length ? row.customers.join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {details ? (
        <div className="article-details-overlay excel-archive-details-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetails(null) }}>
          <section className="article-details-modal excel-archive-details-modal" role="dialog" aria-modal="true" aria-labelledby="excel-archive-details-title">
            <button type="button" className="excel-archive-close" onClick={() => setDetails(null)} aria-label="Chiudi dettagli">×</button>
            <h2 id="excel-archive-details-title">Dettagli articolo</h2>
            <div className="article-details-hero">
              {details.photoUrl ? <img src={details.photoUrl} alt={`Immagine ${details.series} ${details.detail}`} /> : <div className="article-details-no-photo">Immagine non disponibile</div>}
              <div className="article-details-hero-copy">
                <strong className="article-details-code">{details.key}</strong>
                <h3>{details.series || '—'}</h3>
                <p>{details.type || 'ALTRO'} · {details.detail || '—'}</p>
                <p className={statusClass(details.status)}>{details.status || '—'}</p>
                {details.photoUrl ? <a href={details.photoUrl} target="_blank" rel="noreferrer">Apri immagine originale ↗</a> : null}
              </div>
            </div>
            <div className="article-details-group">
              <h3>Fonte Excel</h3>
              <div><span>Foglio e riga</span><strong>{details.source}</strong></div>
              <div><span>Data</span><strong>{details.date}</strong></div>
              <div><span>Provenienza</span><strong>{details.origin || '—'}</strong></div>
            </div>
            <div className="article-details-group">
              <h3>Quantità e valori</h3>
              <div><span>Q · Quantità</span><strong>{details.qty}</strong></div>
              <div><span>S · Quantità residua stimata dal workbook</span><strong>{details.available}</strong></div>
              <div><span>Costo totale</span><strong>{details.total}</strong></div>
              <div><span>Costo unitario</span><strong>{details.unit}</strong></div>
              <div><span>Valore in colonna SOLD (Excel)</span><strong>{details.sold}</strong></div>
            </div>
            <div className="article-details-group">
              <h3>Utenti indicati nel foglio</h3>
              <div><span>Codici / riferimenti</span><strong>{details.customers.length ? details.customers.join(', ') : '—'}</strong></div>
            </div>
            <p className="muted">Consultazione di sola lettura. Per correggere i dati modifica il workbook Excel e carica un nuovo snapshot.</p>
          </section>
        </div>
      ) : null}
    </>
  )
}
