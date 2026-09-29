import type { RubySegment } from '@/lib/dictionary/detail/ruby'

/** Japanese text with furigana over the segments that need it. */
export function RubyText({ segments, className }: { segments: RubySegment[]; className?: string }) {
  let offset = 0
  const keyed = segments.map(segment => {
    const key = `${offset}`
    offset += segment.text.length
    return { ...segment, key }
  })
  return (
    <span lang="ja" className={className}>
      {keyed.map(segment =>
        segment.reading ? (
          <ruby key={segment.key}>
            {segment.text}
            <rt className="text-[0.45em] font-normal text-muted-foreground">{segment.reading}</rt>
          </ruby>
        ) : (
          <span key={segment.key}>{segment.text}</span>
        )
      )}
    </span>
  )
}
