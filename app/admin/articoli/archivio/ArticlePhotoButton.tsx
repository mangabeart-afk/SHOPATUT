'use client'

type Props = {
  articleId: string
  photoUrl: string | null
  onOpen?: () => void
}

export default function ArticlePhotoButton({
  articleId,
  photoUrl,
  onOpen,
}: Props) {
  const hasPhoto = Boolean(photoUrl?.trim())

  return (
    <button
      type="button"
      className={
        hasPhoto
          ? 'image-preview-link image-preview-active'
          : 'image-preview-link image-preview-inactive'
      }
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

        if (onOpen) {
          onOpen()
          return
        }

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
