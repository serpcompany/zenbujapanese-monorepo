import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { sections } from '@/lib/site/routes';

export function PreviewLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return process.env.NODE_ENV !== 'production' ? (
    <Link className="text-primary underline-offset-4 hover:underline" href={href}>
      {children}
    </Link>
  ) : (
    <span>{children}</span>
  );
}

export async function ScaffoldPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations('Shell'),
  ]);
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 md:py-16">
      {process.env.NODE_ENV !== 'production' ? (
        <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
          ← {t('home')}
        </Link>
      ) : null}
      <div className="my-10 space-y-3">
        <Badge variant="secondary">{t('scaffold')}</Badge>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl" lang="en">{title}</h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground" lang="en">{description}</p>
      </div>
      <Alert>
        <AlertTitle>{t('scaffold')}</AlertTitle>
        <AlertDescription>
          {t('notice')}
          {locale === 'ja' ? <p>{t('missingCopy')}</p> : null}
        </AlertDescription>
      </Alert>
      <div className="mt-10 flex flex-col gap-8" lang="en">
        {children}
      </div>
    </main>
  );
}

export async function PreviewCard({
  title,
  description,
  href,
  children,
}: {
  title: string;
  description: string;
  href: string;
  children?: React.ReactNode;
}) {
  const t = await getTranslations('Shell');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
      <CardFooter>
        <PreviewLink href={href}>{t('open')} →</PreviewLink>
      </CardFooter>
    </Card>
  );
}

export function SectionIndex({ section }: { section: keyof typeof sections }) {
  const item = sections[section];
  return (
    <ScaffoldPage title={item.title} description={item.purpose}>
      <h2 className="font-heading text-xl font-semibold tracking-tight">Preview item</h2>
      <PreviewCard
        title={item.sample}
        description={item.detail}
        href={item.href}
      >
        <Badge variant="outline">Unpublished sample</Badge>
      </PreviewCard>
      <p className="max-w-3xl leading-7 text-muted-foreground">
        No published {section === 'learn' ? 'lessons' : section} have been
        connected. This single item exists to review the detail-page structure.
      </p>
    </ScaffoldPage>
  );
}

export function ContentSections({
  items,
}: {
  items: readonly { title: string; body: string }[];
}) {
  return (
    <div className="typeset max-w-3xl">
      {items.map((item) => (
        <section key={item.title}>
          <h2>{item.title}</h2>
          <p>{item.body}</p>
        </section>
      ))}
    </div>
  );
}
