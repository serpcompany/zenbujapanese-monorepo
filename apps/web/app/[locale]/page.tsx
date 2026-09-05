import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PreviewCard } from '@/components/site/scaffold';

export default async function HomePage() {
  const t = await getTranslations('Shell');
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 md:py-16">
      <div className="mb-10 space-y-3">
        <p className="text-sm text-muted-foreground">{t('scaffold')}</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Zenbu Japanese</h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">{t('notice')}</p>
      </div>
      <Link href="/dictionary" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
        {t('sections.dictionary')} →
      </Link>
      {process.env.NODE_ENV !== 'production' ? (
        <>
          <div className="my-8 grid gap-4 sm:grid-cols-2">
            {(
              [
                'about',
                'contact',
                'support',
                'legal',
                'videos',
                'blog',
                'products',
                'resources',
                'learn',
              ] as const
            ).map((section) => (
              <PreviewCard
                key={section}
                title={t(`sections.${section}`)}
                description={t('scaffold')}
                href={`/${section}`}
              />
            ))}
          </div>
          <Link href="/sitemap" className="text-sm text-primary underline-offset-4 hover:underline">
            {t('directory')} →
          </Link>
        </>
      ) : null}
    </main>
  );
}
