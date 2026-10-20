export type PhotoImportItem = {
  sheet: 'X' | 'Y' | 'Z'
  excelRow: number
  articleId: string
  articleCode: string
  url: string
  hadPhoto: boolean
}

export type PhotoPreviewStats = {
  urlsFound: number
  validUrls: number
  invalidUrls: number
  dbMatches: number
  missingDatabaseRows: number
  existingPhotos: number
  eligibleWithoutOverwrite: number
  issueExamples: string[]
}

export type PhotoSyncState = {
  stage?: 'idle' | 'preview' | 'applied' | 'error'
  error?: string
  message?: string
  plan?: PhotoImportItem[]
  stats?: PhotoPreviewStats
  result?: {
    updated: number
    skippedExisting: number
    missingOrChanged: number
    failed: number
    failureExamples: string[]
  }
}
