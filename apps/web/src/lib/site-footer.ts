import {
  frequencyDictionariesPath,
  kanaChartsPath,
  kanjiListsPath
} from '@/lib/dictionary/browse/paths'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { type LinkTargetId, type LinkTo, linkTo } from '@/lib/site'
import { pageLinkTo } from '@/lib/site-menus'

type FooterLink = LinkTo & { title: string }

export type FooterColumn = {
  id: 'Products' | 'Tools' | 'Company' | 'Legal'
  heading: string
  links: readonly FooterLink[]
  account?: true
}

export function footerColumnsIn(locale: Locale): readonly FooterColumn[] {
  const t = getDictionary(locale)
  const page = (href: string) => ({ href: localizedPath(href, locale) })
  const target = (id: LinkTargetId): LinkTo => {
    const link = linkTo(id)
    return { ...link, href: localizedPath(link.href, locale) }
  }
  return [
    {
      id: 'Products',
      heading: t.footer.products,
      links: [
        { title: t.menus.iphoneApp, ...target('iphone-app') },
        pageLinkTo('/dictionary/', locale, t.footer.dictionary)
      ],
      account: true
    },
    {
      id: 'Tools',
      heading: t.footer.tools,
      links: [
        { title: t.footer.kanaCharts, ...page(kanaChartsPath) },
        { title: t.footer.kanjiLists, ...page(kanjiListsPath) },
        { title: t.footer.frequencyLists, ...page(frequencyDictionariesPath) },
        { title: t.footer.allTools, ...target('tools') }
      ]
    },
    {
      id: 'Company',
      heading: t.footer.company,
      links: [
        pageLinkTo('/about/', locale),
        pageLinkTo('/support/', locale),
        pageLinkTo('/contact/', locale),
        pageLinkTo('/sources/', locale)
      ]
    },
    {
      id: 'Legal',
      heading: t.footer.legal,
      links: [
        pageLinkTo('/legal/privacy/', locale),
        pageLinkTo('/legal/terms/', locale),
        pageLinkTo('/legal/dmca/', locale, t.footer.dmca),
        pageLinkTo('/legal/affiliate-disclosure/', locale)
      ]
    }
  ]
}
