import Link from 'next/link'
import { Fill } from '@/components/fill'
import { PageShell } from '@/components/page-shell'
import { company } from '@/lib/company'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { localizedPath } from '@/lib/i18n/paths'
import { pageMetadata } from '@/lib/metadata'
import { pageFor } from '@/lib/pages'
import { site } from '@/lib/site'

const shortVersion = ['works', 'reports', 'account', 'noSale', 'providers', 'rights'] as const

const appLabels = {
  sendCrashReports: 'Send Crash Reports',
  reportAProblem: 'Report a Problem…',
  included: 'Included with your report'
} as const

const whatWeKeep = [
  'account',
  'signIn',
  'sessions',
  'studyData',
  'subscription',
  'changes'
] as const

const howLongWeKeepIt = [
  'account',
  'subscription',
  'deletedAccount',
  'sessions',
  'codes',
  'requestCounts',
  'changes',
  'photos',
  'removed',
  'backups',
  'reports',
  'supportEmail'
] as const

const providers = [
  { key: 'cloudflare', name: 'Cloudflare' },
  { key: 'useSend', name: 'useSend' },
  { key: 'stripe', name: 'Stripe' },
  { key: 'lambda', name: 'Lambda, Inc.' },
  { key: 'sentry', name: 'Sentry' },
  { key: 'ahrefs', name: 'Ahrefs' },
  { key: 'google', name: 'Google' },
  { key: 'apple', name: 'Apple' },
  { key: 'youtube', name: 'YouTube' }
] as const

const legalBases = ['account', 'subscription', 'security', 'support'] as const

const rights = ['export', 'correct', 'delete', 'object'] as const

function PolicyTable({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b">
          {head.map(cell => (
            <th key={cell} scope="col" className="py-2 pr-4 font-medium">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([what, detail]) => (
          <tr key={what} className="border-b align-top">
            <td className="py-2 pr-4">{what}</td>
            <td className="py-2">{detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const mail = <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>

export async function generateMetadata({ params }: PageProps<'/[locale]/legal/privacy'>) {
  return pageMetadata('/legal/privacy/', await localeOf(params))
}

export default async function PrivacyPage({ params }: PageProps<'/[locale]/legal/privacy'>) {
  const locale = await localeOf(params)
  const t = getDictionary(locale).privacy
  const named = { name: site.name }
  return (
    <PageShell path="/legal/privacy/" locale={locale} updated="2026-10-26" englishPrevails>
      <p>{fill(t.intro, named)}</p>

      <h2>{t.short.heading}</h2>
      <ul>
        {shortVersion.map(point => (
          <li key={point}>{t.short[point]}</li>
        ))}
      </ul>

      <h2>{t.whoWeAre.heading}</h2>
      <p>
        <Fill
          template={t.whoWeAre.body}
          values={{
            ...named,
            company: company.name,
            street: company.street,
            city: company.city,
            country: company.country,
            email: mail,
            phone: company.phone
          }}
        />
      </p>

      <h2>{t.device.heading}</h2>
      <p>{t.device.storage}</p>
      <p>{t.device.onDevice}</p>
      <p>{t.device.youtube}</p>

      <h2 id="reports">{t.reports.heading}</h2>
      <p>
        <Fill
          template={t.reports.crashes}
          values={{ sendCrashReports: <strong>{appLabels.sendCrashReports}</strong> }}
        />
      </p>
      <p>{t.reports.includes}</p>
      <p>{t.reports.never}</p>
      <p>
        <Fill
          template={t.reports.problems}
          values={{
            reportAProblem: <strong>{appLabels.reportAProblem}</strong>,
            included: <strong>{appLabels.included}</strong>
          }}
        />
      </p>
      <p>{t.reports.written}</p>
      <p>{t.reports.ipAddress}</p>

      <h2>{t.account.heading}</h2>
      <p>{t.account.intro}</p>
      <PolicyTable
        head={[t.keep.what, t.keep.why]}
        rows={whatWeKeep.map(row => [t.keep[row].what, t.keep[row].why])}
      />
      <p>{t.account.removals}</p>
      <p>{t.account.emails}</p>
      <p>{t.account.website}</p>

      <h2 id="tomodachi">{t.tomodachi.heading}</h2>
      <p>{t.tomodachi.progress}</p>
      <p>{t.tomodachi.reminders}</p>
      <p>{t.tomodachi.account}</p>

      <h2>{t.providers.heading}</h2>
      <p>{t.providers.intro}</p>
      <ul>
        {providers.map(({ key, name }) => (
          <li key={key}>
            <Fill template={t.providers[key]} values={{ provider: <strong>{name}</strong> }} />
          </li>
        ))}
      </ul>
      <p>{t.providers.where}</p>

      <h2>{t.retention.heading}</h2>
      <PolicyTable
        head={[t.retention.what, t.retention.howLong]}
        rows={howLongWeKeepIt.map(row => [t.retention[row].what, t.retention[row].howLong])}
      />
      <p>{t.retention.expired}</p>

      <h2>{t.bases.heading}</h2>
      <ul>
        {legalBases.map(basis => (
          <li key={basis}>{t.bases[basis]}</li>
        ))}
      </ul>

      <h2>{t.rights.heading}</h2>
      <ul>
        {rights.map(right => (
          <li key={right}>
            <Fill
              template={t.rights[right].text}
              values={{ title: <strong>{t.rights[right].title}</strong>, email: mail }}
            />
          </li>
        ))}
      </ul>
      <p>{t.rights.fairness}</p>

      <h2>{t.children.heading}</h2>
      <p>{fill(t.children.body, named)}</p>

      <h2>{t.changes.heading}</h2>
      <p>
        <Fill
          template={t.changes.body}
          values={{
            email: mail,
            terms: (
              <Link href={localizedPath('/legal/terms/', locale)}>
                {pageFor('/legal/terms/', locale).title}
              </Link>
            )
          }}
        />
      </p>
    </PageShell>
  )
}
