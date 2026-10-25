'use server'

import type { PhotoSyncState } from './types'

function readOnlyState(): PhotoSyncState {
  return { stage: 'error', error: 'Sincronizzazione foto disattivata: aggiorna il workbook Excel e carica un nuovo snapshot.' }
}

export async function previewPhotoUrls(_previousState: PhotoSyncState, _formData: FormData): Promise<PhotoSyncState> {
  return readOnlyState()
}

export async function applyPhotoUrls(_previousState: PhotoSyncState, _formData: FormData): Promise<PhotoSyncState> {
  return readOnlyState()
}
