import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PreviewCard } from '@/components/site/scaffold';

export default async function HomePage() {
  const t = await getTranslations('Shell');
  return (
    <main className="site-page">
      <div className="page-heading">
        <p className="text-muted-foreground">{t('scaffold')}</p>
        <h1>Zenbu Japanese</h1>
        <p>{t('notice')}</p>
      </div>
      <Link href="/dictionary" className="home-dictionary-link">
        {t('sections.dictionary')} →
      </Link>
      {process.env.NODE_ENV !== 'production' ? (
        <>
          <div className="preview-grid">
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
          <Link href="/sitemap" className="preview-link">
            {t('directory')} →
          </Link>
        </>
      ) : null}
    </main>
  );
}
