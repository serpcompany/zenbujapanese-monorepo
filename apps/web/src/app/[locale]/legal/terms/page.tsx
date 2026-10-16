import Link from 'next/link'
import { Fill } from '@/components/fill'
import { PageShell } from '@/components/page-shell'
import { company } from '@/lib/company'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'
import { localizedPath } from '@/lib/i18n/paths'
import { pageMetadata } from '@/lib/metadata'
import { pageFor } from '@/lib/pages'
import { site } from '@/lib/site'

const forbiddenUses = ['interfere', 'scrape', 'infringe'] as const

const sectionsAfterUse = [
  'thirdParty',
  'ourContent',
  'app',
  'disclaimer',
  'liability',
  'changes',
  'law'
] as const

export async function generateMetadata({ params }: PageProps<'/[locale]/legal/terms'>) {
  return pageMetadata('/legal/terms/', await localeOf(params))
}

export default async function TermsPage({ params }: PageProps<'/[locale]/legal/terms'>) {
  const locale = await localeOf(params)
  const t = getDictionary(locale).terms
  return (
    <PageShell path="/legal/terms/" locale={locale} updated="2026-09-28" englishPrevails>
      <p>
        <Fill template={t.intro} values={{ name: site.name, company: company.name }} />
      </p>

      <TermsSection {...t.service} />

      <h2>{t.use.heading}</h2>
      <p>{t.use.intro}</p>
      <ul>
        {forbiddenUses.map(use => (
          <li key={use}>{t.use[use]}</li>
        ))}
      </ul>

      {sectionsAfterUse.map(section => (
        <TermsSection key={section} {...t[section]} />
      ))}

      <h2>{t.contact.heading}</h2>
      <p>
        <Fill
          template={t.contact.body}
          values={{
            email: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>,
            privacy: (
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

function TermsSection({ heading, body }: { heading: string; body: string }) {
  return (
    <>
      <h2>{heading}</h2>
      <p>
        <Fill template={body} values={{ name: site.name }} />
      </p>
    </>
  )
}
