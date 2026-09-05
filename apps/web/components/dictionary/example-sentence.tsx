import type { ExampleSentence } from '@/lib/dictionary/types';

export function ExampleSentenceView({
  sentence,
}: {
  sentence: ExampleSentence;
}) {
  return (
    <figure className="example-sentence">
      <blockquote>
        <p lang="ja">{sentence.japanese}</p>
        <p>{sentence.english}</p>
      </blockquote>
      <figcaption>
        <a href="https://tatoeba.org/en/sentences/show/12824508">bunbuku</a> /{' '}
        <a href="https://tatoeba.org/en/sentences/show/773323">marloncori</a>,
        Tatoeba ·{' '}
        <a href="https://creativecommons.org/licenses/by/2.0/fr/">
          CC BY 2.0 FR
        </a>
      </figcaption>
    </figure>
  );
}
