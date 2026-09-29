import { ChevronRightIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { FrequencyDot } from '@/components/dictionary/frequency'
import { LearnerPrompt } from '@/components/dictionary/learner-prompt'
import { PageToolbar } from '@/components/dictionary/page-toolbar'
import { PitchAccent } from '@/components/dictionary/pitch-accent'
import { PronounceButton } from '@/components/dictionary/pronounce-button'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Section } from '@/components/dictionary/section'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { Card, CardContent } from '@/components/ui/card'
import { Item, ItemActions, ItemContent } from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'
import { getWordPage, isDictionaryAvailable, type WordPageData } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { pageSources } from '@/lib/dictionary/sources'
import { decodeSegment, parseWordSegment } from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/[word]'>

/** `/dictionary/<slug>-<ent_seq>/`: the number decides the word; any other slug redirects. */
async function load(params: Props['params']) {
  if (!isDictionaryAvailable()) notFound()
  const segment = (await params).word
  const parsed = parseWordSegment(segment)
  if (!parsed) notFound()
  const word = await getWordPage(parsed.entSeq)
  if (!word) notFound()
  // Any other slug, a bare number, or a padded one (要る-01546640) redirects, so each word has
  // one URL. Location headers are ASCII, so the Japanese slug is percent-encoded.
  if (decodeSegment(segment) !== `${word.slug}-${word.entSeq}`) {
    permanentRedirect(encodeURI(word.path))
  }
  return word
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const word = await load(params)
  const reading = word.reading === word.headword ? '' : ` (${word.reading})`
  const partOfSpeech = word.partOfSpeech ? ` ${word.partOfSpeech}.` : ''
  return dictionaryMetadata(
    encodeURI(word.path),
    `${word.headword}${reading} meaning`,
    `${word.headword}${reading}: ${word.summary}.${partOfSpeech}`
  )
}

/** Kanji rows, each linking to its kanji page when it has one. */
function KanjiItems({ kanji }: { kanji: WordPageData['kanji'] }) {
  return (
    <div className="-mx-3 flex flex-col">
      {kanji.map(item => {
        const content = (
          <>
            <span lang="ja" className="text-2xl font-semibold">
              {item.character}
            </span>
            <ItemContent className="text-muted-foreground">{item.meaning}</ItemContent>
            {item.path ? (
              <ItemActions>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </ItemActions>
            ) : null}
          </>
        )
        return item.path ? (
          <Item key={item.character} render={<Link href={item.path} />}>
            {content}
          </Item>
        ) : (
          <Item key={item.character}>{content}</Item>
        )
      })}
    </div>
  )
}

/** One line of alternative forms, written or reading, as the app's AlternativeFormLine. */
function AlternativeForms({ forms }: { forms: WordPageData['alternatives'] }) {
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
          <span key={form.value}>
            {index > 0 ? ', ' : null}
            {form.path ? (
              <Link href={form.path} className="underline-offset-4 hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
          </span>
        )
      })}
    </p>
  )
}

export default async function WordPage({ params }: Props) {
  const word = await load(params)
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs page={{ label: word.headword, path: word.path, lang: 'ja' }} />
      <PageToolbar title={word.headword} shareText={word.shareText} />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <RubyText segments={word.ruby} className="text-5xl font-medium leading-tight" />
            {word.pitch ? (
              <PitchAccent
                morae={word.pitch.morae}
                downstep={word.pitch.downstep}
                text={word.reading}
              />
            ) : (
              <PronounceButton text={word.reading} />
            )}
          </div>
          {word.partOfSpeech ? (
            <>
              <Separator />
              <p className="text-sm">{word.partOfSpeech}</p>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Section title="Meaning">
        <ol className="flex flex-col gap-3">
          {word.senses.map(sense => (
            <li key={sense.number} className="flex gap-2">
              <span className="font-medium tabular-nums">{sense.number}.</span>
              <div>
                <p className="font-medium">{sense.meaning}</p>
                {sense.notes.length > 0 ? (
                  <p className="text-muted-foreground">{sense.notes.join(' · ')}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Frequency">
        <ul className="flex flex-col divide-y">
          {word.frequencyRows.map(rank => (
            <li key={rank.source} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <FrequencyDot tier={rank.tier} />
              {rank.source}
              <span className="ml-auto text-muted-foreground tabular-nums">{rank.value}</span>
            </li>
          ))}
        </ul>
      </Section>

      {word.alternatives.length > 0 ? (
        <Section title="Alternatives">
          <div className="flex flex-col gap-2">
            <AlternativeForms forms={word.alternatives.filter(form => form.kind === 'written')} />
            <AlternativeForms forms={word.alternatives.filter(form => form.kind === 'reading')} />
          </div>
        </Section>
      ) : null}

      {word.kanji.length > 0 ? (
        <Section title="Kanji">
          <KanjiItems kanji={word.kanji} />
        </Section>
      ) : null}

      {word.alternativeKanji.length > 0 ? (
        <Section title="Alternative kanji">
          <KanjiItems kanji={word.alternativeKanji} />
        </Section>
      ) : null}

      {word.related.length > 0 ? (
        <Section title="Related words">
          <ul className="flex flex-col divide-y">
            {word.related.map(related => (
              <li
                key={`${related.headword}${related.relation}`}
                className="py-2 first:pt-0 last:pb-0"
              >
                {related.path ? (
                  <Link href={related.path} className="underline-offset-4 hover:underline">
                    <RubyText segments={related.ruby} className="text-lg font-medium" />
                  </Link>
                ) : (
                  <RubyText segments={related.ruby} className="text-lg font-medium" />
                )}
                <p className="text-sm text-muted-foreground">
                  {related.relation} · {related.summary}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Lists">
        <LearnerPrompt kind="lists" />
      </Section>
      <Section title="Notes">
        <LearnerPrompt kind="notes" />
      </Section>

      {word.examples.length > 0 ? (
        <Section title="Examples">
          <ul className="flex flex-col divide-y">
            {word.examples.map(example => {
              let offset = 0
              const tokens = example.tokens.map(token => {
                const key = `${offset}`
                offset += token.text.length
                return { ...token, key }
              })
              return (
                <li key={example.text} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex-1">
                    <p lang="ja" className="text-xl leading-[2.2]">
                      {tokens.map(token => (
                        <RubyText
                          key={token.key}
                          segments={token.ruby}
                          className={
                            token.isMatch
                              ? 'mr-0.5 border-b-2 border-foreground font-medium'
                              : token.isWord
                                ? 'mr-0.5 border-b border-border'
                                : undefined
                          }
                        />
                      ))}
                    </p>
                    <p className="text-muted-foreground">{example.translation}</p>
                  </div>
                  <PronounceButton text={example.text} label="Pronounce sentence" />
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}

      <SourceCredits sources={pageSources.word} />
    </main>
  )
}
