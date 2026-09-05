import { Link } from '@/i18n/navigation';
import { notFound } from 'next/navigation';
import { DictionarySearch } from '@/components/dictionary/search';
import { EntryCard } from '@/components/dictionary/entry-card';
import { resolveSample } from '@/lib/dictionary/sample-dictionary';
import { getTranslations } from 'next-intl/server';

export default async function EntryPage({
  params,
}: PageProps<'/[locale]/dictionary/[slug]'>) {
  const { slug } = await params;
  const sample = resolveSample(slug);
  if (!sample) notFound();
  const t = await getTranslations('Dictionary');
  return (
    <main>
      <DictionarySearch />
      <section className="dictionary-content" aria-label="Dictionary entry">
        <Link href="/dictionary" className="entry-link mb-5">
          ← {t('back')}
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
