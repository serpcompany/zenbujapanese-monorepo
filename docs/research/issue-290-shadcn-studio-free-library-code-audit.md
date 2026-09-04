# Issue #290: Shadcn Studio free-library code audit

**Audit date:** 2026-09-05 (Asia/Tokyo)

**Scope:** Shadcn Studio's public, unauthenticated free catalog and source, plus its five public free Next.js template repositories
**Decision this supports:** whether Zenbu Japanese should use Shadcn Studio components, blocks, pages, themes, or templates as the starting point for the website

## Bottom line

Shadcn Studio is useful as a **searchable pattern catalog**, but its free output should not be treated as a pre-tested application library.

- The current public registry is large and inspectable: 608 component examples, 57 free blocks, 7 free pages, and 22 free themes. The complete category registries contain 735 blocks and 101 pages, so most blocks and pages are premium rather than public free source. The public index is the authoritative current inventory: [free registry index](https://shadcnstudio.com/r/new-york-v4/registry.json), [component index](https://shadcnstudio.com/r/components/new-york-v4/registry.json), [block index](https://shadcnstudio.com/r/blocks/new-york-v4/registry.json), [page index](https://shadcnstudio.com/r/pages/new-york-v4/registry.json), and [theme index](https://shadcnstudio.com/r/themes/registry.json).
- The versioned public GitHub repository is behind the live registry. At commit [`72a2033`](https://github.com/shadcnstudio/shadcn-studio/tree/72a20331970218848103184b61e1efa9d0e08dea) it has 600 components, 37 blocks, and 22 themes (659 items), while the live free index has 694 items. Use the live registry for selection and save the exact installed source in Zenbu; do not rely on a catalog name staying unchanged.
- The open repository contains **zero test/spec files and no CI workflow that tests the 659 registry items**. The five free template repositories also contain zero tests and no CI workflows. The snippets inherit some behavior from shadcn/ui and Radix/Base UI primitives, but the Studio composition around those primitives is not thereby proven. Evidence: [registry source tree](https://github.com/shadcnstudio/shadcn-studio/tree/72a20331970218848103184b61e1efa9d0e08dea/src/components/shadcn-studio) and the five template repositories linked below.
- There is no free dictionary, vocabulary, word-result, or word-entry block/page/template in the public indexes. Zenbu's domain sections must be composed, but they can be composed almost entirely from upstream shadcn/ui primitives instead of hand-building controls.
- The safest starting point is therefore: **install upstream shadcn/ui primitives, use Studio only for a small number of reviewed interaction patterns, and write Zenbu-specific semantic composition plus tests.** No free Studio page or full template should become the Zenbu website baseline.
- The free Studio license is not plain MIT: its `LICENSE.md` adds Commons Clause restrictions. Standalone free template repositories contain plain MIT files. Preserve source provenance and notices, and do not call the main Studio registry “MIT-only.” Sources: [Studio license](https://shadcnstudio.com/license), [repository license](https://github.com/shadcnstudio/shadcn-studio/blob/72a20331970218848103184b61e1efa9d0e08dea/LICENSE.md).

## Method and limits

This audit used first-party sources only:

1. Enumerated the current unauthenticated registry indexes and compared their item names/types.
2. Downloaded and statically inspected the generated source payload for every one of the 57 free blocks and all 7 free pages.
3. Scanned all 639 TSX files in the versioned open-source registry checkout and manually reviewed a category-stratified sample, with deeper review of all Zenbu-relevant candidates.
4. Inspected all 22 theme payloads for token coverage and internal consistency.
5. Inspected source, manifests, licenses, and repository checks for all four free landing templates and the free AdminCN dashboard.
6. Used live previews to confirm visible semantics and free/premium status. No package was installed and no build was run, so this is a source audit, not a claim that every item builds against Zenbu's eventual dependency lockfile.

The live registry is unversioned. The audit therefore records both the date and the stable GitHub revision. Registry source cited from `shadcnstudio.com` is the source returned on the audit date, not a permanent revision.

## Scoring rubric

Each candidate is scored from 0 to 5 on six dimensions; the overall score is the unweighted mean.

| Dimension | 5 means | 0 means |
| --- | --- | --- |
| Zenbu fit | Directly represents the required dictionary/site behavior | Unrelated product/domain |
| Semantics and accessibility | Correct native semantics, names, focus, and keyboard behavior | Material barriers or invalid interaction nesting |
| State completeness | Real loading/error/empty/disabled behavior is represented | Static demo only or fake state |
| Dependency restraint | Uses only primitives already justified for Zenbu | Pulls unrelated heavy runtime dependencies |
| Server/composition quality | Server-first where possible; clear props and stable identifiers | Unnecessary client boundary, hardcoded content, index keys |
| Adoption clarity | Can be installed and owned with clear source/license | Premium/auth-only, unclear provenance, or major rewrite required |

Interpretation: **4.0–5.0 adopt**, **3.0–3.9 adapt and test**, **2.0–2.9 reference only**, **0–1.9 reject for this project**.

### Zenbu-relevant scorecard

| Candidate | Fit | A11y | States | Deps | Server/composition | Adoption clarity | Overall | Disposition |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Upstream shadcn/ui primitives | 5 | 4 | 4 | 5 | 5 | 5 | **4.7** | Adopt reviewed primitives |
| Studio `select-01` | 4 | 5 | 4 | 5 | 5 | 3 | **4.3** | Adapt labels/options and locale navigation |
| Studio `alert-14` / `alert-17` | 4 | 4 | 3 | 5 | 5 | 3 | **4.0** | Adapt copy and announcement policy |
| Studio `button-31` | 4 | 5 | 2 | 5 | 5 | 3 | **4.0** | Pattern reference for a named icon action |
| Studio `input-36` | 4 | 4 | 4 | 5 | 3 | 3 | **3.8** | Adapt; add explicit button/form behavior |
| Studio `pagination-01` / `breadcrumb-01` | 3 | 4 | 1 | 5 | 5 | 3 | **3.5** | Adapt only after real routing exists |
| Studio `input-39` | 4 | 2 | 1 | 5 | 2 | 3 | **2.8** | Reject fake loading behavior |
| Studio `dashboard-dropdown-01` | 3 | 4 | 1 | 4 | 2 | 3 | **2.8** | Reject its logic; use next-intl + native select |
| Studio free named themes | 2 | 2 | 3 | 3 | 5 | 2 | **2.8** | Palette reference only |
| Studio `navbar-component-01` | 3 | 1 | 2 | 4 | 3 | 3 | **2.7** | Reject unchanged |
| Studio `footer-component-01` | 3 | 2 | 2 | 4 | 4 | 3 | **3.0** | Structure reference only; replacement is simpler |
| Seven free Studio pages | 1 | 2 | 1 | 2 | 3 | 3 | **2.0** | Reject as Zenbu baselines |
| Four free landing templates | 1 | 2 | 2 | 1 | 2 | 4 | **2.0** | Reject now; reconsider Ink only for Blog |
| Free AdminCN dashboard | 0 | 3 | 3 | 0 | 1 | 4 | **1.8** | Reject |

### Category-stratified source sample

In addition to the full automated scan, the stable source review sampled the first, median, and last item in every component category (93 snippets), then added the current Zenbu candidates and all newly added free blocks/pages. The deterministic 93-item sample was:

- `accordion-01`, `accordion-08`, `accordion-16`; `alert-01`, `alert-15`, `alert-30`; `avatar-01`, `avatar-11`, `avatar-21`; `badge-01`, `badge-12`, `badge-24`; `breadcrumb-01`, `breadcrumb-04`, `breadcrumb-08`
- `button-01`, `button-24`, `button-47`; `button-group-01`, `button-group-08`, `button-group-16`; `calendar-01`, `calendar-13`, `calendar-25`; `card-01`, `card-09`, `card-17`; `checkbox-01`, `checkbox-10`, `checkbox-19`
- `collapsible-01`, `collapsible-05`, `collapsible-10`; `combobox-01`, `combobox-07`, `combobox-14`; `data-table-01`, `data-table-07`, `data-table-13`; `date-picker-01`, `date-picker-07`, `date-picker-13`; `dialog-01`, `dialog-13`, `dialog-26`
- `dropdown-menu-01`, `dropdown-menu-08`, `dropdown-menu-16`; `form-01`, `form-05`, `form-10`; `input-01`, `input-23`, `input-46`; `input-mask-01`, `input-mask-03`, `input-mask-06`; `input-otp-01`, `input-otp-05`, `input-otp-10`
- `pagination-01`, `pagination-08`, `pagination-15`; `popover-01`, `popover-08`, `popover-15`; `radio-group-01`, `radio-group-08`, `radio-group-15`; `select-01`, `select-19`, `select-38`; `sheet-01`, `sheet-04`, `sheet-07`
- `sonner-01`, `sonner-10`, `sonner-20`; `switch-01`, `switch-10`, `switch-20`; `table-01`, `table-08`, `table-16`; `tabs-01`, `tabs-15`, `tabs-29`; `textarea-01`, `textarea-11`, `textarea-21`; `tooltip-01`, `tooltip-09`, `tooltip-17`

The deeper current-payload review covered `input-36`, `input-39`, `select-01`, `alert-14`, `alert-17`, `pagination-01`, `breadcrumb-01`, `button-31`, `card-09`, `navbar-component-01`, `footer-component-01`, `dashboard-dropdown-01`, `empty-state-01`, `faq-component-01`, and `about-us-page-01`. The audit did not manually line-review all 608 component variants; it exhaustively inventoried them, scanned the stable source mechanically, and used this disclosed stratified/deep sample for code judgments.

## Exhaustive current free inventory

### Individual components: 608

The live free index contains every entry from the component index as of the audit date. IDs are contiguous in each range.

| Category | Count | Exact ID range |
| --- | ---: | --- |
| Accordion | 16 | `accordion-01`–`accordion-16` |
| Alert | 30 | `alert-01`–`alert-30` |
| Avatar | 21 | `avatar-01`–`avatar-21` |
| Badge | 24 | `badge-01`–`badge-24` |
| Breadcrumb | 8 | `breadcrumb-01`–`breadcrumb-08` |
| Button | 55 | `button-01`–`button-55` |
| Button group | 16 | `button-group-01`–`button-group-16` |
| Calendar | 25 | `calendar-01`–`calendar-25` |
| Card | 17 | `card-01`–`card-17` |
| Checkbox | 19 | `checkbox-01`–`checkbox-19` |
| Collapsible | 10 | `collapsible-01`–`collapsible-10` |
| Combobox | 14 | `combobox-01`–`combobox-14` |
| Data table | 13 | `data-table-01`–`data-table-13` |
| Date picker | 13 | `date-picker-01`–`date-picker-13` |
| Dialog | 26 | `dialog-01`–`dialog-26` |
| Dropdown menu | 16 | `dropdown-menu-01`–`dropdown-menu-16` |
| Form | 10 | `form-01`–`form-10` |
| Input | 46 | `input-01`–`input-46` |
| Input mask | 6 | `input-mask-01`–`input-mask-06` |
| Input OTP | 10 | `input-otp-01`–`input-otp-10` |
| Pagination | 15 | `pagination-01`–`pagination-15` |
| Popover | 15 | `popover-01`–`popover-15` |
| Radio group | 15 | `radio-group-01`–`radio-group-15` |
| Select | 38 | `select-01`–`select-38` |
| Sheet | 7 | `sheet-01`–`sheet-07` |
| Sonner | 20 | `sonner-01`–`sonner-20` |
| Switch | 20 | `switch-01`–`switch-20` |
| Table | 16 | `table-01`–`table-16` |
| Tabs | 29 | `tabs-01`–`tabs-29` |
| Textarea | 21 | `textarea-01`–`textarea-21` |
| Tooltip | 17 | `tooltip-01`–`tooltip-17` |

The live documentation also displays categories such as List, Skeleton, Empty, Field, and Spinner, but these do not appear as named variant ranges in the free component registry index. Do not cite or install a guessed ID such as `list-03`; it is not present in the current public registry. Use the corresponding upstream shadcn/ui primitive when available.

### Free blocks: 57

These are the exact block IDs in the free namespace. The full block registry has 735 entries; the other 678 are not in the unauthenticated free namespace.

| Area | Exact free IDs |
| --- | --- |
| Marketing/content | `about-us-page-01`, `app-integration-01`, `blog-component-01`, `blog-component-15`, `blog-component-17`, `contact-us-page-01`, `cta-section-01`, `cta-section-10`, `cta-section-12`, `faq-component-01`, `faq-component-17`, `features-section-01`, `footer-component-01`, `forgot-password-01`, `gallery-component-01`, `hero-section-01`, `hero-section-35`, `hero-section-41`, `login-page-01`, `logo-cloud-01`, `navbar-component-01`, `portfolio-01`, `pricing-component-01`, `register-01`, `reset-password-01`, `social-proof-01`, `social-proof-07`, `team-section-01`, `testimonials-component-01`, `testimonials-component-18`, `two-factor-authentication-01`, `verify-email-01`, `compare-07`, `timeline-component-05` |
| Application/forms | `application-shell-01`, `form-layout-01`, `form-layout-02`, `account-settings-01`, `file-upload-01`, `onboarding-feed-01`, `empty-state-01` |
| Dashboard | `chart-component-01`, `dashboard-dialog-01`, `dashboard-dialog-02`, `dashboard-dialog-21`, `dashboard-dialog-22`, `dashboard-dropdown-01`, `dashboard-dropdown-02`, `dashboard-footer-01`, `dashboard-header-01`, `dashboard-shell-01`, `dashboard-sidebar-01`, `statistics-component-01`, `statistics-component-12`, `widget-component-01`, `widget-component-02` |
| Commerce | `product-list-01` |

Source: [current free index](https://shadcnstudio.com/r/new-york-v4/registry.json).

### Free pages: 7

| ID | Composition | Zenbu applicability |
| --- | --- | --- |
| [`about-page-06`](https://shadcnstudio.com/r/pages/new-york-v4/about-page-06.json) | Navbar + About + Team + mobile-app CTA + FAQ + Footer; 20 files / ~807 source lines | Reference only; most sections do not belong on Zenbu About |
| [`changelog-page-01`](https://shadcnstudio.com/r/pages/new-york-v4/changelog-page-01.json) | Navbar + timeline + footer; 17 files / ~825 lines | Not in current route plan |
| [`contact-page-09`](https://shadcnstudio.com/r/pages/new-york-v4/contact-page-09.json) | Navbar + static contact section + footer; 13 files / ~468 lines | Reference only; not a working contact submission flow |
| [`faq-page-01`](https://shadcnstudio.com/r/pages/new-york-v4/faq-page-01.json) | Navbar + accordion FAQ + footer; 13 files / ~434 lines | Accordion section may inform a future FAQ; no current FAQ route |
| [`feature-page-01`](https://shadcnstudio.com/r/pages/new-york-v4/feature-page-01.json) | Navbar + feature cards + social proof + CTA + footer; 17 files / ~630 lines | Product marketing reference only |
| [`integrations-page-01`](https://shadcnstudio.com/r/pages/new-york-v4/integrations-page-01.json) | Navbar + integrations + CTA + footer; 15 files / ~508 lines | Not a Zenbu surface |
| [`pricing-page-16`](https://shadcnstudio.com/r/pages/new-york-v4/pricing-page-16.json) | Navbar + pricing + FAQ + CTA + footer; 17 files / ~613 lines | Future product-pricing reference only |

The full current page catalog contains 101 pages. These seven are the only entries in the public free namespace; the remaining 94 require the premium/authenticated registry. The free page payloads are assemblies of the same free blocks, not independently engineered application flows.

### Free themes: 22

Exact IDs: `marshmallow`, `art-deco`, `vs-code`, `spotify`, `summer`, `material-design`, `marvel`, `valorant`, `ghibli-studio`, `modern-minimal`, `nature`, `elegant-luxury`, `neo-brutalism`, `pastel-dreams`, `clean-slate`, `midnight-bloom`, `sunset-horizon`, `claude`, `caffeine`, `corporate`, `slack`, and `perplexity`.

All 22 payloads contain light and dark values for the core shadcn semantic tokens. However:

- 19 payloads contain different duplicate `radius` values between the light and dark sections; 19 also have font declarations whose mode-level values differ from or omit the top-level theme declaration. That makes application precedence something Zenbu would have to verify rather than blindly trust.
- Several themes require named fonts not delivered by the theme payload itself.
- None matches Zenbu's Japanese-dictionary identity. The red presets (`marvel`, `valorant`, `neo-brutalism`, `elegant-luxury`) bring unrelated visual systems, not merely a red primary color.
- Shadcn Studio advertises contrast validation as a **Pro** theme-generator feature; the static free theme files do not include contrast-test evidence. Source: [theme generator](https://shadcnstudio.com/theme-generator) and [theme index](https://shadcnstudio.com/r/themes/registry.json).

Recommendation: do not adopt a named preset. Start from upstream shadcn semantic tokens, apply Zenbu brand tokens, and run automated contrast checks. This is configuration of a reliable system, not custom implementation of controls.

### Free full templates and dashboards: 5

The live template catalogs expose four free landing templates and one free admin dashboard. Each has a public source repository and plain MIT `LICENSE.md`.

| Template | Audited revision | Code/dependencies | Finding |
| --- | --- | --- | --- |
| [Zolt portfolio](https://github.com/shadcnstudio/shadcn-nextjs-zolt-landing-page-free/tree/b4a6e43fac0f034bc7d3445af6c0a35095bed7db) | `b4a6e43`, 2026-08-13 | 75 TSX; 34 client files; Three, React Three Fiber, Rapier, Motion, MDX | Reject: unrelated portfolio/3D stack and excessive client/runtime weight |
| [Ink blog](https://github.com/shadcnstudio/shadcn-nextjs-ink-landing-page-free/tree/1068a68106bf8108626d9788e38b8800d04186f0) | `1068a68`, 2026-08-14 | 44 TSX; 18 client files; MDX stack | Do not use as site baseline; reconsider only inside the future blog issue |
| [Track changelog](https://github.com/shadcnstudio/shadcn-nextjs-track-landing-page-free/tree/e3111992847585cb05c50b4b308ee3f7fa4ad302) | `e311199`, 2026-08-14 | 34 TSX; 6 client files | Reject: unrelated; its `CopyCode` highlighter writes regex-transformed input with `dangerouslySetInnerHTML` without first HTML-escaping the input ([source](https://github.com/shadcnstudio/shadcn-nextjs-track-landing-page-free/blob/e3111992847585cb05c50b4b308ee3f7fa4ad302/src/components/copy-code.tsx)) |
| [Bistro restaurant](https://github.com/shadcnstudio/shadcn-nextjs-bistro-landing-page-free/tree/636d50d2036baf23f0303bc2c98e7bc2d6432bcd) | `636d50d`, 2026-08-14 | 40 TSX; carousel/MDX | Reject: unrelated restaurant content and interaction model |
| [AdminCN](https://github.com/shadcnstudio/shadcn-nextjs-admincn-admin-template-free/tree/dd1afd2f3a794ea9e746197de314f81d43670ea1) | `dd1afd2`, 2026-08-18 | 171 TSX; 83 client files; table, charts, forms, URL state, resizable panels | Reject: this is an authenticated admin product shell, not a public content/dictionary website |

All five use Next.js App Router, React 19, TypeScript, and Tailwind v4-era packages, so their basic generation is contemporary. That does not overcome the domain mismatch, dependency surface, absence of tests/CI, and large amount of demo content.

## Source-quality findings

### What is good

- Registry payloads declare both direct dependencies and shadcn registry dependencies, which makes installation effects reviewable before copying. Example: [`input-36`](https://shadcnstudio.com/r/components/new-york-v4/input-36.json).
- The current input examples use shadcn's `InputGroup` instead of manually overlapping arbitrary elements.
- `input-36` gives the clear button a screen-reader label and restores focus to the input after clearing.
- `select-01` uses a real native `<select>` with a programmatic label, which is a strong fit for a two-locale selector. Source: [`select-01`](https://shadcnstudio.com/r/components/new-york-v4/select-01.json).
- `alert-14` and `alert-17` are thin compositions of the upstream Alert primitive rather than bespoke notification systems. Sources: [`alert-14`](https://shadcnstudio.com/r/components/new-york-v4/alert-14.json), [`alert-17`](https://shadcnstudio.com/r/components/new-york-v4/alert-17.json).
- The public component snippets avoid `dangerouslySetInnerHTML`; the notable unsafe-looking occurrence found in this audit is in the standalone Track template, not the selected primitive examples.
- Studio uses open-code ownership rather than a runtime Studio package. This avoids vendor runtime lock-in, but it also means Zenbu owns every copied line and must test/maintain it. Studio's own documentation describes the registry/copy workflow: [CLI documentation](https://shadcnstudio.com/docs/getting-started/how-to-use-shadcn-cli).

### What prevents “install and trust”

- **No test evidence:** no tests or CI were found in the free registry or five free templates.
- **Demo state is often fake:** `input-39` starts a 500 ms timer whenever text changes and calls that “loading”; it is not connected to form submission or retrieval, and its visually hidden loading text is not in a status/live region. Source: [`input-39`](https://shadcnstudio.com/r/components/new-york-v4/input-39.json).
- **Placeholder navigation is pervasive:** 23 of the 57 current free block payloads contain `href="#"` placeholder links. None imports `next/link`. These are showcase blocks, not ready route implementations.
- **Weak identifiers:** 27 of 57 free blocks use `key={index}` somewhere in their source. Zenbu result/entry lists must use JMdict IDs.
- **Image work remains:** 24 of 57 blocks use native `<img>` elements; none of the free blocks imports `next/image`. That can be legitimate, but dimensions, remote policy, loading, and alt text still require review.
- **Client boundaries are common:** 27 source files in the 57 block payloads declare `use client`. The dashboard/template products are much more client-heavy. Zenbu's indexed dictionary content should remain server-rendered, with client boundaries limited to interactive controls.
- **Accessibility defects exist in reviewed blocks:** `navbar-component-01` nests an anchor inside an interactive dropdown-menu item instead of using the primitive's link/as-child composition, hardcodes five desktop links separately from its `navigationData`, and uses index keys. `footer-component-01` gives its icon-only social links no accessible names. Sources: [`navbar-component-01`](https://shadcnstudio.com/r/blocks/new-york-v4/navbar-component-01.json), [`footer-component-01`](https://shadcnstudio.com/r/blocks/new-york-v4/footer-component-01.json).
- **The language block does not localize:** `dashboard-dropdown-01` only updates local React state. It does not navigate locale routes, integrate with next-intl, persist the choice, or preserve the current route. It also hardcodes an unrelated language set. Source: [`dashboard-dropdown-01`](https://shadcnstudio.com/r/blocks/new-york-v4/dashboard-dropdown-01.json).
- **Empty/error/loading are not a coherent system:** `empty-state-01` is specifically a metric card for “0 API requests,” not a reusable search-results empty state. Search failure, weak-only results, zero results, initial state, and missing enrichment still require separate Zenbu contracts. Source: [`empty-state-01`](https://shadcnstudio.com/r/blocks/new-york-v4/empty-state-01.json).

## Dependency and license impact

| Source/dependency | Why it appears | License/source conclusion | Zenbu policy |
| --- | --- | --- | --- |
| Upstream shadcn/ui code | Core Button, InputGroup, Alert, NativeSelect, Badge, Sheet, etc. | Open-code component distribution; use official registry/docs as the primitive source ([shadcn/ui docs](https://ui.shadcn.com/docs)) | Adopt reviewed primitives; keep local tests |
| Radix UI or Base UI | Behavior foundation for menus/selects/dialogs depending on chosen shadcn style | Both are established primitive systems, but mixing both increases bundle and mental overhead | Choose one family in the scaffold and do not import a Studio item that silently adds the other |
| `lucide-react` | Icons in 286 of 659 items in the stable open registry and most selected examples | Small per-icon imports when tree-shaken | Accept as the initial icon library; require accessible names on icon-only actions |
| Motion | 18 stable registry entries plus animated blocks | Adds client JS and motion behavior | Do not add for dictionary MVP; respect reduced motion if later justified |
| TanStack Table | 15 stable registry entries and AdminCN | Useful for data grids, not semantic dictionary results | Reject for result/entry pages |
| Recharts / Three / carousel stacks | Dashboards and marketing templates | Large, domain-specific additions | Reject unless a later feature independently requires them |
| Main Studio free registry | Examples, blocks, themes | “MIT (Free)” plus Commons Clause restrictions ([license](https://shadcnstudio.com/license)) | Prefer upstream shadcn; if copied, record item ID/date, retain notice, and confirm the project accepts the restriction |
| Five standalone template repositories | Whole demo sites/dashboard | Each repository has a plain MIT file; example: [AdminCN license](https://github.com/shadcnstudio/shadcn-nextjs-admincn-admin-template-free/blob/dd1afd2f3a794ea9e746197de314f81d43670ea1/LICENSE.md) | None is recommended for initial Zenbu; preserve license if a later issue copies code |

## Zenbu component/section plan grounded in the audit

This is deliberately a component map, not a visual-style decision.

| Zenbu surface | Reliable primitive/source | Studio code disposition | Required Zenbu composition/contract |
| --- | --- | --- | --- |
| Site shell | Semantic `<header>`, `<nav>`, `<main>`, `<footer>`; upstream Button, Dropdown Menu or Sheet | **Reject** `navbar-component-01` and `footer-component-01` unchanged | One route-data source for desktop/mobile links; localized labels; named icon links; Next links |
| Locale selector | Upstream shadcn Native Select + next-intl navigation | **Adapt pattern only** from `select-01`; **reject** `dashboard-dropdown-01` logic | English/Japanese options; preserve equivalent route/query; announce current locale |
| Dictionary search form | Native GET `<form role="search">`; upstream Field, Input Group, Input, Button | **Adapt interaction only** from `input-36`; **reject** fake `input-39` loading | `name="search"`, submit-first behavior, translated label, submit button, optional clear button with `type="button"`, real pending state |
| Best/Additional groups | Semantic `<section>` + heading + `<ol>/<li>`; upstream Item, Badge, Separator | No suitable free Studio block/component | Stable JMdict ID keys; whole-row exact-entry link; reading, gloss, status badges; no data table |
| Result row | Upstream Item/Badge/Button building blocks | Do not use generic Card variants as the data model | Exact public URL, app parity fields/order, visible focus, no nested links |
| Exact-entry identity | Headings, pronunciation/readings list, upstream Badge and audio/share Buttons | No suitable Studio page | Japanese headword + reading + JMdict ID identity; share/copy affordance; server-rendered content |
| Senses/facts | Semantic ordered list and `<dl>`; upstream Separator, optional Card for a bounded fact cluster | `card-09` is only a style demo; **reference only** | Preserve sense order/labels; do not flatten dictionary structure into generic cards |
| Examples/related entries | Semantic lists; upstream Item/Separator | No suitable free Studio block | Entry-associated destinations and attribution; stable links |
| Loading | Upstream Skeleton/Spinner; container `aria-busy` | Do not use `input-39` timer | Driven by actual navigation/retrieval state; retain page context |
| Zero results | Upstream Empty primitive or a semantic section | **Reject** `empty-state-01` copy/layout unchanged | Query echoed safely; spelling/input guidance; `noindex` contract from #280 |
| Retrieval failure | Upstream Alert + retry Button | **Adapt** `alert-14`/`alert-17` primitive shape, replace all copy | Distinguish failure from zero results; accessible retry and status messaging |
| Missing enrichment | Plain explanatory text/omission; optional muted Alert | No Studio state maps correctly | Core JMdict entry remains usable; missing example/frequency is not a fatal error |
| Pagination | Upstream Pagination | **Adapt** `pagination-01` only | Real query URLs, correct `aria-current`, localized previous/next, canonical policy |
| Breadcrumbs | Upstream Breadcrumb | **Adapt** `breadcrumb-01` only | Real localized routes; current entry name; Next links |
| About/source page | Typography, sections, links, Separator; Accordion only for genuine FAQ content | **Reject** `about-page-06` and `about-us-page-01` as baselines | Zenbu purpose, app links, data-source/license attribution, contact/support destinations |
| Legal pages | Typography, headings, lists, links, Separator | No relevant Studio template | Content-first legal document layout; no marketing template dependency |

### Smallest justified prototype set

Install the upstream shadcn primitives required for one real user journey, not the Studio template catalog:

1. `button`, `input-group`, `field`/`label`, `native-select`
2. `item`, `badge`, `separator`
3. `alert`, `empty`, `skeleton`/`spinner`
4. `breadcrumb`; add `pagination` only when results actually paginate
5. `dropdown-menu` or `sheet` only if the approved responsive shell needs it

The Studio candidates worth keeping open beside the implementation are:

- `input-36` — clear/focus interaction reference, after adding explicit button type and Zenbu form state
- `select-01` — native selector composition reference
- `alert-14` and `alert-17` — alert composition references
- `pagination-01` and `breadcrumb-01` — structure references with all placeholder URLs/content replaced
- `button-31` — accessible-name pattern for an icon-only share/bookmark-style action

Nothing in that list should be copied without an adjacent Zenbu component or journey test. The result-row and exact-entry sections are domain components; forcing a generic Studio block onto them would create more custom repair work than composing upstream primitives.

## Recommended acceptance checks for any copied item

1. Record Studio item ID, registry URL, audit/install date, and license notice in the change.
2. Review the generated payload before running the add command; reject unexpected dependencies or primitive-family mixing.
3. Replace all demo content, `href="#"`, array-index keys, and fake timers.
4. Keep indexed content server-rendered; isolate only actual interactions behind `use client`.
5. Test keyboard navigation, visible focus, accessible names, loading announcement, zero/failure differentiation, and 320 px layout.
6. Run automated accessibility and contrast checks for both locales and themes.
7. Add a component/journey test tied to the real Zenbu contract, not a snapshot of demo markup.

## Decisions that genuinely remain

The catalog audit removes the need for broad visual questions. Only these adoption decisions remain for #290:

1. **Foundation:** approve upstream shadcn/ui primitives as the website control foundation, with Shadcn Studio treated as a reviewed example catalog rather than the source of a full site/template. **Recommendation: approve.**
2. **Studio license boundary:** either avoid main-registry Studio code for MVP, or accept the MIT-plus-Commons-Clause restriction and preserve provenance/notices. **Recommendation: avoid main-registry code unless one of the six named snippets materially saves work; prefer upstream equivalents.**
3. **Primitive family:** choose one shadcn primitive family/style during scaffold and prevent accidental Radix/Base UI mixing. **Recommendation: let #277 select the current official shadcn default after a tiny dependency/build proof, then lock it in `components.json`.**
4. **Future templates:** do not import Zolt, Ink, Track, Bistro, or AdminCN now; allow the future Blog issue to separately evaluate Ink against the actual blog requirements. **Recommendation: approve.**

These are architecture/adoption gates. Actual layout and visual hierarchy should be decided only after the real app dictionary sections and the approved primitives are rendered together in the smallest prototype journey.

## Owner decisions recorded

### 2026-09-05 — Figma prototype workflow approved

**Superseded later on 2026-09-05.** The owner initially approved using the Shadcn Studio Figma UI Kit as a component-aligned prototype workspace, then chose a simpler official-shadcn-only starting policy below. Do not establish a Shadcn Studio or alternate Figma-kit dependency for the initial website.

This is a reversible workflow choice and does not warrant an ADR.

### 2026-09-05 — Official shadcn-only initial UI policy approved

- Official [shadcn/ui](https://ui.shadcn.com/) is the default web UI code source.
- Prefer official components and applicable official blocks over hand-rolling equivalent controls or established interaction patterns.
- Keep the initial design deliberately simple.
- Do not adopt the Obra community Figma kit for the initial workflow.
- Do not retain Shadcn Studio as an initial dependency or inspiration track.
- Any outside component requires an individual source/dependency/accessibility/maintenance review **and** relevant automated tests before acceptance.
- Zenbu-specific dictionary composition remains necessary where no official component or block models the domain, but it should be assembled from official primitives wherever possible.

This policy does not claim that official blocks are drop-in Zenbu pages. Demo content, routes, state, and server/client boundaries still require review against the real Zenbu journey.

### 2026-09-05 — Lightweight Figma designs before code

Create deliberately lightweight designs before implementation using a free community Figma kit listed by the official [shadcn/ui Figma documentation](https://ui.shadcn.com/docs/figma). Do not use the previously proposed Obra kit or Shadcn Studio kit. Select the exact free kit only after checking that its components, variables, and chosen shadcn style align with the scaffold configuration.

The Figma work should establish page sections, component choices, hierarchy, and responsive intent without manufacturing a large independent design system or treating generated code as approved implementation.

### Verified Zenbu brand and theme evidence

- The owner-supplied `/Users/devin/Desktop/zenbu-icon-pack-complete.zip` and tracked `apps/ios/Brand/zenbu-icon-pack-complete.zip` are byte-identical: SHA-256 `aba6ff0e313298d4bef0e2b00a265eb9892a41ad1816e6eb95f4d02e823a3b8f`.
- The tracked pack already contains the recommended responsive website SVG, favicons, PWA assets, social exports, and manifest examples.
- Its explicit brand colors are red `#BC002D`, charcoal `#202020`, and white `#FFFFFF`.
- `apps/ios/Modules/Sources/SearchExperience/ZenbuTheme.swift` defines separate light/dark Display P3 evidence colors for radical selection, OCR recognition, stroke progress, and pitch downstep.
- Those iOS evidence colors are domain visualization roles, not general website brand/action tokens. They should appear on the web only for the equivalent evidence and after contrast verification.
- No shared web theme/token source exists yet because `apps/web` has not been scaffolded. The first light Figma designs should use official shadcn semantic roles with the verified Zenbu brand colors, while leaving permanent token calibration to the reviewed prototype.

### 2026-09-05 — Brand and interaction color roles

Zenbu red remains the primary **brand identity** color, but it is not the default interactive-action color. The iPhone app deliberately relies mainly on the platform's blue accent for ordinary actions and links because red buttons can read as danger. The website should preserve that semantic distinction:

- Zenbu red `#BC002D`: logo, identity, and restrained brand accents;
- accessible blue, exact value still to be selected and contrast-tested: primary actions, links, selection, and focus;
- destructive/error red: a separate semantic token rather than the brand color;
- pitch, OCR, radical-selection, and stroke-progress colors: separate evidence tokens used only for equivalent domain evidence.

The current iOS asset catalog contains no custom app-wide accent color, and the Search Experience uses system semantics and `Color.accentColor` for ordinary selected/link treatment. Do not infer a custom cross-platform blue hex from that behavior; choose the web value through the light-theme design and contrast checks.

### 2026-09-05 — Compatibility-first theme and Figma path

The owner delegated the remaining theme/tool choice to the path with the greatest compatibility and functionality and the least custom effort.

- Use official [shadcn Create](https://ui.shadcn.com/create) to generate the Next.js preset rather than manually constructing a theme framework.
- Keep the standard `components.json` plus `apps/web/app/globals.css` CSS-variable architecture with `cssVariables: true`; do not create a separate `theme.ts` or custom theming runtime.
- Use the current official shadcn default primitive family selected by Create and lock it in `components.json`; do not mix primitive families.
- Start with neutral semantic surfaces and the generated official blue theme for interactive `primary`/focus roles.
- Add only the verified Zenbu red as a separate `brand`/`brand-foreground` token initially; do not map it to `primary` or `destructive`.
- Retain the generated dark-token block for structural compatibility, but do not add a theme switch or require dark-mode design in the first pass.
- Use the free shadcncraft Figma Starter Kit for lightweight pre-code mockups because the official shadcn Figma directory lists it and it supports shadcn styles/Create-preset import. Use its Figma assets only; its React code remains outside the approved official-shadcn source boundary.
- Validate rendered contrast and component behavior; the generated preset is a starting configuration, not an accessibility waiver.

This resolves the initial Figma-kit, theme-storage, palette-source, and Apple-versus-Tailwind questions. Apple remains semantic inspiration only; Tailwind/shadcn-generated web tokens are the implementation source.

### Official shadcn documentation follow-up

The owner supplied exact official references for [Create](https://ui.shadcn.com/create), [Theming](https://ui.shadcn.com/docs/theming), [Typeset](https://ui.shadcn.com/docs/typeset), and [Skills](https://ui.shadcn.com/docs/skills). Their current guidance establishes:

- `components.json` is required when using the CLI and locks choices such as style, base color, CSS-variable mode, aliases, and primitive family.
- A standalone Next.js app normally points `components.json` to `app/globals.css`.
- The official shadcn monorepo structure instead uses both `apps/web/components.json` and `packages/ui/components.json`, with shared primitives and `packages/ui/src/styles/globals.css` exposed through `@workspace/ui`.
- The `--monorepo` New Project command creates a new Turborepo with web and UI workspaces. It must not be run blindly at the root of Zenbu's existing monorepo.
- The owner-created preset `b1PzeK` currently represents Nova, Neutral base, Blue theme, Base UI, Inter, Lucide, default radius, pointer cursors, and the monorepo option. The theme payload includes both `:root` and `.dark` semantic OKLCH values.
- shadcn Typeset is one owned CSS file for plain HTML/rendered Markdown. It inherits the main theme and is a good candidate for About, Legal, Blog, Resources, and other prose surfaces, but not a replacement for structured dictionary result/entry components.
- The official shadcn agent skill should be installed only as part of the configured web workspace, after `components.json` exists, so it can read actual project configuration with `shadcn info --json`.

The theme-file location is therefore conditional until #277 resolves whether Zenbu adds the official `packages/ui`/Turborepo workspace or keeps shadcn local to `apps/web`. The compatibility/effort recommendation is the standalone app initially; extract shared web UI only when a second consumer exists. This avoids a repository-wide JavaScript workspace change for one web app.

### 2026-09-05 — Minimal JavaScript workspace approved

Resolve #277 with a minimal pnpm workspace for the website, not shadcn's generated full Turborepo template:

- keep `apps/ios` in place and outside JavaScript tooling;
- add `apps/web` as the only initial JavaScript application;
- keep shadcn components, `components.json`, and theme CSS local to `apps/web`;
- add only the minimal root pnpm workspace/lockfile configuration needed to install and operate `apps/web` consistently;
- do not add Turborepo or `packages/ui` until another real JavaScript consumer or measured task-orchestration need exists;
- retain preset `b1PzeK` as the selected visual/component preset, but initialize it against the existing `apps/web` project rather than running its New Project `--monorepo` command at the Zenbu root.

This is deliberately reversible. Shared domain/data contracts may still be introduced later under their own approved issue; that does not require prematurely extracting the website's UI components.

### 2026-09-05 — Figma-library status and simplicity references

No Figma library or design file has been created yet. The free shadcncraft Starter Kit remains only the current candidate for component-aligned mockups; its free offering must not be described as a complete page-template library.

The owner defined “simple” through Recall and Kanjikana examples: a minimal, conventional, content-first website with compact expected navigation, bounded readable content, light neutral surfaces, restrained blue interaction, thin borders, generous whitespace, and little decorative chrome. These are degree-of-simplicity references, not designs to copy. The first frames should assemble the site shell, dictionary landing, submitted results, exact entry, and one prose layout from official shadcn-shaped components, with Zenbu-specific hierarchy supplied by the app/web dictionary contract.

### 2026-09-05 — Simplicity as an execution priority

The owner is explicitly optimizing for getting content online through a fast, functional, responsive, minimal, low-bug website—not for investing in an elaborate visual identity or design process. Use official defaults and conventional composition as the answer whenever they satisfy the requirement. Figma, theming, custom styling, motion, and layout experimentation must remain subordinate to delivery and should not become independent workstreams.

The shadcncraft Figma kit is therefore optional rather than required. The smallest pre-code structural check is preferable to a multi-page polished mockup set, and useful implementation should not wait for cosmetic decisions.

### 2026-09-05 — Figma MCP trial

A fresh [`Zenbu Japanese Website V1`](https://www.figma.com/design/p7tBaTcDh3VTbxItGG0zLM) file was created in the `SERP 2025` Starter team. The connector exposed no current shadcn-specific library, but Figma's `Simple Design System` provided sufficient generic Header, Footer, Search, Button, Input, Select, Navigation, Card, Notification, variable, spacing, radius, and text-style assets for a structural mockup.

The Starter team reached its MCP call limit before the first component instance could be imported, leaving the new file blank. No paid upgrade was authorized or purchased, and the unrelated legacy `shadcnblocks` file was excluded. Treat this as evidence that Figma may add more process/cost than value for the minimal V1 unless the quota resets or an existing suitable library becomes directly accessible.

The owner subsequently supplied a separate, current September 2026 shadcn community file. Authenticated browser access made the editable local component library available without using the unrelated legacy file. A new isolated `Zenbu Website V1` page was added and three desktop frames were completed from linked shadcn Button, Input Group, Item, and Badge instances plus the kit's Tailwind variables and text styles. See the [component-plan report](issue-290-website-design-references-and-component-plan.md#browser-workaround-and-completed-first-pass) for exact frame links and validation evidence.
