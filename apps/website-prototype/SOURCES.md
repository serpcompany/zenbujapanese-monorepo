# Sources

Accessed 2026-09-05. New implementation; no previous prototype code restored.

## Selected A revision

Owner selected A and requested Nova / Neutral / Blue / Inter preset `b1PzeK`, with brand `#BC002D`. Theme tokens recovered from the approved website planning commit `c594edf:apps/web/app/globals.css`; no old layout restored. Official Base Nova Badge fetched from https://ui.shadcn.com/r/styles/base-nova/badge.json and incorporated in `src/badge.tsx` with only the cn utility localized. Tailwind v4 renders its actual utilities. Brand colors the title; controls and frequency badges use the approved blue primary.

`src/pitch.tsx` ports `apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift` PitchAccentView/PitchContour: medium katakana, horizontal padding12, min-height34 capsule, 4px text-bottom padding, 7px SVG, 1.5px round stroke; measured width × downstep / mora count; heiban full line. Exact ZenbuTheme P3 light/dark stroke colors retained. Browser reading font metrics and CSS capsule fill approximate platform text/material rendering.

Speech behavior inspected in SpeechSynthesisClient.swift: native AVFoundation cancels ongoing speech, selects ja-JP, default speech rate×.82. Browser cancels speech, selects Japanese voice, reads kana at Web Speech relative rate .82. Different engines/rate scales prevent exact audio identity. Verified browser utterance payload `きのう`, `ja-JP`, `.82` using interception; this is not a recording or a listening-quality assertion.

Selected A screenshot names are `A-selected-desktop.png`, `A-selected-mobile.png`, `A-entry-desktop.png`, and `A-entry-mobile.png`. Earlier screenshots and B/C are historical comparison artifacts.

## Incorporated components

`src/ui.tsx` adapts the actual shadcn/ui Card and Radix Switch component structure, with plain CSS replacing Tailwind class strings and unused Card subcomponents omitted:

- https://ui.shadcn.com/r/styles/new-york/card.json
- https://ui.shadcn.com/r/styles/new-york/switch.json
- https://ui.shadcn.com/docs/components/card
- https://ui.shadcn.com/docs/components/switch

MIT license below. Radix Switch remains the underlying accessible control. Lucide icons are from the installed lucide-react package.

## Exact Shadcn Studio block references

Public rendered previews inspected; no Pro source or assets copied, purchased, or bypassed. Original dictionary compositions adapt these layout ideas, not proprietary block code:

- A: [Hero 42](https://shadcnstudio.com/preview/blocks/base/marketing-ui/hero-section/hero-section-42) — centered eyebrow / title / description rhythm, reduced to quiet search-first proportions.
- B: [Hero 36](https://shadcnstudio.com/preview/blocks/base/marketing-ui/hero-section/hero-section-36) — split text / secondary-surface composition, replacing the visual showcase with search. Editorial card body is original.
- C: [Hero 37](https://shadcnstudio.com/preview/blocks/base/marketing-ui/hero-section/hero-section-37) — contained hero treatment and clear separation of hero from the content below; dictionary card collection is original.

Catalog: https://shadcnstudio.com/blocks#marketing-ui. Brief references: https://jpdb.io/search?q=hello&lang=english and https://jisho.org/search/kinou.

## shadcn/ui license

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
