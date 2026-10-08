import { type Phrase, type RichText, withKeys } from '@/lib/tools/content'

export function Latin({ children }: { children: string }) {
  return (
    <code
      lang="ja-Latn"
      className="rounded-sm bg-muted px-1 font-mono text-[0.9em] text-foreground"
    >
      {children}
    </code>
  )
}

export function Japanese({ children }: { children: string }) {
  return (
    <span lang="ja" className="font-medium text-foreground">
      {children}
    </span>
  )
}

function PhraseView({ phrase }: { phrase: Phrase }) {
  if (typeof phrase === 'string') return phrase
  if ('japanese' in phrase) return <Japanese>{phrase.japanese}</Japanese>
  return <Latin>{phrase.latin}</Latin>
}

export function RichTextView({ text }: { text: RichText }) {
  return withKeys(text).map(({ key, phrase }) => <PhraseView key={key} phrase={phrase} />)
}
