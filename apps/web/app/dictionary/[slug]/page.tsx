import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DictionarySearch } from '@/components/dictionary/search';
import { EntryCard } from '@/components/dictionary/entry-card';
import { resolveSample } from '@/lib/dictionary/sample-dictionary';

export default async function EntryPage({
  params,
}: PageProps<'/dictionary/[slug]'>) {
  const { slug } = await params;
  const sample = resolveSample(slug);
  if (!sample) notFound();
  return (
    <main>
      <DictionarySearch />
      <section className="dictionary-content" aria-label="Dictionary entry">
        <Link href="/dictionary" className="entry-link mb-5">
          ← Back to sample dictionary
        </Link>
        <EntryCard sample={sample} detail />
        <p className="source-disclosure">
          Verified app sample.{' '}
          <a href="/data-notices.txt">UniDic and TUBELEX notices</a>.
        </p>
      </section>
    </main>
  );
}
