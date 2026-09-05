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
      <ol className="grid gap-3 sm:grid-cols-2">
        {reviewRoutes.map((route) => (
          <li key={route.href}>
            <Link className="flex flex-col rounded-lg border p-4 text-sm font-medium text-primary" href={route.href}>
              {route.title}
              <code className="mt-1 text-xs font-normal text-muted-foreground [overflow-wrap:anywhere]">{route.href}</code>
            </Link>
          </li>
        ))}
      </ol>
      <h2 className="font-heading text-xl font-semibold tracking-tight">Exact dictionary entry</h2>
      <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/dictionary/食べる-1358280">
        食べる — 1358280
      </Link>
    </ScaffoldPage>
  );
}
