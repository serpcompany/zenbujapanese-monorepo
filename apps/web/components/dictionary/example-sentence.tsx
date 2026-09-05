import type { ExampleSentence } from '@/lib/dictionary/types';

export function ExampleSentenceView({
  sentence,
  attribution,
}: {
  sentence: ExampleSentence;
  attribution: React.ReactNode;
}) {
  return (
    <figure className="mt-5 border-t pt-4 text-sm leading-7">
      <blockquote>
        <p className="text-muted-foreground" lang="ja">{sentence.japanese}</p>
        <p>{sentence.english}</p>
      </blockquote>
      <figcaption className="mt-3 text-xs text-muted-foreground">{attribution}</figcaption>
    </figure>
  );
}
