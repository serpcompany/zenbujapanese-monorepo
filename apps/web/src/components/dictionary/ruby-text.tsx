import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'

export function RubyText({
  segments,
  className,
  pageWord = false
}: {
  segments: RubySegment[]
  className?: string
  pageWord?: boolean
}) {
  let offset = 0
  const keyed = segments.map(segment => {
    const key = `${offset}`
    offset += segment.text.length
    return { ...segment, key }
  })
  return (
    <span lang="ja" className={className} data-page-word={pageWord || undefined}>
      {keyed.map(segment =>
        segment.reading ? (
          <ruby key={segment.key}>
            {segment.text}
            <rt className="furigana font-normal text-muted-foreground">{segment.reading}</rt>
          </ruby>
        ) : (
          <span key={segment.key}>{segment.text}</span>
        )
      )}
    </span>
  )
}
