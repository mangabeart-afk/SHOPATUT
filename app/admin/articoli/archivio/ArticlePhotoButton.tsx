'use client'

type Props = {
  articleId: string
  photoUrl: string | null
}

export default function ArticlePhotoButton({
  articleId,
  photoUrl,
}: Props) {
  const hasPhoto =
    typeof photoUrl === 'string' &&
    photoUrl.trim().length > 0

  return (
    <button
      type="button"
      className="article-photo-button"
      title={
        hasPhoto
          ? 'Visualizza immagine articolo'
          : 'Immagine non disponibile'
      }
      aria-label={
        hasPhoto
          ? `Visualizza immagine articolo ${articleId}`
          : `Immagine non disponibile per ${articleId}`
      }
      disabled={!hasPhoto}
      onClick={() => {
        if (!hasPhoto) return

        window.open(
          photoUrl,
          '_blank',
          'noopener,noreferrer',
        )
      }}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
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
  )
}
