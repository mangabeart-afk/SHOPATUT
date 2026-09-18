'use client'

type Props = {
  articleId: string
  photoUrl: string | null
}

export default function ArticlePhotoButton({
  articleId,
  photoUrl,
}: Props) {
  const hasPhoto = Boolean(photoUrl?.trim())

  return (
    <button
      type="button"
      className="image-preview-link"
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
        if (!hasPhoto || !photoUrl) return

        window.open(
          photoUrl,
          '_blank',
          'noopener,noreferrer',
        )
      }}
    >
      🔍
    </button>
  )
}
