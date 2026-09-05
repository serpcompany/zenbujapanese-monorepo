import { DictionarySearch } from '@/components/dictionary/search';
import { EntryCard } from '@/components/dictionary/entry-card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { searchSamples } from '@/lib/dictionary/sample-dictionary';

export default async function DictionaryPage({
  searchParams,
}: PageProps<'/[locale]/dictionary'>) {
  const params = await searchParams;
  const query = typeof params.search === 'string' ? params.search : '';
  const results = searchSamples(query);
  return (
    <main>
      <DictionarySearch query={query} />
      <section
        className="mx-auto w-full max-w-5xl px-6 pb-16"
        aria-label="Sample dictionary results"
      >
        <div className="mb-2 flex items-start justify-between gap-4">
          <h2 className="font-heading text-xl font-semibold tracking-tight">
            {query ? `Sample results for “${query}”` : 'Explore the dictionary'}
          </h2>
          <span className="text-sm text-muted-foreground">{results.length} sample entries</span>
        </div>
        <p className="mb-6 text-sm leading-6 text-muted-foreground">
          This preview searches four verified app entries only. Try “taberu”,
          “hello”, or “橋”.
        </p>
        <div className="grid gap-4">
          {results.map((sample) => (
            <EntryCard key={sample.entry.id.rawValue} sample={sample} />
          ))}
        </div>
        {!results.length ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No sample entries found</EmptyTitle>
              <EmptyDescription>
                Try “taberu”, “hello”, or “橋”. The full dictionary is not
                connected yet.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        <p className="mt-6 text-xs leading-5 text-muted-foreground [&_a]:underline [&_a]:underline-offset-4">
          Dictionary content:{' '}
          <a href="https://www.edrdg.org/">JMdict / EDRDG</a>,{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">
            CC BY-SA 4.0
          </a>
          . Sample presentation adapted from Zenbu.{' '}
          <a href="/data-notices.txt">UniDic and TUBELEX notices</a>.
        </p>
      </section>
    </main>
  );
}
