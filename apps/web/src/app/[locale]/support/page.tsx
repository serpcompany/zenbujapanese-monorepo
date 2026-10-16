import Link from 'next/link'
import { Fill } from '@/components/fill'
import { PageShell } from '@/components/page-shell'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'
import { localizedPath } from '@/lib/i18n/paths'
import { pageMetadata } from '@/lib/metadata'
import { pageFor } from '@/lib/pages'
import { site } from '@/lib/site'

export async function generateMetadata({ params }: PageProps<'/[locale]/support'>) {
  return pageMetadata('/support/', await localeOf(params))
}

export default async function SupportPage({ params }: PageProps<'/[locale]/support'>) {
  const locale = await localeOf(params)
  const t = getDictionary(locale).support
  return (
    <PageShell path="/support/" locale={locale}>
      <p>
        <Fill
          template={t.app}
          values={{
            name: site.name,
            email: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
          }}
        />
      </p>
      <p>
        <Fill
          template={t.tomodachi}
          values={{
            link: (
              <Link href={localizedPath('/legal/privacy/#tomodachi', locale)}>
                {t.tomodachiLink}
              </Link>
            )
          }}
        />
      </p>
      <p>
        <Fill
          template={t.privacy}
          values={{
            link: (
              <Link href={localizedPath('/legal/privacy/', locale)}>
                {pageFor('/legal/privacy/', locale).title}
              </Link>
            )
          }}
        />
      </p>
    </PageShell>
  )
}
