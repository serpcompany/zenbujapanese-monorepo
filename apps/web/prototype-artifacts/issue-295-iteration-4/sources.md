# Sources selected before page composition

Prototype question: which arrangement of full dictionary information is easiest to read? Three related layouts use one restrained source-derived header, search section, and footer.

Tailark is an independent MIT-licensed library, not Shadcn Studio or shadcnblocks.com. Pinned revision: `8139698115c1341bfd2e3e286c04bb4d8146f472`.

## Predesigned sections

- [Mist CTA one](https://github.com/tailark/blocks/blob/8139698115c1341bfd2e3e286c04bb4d8146f472/registry/bases/base/mist/blocks/call-to-action/one.tsx): preserve section / py-12 / max-w-5xl px-6 / centered space-y-6 heading and action arrangement. Replace marketing heading and CTA buttons with dictionary heading and a search form, add one short instruction. This is explicitly an adaptation of a CTA section, not a ready-made dictionary hero.
- [Mist header one](https://github.com/tailark/blocks/blob/8139698115c1341bfd2e3e286c04bb4d8146f472/registry/bases/base/mist/blocks/hero-section/one/header.tsx): preserve brand/navigation desktop row, responsive wrapping and mobile menu arrangement. Make static, remove scroll behavior and auth CTAs, replace logo/copy, use installed Button for mobile trigger.
- [Mist footer one](https://github.com/tailark/blocks/blob/8139698115c1341bfd2e3e286c04bb4d8146f472/registry/bases/base/mist/blocks/footer/one.tsx): preserve centered logo, wrapping link row and final small-print tiers. Remove social links and replace destinations with working source/help anchors.

No suitable predesigned dictionary-result section was found in these permitted sources. Result sections are openly custom domain compositions of CLI-installed shadcn Item, Badge, Separator, Tabs, Accordion and Button; they are not claimed as upstream sections.

## Components and wrappers

CLI: `pnpm dlx shadcn@latest init --preset b1PzeK --template next --name web --cwd apps --yes`; `pnpm dlx shadcn@latest add input-group item badge separator accordion tabs --cwd apps/web --yes`.

- Search: InputGroup, InputGroupInput, InputGroupAddon, Button within source section.
- Word results: ItemGroup / Item / ItemHeader / ItemContent, Badge for commonness, text for sense POS and frequency. `WordResult` maps dictionary fixture data to these slots.
- `PitchAccent`: custom Japanese mora diagram; no shadcn domain primitive exists.
- `ExampleSentence`: bilingual semantic content; no custom control.
- `ListenButton`: installed Button, browser speech synthesis preview explicitly identified. Does not pretend to play corpus recordings.
- Variant A: uninterrupted result list, examples inline.
- Variant B: same list with each result organized in reading and evidence columns.
- Variant C: same list with example sentences in installed Accordion panels.
- `PrototypeSwitcher`: installed Button and router URL state, dev only.

Fixture lexical facts are illustrative design evidence, not validated app/web ranking parity. Frequency examples 386 and 7,928 were previously checked against app TUBELEX data; other unavailable values stay explicit. Example sentences are authored fixtures; pitch contours are illustrative. No JLPT values invented.

Documentation read: official shadcn theming, typeset, Next installation, Input Group; local Next page convention. Typeset styles are examples, not an extra dependency.
