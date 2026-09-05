import Link from 'next/link';
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

export function EntryCard({
  sample,
  detail = false,
}: {
  sample: DictionarySample;
  detail?: boolean;
}) {
  const { entry, romaji, frequency } = sample;
  const senses = detail ? entry.senses : entry.senses.slice(0, 1);
  return (
    <article aria-label={`${entry.headword} — ${entry.summary}`}>
      <Card className="entry-card">
        <CardHeader className="word-column">
          <CardTitle>
            <h2 lang="ja">
              <ruby>
                {entry.headword}
                <rt>{entry.reading}</rt>
              </ruby>
            </h2>
          </CardTitle>
          <CardDescription className="reading-romaji">
            {romaji[0]}
          </CardDescription>
          <div className="frequency">
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
          <CardContent className="meaning-column">
            <div className="entry-topline">
              <span>
                {entry.partsOfSpeech.map((part) => part.rawValue).join(' · ')}
              </span>
              {entry.isCommon ? <Badge variant="outline">Common</Badge> : null}
            </div>
            {senses.map((sense, index) => (
              <div key={index}>
                <p className="definition">
                  {detail && senses.length > 1 ? `${index + 1}. ` : ''}
                  {sense.meaning}
                </p>
                {sense.notes.length ? (
                  <p className="sense-notes">{sense.notes.join(' · ')}</p>
                ) : null}
              </div>
            ))}
            {entry.pitchAccent ? (
              <PitchAccentView
                reading={entry.reading}
                pitch={entry.pitchAccent}
              />
            ) : null}
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
          <CardFooter variant="plain" className="px-0">
            {detail ? (
              <p className="entry-source">
                JMdict {entry.sourceProvenances[0].sourceRecordID} ·{' '}
                <a href="https://www.edrdg.org/">EDRDG</a> ·{' '}
                <a href="https://creativecommons.org/licenses/by-sa/4.0/">
                  CC BY-SA 4.0
                </a>
              </p>
            ) : (
              <Link
                className="entry-link"
                href={`/dictionary/${entrySlug(entry)}`}
              >
                View {entry.headword} entry <span aria-hidden="true">→</span>
              </Link>
            )}
          </CardFooter>
        </div>
      </Card>
    </article>
  );
}
