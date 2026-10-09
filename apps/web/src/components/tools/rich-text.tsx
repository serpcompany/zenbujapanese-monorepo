import { Kbd } from '@/components/ui/kbd'
import { type Phrase, type RichText, withKeys } from '@/lib/tools/content'

export function Typed({ children }: { children: string }) {
  return (
    <span className="muted-surface">
      <Kbd lang="ja-Latn">{children}</Kbd>
    </span>
  )
}

export function Latin({ children }: { children: string }) {
  return (
    <span lang="ja-Latn" className="font-medium text-foreground">
      {children}
    </span>
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
  if ('typed' in phrase) return <Typed>{phrase.typed}</Typed>
  return <Latin>{phrase.latin}</Latin>
}

export function RichTextView({ text }: { text: RichText }) {
  return withKeys(text).map(({ key, phrase }) => <PhraseView key={key} phrase={phrase} />)
}
