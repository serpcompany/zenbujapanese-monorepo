'use client';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('Shell');
  return (
    <main className="site-page">
      <div className="page-heading">
        <h1>{t('notFound')}</h1>
        <p>{t('unavailable')}</p>
      </div>
      <Link className="preview-link" href="/">
        {t('home')}
      </Link>
    </main>
  );
}
