type OriginLabelProps = { value: string | null | undefined; className?: string }

const originAbbreviations: Array<[RegExp, string]> = [
  [/^(GIAPPONE|JAPAN|JAP)$/i, 'JAP'],
  [/^(VIETNAM|VIET)$/i, 'VIET'],
  [/^(EUROPA|EU)$/i, 'EU'],
  [/^(AMERICA|STATI UNITI|UNITED STATES|USA|US)$/i, 'USA'],
  [/^(COREA DEL SUD|SOUTH KOREA|COREA)$/i, 'KOR'],
  [/^(CINA|CHINA)$/i, 'CHN'],
  [/^(TAIWAN)$/i, 'TW'],
  [/^(THAILANDIA|THAILAND)$/i, 'THA'],
  [/^(REGNO UNITO|UNITED KINGDOM|UK)$/i, 'UK'],
  [/^(FRANCIA|FRANCE)$/i, 'FR'],
  [/^(ITALIA|ITALY)$/i, 'IT'],
  [/^(GERMANIA|GERMANY)$/i, 'DE'],
  [/^(SPAGNA|SPAIN)$/i, 'ES'],
  [/^(HONG KONG)$/i, 'HK'],
  [/^(AUSTRALIA)$/i, 'AUS'],
  [/^(FILIPPINE|PHILIPPINES)$/i, 'PH'],
  [/^(INDONESIA)$/i, 'ID'],
  [/^(SINGAPORE|SINGAPURA)$/i, 'SG'],
  [/^(ALTRO|OTHER)$/i, 'ALTRO'],
]

function compactOrigin(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const found = originAbbreviations.find(([pattern]) => pattern.test(normalized))
  if (found) return found[1]
  const letters = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '')
  return letters.length <= 5 ? letters.toUpperCase() : letters.slice(0, 3).toUpperCase()
}

export default function OriginLabel({ value, className = '' }: OriginLabelProps) {
  const label = String(value || '').trim()
  if (!label) return <>{'—'}</>
  const short = compactOrigin(label)
  return (
    <span className={`origin-label ${className}`.trim()} title={label} aria-label={label}>
      <span className="origin-label-full">{label}</span>
      <span className="origin-label-short" aria-hidden="true">{short}</span>
    </span>
  )
}
