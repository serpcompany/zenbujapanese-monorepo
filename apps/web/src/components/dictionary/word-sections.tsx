import Link from 'next/link'
import type { AlternativeForm, RelatedWord } from '@/lib/dictionary/detail/word'
import { Romaji } from './reading-aid'
import { RubyText } from './ruby-text'

type Linked<T> = T & { path: string | null }

/**
 * One line of alternative forms, written or reading, as the app's AlternativeFormLine. A reading
 * shows its romaji under itself with Romaji on, as the app's formLabel does.
 */
export function AlternativeForms({ forms }: { forms: Linked<AlternativeForm>[] }) {
  if (forms.length === 0) return null
  return (
    <p lang="ja" className="text-lg">
      {forms.map((form, index) => {
        const label = (
          <span className={form.labels.length > 0 ? 'text-muted-foreground' : undefined}>
            {form.value}
            {form.labels.length > 0 ? (
              <span lang="en" className="text-sm">
                {' '}
                ({form.labels.join(', ')})
              </span>
            ) : null}
          </span>
        )
        return (
          <span key={form.value} data-alternative-form={form.value}>
            {index > 0 ? ', ' : null}
            <span className="inline-flex flex-col">
              {form.path ? (
                <Link href={form.path} className="underline-offset-4 hover:underline">
                  {label}
                </Link>
              ) : (
                label
              )}
              <Romaji text={form.romaji} />
            </span>
          </span>
        )
      })}
    </p>
  )
}

/**
 * Related words, as the app's RelationshipsSection: each with furigana, its romaji with Romaji on,
 * the relation, and its summary, opening its word page when it has one.
 */
export function RelatedWords({ related }: { related: Linked<RelatedWord>[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {related.map(word => (
        <li
          key={`${word.headword}|${word.reading}|${word.entSeq}|${word.relation}`}
          className="py-2 first:pt-0 last:pb-0"
          data-related-word={word.headword}
        >
          {word.path ? (
            <Link href={word.path} className="underline-offset-4 hover:underline">
              <RubyText segments={word.ruby} className="text-lg font-medium" />
            </Link>
          ) : (
            <RubyText segments={word.ruby} className="text-lg font-medium" />
          )}
          <Romaji text={word.romaji} />
          <p className="text-sm text-muted-foreground">
            {word.relation} · {word.summary}
          </p>
        </li>
      ))}
    </ul>
  )
}
