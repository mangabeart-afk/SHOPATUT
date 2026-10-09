'use client'

import { useEffect, useState } from 'react'

type IncomingArticle = {
  id: string
  article_code: string
  series: string | null
  detail: string | null
  photo_url: string | null
  status: string | null
  origin?: string | null
}

export default function IncomingArticlesGallery({
  articles,
}: {
  articles: IncomingArticle[]
}) {
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<IncomingArticle | null>(null)

  const visibleArticles = articles
    .filter((article) => Boolean(article.photo_url) && !failedIds.has(article.id))
    .slice(0, 12)

  useEffect(() => {
    if (!selected) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('incoming-modal-open')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('incoming-modal-open')
    }
  }, [selected])

  if (visibleArticles.length === 0) {
    return <div className="empty">Nessun articolo con foto disponibile.</div>
  }

  return (
    <>
      <div className="incoming-gallery">
        {visibleArticles.map((article, index) => (
          <article className="incoming-card" key={article.id}>
            <button
              type="button"
              className="incoming-photo"
              title="Apri anteprima"
              aria-label={`Apri anteprima ${article.article_code}`}
              onClick={() => setSelected(article)}
            >
              <img
                src={article.photo_url || ''}
                alt={article.detail || article.series || article.article_code}
                loading={index < 5 ? 'eager' : 'lazy'}
                decoding="async"
                fetchPriority={index === 0 ? 'high' : 'auto'}
                onError={() =>
                  setFailedIds((current) => {
                    const next = new Set(current)
                    next.add(article.id)
                    return next
                  })
                }
              />
            </button>

            <div className="incoming-info" title={`${article.article_code}${article.origin ? ` · ${article.origin}` : ''}${article.series ? ` · ${article.series}` : ''}${article.detail ? ` · ${article.detail}` : ''}`}>
              <strong className="incoming-code-origin">
                <span className="incoming-code">{article.article_code}</span>
                <span className="incoming-origin">{article.origin || ''}</span>
              </strong>
              <span className="incoming-series" title={article.series || ''}>{article.series || ''}</span>
              <span className="incoming-detail" title={article.detail || ''}>{article.detail || ''}</span>
            </div>
          </article>
        ))}
      </div>

      {selected && selected.photo_url && (
        <div
          className="incoming-modal-overlay"
          role="presentation"
          onMouseDown={() => setSelected(null)}
        >
          <div
            className="incoming-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Anteprima ${selected.article_code}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="incoming-modal-close"
              onClick={() => setSelected(null)}
              aria-label="Chiudi anteprima"
            >
              ×
            </button>
            <img
              src={selected.photo_url}
              alt={selected.detail || selected.series || selected.article_code}
            />
            <div className="incoming-modal-caption">
              <strong>{selected.article_code}</strong>
              {selected.origin && <span>{selected.origin}</span>}
              {selected.series && <span>{selected.series}</span>}
              {selected.detail && <span>{selected.detail}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
