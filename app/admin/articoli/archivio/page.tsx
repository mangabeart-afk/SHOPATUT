async function registerSale(formData: FormData) {
  'use server'

  const supabase = await createClient()

  const customerCode = String(
    formData.get('customer_code') || '',
  ).trim()

  const articleId = String(
    formData.get('sale_article_id') || '',
  ).trim()

  const quantity = Number(
    formData.get(`qty_${articleId}`) || 0,
  )

  const totalPrice = Number(
    formData.get(`price_${articleId}`) || 0,
  )

  if (!customerCode) {
    redirect(
      '/admin/articoli/archivio?error=Inserisci il nome o codice cliente',
    )
  }

  if (!articleId || quantity <= 0 || totalPrice < 0) {
    redirect(
      '/admin/articoli/archivio?error=Dati vendita non validi',
    )
  }

  const { error: saleError } = await supabase.rpc(
    'register_article_sales',
    {
      p_customer_code: customerCode,
      p_lines: [
        {
          article_id: articleId,
          quantity,
          total_amount_eur: totalPrice,
        },
      ],
    },
  )

  if (saleError) {
    redirect(
      `/admin/articoli/archivio?error=${encodeURIComponent(
        saleError.message,
      )}`,
    )
  }

  redirect(
    '/admin/articoli/archivio?message=Vendita registrata correttamente',
  )
}
