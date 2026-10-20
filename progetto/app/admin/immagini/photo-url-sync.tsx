'use client'

import { useActionState } from 'react'
import { applyPhotoUrls, previewPhotoUrls } from './actions'
import type { PhotoSyncState } from './types'

const initialState: PhotoSyncState = { stage: 'idle' }

function count(value: number | undefined) {
  return new Intl.NumberFormat('it-IT').format(value || 0)
}

export default function PhotoUrlSync() {
  const [preview, previewAction, previewPending] = useActionState(previewPhotoUrls, initialState)
  const [applied, applyAction, applyPending] = useActionState(applyPhotoUrls, initialState)

  return (
    <div className="photo-url-sync">
      <form action={previewAction} className="article-create-form">
        <label className="photo-url-upload">
          <span>File Excel aggiornato (.xlsx)</span>
          <input type="file" name="workbook" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button type="submit" className="primary-button" disabled={previewPending}>
          {previewPending ? 'Analisi del file…' : '1 · Analizza e mostra anteprima'}
        </button>
      </form>

      {preview.stage === 'error' && <div className="error photo-url-result" role="alert">{preview.error}</div>}

      {preview.stage === 'preview' && applied.stage !== 'applied' && preview.stats && (
        <section className="photo-url-preview" aria-live="polite">
          <div className="success photo-url-result">{preview.message}</div>
          <div className="photo-url-stats">
            <div><span>Link trovati</span><strong>{count(preview.stats.urlsFound)}</strong></div>
            <div><span>URL validi</span><strong>{count(preview.stats.validUrls)}</strong></div>
            <div><span>Articoli associati</span><strong>{count(preview.stats.dbMatches)}</strong></div>
            <div><span>Foto già presenti</span><strong>{count(preview.stats.existingPhotos)}</strong></div>
            <div><span>Nuove foto aggiornabili</span><strong>{count(preview.stats.eligibleWithoutOverwrite)}</strong></div>
            <div><span>Righe non associate</span><strong>{count(preview.stats.missingDatabaseRows)}</strong></div>
          </div>
          {(preview.stats.invalidUrls > 0 || preview.stats.missingDatabaseRows > 0) && (
            <div className="photo-url-issues">
              <h3>Da controllare</h3>
              <p>URL non validi: {count(preview.stats.invalidUrls)} · Righe senza corrispondenza in Supabase: {count(preview.stats.missingDatabaseRows)}.</p>
              {preview.stats.issueExamples.length > 0 && <ul>{preview.stats.issueExamples.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>}
            </div>
          )}
          {preview.plan && preview.plan.length > 0 ? (
            <form action={applyAction} className="photo-url-confirm-form">
              <input type="hidden" name="plan" value={JSON.stringify(preview.plan)} />
              <label className="photo-url-overwrite"><input type="checkbox" name="overwrite_existing" /> <span>Sovrascrivi anche le foto già presenti in Supabase. Lascia deselezionato per conservarle.</span></label>
              <p>La conferma aggiornerà soltanto <code>articles.photo_url</code> per gli articoli corrispondenti alla stessa scheda e riga Excel. Non modifica quantità, prezzi, stati, assegnazioni o movimenti.</p>
              <button type="submit" className="primary-button" disabled={applyPending}>
                {applyPending ? 'Sincronizzazione…' : `2 · Conferma sincronizzazione (${count(preview.plan.length)} link associabili)`}
              </button>
            </form>
          ) : <div className="empty">Nessun link associabile. Verifica le colonne e che le righe Excel non siano state spostate.</div>}
        </section>
      )}

      {applied.stage === 'error' && <div className="error photo-url-result" role="alert">{applied.error}</div>}
      {applied.stage === 'applied' && applied.result && (
        <section className="photo-url-preview" aria-live="polite">
          <div className="success photo-url-result">{applied.message}</div>
          <div className="photo-url-stats photo-url-final-stats">
            <div><span>Foto aggiornate</span><strong>{count(applied.result.updated)}</strong></div>
            <div><span>Foto esistenti conservate</span><strong>{count(applied.result.skippedExisting)}</strong></div>
            <div><span>Righe cambiate o non più associate</span><strong>{count(applied.result.missingOrChanged)}</strong></div>
            <div><span>Errori aggiornamento</span><strong>{count(applied.result.failed)}</strong></div>
          </div>
          {applied.result.failureExamples.length > 0 && <div className="photo-url-issues"><h3>Dettagli degli errori</h3><ul>{applied.result.failureExamples.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></div>}
          <a className="back-button" href="/admin/articoli/archivio">Verifica nell’Archivio articoli →</a>
        </section>
      )}
    </div>
  )
}
