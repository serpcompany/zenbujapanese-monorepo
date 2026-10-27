import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { catalogEntry, featuredApp, type ProductWithPage } from '@/lib/products/catalog'
import { productNameIn } from '@/lib/products/localized-catalog'
import { type LinkTo, linkTo, localizedLink } from '@/lib/site'
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
  const productPage = (id: ProductWithPage['id']) => localizedLink(catalogEntry(id).page, locale)
  const product = (id: ProductWithPage['id']): FooterLink => ({
    title: productNameIn(id, locale),
    ...productPage(id)
  })
  return [
    {
      id: 'Products',
      heading: t.footer.products,
      links: [
        { title: t.products.featuredApp.title, ...localizedLink(featuredApp.page, locale) },
        { title: t.footer.dictionary, ...productPage('dictionary') }
      ],
      account: true
    },
    {
      id: 'Tools',
      heading: t.footer.tools,
      links: [
        product('kana-charts'),
        product('kanji-lists'),
        product('frequency-lists'),
        { title: t.footer.allTools, ...localizedLink(linkTo('tools'), locale) }
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
