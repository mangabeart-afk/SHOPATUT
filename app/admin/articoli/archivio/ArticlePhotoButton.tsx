'use client'

type Props = { articleId: string; photoUrl: string | null; onOpen?: () => void }

export default function ArticlePhotoButton({ articleId, photoUrl, onOpen }: Props) {
  const hasPhoto = Boolean(photoUrl?.trim())
  return <button type="button" className={`image-preview-link ${hasPhoto ? 'image-preview-active' : 'image-preview-inactive'}`} disabled={!hasPhoto} title={hasPhoto ? 'Visualizza immagine articolo' : 'Immagine non disponibile'} aria-label={hasPhoto ? `Visualizza immagine articolo ${articleId}` : `Immagine non disponibile per ${articleId}`} onClick={() => { if (hasPhoto) onOpen?.() }}>🔍</button>
}
