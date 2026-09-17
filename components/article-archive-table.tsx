'use client'
import { useState } from 'react'

export default function ArticleArchiveTable({ rows, initialSearch }: { rows: any[]; initialSearch: string }) {
  const [search, setSearch] = useState(initialSearch)
  const [photo, setPhoto] = useState<string | null>(null)
  return <section className="panel">
    <form className="search-form" method="get"><input name="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per codice, serie, descrizione o provenienza" /><button type="submit">Cerca</button>{search && <a className="back-button" href="/admin/articoli/archivio">Azzera</a>}</form>
    <div className="archive-table-wrap table-wrap"><table><thead><tr><th>Codice</th><th>Data</th><th>Serie</th><th>Dettaglio</th><th>Valore acquisto</th><th>Quantità</th><th>Vendite complessive</th><th>Residue</th><th>Codici utenti</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><a href={`/admin/articoli/${row.id}`}>{row.article_code}</a></td><td>{row.purchase_date ? new Date(row.purchase_date).toLocaleDateString('it-IT') : '—'}</td><td>{row.series || '—'}</td><td><div>{row.detail || '—'}</div>{row.photo_url && <button type="button" className="icon-button" title="Apri immagine" onClick={() => setPhoto(row.photo_url)}>🖼️</button>}</td><td>€ {Number(row.total_cost_eur || 0).toFixed(2)}</td><td>{row.quantity_purchased}</td><td>€ {Number(row.sales_revenue || 0).toFixed(2)}</td><td>{row.remaining_quantity}</td><td>{row.mailbox_codes.length ? row.mailbox_codes.join(', ') : '—'}</td></tr>)}</tbody></table></div>
    {!rows.length && <p className="muted">Nessun articolo trovato.</p>}
    {photo && <div className="image-modal" role="dialog" aria-modal="true" onClick={() => setPhoto(null)}><div className="image-modal-content" onClick={e => e.stopPropagation()}><button type="button" className="modal-close" onClick={() => setPhoto(null)}>×</button><img src={photo} alt="Foto articolo" /></div></div>}
  </section>
}
