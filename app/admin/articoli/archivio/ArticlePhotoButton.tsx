'use client'

type Props = { articleId: string; photoUrl: string | null; onOpen?: () => void }

export default function ArticlePhotoButton({ articleId, photoUrl, onOpen }: Props) {
  const hasPhoto = Boolean(photoUrl?.trim())
  if (!hasPhoto) return null

  return (
    <button
      type="button"
      className="image-preview-icon"
      title={`Visualizza immagine ${articleId}`}
      aria-label={`Visualizza immagine ${articleId}`}
      onClick={onOpen}
    >
      🔍
    </button>
  )
}
