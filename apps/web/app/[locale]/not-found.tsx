'use client';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('Shell');
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16">
      <div className="mb-8 space-y-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('notFound')}</h1>
        <p className="text-muted-foreground">{t('unavailable')}</p>
      </div>
      <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/">
        {t('home')}
      </Link>
    </main>
  );
}
