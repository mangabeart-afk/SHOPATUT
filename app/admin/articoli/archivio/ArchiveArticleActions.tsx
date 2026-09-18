'use client'

import { useState } from 'react'
import ArticlePhotoButton from './ArticlePhotoButton'

type ArticleOption = {
  id: string
  article_code: string
  photo_url: string | null
  purchase_date: string
  series: string | null
  detail: string | null
  origin: string
  seller: string | null
  quantity_purchased: number
  total_cost_eur: number | null
  unit_cost_eur: number | null
  status: string
  statusLabel: string
  statusClass: string
}

type Props = {
  articles: ArticleOption[]
  registerArrival: (formData: FormData) => Promise<void>
  registerSale: (formData: FormData) => Promise<void>
}

type SaleData = {
  quantity: string
  price: string
}

export default function ArchiveArticleActions({
  articles,
  registerArrival,
  registerSale,
}: Props) {
