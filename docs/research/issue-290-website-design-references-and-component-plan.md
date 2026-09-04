# Issue #290: website design references and component plan

Status: initial hypothesis set; broad visual and layout recommendations are not owner-approved and are superseded as the immediate decision input by the component-first Shadcn Studio audit

Issue: [#290](https://github.com/serpcompany/zenbujapanese-monorepo/issues/290)

Parent: [#271](https://github.com/serpcompany/zenbujapanese-monorepo/issues/271)

Evidence baseline: `issue-271-website-dictionary-plan` at `485b3a63f40377d425e35186daa6c38305f3ae3e`

## Answer first

> Owner correction (2026-09-05): the recommendations in this section are hypotheses from the initial research pass, not accepted design decisions. Issue #290 now starts from the audited component/section/template inventory in [`issue-290-shadcn-studio-free-library-code-audit.md`](issue-290-shadcn-studio-free-library-code-audit.md), followed by Figma prototypes using real Zenbu content. Visual and layout choices will be made from those prototypes rather than assumed here.

> Later owner decision (2026-09-05): skip the proposed Figma-kit and Shadcn Studio workflows for the initial website. Use official shadcn/ui components and applicable official blocks as the default source, avoid hand-rolling established controls where possible, keep the first design simple, and require individual review plus relevant tests for any outside component.

> Clarification (2026-09-05): “skip” applies to the proposed Obra and Shadcn Studio kits, not all Figma work. Create lightweight designs before code using a suitable free community kit listed by official shadcn/ui documentation; the exact kit remains to be selected after compatibility inspection.

> Color-role correction (2026-09-05): Zenbu red is the main brand identity color, not the ordinary action color. Match the app's semantic direction by using blue for normal actions, links, selection, and focus; keep destructive/error red and purpose-specific learning-evidence colors separate. The exact web blue remains to be selected and contrast-tested.

> Compatibility-first resolution (2026-09-05): use official shadcn Create's current Next.js/default-family preset, neutral semantic surfaces, and generated blue interaction theme through standard `components.json` and `apps/web/app/globals.css`. Add Zenbu red only as a separate brand token initially. Retain generated dark tokens without designing or exposing a theme switch in the first pass. Use the free shadcncraft Figma Starter Kit for lightweight pre-code mockups only; do not use its React code.

> Figma status clarification (2026-09-05): no Figma file or library has been created or used yet. The free shadcncraft Starter Kit is only the current candidate because official shadcn documentation lists it and it supports shadcn/Create-aligned variables. Its free surface is primarily a component kit with a small set of blocks, not a complete free page-template system. Do not imply that page templates have already been selected.

> Owner definition of “simple” (2026-09-05): begin with a very minimal, familiar website containing the elements people ordinarily expect. Recall and Kanjikana are simplicity references only, not visual templates to copy.

### Owner-supplied simplicity references

The owner supplied current Recall and Kanjikana pages to establish the intended degree of restraint rather than a brand or layout to reproduce.

Observed qualities to carry into the first Zenbu mockups:

- compact, conventional header rather than an application dashboard shell;
- centered, bounded content width and generous whitespace;
- light neutral/white surfaces with dark readable text;
- blue reserved for clear actions and links;
- thin borders and separators before shadows or ornamental effects;
- plain section headings, lists, grids, and definition/fact groupings;
- cards only when repeated content is genuinely a card-like unit;
- expected footer/navigation/legal patterns without novelty;
- minimal animation and decorative chrome;
- responsive stacking driven by content rather than a separate mobile visual concept.

Reference boundaries:

- Recall's landing and public deck pages demonstrate sparse navigation, restrained blue calls to action, bounded prose, simple fact rows, and repeated learning cards.
- Kanjikana demonstrates a compact learning-tool header, search and locale/theme controls, simple content grids/lists, and content-first Japanese detail pages.
- Do not copy their logos, typography, marketing content, illustrations, navigation inventory, grids, monetization patterns, or precise page composition.
- Zenbu's actual sections and hierarchy still come from its approved app/web dictionary contract and real app content.

### Initial minimal page-frame inventory

The first Figma work should use the selected shadcn-compatible component kit to assemble only conventional frames:

1. **Site shell:** Zenbu identity, essential navigation, locale control, main landmark, and expected footer.
2. **Dictionary landing:** page identity, one submit-first search form, short usage guidance, and no speculative feature dashboard.
3. **Submitted results:** retained query, explicit Best/Additional groups, simple exact-entry links, and defined status states.
4. **Exact entry:** exact identity, reading/pronunciation actions, ordered public dictionary sections, and examples/relationships where present; layout remains a prototype question rather than an assumed two-column rule.
5. **Prose frame:** one Typeset-backed readable content container for About/Legal/Resources-like content.

Use official shadcn primitives and applicable official blocks inside these frames. Composing Zenbu's domain-specific result and entry sections is necessary; hand-building replacement controls is not.

### Simplicity is a delivery constraint, not a visual-design project

The owner clarified that the references are not invitations to develop an elaborate style. The goal is to avoid spending substantial time, energy, or thought on distinctive presentation before the site has useful content.

Prioritize, in order:

1. functional public content and navigation;
2. fast loading and server-renderable output;
3. responsive behavior from conventional document flow;
4. accessible native semantics and official shadcn controls;
5. low defect surface and straightforward browser QA;
6. restrained, recognizable Zenbu branding;
7. visual customization only where a real requirement remains unmet.

Default implementation posture:

- use shadcn's generated defaults and semantic tokens;
- prefer ordinary document flow, headings, lists, links, forms, and bounded containers;
- minimize bespoke CSS, animation, layout modes, component variants, and dependencies;
- do not make Figma, theming, or a design system an independent project;
- do not block useful content on visual polish;
- add complexity only in response to a demonstrated content, usability, accessibility, or product requirement.

The Figma-kit candidate is optional tooling, not a required dependency or deliverable. Any pre-code design work should be the smallest structural check needed to prevent obvious rework.

### Figma trial result

On 2026-09-05, a fresh [`Zenbu Japanese Website V1`](https://www.figma.com/design/p7tBaTcDh3VTbxItGG0zLM) design file was created in the owner's `SERP 2025` Starter team to test the out-of-box component workflow.

Discovery established:

- no current shadcn/shadcncraft library was available to add through the connected Figma library inventory;
- Figma's maintained `Simple Design System` was already available and included component sets for Header, Footer, Search, Button, Input, Select, Navigation, Card, and Notification;
- it also exposed semantic color variables, blue primitives, spacing/radius variables, and heading/body text styles;
- the available components could support a minimal structural mockup, but they would be Figma-only stand-ins for official shadcn code rather than one-to-one design/code components;
- the Starter plan reached its MCP call limit before the first component instance could be imported or any canvas content created;
- the desktop upgrade prompt advertised a ¥2,400/month Professional Full seat with 200 MCP calls per day.

No upgrade was purchased and no old `shadcnblocks` file was used. The fresh file remains blank. Because design is explicitly subordinate to delivery, do not pay for or wait indefinitely on Figma merely to produce low-fidelity frames that can be validated more reliably in the browser.

#### Browser workaround and completed first pass

The owner supplied a separate, current September 2026 shadcn community file and asked whether it could be used through the authenticated browser. That route succeeded and supersedes the blocked blank-file experiment above.

Source/design file: [shadcn/ui components with variables and Tailwind classes — September 2026](https://www.figma.com/design/5IgA60ZAyhIh97skZt6cnv/shadcn-ui-components-with-variables---Tailwind-classes---Updated-September-2026--Community-?node-id=4003-2&p=f)

A new isolated page named `Zenbu Website V1` was added inside the editable community-file copy. The existing component, example, block, variable, style, and icon pages were not modified.

Completed frames:

- [`01 Dictionary Landing`](https://www.figma.com/design/5IgA60ZAyhIh97skZt6cnv/shadcn-ui-components-with-variables---Tailwind-classes---Updated-September-2026--Community-?node-id=4005-18445&p=f)
- [`02 Search Results — hello`](https://www.figma.com/design/5IgA60ZAyhIh97skZt6cnv/shadcn-ui-components-with-variables---Tailwind-classes---Updated-September-2026--Community-?node-id=4005-18446&p=f)
- [`03 Exact Entry — 今日は`](https://www.figma.com/design/5IgA60ZAyhIh97skZt6cnv/shadcn-ui-components-with-variables---Tailwind-classes---Updated-September-2026--Community-?node-id=4005-18447&p=f)

The first pass intentionally uses:

- a compact expected header and footer;
- one task-focused landing search;
- explicit Best Matches and Additional Matches groups;
- one content-first exact-entry column;
- linked shadcn Button, Input Group, Item, and Badge instances;
- the kit's Tailwind/shadcn variables and spacing;
- Inter for Latin text and verified Noto Sans JP for Japanese text;
- real representative Zenbu/JMdict fixture content;
- no hero art, dashboard, marketing blocks, animation, or speculative product features.

Validation confirmed all three frames are 1280×900, contain the expected Header/Content/Footer structure, retain linked component instances, contain no unfinished placeholders, and have no Japanese text left on the Inter family. Mobile/responsive frames remain intentionally uncreated until the owner reviews whether this degree of simplicity is correct.

Zenbu's website should feel like a calm, fast reference tool with one unmistakable Zenbu signature: the existing red `全` mark. It should preserve the iPhone app's information hierarchy and learner-visible states without copying either the old red-chrome iPhone UI or Takoboto's dense desktop shell.

The recommended V1 direction is:

- neutral, reading-first surfaces with restrained `#BC002D` brand accents;
- system-first typography so Japanese remains clear and the first load does not carry a large CJK webfont;
- one submitted-results column on every viewport, rather than a desktop master-detail pane;
- a richer two-column *entry layout* on wide screens, with the lexical content in the main column and compact entry facts/navigation in an aside;
- a single-column mobile layout preserving the app's content order;
- semantic HTML and ordinary links as the core of result and entry composition;
- shadcn/ui primitives for controls and state patterns, with only a small number of Shadcn Studio variants considered individually;
- both light and dark theme tokens prepared before implementation, with system preference as the initial default;
- no wholesale Shadcn Studio page, theme, or application-shell import.

The smallest useful design prototype after `apps/web` exists is one responsive path using frozen representative data:

```text
/dictionary/
  -> submit hello
/dictionary/?search=hello
  -> open a result
/dictionary/今日は-1000940
```

It should also switch between unprefixed English and `/ja`, and demonstrate no-results, retrieval-failure, and missing-enrichment states. That prototype can settle density, entry-column behavior, theme, and navigation without choosing dictionary storage.

## Scope and evidence limits

This report is a design-decision input. It does not scaffold `apps/web`, select dictionary storage, install components, change iOS, or approve final visual design.

Primary evidence used:

- the approved product and behavior contract in [`issue-276-app-web-dictionary-contract.md`](issue-276-app-web-dictionary-contract.md);
- the current iPhone Search and Word Detail implementations in [`SearchView.swift`](../../apps/ios/Modules/Sources/SearchExperience/SearchView.swift) and [`WordDetailView.swift`](../../apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift);
- current and historical retained screenshots under [`apps/ios/Verification`](../../apps/ios/Verification) and the App Store set under [`screenshots/app-store/en-US/iphone-67`](../../screenshots/app-store/en-US/iphone-67);
- the app-owned evidence colors in [`ZenbuTheme.swift`](../../apps/ios/Modules/Sources/SearchExperience/ZenbuTheme.swift);
- the production icon archive in [`apps/ios/Brand/zenbu-icon-pack-complete.zip`](../../apps/ios/Brand/zenbu-icon-pack-complete.zip);
- direct product pages for [Takoboto search](https://takoboto.jp/?q=hello), [Jisho search](https://jisho.org/search/hello), [Cambridge English-Japanese entry](https://dictionary.cambridge.org/dictionary/english-japanese/hello), [LingoDeer English](https://www.lingodeer.com/), and [LingoDeer Spanish](https://www.lingodeer.com/es);
- first-party [Shadcn Studio component documentation](https://shadcnstudio.com/components), [CLI/registry documentation](https://shadcnstudio.com/docs/getting-started/how-to-use-shadcn-cli), and [license page](https://shadcnstudio.com/license);
- official [shadcn/ui theming](https://ui.shadcn.com/docs/theming), [Tailwind theme-variable](https://tailwindcss.com/docs/theme) and [compatibility](https://tailwindcss.com/docs/compatibility) documentation;
- official [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) and [font optimization](https://nextjs.org/docs/app/getting-started/fonts) guidance;
- W3C guidance for [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [minimum target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [focus visibility](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), and [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

Reference screenshots are point-in-time visual evidence. Product pages may change. Takoboto, Jisho, Cambridge, and LingoDeer are useful for particular questions, not complete templates for Zenbu.

## Existing Zenbu design evidence

### Brand assets

The icon archive identifies:

- primary red: `#BC002D`;
- flat-vector colors: `#BC002D`, `#202020`, and `#FFFFFF`;
- `vector/zenbu-icon-flat-vector.svg` as the recommended responsive website artwork;
- ready-made favicon, PWA, avatar, Open Graph, and social-card exports;
- an explicit warning that the auto-vectorized master should receive designer review before large-format print, trademark filing, or permanent master-logo adoption.

The website should reuse the supplied flat vector and web exports. It should not redraw the logo, extract a new red from a screenshot, or use the detailed app icon as a large full-width decorative background.

### Current iPhone visual direction

The most recent native-chrome evidence is materially quieter than the older App Store screenshots. The current direction uses:

- system backgrounds and text hierarchy;
- large, readable Japanese headwords;
- short section labels and ordered meanings;
- list separators instead of a card around every fact;
- native focus, loading, no-result, and error semantics;
- restrained rounded surfaces for search, pitch, and compact controls;
- red for selected navigation or specific evidence, not for every surface.

`ZenbuTheme.swift` is explicit that ordinary surfaces, text hierarchy, controls, and feedback use system semantics. Its app-owned coral/red values communicate distinct evidence roles such as pitch downstep, OCR recognition, radical selection, or stroke progress. The website must not repurpose `ZenbuTheme.pitchDownstep` as a generic button or link color; brand red and evidence red need separate semantic tokens even if they are visually related.

The historical App Store Search and Word Detail screenshots use a broad red top bar and older tab/navigation treatment. They remain useful evidence for content density, but the newer native-chrome screenshots are the stronger visual authority for the current product direction.

### Current content hierarchy

The current Search surface distinguishes:

1. search input;
2. loading, no-results, and retrieval-failure states;
3. example-sentence access when available;
4. an optional Japanese reading refinement;
5. Discovered Words when that presentation is active;
6. Dictionary Best Matches;
7. Additional Matches;
8. per-result headword, reading, summary, and frequency evidence.

The current Word Detail surface orders public and private material approximately as:

1. identity and pronunciation;
2. classification and frequency;
3. alternative forms;
4. ordered meanings and source notes;
5. kanji and relationships;
6. learner notes and Encounter Media;
7. entry-associated examples.

Public web composition should preserve the public lexical order while omitting private learner notes, saved state, Encounter Media, history, and session content.

## Recommended visual system

### Visual direction

Use a **quiet reference surface with a strong Zenbu stamp**:

- the `全` mark and brand red establish identity in the header, favicon, focus/active states, and primary action;
- the dictionary itself is predominantly neutral so Japanese text, readings, senses, and examples carry the visual weight;
- evidence colors are semantic and local, never decoration;
- borders and spacing organize information before shadows and cards;
- the design should feel trustworthy enough for reference use and friendly enough for learners, without mascot-heavy or gamified chrome on dictionary pages.

### Proposed semantic token direction

These are prototype values, not an approved permanent palette.

| Token role | Light proposal | Dark proposal | Reason |
| --- | --- | --- | --- |
| Brand primary | `#BC002D` | accessible lighter derivative to be measured | Exact icon-pack red is the existing brand anchor. The same red must not be assumed accessible on a dark surface without measurement. |
| Brand charcoal | `#202020` | near-white foreground | Exact flat-vector charcoal; useful for wordmark/art, not a replacement for all semantic foreground tokens. |
| Page background | white or very light neutral | near-black neutral | Matches current system-first iPhone direction and maximizes reading comfort. |
| Surface | subtle neutral step above/below page | subtle dark neutral step | Search controls, compact facts, and bounded state messages. |
| Border | low-contrast neutral with tested separation | low-contrast light neutral | Prefer structural borders over elevation. |
| Muted text | WCAG-tested neutral | WCAG-tested light neutral | Readings, source notes, qualifiers; must not become too faint. |
| Evidence: pitch | port the semantic role, not blindly the RGB value | port the semantic role | The current app owns a separate pitch-downstep role. |
| Destructive/error | separate semantic destructive token | separate semantic destructive token | Do not use brand red alone to imply failure. |

Use shadcn/Tailwind semantic variables (`background`, `foreground`, `card`, `muted`, `border`, `primary`, `ring`, `destructive`) as the web interface. Keep additional Zenbu-owned variables for evidence roles such as pitch. This follows shadcn's CSS-variable model while protecting the domain distinction already present in `ZenbuTheme`.

### Typography

- Start with a system-first sans stack. It aligns with the current iPhone direction and avoids loading a large Japanese webfont before useful text.
- Give Japanese headwords their own responsive type scale and generous line height; do not fake emphasis with extreme font weight.
- Keep readings visually subordinate but always readable; furigana/ruby must survive zoom and reflow.
- Use tabular/monospaced digits only for frequency ranks and other compact numeric evidence, following the app's treatment.
- If a later brand review chooses a hosted Japanese face such as Noto Sans JP, measure the actual font payload, rendering, and layout shift before adoption. Next.js font tooling can optimize a selected font, but it does not make an unbounded CJK payload free.

### Spacing, shape, elevation, icons, and motion

| Area | Recommendation |
| --- | --- |
| Spacing | 4px base rhythm; 16px mobile page inset; 24-32px desktop inset; 24-40px between entry sections depending on hierarchy. |
| Radius | 8-12px for controls and bounded messages; full pill only for compact badges/pitch; avoid rounding every content section. |
| Elevation | Borders first. Use shadow only for menus, sheets, sticky overlays, or a clearly raised desktop aside. |
| Icons | Use one web icon family, likely Lucide through shadcn. Pair unfamiliar icons with text or an accessible name. Do not copy SF Symbols by appearance. |
| Targets | Preserve at least 44px practical pointer targets for primary controls, while meeting WCAG 2.2's formal minimum and spacing rules. |
| Motion | Short, functional transitions only. Respect reduced motion. Loading must remain understandable without shimmer or animation. |

### Light and dark mode

Recommendation: prepare and QA both light and dark semantic tokens at launch, defaulting to system preference. A visible theme switch can be deferred if scope requires it, but the token contract should not assume a light-only site because:

- the iPhone product already has retained light and dark evidence;
- shadcn/Tailwind theming is cheapest to establish before many copied components exist;
- retrofitting dark mode after large entry, results, and legal surfaces exist is a predictable source of contrast drift.

This remains an owner decision. If dark mode is deferred, the implementation should still avoid literal white/black utility classes in feature components so the second theme does not require a rewrite.

## Responsive information architecture

### Site shell and home/static pages

**Desktop:** compact header with logo/wordmark, primary navigation, and a labeled language selector; centered content container; multi-column footer only when link inventory warrants it.

**Mobile:** logo/wordmark, one menu trigger, and a plainly labeled language control. Do not compress the entire desktop navigation into tiny inline links. A Sheet is appropriate for the navigation menu; the locale selector should remain reachable without scrolling a long menu.

**Static content:** one readable prose column with optional local table of contents. Legal/source disclosure must remain ordinary accessible text, not a modal-only experience.

### Dictionary landing

- One centered search task, not a marketing dashboard.
- Visible label/instruction that Japanese, romaji, or the localized edition's language is accepted.
- A text input plus visible Search button; Enter and the button submit the same form.
- A few honest example searches may appear below after content is approved.
- Camera, handwriting, radical search, voice input, and live suggestions are not implied by the first web design.

### Submitted results

Recommendation: **one results column in V1 across desktop, tablet, and mobile**.

Reasons:

- the approved URL is a durable submitted results page, and result clicks have their own exact entry routes;
- app/web parity is easiest to inspect when Best and Additional ordering remain one uninterrupted semantic list;
- it avoids a desktop-only state model for selection, browser history, canonical URLs, focus restoration, and direct entry visits;
- it avoids Takoboto's mobile behavior, where the desktop selected-entry pane disappears and the experience becomes a very long dense stream.

Desktop can use wider result rows with headword/reading on the left and summary/frequency on the right. Tablet and mobile stack those facts. Best Matches and Additional Matches remain explicit headings. The entire row can be a link, with a visible focus treatment and no nested competing links.

**Deferred option:** a two-pane results/selected-entry workspace may be reconsidered after exact entry pages are working. It would need evidence that it improves repeated comparison enough to justify URL, history, focus, and small-screen complexity.

### Exact entry

**Wide desktop:** use a two-column entry page, not a two-pane search workspace:

- main column: displayed headword, reading aids, ordered senses/notes, alternatives, relationships, examples, and later enrichments;
- aside: compact pronunciation/commonness/frequency/pitch facts and an in-page section index when long enough;
- both columns are one exact Public Dictionary Entry and one URL.

**Tablet:** collapse to one main column with compact facts below the identity block. A short sticky in-page navigation may be evaluated, but it must not hide content or trap focus.

**Mobile:** preserve the iPhone's reading order in one column. Use section headings and separators rather than a stack of nested cards. Pronunciation and share actions remain near identity. Private app sections do not appear.

### Locale presentation

- English stays unprefixed; Japanese uses `/ja`.
- The selector names languages in text (`English`, `日本語`), not flags.
- Switching edition should retain the corresponding entry or submitted query when that localized surface exists.
- When it does not exist, explain the fallback rather than silently showing a mixed or falsely translated page.
- Library-owned routing and remembered-choice behavior belongs to #278; the design owns labeling, placement, focus, and unavailable-state presentation.

## Page and state coverage

| Page/state | Desktop concept | Mobile concept | Required observable behavior |
| --- | --- | --- | --- |
| Home/shell | Compact header, focused value proposition, dictionary entry point, bounded content sections | Single-column content and menu Sheet | Header order, language selector, and navigation remain keyboard/touch reachable. |
| Dictionary idle | Centered search form and concise instructions | Search form near top with large targets | Enter and visible Search submit; no live full-results replacement. |
| Loading | Preserve submitted query; bounded status plus stable result-region footprint | Same; avoid full-screen spinner where possible | `aria-busy`/status announces search; focus remains predictable; reduced motion works. |
| One strong result | Best Matches heading and one exact entry link | Same, stacked row | It does not look like an editorial landing page or auto-open without a decision. |
| Many results | Best then Additional, one semantic ordered flow | Same with compact stacked rows | Identity, ordering, and grouping remain inspectable and equal to app contract. |
| No result | Neutral empty message with query and next action | Same | Distinct from failure; no misleading “rare” or empty success styling. |
| Retrieval failure | Error message and Retry action | Same | Retry is a real control; status is not communicated by red alone. |
| Weak-only result | Results may be shown if product contract permits, with non-indexable metadata handled elsewhere | Same | Presentation does not imply strong Match evidence. |
| Unsupported locale | Clear unavailable/fallback surface | Same | No false localized content; selector remains available. |
| Exact rich entry | Main lexical column plus facts/TOC aside | One-column app-derived order | Correct exact `ent_seq`, heading/readings/senses, share and internal navigation. |
| Exact sparse entry | Same structure with absent sections omitted or explicit no-evidence copy where required | Same | Core entry remains useful; absent, no-evidence, and unavailable remain distinct. |
| Missing enrichment | Local inline unavailable/no-evidence treatment | Same | One failed enrichment does not replace the whole entry with an error page. |
| Same spelling | Each `モール-{ent_seq}` page shows its exact record | Same | No meanings/examples leak across records; URL discriminator remains visible through destination. |
| Static About/source page | Prose column with source index and external-link indications | Same | Source links open in indicated new tabs and use approved relationship classes. |

## Reference adopt/adapt/defer/reject matrix

| Reference | Exact observed pattern | Zenbu page/state | Posture | Accessibility/responsive implications | Why only a partial fit / evidence |
| --- | --- | --- | --- | --- | --- |
| Current Zenbu iPhone Search | Search, examples, reading refinement, Best Matches, Additional Matches, typed empty/failure states | Landing/results | **Adopt behavior; adapt layout** | Preserve headings, order, status distinction, and large targets; browser submission replaces iOS interaction timing | Strongest product authority, but SwiftUI navigation and phone-width List are not web layouts. [`SearchView.swift`](../../apps/ios/Modules/Sources/SearchExperience/SearchView.swift) and current Search evidence. |
| Current Zenbu iPhone Word Detail | Large Japanese identity, reading/pitch, classification, alternatives, numbered senses, relationships, examples | Exact entry | **Adopt public hierarchy; adapt layout** | Preserve semantic reading order at 400% zoom; desktop aside must not reorder screen-reader content | Strongest content authority, but private notes/media and iOS controls are excluded. [`WordDetailView.swift`](../../apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift). |
| Zenbu icon pack | Red/charcoal/white `全` mark, flat web vector, favicon/social assets | Global shell/social | **Adopt** | Supply accessible wordmark text/alt treatment; do not rely on the logo alone to name the site | Brand evidence, not a complete UI palette. [`apps/ios/Brand`](../../apps/ios/Brand). |
| Older Zenbu App Store screens | Large red top chrome, clear Best/Additional grouping, dense entry hierarchy | Results/entry | **Adapt grouping; reject broad red chrome** | Large persistent saturated bars reduce reading calm and are not the current native direction | Useful historical content evidence only. [`screenshots/app-store/en-US/iphone-67`](../../screenshots/app-store/en-US/iphone-67). |
| [Takoboto](https://takoboto.jp/?q=hello) | Desktop master-detail: result list left, selected entry right; dense results; language and radical affordances | Results/entry | **Defer two-pane; adapt density lessons** | Mobile collapses to a long dense result stream; two-pane adds focus/history complexity | Strong example of rapid desktop comparison, but visual hierarchy, responsiveness, and selected-state model should not be copied wholesale. |
| [Jisho](https://jisho.org/search/hello) | One search accepts English/Japanese/romaji; word, sentence, and name groups; direct detail links | Landing/results | **Adopt broad-input clarity; adapt grouping** | Responsive page remains very dense; small auxiliary links and long streams need improved targets/hierarchy | Relevant Japanese lookup reference, but ranking/groups and exact entry behavior are Zenbu-owned. |
| [Cambridge](https://dictionary.cambridge.org/dictionary/english-japanese/hello) | Persistent labeled search, audio controls, clear dictionary heading, definition/example groupings, related links | Search/entry | **Adapt semantic sectioning and search control** | Strong heading/control semantics; page also contains substantial unrelated, ad, blog, and recommendation material | Polished responsive dictionary patterns, but it is an English-headword bilingual product and not Zenbu's Japanese-entry model. |
| [LingoDeer `/`](https://www.lingodeer.com/) and [`/es`](https://www.lingodeer.com/es) | Default English is unprefixed; Spanish uses `/es`; visible language menu; strong illustrated marketing brand | Shell/locales | **Adopt URL/selector evidence; reject visual imitation** | Language choice is visible, but flags/country metaphors should not replace language names | Useful locale-presentation reference only; its marketing density, yellow palette, and course structure do not answer dictionary design. |
| [shadcn/ui](https://ui.shadcn.com/docs) | Copy-owned semantic primitives with CSS-variable theming | Controls/state/shell | **Adopt primitives** | Primitive choice does not remove the need for labels, focus, status announcements, or browser QA | Good implementation base, not a Zenbu design system or finished page. |
| [Shadcn Studio](https://shadcnstudio.com/components) | Many copy-owned variants and complete blocks/pages/themes | Candidate controls | **Adapt a few; reject wholesale template/theme import** | Each copied variant needs accessible-name, target, contrast, reduced-motion, and responsive review | Useful accelerator, but examples contain unrelated content, style assumptions, and sometimes extra dependencies. |

## Feature-to-component plan

The design should begin from semantic page composition. A component exists because multiple page needs share one interaction or visual contract, not because a registry offers it.

| Need | Recommended construction | Reuse posture |
| --- | --- | --- |
| Site header | Custom Zenbu composition with logo/wordmark, ordinary links, Navigation Menu only if hierarchy needs it | shadcn primitive; Studio navigation candidate only after route inventory is final |
| Mobile navigation | Sheet with explicit menu label and focus restoration | shadcn Sheet primitive; custom content |
| Language selector | Labeled native Select initially; text language names | shadcn/native select or Studio `select-01` adapted; no flag picker |
| Dictionary search | Real GET `<form>` containing label, search input, visible submit button, and optional clear control | Custom composition from Input/Button; Studio `input-30` is a candidate starting layout |
| Best/Additional groups | `<section>` + heading + `<ol>` | Custom Zenbu composition; do not use Data Table |
| Result row | One exact entry Link containing reading, headword, summary, optional frequency | Custom Zenbu composition; Separator primitive as needed |
| Exact-entry identity | Semantic header with Japanese headword, reading aids, share/pronunciation actions | Custom Zenbu composition |
| Entry fact list | `<dl>` for compact labeled facts | Native markup; Studio `list-03` can be adapted |
| Ordered meanings | `<section>` + `<ol>` with notes attached to their sense | Custom Zenbu composition; no accordion by default because meanings are primary content |
| Commonness/POS/source labels | Neutral text or outline badges only when scanning benefits | shadcn Badge / Studio `badge-04` candidate |
| Loading | Stable layout plus text status and minimal skeletons | shadcn Skeleton; Studio `skeleton-02` candidate |
| No results | Custom ContentUnavailable-like composition with heading, query, and next action | Custom composition; not a destructive Alert |
| Retrieval failure | Alert plus Retry button | shadcn Alert/Button; Studio `alert-04` candidate |
| Missing enrichment | Local inline status in the affected section | Custom compact message; do not raise page-wide toast |
| Footer/source disclosure | Custom link groups and prose; Separator | Native links + shadcn Separator |
| External link | Ordinary anchor with external-link indication and accessible new-tab copy | Custom shared utility/presentation; `rel` follows approved relationship class |

## Shadcn Studio candidate inventory

### Registry verification method

Shadcn Studio's current CLI documentation says:

- `@shadcn-studio` exposes free components, blocks, and themes without authentication;
- `@ss-components`, `@ss-blocks`, `@ss-pages`, and `@ss-themes` include free and premium items, with premium access requiring email and license key;
- CLI v4 is the supported registry client;
- copied files become project source and are expected to be customized.

On 2026-09-05, each candidate below returned registry metadata anonymously from the public Base UI/Nova endpoint shown. This verifies current public/free availability, not permanent availability or final compatibility with the uncreated `apps/web` style configuration.

The [Shadcn Studio license page](https://shadcnstudio.com/license) labels free content “MIT (Free)” but also states a Commons Clause restriction against unmodified sale/redistribution and competing products. Treat that as its own published license, preserve required notices, and recheck the terms before copying. Zenbu is an end product rather than a component marketplace, but this research is not legal advice.

| Registry ID / evidence URL | Page need | Current dependencies | Access | Theme assumptions and Zenbu changes | Accessibility concerns | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| `@shadcn-studio/input-30` / [`input-30.json`](https://shadcnstudio.com/r/base-nova/input-30.json) | Submit-first dictionary search | registry: `button`, `input`, `label`; no extra npm dependency | Verified public/free | It is an email + Subscribe example. Replace semantics/copy with one GET search form, `type="search"`, query value, visible Search action, and Zenbu tokens. | Visible label/instructions; IME-safe entry; Enter and button identical; 44px practical targets; no live-search side effects. | **Adapt after prototype.** It is a useful grouped-field geometry, not drop-in product code. |
| `@shadcn-studio/select-01` / [`select-01.json`](https://shadcnstudio.com/r/base-nova/select-01.json) | English/日本語 selector | registry: `label`, `native-select`, `utils`; no extra npm dependency | Verified public/free | It is a gender example. Replace all options/copy; text names only; connect to #278 routing. | Native keyboard/touch behavior is a benefit; visible label; announce route change/fallback; preserve query/page when available. | **Adapt after locale prototype.** Prefer this native pattern over a complex country/flag combobox for two locales. |
| `@shadcn-studio/list-03` / [`list-03.json`](https://shadcnstudio.com/r/base-nova/list-03.json) | Entry classification/frequency/source facts | registry: `separator`; no extra npm dependency | Verified public/free | Retain `<dl>` semantics but replace settings-style sample data and control density. | Ensure labels/values remain associated and reflow vertically on narrow/zoomed layouts. | **Adapt selectively.** Do not use it for meanings or search results. |
| `@shadcn-studio/badge-04` / [`badge-04.json`](https://shadcnstudio.com/r/base-nova/badge-04.json) | Compact neutral evidence such as Common or POS | registry: `badge`; no extra npm dependency | Verified public/free | Outline style fits restrained surfaces; use semantic tokens and ordinary text when a badge adds no scan value. | Color cannot be the only meaning; avoid tiny text/targets; noninteractive badges must not look clickable. | **Install/adapt only if the prototype proves badges improve scanning.** |
| `@shadcn-studio/alert-04` / [`alert-04.json`](https://shadcnstudio.com/r/base-nova/alert-04.json) | Retrieval failure with Retry/support action | registry: `alert`, `button`; no extra npm dependency | Verified public/free | Replace generic linked alert with Zenbu failure copy and a real Retry button. Keep brand and destructive colors distinct. | `role="alert"` only when interruption is warranted; move/retain focus deliberately; communicate failure without color alone. | **Adapt.** Strong candidate for the explicit failure state, not no-results. |
| `@shadcn-studio/skeleton-02` / [`skeleton-02.json`](https://shadcnstudio.com/r/base-nova/skeleton-02.json) | Results/entry loading footprint | registry: `skeleton`; no extra npm dependency | Verified public/free | Shape it to actual result rows rather than generic two-column text. Avoid decorative over-animation. | Pair with a textual status and `aria-busy`; skeleton is hidden from assistive tech; respect reduced motion. | **Adapt sparingly.** Prefer stable server-rendered content where possible. |
| `@shadcn-studio/navigation-menu-01` / [`navigation-menu-01.json`](https://shadcnstudio.com/r/base-nova/navigation-menu-01.json) | Future desktop grouped navigation | registry: `navigation-menu`; no extra npm dependency | Verified public/free | Current route inventory may not justify a flyout. Replace sample content; pair with a separate mobile Sheet. | Full keyboard/focus/escape/hover QA; do not hide important destinations behind hover alone. | **Defer.** Start with ordinary links until the approved route inventory requires grouping. |
| `@shadcn-studio/card-09` / [`card-09.json`](https://shadcnstudio.com/r/base-nova/card-09.json) | Outlined content container | registry: `card`; no extra npm dependency | Verified public/free | Primary-border card conflicts with the recommended neutral, separator-led dictionary. | Repeated cards can create noisy landmarks and weak reading order; borders need contrast. | **Reject for result rows; defer for bounded marketing/static content.** |

### Theme and block recommendation

Do not initialize a Shadcn Studio theme or copy a complete page/application block for the dictionary prototype. The existing exact brand evidence is stronger than an unrelated theme preset, and dictionary search/results/entry composition is product-specific. Use the theme generator only as a temporary contrast/token exploration tool if helpful; the accepted output must be checked into Zenbu-owned semantic variables and reviewed independently.

No Pro/authenticated item is required for the initial design direction. If a later owner-selected Pro block is considered, record its exact registry ID, purchaser/license scope, terms, generated files, and dependency diff before installation.

## Accessibility and performance constraints

### Accessibility

- Use one `h1` per page task, then ordered section headings. Best Matches and Additional Matches are headings, not merely styled labels.
- Search is a real GET form. It has a visible label or instruction, not placeholder-only labeling.
- Loading, results count, no-results, and retrieval failure are distinct statuses. Announce asynchronous status changes without repeatedly moving focus.
- Every result row is reachable as one exact link. Avoid nested links/buttons inside a linked card.
- Keyboard order follows visual/reading order. Locale switching and mobile menu closing restore focus predictably.
- Visible focus indicators must survive light/dark themes and brand surfaces.
- Content reflows at 320 CSS px / 400% zoom without horizontal page scrolling; Japanese ruby and long English glosses must be exercised explicitly.
- Meet or exceed text contrast requirements. Muted notes and red-on-dark are the likely failure points.
- Practical primary touch targets should remain 44px even though WCAG 2.2's Target Size (Minimum) criterion allows smaller targets under defined spacing/exceptions.
- New-tab external links receive a visible external indication plus accessible wording. `rel` follows the approved trusted/sponsored/UGC/untrusted classification, not a blanket `nofollow`.
- Motion is not required to understand loading, selection, or navigation. Reduced-motion users receive instant or minimal transitions.
- English and Japanese documents/editions declare the correct page language; mixed-language runs retain correct pronunciation behavior where practical.

### Performance

- Keep page and dictionary content server-renderable; add Client Components only around interactive controls such as locale switching, Retry, or a future audio control.
- Do not ship a full Shadcn Studio page/template dependency graph to obtain one control layout.
- Use the supplied optimized logo/favicon/social assets. The flat SVG belongs in the header; the 4096px raster does not.
- Start system-font-first. If a Japanese webfont is approved, measure transfer size, subset behavior, first render, and layout shift.
- Reserve stable space for result and entry loading states to reduce layout shift.
- Avoid unbounded DOM results. Preserve the app-approved result limit/pagination contract when implementation reaches #282 rather than rendering hundreds of rows because the viewport is large.
- Validate real mobile and desktop Core Web Vitals in #284. Design QA should at least flag regressions in LCP, CLS, INP, transferred font/JS bytes, and server response behavior without turning #290 into a hosting decision.

## Learner journeys for future browser QA

| Journey | Browser-visible steps | Expected observable result | Viewports/states | Candidate design QA seam |
| --- | --- | --- | --- | --- |
| Landing to `hello` results | Open `/dictionary/`; focus Search; type `hello`; press Enter | URL becomes `?search=hello`; submitted query stays visible; Best/Additional groups and ordered exact links appear | Mobile, desktop; light/dark | Public route screenshot plus accessibility tree after submit; focus remains sensible and result group headings are present. |
| Result to exact entry | From `hello`, open `今日は-1000940` | Exact route loads the same headword/reading/first ordered sense; Back returns to submitted results | Mobile, desktop | Route, heading hierarchy, first identity/sense, browser history, and focus restoration. |
| Locale switch | On landing, submitted results, and exact entry, switch English ↔ 日本語 | Unprefixed English and `/ja` corresponding route/query are retained when available; unavailable translation is explicit | Mobile, desktop | URL, visible locale name, `lang`, retained `search`, and focus on the corresponding page. |
| Mobile inspect results | Search on a 320-390px viewport; scan Best and Additional; open an entry and Back | No horizontal page scroll; targets are usable; rows stack without losing headword-reading-summary association | Mobile, 200% and 400% zoom | Reflow, target size/spacing, result reading order, sticky-element overlap, and Back behavior. |
| Desktop inspect results and entry | Search at ≥1280px; open exact entry | Results remain one clear column; entry uses main + aside without changing semantic reading order | Desktop | Container width, line length, aside behavior, keyboard order, and no master-detail state ambiguity. |
| Keyboard-only journey | Tab to Search; submit; move through exact result links; use locale selector; open entry; traverse internal/external links | Every action works without pointer; visible focus never disappears; menus close and restore focus | Desktop light/dark | Tab/Shift+Tab/Enter/Escape sequence at public controls, not React internals. |
| No result versus failure | Submit approved zero-result fixture; separately simulate unavailable retrieval | Zero result gives neutral next action; failure gives distinct Retry; neither appears as successful results | Mobile, desktop | Status role/copy, Retry operability, focus, and visual distinction independent of color. |
| Same-spelling `モール` | Open at least two distinct `モール-{ent_seq}` result links | Each URL/page shows the correct distinct meaning and never borrows another entry's examples | Mobile, desktop | URL suffix, visible sense anchor, Back path, and accessible link names disambiguate destination. |
| Missing optional information | Open `どいたま` and simulate one enrichment unavailable | Core identity/senses stay usable; absent/no-evidence/unavailable states are not conflated | Mobile, desktop | No empty decorative section; local unavailable copy; page-level error is absent. |
| External source link | From About/source disclosure, reach a trusted source/license link | Visible external indicator; opens new tab; accessible name indicates behavior; relationship class is correct | Keyboard, screen reader, mobile | Anchor output (`target`, accessible text, `rel`) and visible indication through public markup. |
| Reduced motion | Repeat loading, menu, theme/locale transitions with reduced motion | No essential information depends on animation; no shimmer or large transition persists | Mobile, desktop | `prefers-reduced-motion` browser state and captured transition behavior. |

## Recommended observable design QA seams

These are later test/prototype boundaries, not tests to write under #290:

1. **Global shell seam:** route + viewport + locale + theme -> header, language selector, main landmark, footer, reading order, and overflow.
2. **Search form seam:** keyboard/touch submission -> stable query URL, retained field value, visible/announced loading, and resulting focus.
3. **Result-group seam:** controlled result presentation -> ordered group headings and one accessible exact link per result.
4. **Exact-entry seam:** controlled rich/sparse entry -> identity, reading aids, ordered public sections, aside collapse, and absence of private sections.
5. **Status seam:** idle/loading/no-result/failure/missing-enrichment -> distinct visible copy, roles, focus, and retry behavior.
6. **Locale seam:** current route/query + locale selection -> corresponding available URL, correct document language, and explicit unavailable fallback.
7. **Theme seam:** representative pages in light/dark/high contrast/reduced motion -> token contrast, focus, evidence distinction, and no unreadable literal colors.
8. **Reflow seam:** representative results/entry at 320px and 400% zoom -> no page-axis horizontal scroll, overlap, truncation of essential facts, or reordered semantics.
9. **External-link seam:** relationship class -> correct `rel`, visible new-tab indication, accessible name, and new-tab target.
10. **Performance seam:** production-shaped page -> bounded font/JS/image transfer, stable layout, and agreed Core Web Vital budgets in #284.

Prefer a small set of representative screenshots plus DOM/accessibility assertions over broad pixel snapshots of every route. A screenshot alone does not prove keyboard order, accessible names, target behavior, locale routing, or exact entry identity.

## Owner decisions required

1. **Visual direction:** approve, reject, or revise “quiet reference surface with a strong Zenbu stamp.”
2. **Theme launch:** approve both system-aware light and dark themes for launch, or declare dark mode deferred while retaining semantic-token readiness.
3. **Results layout:** approve one-column submitted results for V1 and defer Takoboto-style master-detail.
4. **Entry layout:** approve main + aside on wide desktop, collapsing to the app-derived single-column order on smaller viewports.
5. **Typography:** approve system-first fonts for V1, or name a required Latin/Japanese type family for measured evaluation.
6. **Brand red:** approve `#BC002D` as the web brand/action starting token while keeping pitch/evidence/destructive roles separate.
7. **Navigation density:** confirm which route families appear in the launch header versus footer/menu before selecting a Navigation Menu block.
8. **Shadcn Studio:** approve the small candidate shortlist for prototype evaluation, with no full theme/page/block import.
9. **Prototype fidelity:** confirm that the post-scaffold prototype should use frozen real Zenbu fixtures (`hello`, greeting exact entry, `モール`, `どいたま`) rather than generic placeholder cards.

## Evidence that would change the recommendation

- User testing shows repeated comparison between many results and full entries is materially slower with page navigation; that would justify prototyping a URL-correct, keyboard-safe desktop master-detail mode.
- The approved launch route inventory proves several nested navigation groups are simultaneously important; that would justify `navigation-menu-01` or a reviewed Studio application shell.
- A maintained Zenbu web brand guide supplies a different logo master, palette, typeface, spacing system, or dark treatment; it supersedes the inferred token proposal.
- Real content measurements show the proposed desktop aside produces poor line length, duplicate content, or reading-order problems; the exact entry should remain one centered column.
- The selected Next.js/shadcn style cannot consume the verified Base/Nova Studio items cleanly, or their license/dependency diff is unacceptable; use upstream shadcn primitives and manual composition only.
- Japanese readers consistently prefer a measured Japanese webfont and its performance cost stays inside the later budget; adopt that typeface instead of system-first.
- Accessibility review finds brand red or muted tokens fail in actual rendered combinations; adjust semantic colors even if that reduces exact visual parity with the icon.
- #276 or #281 changes the observable field/state inventory; update the component and responsive matrices rather than designing unsupported sections.

## Handoff recommendation

Do not install components from this report yet. After #277 provides the actual Next.js/shadcn foundation:

1. obtain owner decisions above;
2. build the single responsive frozen-data prototype path;
3. exercise mobile/desktop, light/dark, English/Japanese, keyboard, no-result, failure, same-spelling, and missing-enrichment journeys;
4. inspect every copied registry diff and dependency before keeping it;
5. use the approved prototype and this report as inputs to `/to-spec`, then `/to-tickets`.

The likely durable outcome is a small Zenbu-owned web design layer composed from upstream shadcn primitives, not a Shadcn Studio-derived page framework.
