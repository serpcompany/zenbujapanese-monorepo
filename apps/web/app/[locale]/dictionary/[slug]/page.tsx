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
      <section className="mx-auto w-full max-w-5xl px-6 pb-16" aria-label="Dictionary entry">
        <Link href="/dictionary" className="mb-5 inline-block text-sm text-primary underline-offset-4 hover:underline">
          ← {t('back')}
        </Link>
        <EntryCard sample={sample} detail />
        <p className="mt-6 text-xs leading-5 text-muted-foreground [&_a]:underline [&_a]:underline-offset-4">
          Verified app sample.{' '}
          <a href="/data-notices.txt">UniDic and TUBELEX notices</a>.
        </p>
      </section>
    </main>
  );
}
