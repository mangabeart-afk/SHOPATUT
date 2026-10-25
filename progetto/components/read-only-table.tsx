import type { ReactNode } from 'react'

export type ReadOnlyColumn<Row> = { key: keyof Row | string; label: string; align?: 'left' | 'right' | 'center' }

export default function ReadOnlyTable<Row extends Record<string, unknown>>({
  columns,
  rows,
  emptyLabel = 'Nessun dato presente nel workbook.',
}: {
  columns: ReadOnlyColumn<Row>[]
  rows: Row[]
  emptyLabel?: string
}) {
  if (!rows.length) return <div className="empty">{emptyLabel}</div>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={String(column.key)} style={{ textAlign: column.align || 'left' }}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={String(row.id ?? row.code ?? row.excelRow ?? rowIndex)}>
              {columns.map((column) => {
                const value = row[String(column.key)] as ReactNode
                return <td key={String(column.key)} style={{ textAlign: column.align || 'left' }}>{value ?? '—'}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
