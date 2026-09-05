# Local website route foundation (#278 / #279)

Run `pnpm dev` from the repo root and open http://localhost:3300/.
The homepage links to every section and a discreet local route directory.
The directory lists all **23** #279 route patterns plus a real dictionary entry.
Every route has an initial `/ja` equivalent. English stays unprefixed.

## Ownership and review addresses

| Surface              | Concrete English review URL         | Purpose and content owner                                                  |
| -------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| Home                 | `/`                                 | Website entry point; local reviewer launcher until approved homepage copy  |
| About                | `/about`                            | Product purpose, team copy and language-data acknowledgement               |
| Contact              | `/contact`                          | General contact; form is disabled, with no destination or delivery         |
| Support              | `/support`                          | Product help and troubleshooting; approved answers/channels pending        |
| Legal index          | `/legal`                            | Policy directory; owner/legal review required                              |
| Privacy              | `/legal/privacy`                    | Privacy-policy outline only                                                |
| Terms                | `/legal/terms`                      | Terms outline only                                                         |
| Copyright            | `/legal/dmca`                       | Copyright-process outline; no designated agent is claimed                  |
| Affiliate disclosure | `/legal/affiliate-disclosure`       | Disclosure outline; no affiliate relationship is claimed                   |
| Dictionary           | `/dictionary`                       | Existing four-record #277 app sample; corpus work remains #281/#282        |
| Videos               | `/videos`                           | Browsable video collection owned by video editorial workflow               |
| Watch                | `/watch/dictionary-walkthrough`     | One video player/transcript/reference surface; no media is supplied        |
| Blog                 | `/blog`                             | Editorial article collection                                               |
| Blog article         | `/blog/behind-the-dictionary`       | Article introduction/body/sources; no author or publication date invented  |
| Products             | `/products`                         | Product discovery                                                          |
| Product              | `/products/zenbu-japanese`          | Product overview/availability; final positioning and install links pending |
| Features             | `/products/zenbu-japanese/features` | Verified product capability descriptions pending                           |
| Pricing              | `/products/zenbu-japanese/pricing`  | Plan/price layout; no price, offer, trial or checkout invented             |
| Resources            | `/resources`                        | Reusable reference materials, distinct from articles or sequenced lessons  |
| Resource             | `/resources/dictionary-guide`       | Reference guide and supporting assets; no fake downloads                   |
| Learn                | `/learn`                            | Structured learning collection                                             |
| Lesson               | `/learn/first-words`                | Objective/explanation/practice outline; no scores or progress recorded     |
| Route directory      | `/sitemap`                          | Development-only review directory, not an XML/production sitemap           |

Exact dictionary example: `/dictionary/食べる-1358280`. Its app identity, data,
frequency, pitch and example provenance remain unchanged. `Common` labels were
removed in favor of the requested numeric frequency badge. `Listen` uses the
browser's speech synthesis with `ja-JP`, not a supplied recording; unavailable
APIs and playback errors are shown honestly.

Only the listed demo identifiers resolve. Unknown video/article/product/resource/
lesson identifiers, invalid product children, unknown legal documents and other
paths return 404. A wrong dictionary headword/ID pair remains 404.

## Shared structure and placeholder policy

`app/[locale]/layout.tsx` provides the approved Inter/Nova/Neutral/Blue theme,
red brand token, locale provider and language selector. There is no marketing
header navigation or global footer. Fixed page shells prerender for English and
Japanese. Dictionary pages alone read the two reading-preference session cookies.
Server Components render content; client code is limited to the locale selector,
reading controls, browser audio, and official UI primitives.

Section indexes share `SectionIndex`; article/resource/lesson/video pages retain
their different content structures. Product overview/features/pricing share a
product layout component. Legal documents use one finite policy outline map.
Reusable page/Card/Alert composition establishes hierarchy without generating
fictional finished content.

Scaffold pages display a non-final badge and explicit notice. Contact submission,
video playback content, downloads, prices, legal terms and lesson exercises are
not fabricated. All pages inherit `noindex, nofollow`. In **production mode**, the
homepage and scaffold components omit unfinished navigation links and `/sitemap`
returns 404; known unfinished pages can still be reviewed directly and remain
visibly non-final/noindex. In **development**, the homepage/directory expose all
review routes. Full SEO, XML sitemaps and production navigation remain separate
approval work under #280; no production-readiness claim is made here.

## Maintained locale behavior

`next-intl` owns as-needed prefixes, browser-language matching, remembered
`NEXT_LOCALE` choice, redirects and route construction. `/en/...` normalizes to
the unprefixed English equivalent; unsupported `/fr/...` is rejected. Japanese
browser preference may redirect an unprefixed request to `/ja` until the learner
explicitly chooses English, following the library's standard behavior. There is
no IP-based locale detection or custom language-negotiation algorithm.

The language selector preserves the corresponding path, query and fragment.
Exact dictionary addresses and reading preferences survive locale switches.
Search forms and internal links use locale-aware destinations. Shell messages,
language/reading/audio controls and entry/back links have English/Japanese
messages. Unapproved authored page copy stays English with an explicit Japanese
fallback notice; no Japanese dictionary gloss translation is invented.

Setup follows the current next-intl [routing](https://next-intl.dev/docs/routing/setup),
[navigation](https://next-intl.dev/docs/routing/navigation),
[configuration](https://next-intl.dev/docs/routing/configuration) and
[error-file](https://next-intl.dev/docs/environments/error-files) documentation.
Next 16.3 `next/root-params` supplies locale to request configuration. Root layout
translation/provider loading uses its validated explicit locale, including error
rendering. A clean dev-server restart is required after moving the root routing
layout; an old hot-reload process can retain stale route/not-found state.

## Verification and remaining boundary

`pnpm test` includes the original dictionary journeys and an independent,
hardcoded #279 checklist: 23 patterns plus exact entry, both locales, desktop and
mobile, expected headings/purpose, noindex, missing-copy notice and overflow;
unknown dynamic routes; language choice/query/entry/reading preservation; and
browser-speech behavior. The implementation route catalog is not the test oracle.

Passing route tests save full-page screenshots for home, directory, index,
product detail, article, legal, video and dictionary in `test-results/`, in both
locales and viewport sizes. CI uploads these as `web-test-results` even on success.
`pnpm build` followed by `pnpm --filter web test:production` checks the production
placeholder/navigation policy against a local Next production server on 3301;
its artifacts use `test-results-production/`. The reviewer preview stays on 3300.

Cloudflare-compatible runtime validation required by #278 is still outstanding.
The #277 bounded compatibility findings remain relevant and must be refreshed
for next-intl/proxy/root-params when the runtime is selected under #284. Normal
Next development/production tests do not prove Workers compatibility. Neither
issue is closed on the basis of this local foundation. No iOS, DNS, Cloudflare,
App Store, merge or production-deployment action is included.
