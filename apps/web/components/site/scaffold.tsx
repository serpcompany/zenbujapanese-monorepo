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
    <Link className="preview-link" href={href}>
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
    <main className="site-page">
      {process.env.NODE_ENV !== 'production' ? (
        <Link href="/" className="preview-link">
          ← {t('home')}
        </Link>
      ) : null}
      <div className="page-heading">
        <Badge variant="secondary">{t('scaffold')}</Badge>
        <h1 lang="en">{title}</h1>
        <p lang="en">{description}</p>
      </div>
      <Alert>
        <AlertTitle>{t('scaffold')}</AlertTitle>
        <AlertDescription>
          {t('notice')}
          {locale === 'ja' ? <p>{t('missingCopy')}</p> : null}
        </AlertDescription>
      </Alert>
      <div className="page-content" lang="en">
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
      <CardFooter variant="plain">
        <PreviewLink href={href}>{t('open')} →</PreviewLink>
      </CardFooter>
    </Card>
  );
}

export function SectionIndex({ section }: { section: keyof typeof sections }) {
  const item = sections[section];
  return (
    <ScaffoldPage title={item.title} description={item.purpose}>
      <h2>Preview item</h2>
      <PreviewCard
        title={item.sample}
        description={item.detail}
        href={item.href}
      >
        <Badge variant="outline">Unpublished sample</Badge>
      </PreviewCard>
      <p className="text-muted-foreground">
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
    <div className="content-sections">
      {items.map((item) => (
        <section key={item.title}>
          <h2>{item.title}</h2>
          <p>{item.body}</p>
        </section>
      ))}
    </div>
  );
}
