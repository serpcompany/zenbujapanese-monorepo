export type SitePage = {
  path: string
  title: string
  description: string
}

export const sitePages = [
  { path: '/', title: 'Home', description: 'Zenbu Japanese dictionary and translator.' },
  {
    path: '/dictionary/',
    title: 'Japanese dictionary',
    description: 'Look up Japanese words and kanji in Japanese, kana, romaji, or English.'
  },
  { path: '/about/', title: 'About', description: 'About Zenbu Japanese.' },
  { path: '/support/', title: 'Support', description: 'Get help with Zenbu Japanese.' },
  { path: '/contact/', title: 'Contact', description: 'Contact the Zenbu Japanese team.' },
  { path: '/legal/', title: 'Legal', description: 'Zenbu Japanese legal policies.' },
  {
    path: '/legal/privacy/',
    title: 'Privacy Policy',
    description: 'How Zenbu Japanese handles information in the app and on this website.'
  },
  {
    path: '/legal/terms/',
    title: 'Terms of Use',
    description: 'Terms for using Zenbu Japanese and this website.'
  },
  {
    path: '/legal/dmca/',
    title: 'DMCA Copyright Policy',
    description: 'How to report claimed copyright infringement to Zenbu Japanese.'
  },
  {
    path: '/legal/affiliate-disclosure/',
    title: 'Affiliate Disclosure',
    description: 'How Zenbu Japanese discloses affiliate relationships.'
  },
  {
    path: '/sources/',
    title: 'Sources',
    description: 'The open data behind the Zenbu Japanese dictionary, with credits and licences.'
  },
  { path: '/sitemap/', title: 'Sitemap', description: 'Every page on zenbujapanese.com.' }
] as const satisfies readonly SitePage[]

export const legalPages = sitePages.filter(
  page => page.path.startsWith('/legal/') && page.path !== '/legal/'
)

export function pageFor(path: (typeof sitePages)[number]['path']): SitePage {
  const page = sitePages.find(candidate => candidate.path === path)
  if (!page) throw new Error(`Unknown page: ${path}`)
  return page
}
