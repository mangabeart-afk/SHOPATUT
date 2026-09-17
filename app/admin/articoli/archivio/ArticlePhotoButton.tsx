'use client'

import { useState } from 'react'

type ArticlePhotoButtonProps = {
  articleCode: string
  photo: string | null
}

export default function ArticlePhotoButton({
  articleCode,
  photo,
}: ArticlePhotoButtonProps) {
  const [open, setOpen] = useState(false)

  if (!photo) {
    return (
      <button
        type="button"
        className="photo-button photo-button-disabled"
        title="Foto non disponibile"
        aria-label={`Foto non disponibile per ${articleCode}`}
        disabled
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle
            cx="11"
            cy="11"
            r="7"
          />

          <path d="m20 20-4-4" />
        </svg>
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        className="photo-button"
        title="Visualizza foto articolo"
        aria-label={`Visualizza foto ${articleCode}`}
        onClick={() => setOpen(true)}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle
            cx="11"
            cy="11"
            r="7"
          />

          <path d="m20 20-4-4" />
        </svg>
      </button>

      {open && (
        <div
          className="photo-modal-backdrop"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="photo-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Foto articolo ${articleCode}`}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="photo-modal-header">
              <strong>{articleCode}</strong>

              <button
                type="button"
                className="photo-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Chiudi foto"
              >
                ×
              </button>
            </div>

            <div className="photo-modal-content">
              <img
                src={photo}
                alt={`Foto articolo ${articleCode}`}
                className="article-photo-preview"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
