export function RomajiLine({ romaji, className }: { romaji: string | null; className?: string }) {
  if (romaji === null) return null
  return (
    <span data-aid="romaji" lang="ja-Latn" className={className}>
      {romaji}
    </span>
  )
}

export function ReadingLine({ reading, className }: { reading: string; className?: string }) {
  return (
    <span data-aid="reading" lang="ja" className={className}>
      {reading}
    </span>
  )
}
