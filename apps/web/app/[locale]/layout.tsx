import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { LanguageSelector } from '@/components/site/language-selector';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: {
    default: 'Zenbu Japanese — Website preview',
    template: '%s | Zenbu Japanese',
  },
  description: 'Unfinished website foundation for local review.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [t, messages] = await Promise.all([
    getTranslations({ locale, namespace: 'Shell' }),
    getMessages({ locale }),
  ]);
  return (
    <html lang={locale} className={inter.variable}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="edition-control">
            <LanguageSelector label={t('language')} />
          </div>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
