import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import {
  entrySlug,
  eatingExample,
  type DictionarySample,
} from '@/lib/dictionary/sample-dictionary';
import { PitchAccentView } from './pitch-accent';
import { ExampleSentenceView } from './example-sentence';
import { ListenButton } from './listen-button';
import { getTranslations } from 'next-intl/server';

export async function EntryCard({
  sample,
  detail = false,
}: {
  sample: DictionarySample;
  detail?: boolean;
}) {
  const { entry, romaji, frequency } = sample;
  const t = await getTranslations('Dictionary');
  const senses = detail ? entry.senses : entry.senses.slice(0, 1);
  return (
    <article aria-label={`${entry.headword} — ${entry.summary}`}>
      <Card className="grid gap-5 p-5 sm:grid-cols-[12rem_1fr] sm:gap-8 sm:p-7">
        <CardHeader className="items-start gap-1 border-b p-0 pb-5 sm:border-r sm:border-b-0 sm:pr-6 sm:pb-0">
          <CardTitle>
            <h2 className="text-3xl leading-relaxed font-medium tracking-normal" lang="ja">
              <ruby>
                {entry.headword}
                <rt className="text-xs font-normal tracking-widest text-muted-foreground">{entry.reading}</rt>
              </ruby>
            </h2>
          </CardTitle>
          <CardDescription className="reading-romaji text-sm">
            {romaji[0]}
          </CardDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {frequency ? (
              <>
                <Badge
                  variant="secondary"
                  aria-label={`Frequency rank ${frequency.rank}`}
                  title={`${frequency.pack.displayName}: ${frequency.pack.domainDescription}`}
                >
                  #{frequency.rank.toLocaleString('en-US')}
                </Badge>
                <span>TUBELEX</span>
              </>
            ) : (
              <span>No TUBELEX frequency evidence</span>
            )}
          </div>
        </CardHeader>
        <div className="min-w-0">
          <CardContent className="p-0">
            <div className="mb-3 text-sm text-muted-foreground">
              <span>
                {entry.partsOfSpeech.map((part) => part.rawValue).join(' · ')}
              </span>
            </div>
            {senses.map((sense, index) => (
              <div key={index}>
                <p className="text-lg leading-7 font-medium">
                  {detail && senses.length > 1 ? `${index + 1}. ` : ''}
                  {sense.meaning}
                </p>
                {sense.notes.length ? (
                  <p className="mt-1 mb-4 text-sm leading-6 text-muted-foreground">{sense.notes.join(' · ')}</p>
                ) : null}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <ListenButton reading={entry.reading} />
              {entry.pitchAccent ? (
                <PitchAccentView
                  reading={entry.reading}
                  pitch={entry.pitchAccent}
                />
              ) : null}
            </div>
            {entry.id.rawValue === '042e07f7052f611fed33ddddf37f55fd' ? (
              <ExampleSentenceView
                sentence={eatingExample}
                attribution={
                  <>
                    <a href="https://tatoeba.org/en/sentences/show/12824508">
                      bunbuku
                    </a>{' '}
                    /{' '}
                    <a href="https://tatoeba.org/en/sentences/show/773323">
                      marloncori
                    </a>
                    , Tatoeba ·{' '}
                    <a href="https://creativecommons.org/licenses/by/2.0/fr/">
                      CC BY 2.0 FR
                    </a>
                  </>
                }
              />
            ) : null}
          </CardContent>
          <CardFooter className="mt-5 px-0">
            {detail ? (
              <p className="text-xs leading-5 text-muted-foreground [&_a]:underline [&_a]:underline-offset-4">
                JMdict {entry.sourceProvenances[0].sourceRecordID} ·{' '}
                <a href="https://www.edrdg.org/">EDRDG</a> ·{' '}
                <a href="https://creativecommons.org/licenses/by-sa/4.0/">
                  CC BY-SA 4.0
                </a>
              </p>
            ) : (
              <Link
                className="text-sm text-primary underline-offset-4 hover:underline"
                href={`/dictionary/${entrySlug(entry)}`}
              >
                {t('viewEntry', { headword: entry.headword })}{' '}
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </CardFooter>
        </div>
      </Card>
    </article>
  );
}
