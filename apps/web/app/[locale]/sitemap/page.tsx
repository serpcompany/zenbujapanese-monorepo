import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { reviewRoutes } from '@/lib/site/routes';
import { ScaffoldPage } from '@/components/site/scaffold';

export const metadata = { title: 'Local route directory' };
export default async function RouteDirectory() {
  if (process.env.NODE_ENV === 'production') notFound();
  const t = await getTranslations('Shell');
  return (
    <ScaffoldPage
      title={t('directory')}
      description="All 23 route patterns from #279, with concrete sample addresses. This directory is only available in local development; it is not the production XML sitemap."
    >
      <ol className="route-directory">
        {reviewRoutes.map((route) => (
          <li key={route.href}>
            <Link href={route.href}>
              {route.title}
              <code>{route.href}</code>
            </Link>
          </li>
        ))}
      </ol>
      <h2>Exact dictionary entry</h2>
      <Link className="preview-link" href="/dictionary/食べる-1358280">
        食べる — 1358280
      </Link>
    </ScaffoldPage>
  );
}
