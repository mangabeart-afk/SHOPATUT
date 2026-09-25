'use client'

import { useEffect, useRef } from 'react'

type SelectAllProps = {
  name: string
  label?: string
}

export default function SelectAll({ name, label = 'Seleziona tutti' }: SelectAllProps) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const box = ref.current
    if (!box?.form) return

    const update = () => {
      const items = Array.from(box.form!.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))
      const checked = items.filter((item) => item.checked)
      box.checked = items.length > 0 && checked.length === items.length
      box.indeterminate = checked.length > 0 && checked.length < items.length
    }

    const items = Array.from(box.form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))
    items.forEach((item) => item.addEventListener('change', update))
    update()
    return () => items.forEach((item) => item.removeEventListener('change', update))
  }, [name])

  function toggle() {
    const box = ref.current
    if (!box?.form) return
    const items = Array.from(box.form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))
    items.forEach((item) => { item.checked = box.checked })
    box.indeterminate = false
  }

  return (
    <label className="article-select-row select-all-row">
      <input ref={ref} type="checkbox" aria-label={label} onChange={toggle} />
      <span>
        <strong>{label}</strong>
        <small>Seleziona o deseleziona tutti gli articoli mostrati.</small>
      </span>
    </label>
  )
}
