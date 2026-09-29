import { cn } from 'cn'

// Each Reading Aid's text, as the page renders it: always in the HTML, and shown or hidden by the
// setting on <html> (globals.css's variants, set before paint by the root layout's script), so a
// stored setting applies without a flash, a layout shift, or a hydration mismatch. The classes are
// the contract the rendered-page tests read back (rendered-aids.ts).

/** The classes that show each aid's text only under its setting. */
export const aidClasses = {
  /** On each `<rt>`: furigana hides with Furigana off. */
  furigana: 'furigana-off:hidden',
  /** The reading a headword shows under itself with Furigana off. */
  readingWithoutFurigana: 'hidden furigana-off:block',
  romaji: 'hidden romaji-on:block',
  /** The short meaning under a linked word. */
  wordMeaning: 'hidden word-meanings-on:block',
  translation: 'translations-off:hidden'
} as const

export type AidKind = keyof typeof aidClasses

/** Furigana, which hides with Furigana off. */
export const rtClass = `text-[0.45em] font-normal text-muted-foreground ${aidClasses.furigana}`

/** One aid's text, marked with its kind; nothing when there's no text. */
export function AidText({
  kind,
  text,
  className,
  lang
}: {
  kind: Exclude<AidKind, 'furigana'>
  text: string | null
  className?: string
  lang?: string
}) {
  if (text === null) return null
  return (
    <span data-reading-aid={kind} lang={lang} className={cn(aidClasses[kind], className)}>
      {text}
    </span>
  )
}

/** Romaji under Japanese, with Romaji on (the app's RomajiReadingAidText). */
export function Romaji({ text, className }: { text: string | null; className?: string }) {
  return (
    <AidText
      kind="romaji"
      text={text}
      lang="ja-Latn"
      className={cn('text-sm font-normal text-muted-foreground', className)}
    />
  )
}

/**
 * Under a headword, as the app's WordHeadline stacks them: its romaji with Romaji on, then its
 * reading with Furigana off (`readingWithoutFurigana`).
 */
export function HeadlineAids({
  romaji,
  readingWithoutFurigana
}: {
  romaji: string | null
  readingWithoutFurigana: string | null
}) {
  return (
    <>
      <Romaji text={romaji} className="text-base" />
      <AidText
        kind="readingWithoutFurigana"
        text={readingWithoutFurigana}
        lang="ja"
        className="text-xl text-muted-foreground"
      />
    </>
  )
}
