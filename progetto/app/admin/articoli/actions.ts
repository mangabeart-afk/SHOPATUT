'use server'

function readOnlyError(): never {
  throw new Error('Operazione disattivata: il workbook Excel è la fonte ufficiale e il sito è in sola lettura.')
}

export async function createArticle(_formData: FormData): Promise<never> { return readOnlyError() }
export async function updateArticle(_formData: FormData): Promise<never> { return readOnlyError() }
export async function updateSelectedArticles(_formData: FormData): Promise<never> { return readOnlyError() }
export async function deleteSelectedArticles(_formData: FormData): Promise<never> { return readOnlyError() }
