import { cn } from '@/lib/utils'

export function RomajiLine({ romaji, className }: { romaji: string | null; className?: string }) {
  if (romaji === null) return null
  return (
    <span data-aid="romaji" lang="ja-Latn" className={cn('text-muted-foreground', className)}>
      {romaji}
    </span>
  )
}

export function ReadingLine({ reading, className }: { reading: string; className?: string }) {
  return (
    <span data-aid="reading" lang="ja" className={cn('text-muted-foreground', className)}>
      {reading}
    </span>
  )
}
