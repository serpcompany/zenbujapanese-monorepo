import { Fill } from '@zenbu/ui/lib/fill'
import { PageShell } from '@/components/page-shell'
import { company } from '@/lib/company'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

const dmcaEmail = 'dmca@zenbujapanese.com'

const noticeParts = ['signature', 'work', 'material', 'contact', 'goodFaith', 'accuracy'] as const

export async function generateMetadata({ params }: PageProps<'/[locale]/legal/dmca'>) {
  return pageMetadata('/legal/dmca/', await localeOf(params))
}

export default async function DmcaPage({ params }: PageProps<'/[locale]/legal/dmca'>) {
  const locale = await localeOf(params)
  const t = getDictionary(locale).dmca
  return (
    <PageShell path="/legal/dmca/" locale={locale} updated="2026-09-28" englishPrevails>
      <p>{fill(t.intro, { name: site.name })}</p>

      <h2>{t.agent.heading}</h2>
      <address className="not-italic">
        {site.name}
        <br />
        {company.name}
        <br />
        {company.street}
        <br />
        {company.city}
        <br />
        {fill(t.agent.phone, { phone: company.phone })}
        <br />
        <Fill
          template={t.agent.email}
          values={{ email: <a href={`mailto:${dmcaEmail}`}>{dmcaEmail}</a> }}
        />
      </address>

      <h2>{t.notice.heading}</h2>
      <p>{t.notice.intro}</p>
      <ul>
        {noticeParts.map(part => (
          <li key={part}>{t.notice[part]}</li>
        ))}
      </ul>
      <p>{t.notice.misrepresentation}</p>

      <h2>{t.counter.heading}</h2>
      <p>{fill(t.counter.body, { name: site.name })}</p>

      <h2>{t.repeat.heading}</h2>
      <p>{t.repeat.body}</p>
    </PageShell>
  )
}
