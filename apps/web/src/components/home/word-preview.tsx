import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { RubyText } from '@/components/dictionary/ruby-text'
import { previewLabel, previewPanel } from '@/components/home/home-styles'
import { cn } from '@/lib/utils'

export function WordPreview({
  word,
  className
}: {
  word: { ruby: RubySegment[]; partOfSpeech: string; meanings: string[] }
  className?: string
}) {
  return (
    <div className={cn(previewPanel, 'flex flex-col gap-1.5 px-4 py-3.5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <RubyText segments={word.ruby} className="text-2xl leading-[1.7] font-medium" />
        <span className="text-xs text-muted-foreground">{word.partOfSpeech}</span>
      </div>
      <p className={previewLabel}>Meaning</p>
      <ol className="flex list-decimal flex-col gap-1 pl-4.5 text-[0.8125rem]">
        {word.meanings.map(meaning => (
          <li key={meaning}>{meaning}</li>
        ))}
      </ol>
    </div>
  )
}
