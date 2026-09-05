import type { ExampleSentence } from '@/lib/dictionary/types';

export function ExampleSentenceView({
  sentence,
  attribution,
}: {
  sentence: ExampleSentence;
  attribution: React.ReactNode;
}) {
  return (
    <figure className="example-sentence">
      <blockquote>
        <p lang="ja">{sentence.japanese}</p>
        <p>{sentence.english}</p>
      </blockquote>
      <figcaption>{attribution}</figcaption>
    </figure>
  );
}
