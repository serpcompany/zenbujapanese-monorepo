// Concrete review examples for every #279 route pattern. Not a content catalog.
export const reviewRoutes = [
  { href: '/', title: 'Website home' },
  { href: '/about', title: 'About' },
  { href: '/contact', title: 'Contact' },
  { href: '/support', title: 'Support' },
  { href: '/legal', title: 'Legal index' },
  { href: '/legal/privacy', title: 'Privacy' },
  { href: '/legal/terms', title: 'Terms' },
  { href: '/legal/dmca', title: 'DMCA' },
  { href: '/legal/affiliate-disclosure', title: 'Affiliate disclosure' },
  { href: '/dictionary', title: 'Dictionary sample' },
  { href: '/videos', title: 'Video library' },
  { href: '/watch/dictionary-walkthrough', title: 'Video watch page' },
  { href: '/blog', title: 'Blog index' },
  { href: '/blog/behind-the-dictionary', title: 'Blog article' },
  { href: '/products', title: 'Product index' },
  { href: '/products/zenbu-japanese', title: 'Product overview' },
  { href: '/products/zenbu-japanese/features', title: 'Product features' },
  { href: '/products/zenbu-japanese/pricing', title: 'Product pricing' },
  { href: '/resources', title: 'Resource index' },
  { href: '/resources/dictionary-guide', title: 'Resource detail' },
  { href: '/learn', title: 'Learning index' },
  { href: '/learn/first-words', title: 'Lesson detail' },
  { href: '/sitemap', title: 'Local route directory' },
] as const;

export const sections = {
  videos: {
    title: 'Videos',
    purpose:
      'A browsable library of published videos. Playback and a transcript belong on the separate watch page.',
    href: '/watch/dictionary-walkthrough',
    sample: 'Dictionary walkthrough',
    detail: 'A video demonstration of a dictionary lookup.',
  },
  blog: {
    title: 'Blog',
    purpose:
      'Editorial articles, updates, and stories about Japanese learning. Articles are distinct from structured lessons.',
    href: '/blog/behind-the-dictionary',
    sample: 'Behind the dictionary',
    detail: 'An editorial article about how the dictionary is assembled.',
  },
  resources: {
    title: 'Resources',
    purpose:
      'Reference guides and useful learning materials to revisit. Resources support a task without implying a lesson sequence.',
    href: '/resources/dictionary-guide',
    sample: 'Dictionary guide',
    detail: 'A reference guide for reading a dictionary entry.',
  },
  learn: {
    title: 'Learn',
    purpose:
      'Structured learning units with an objective, an explanation, and practice. Lessons are distinct from editorial blog posts.',
    href: '/learn/first-words',
    sample: 'First words',
    detail: 'A lesson outline for beginning to explore Japanese vocabulary.',
  },
} as const;

export const legalPages = {
  privacy: {
    title: 'Privacy policy',
    topics: [
      'Data collected and its purposes',
      'Cookies and local preferences',
      'Retention, rights, and contact details',
    ],
  },
  terms: {
    title: 'Terms of use',
    topics: [
      'Scope of the service',
      'Acceptable use and account terms, if applicable',
      'Licensing, limitations, and governing terms',
    ],
  },
  dmca: {
    title: 'Copyright and DMCA',
    topics: [
      'Designated contact and eligibility',
      'Notice requirements and submission process',
      'Counter-notices and follow-up',
    ],
  },
  'affiliate-disclosure': {
    title: 'Affiliate disclosure',
    topics: [
      'Whether affiliate links are used',
      'Placement of disclosures',
      'How commercial relationships affect recommendations',
    ],
  },
} as const;
