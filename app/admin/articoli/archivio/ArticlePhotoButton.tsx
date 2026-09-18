'use client'

type Props = {
  articleId: string
}

export default function ArticlePhotoButton({ articleId }: Props) {
  return (
    <a
      href={`/admin/articoli/${articleId}`}
      className="image-preview-link"
      title="Visualizza immagine articolo"
      aria-label={`Visualizza immagine articolo ${articleId}`}
    >
      🔍
    </a>
  )
}
