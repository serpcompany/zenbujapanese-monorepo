import { Fill } from '@zenbu/ui/lib/fill'
import { PageShell } from '@/components/page-shell'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export async function generateMetadata({ params }: PageProps<'/[locale]/contact'>) {
  return pageMetadata('/contact/', await localeOf(params))
}

export default async function ContactPage({ params }: PageProps<'/[locale]/contact'>) {
  const locale = await localeOf(params)
  return (
    <PageShell path="/contact/" locale={locale}>
      <p>
        <Fill
          template={getDictionary(locale).contact.body}
          values={{ email: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> }}
        />
      </p>
    </PageShell>
  )
}
