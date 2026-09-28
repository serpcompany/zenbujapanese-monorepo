import { ChevronRightIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { FrequencyDot } from '@/components/dictionary/frequency'
import { LearnerPrompt } from '@/components/dictionary/learner-prompt'
import { PageToolbar } from '@/components/dictionary/page-toolbar'
import { PitchAccent } from '@/components/dictionary/pitch-accent'
import { PronounceButton } from '@/components/dictionary/pronounce-button'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Section } from '@/components/dictionary/section'
import { Card, CardContent } from '@/components/ui/card'
import { Item, ItemActions, ItemContent } from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'
import { getWordPage, isDictionaryAvailable } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { parseWordSegment, searchPath } from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/[word]'>

/** `/dictionary/<slug>-<ent_seq>/`: the number decides the word; any other slug redirects. */
async function load(params: Props['params']) {
  if (!isDictionaryAvailable()) notFound()
  const parsed = parseWordSegment((await params).word)
  if (!parsed) notFound()
  const word = await getWordPage(parsed.entSeq)
  if (!word) notFound()
  // Location headers are ASCII, so the Japanese slug is percent-encoded.
  if (parsed.slug !== word.slug) permanentRedirect(encodeURI(word.path))
  return word
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const word = await load(params)
  const reading = word.reading === word.headword ? '' : ` (${word.reading})`
  return dictionaryMetadata(
    word.path,
    `${word.headword}${reading} meaning`,
    `${word.headword}${reading}: ${word.summary}. ${word.partOfSpeech}.`
  )
}

export default async function WordPage({ params }: Props) {
  const word = await load(params)
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <PageToolbar
        back={{ href: searchPath(word.reading), label: word.reading }}
        title={word.headword}
        shareText={`${word.headword}（${word.reading}）: ${word.summary}`}
      />

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
          <Separator />
          <p className="text-sm">{word.partOfSpeech}</p>
        </CardContent>
      </Card>

      <Section title="Meaning">
        <ol className="flex flex-col gap-3">
          {word.senses.map((sense, position) => (
            <li key={sense.meaning} className="flex gap-2">
              <span className="font-medium tabular-nums">{position + 1}.</span>
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

      {word.frequency.length > 0 ? (
        <Section title="Frequency">
          <ul className="flex flex-col divide-y">
            {word.frequency.map(rank => (
              <li key={rank.source} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <FrequencyDot band={rank.band} />
                {rank.source}
                <span className="ml-auto text-muted-foreground tabular-nums">{rank.value}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {word.kanji.length > 0 ? (
        <Section title="Kanji">
          <div className="-mx-3 flex flex-col">
            {word.kanji.map(kanji => {
              const content = (
                <>
                  <span lang="ja" className="text-2xl font-semibold">
                    {kanji.character}
                  </span>
                  <ItemContent className="text-muted-foreground">{kanji.meaning}</ItemContent>
                  {kanji.path ? (
                    <ItemActions>
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    </ItemActions>
                  ) : null}
                </>
              )
              return kanji.path ? (
                <Item key={kanji.character} render={<Link href={kanji.path} />}>
                  {content}
                </Item>
              ) : (
                <Item key={kanji.character}>{content}</Item>
              )
            })}
          </div>
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
              const text = example.tokens.map(token => token.text).join('')
              let offset = 0
              const tokens = example.tokens.map(token => {
                const key = `${offset}`
                offset += token.text.length
                return { ...token, key }
              })
              return (
                <li key={text} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex-1">
                    <p lang="ja" className="text-xl leading-[2.2]">
                      {tokens.map(token => {
                        const body = token.reading ? (
                          <ruby>
                            {token.text}
                            <rt className="text-[0.5em] text-muted-foreground">{token.reading}</rt>
                          </ruby>
                        ) : (
                          token.text
                        )
                        return (
                          <span
                            key={token.key}
                            className={
                              token.isMatch
                                ? 'mr-0.5 border-b-2 border-foreground font-medium'
                                : token.isWord
                                  ? 'mr-0.5 border-b border-border'
                                  : undefined
                            }
                          >
                            {body}
                          </span>
                        )
                      })}
                    </p>
                    <p className="text-muted-foreground">{example.translation}</p>
                  </div>
                  <PronounceButton text={text} label="Pronounce sentence" />
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Dictionary data from JMdict (EDRDG, CC BY-SA 4.0). Example sentences from Tatoeba (CC BY 2.0
        FR).
      </p>
    </main>
  )
}
