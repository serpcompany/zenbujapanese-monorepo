# Component sources

`src/ui.tsx` adapts the public shadcn/ui New York Card, CardHeader, CardContent and Radix Switch implementations. Utility classes were translated into local CSS; accessible Radix switch behavior is retained.

- https://ui.shadcn.com/r/styles/new-york/card.json
- https://ui.shadcn.com/r/styles/new-york/switch.json

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

# Visual block references

Public free Shadcn Studio previews were inspected as composition references. No Studio source code or images were copied.

- A: Hero 01 — centered headline, short supporting copy, single primary action. https://shadcnstudio.com/preview/blocks/base/marketing-ui/hero-section/hero-section-01
- B: Hero 41 — split headline/action composition and quiet horizontal header. https://shadcnstudio.com/preview/blocks/base/marketing-ui/hero-section/hero-section-41
- C: Hero 44 — large typographic greeting and generous white space, reinterpreted as a dictionary title. https://shadcnstudio.com/preview/blocks/base/marketing-ui/hero-section/hero-section-44

The card field arrangements are original, informed by the brief's jpdb/Jisho references. Fixtures are authored for this design preview, not canonical Language Reference Data. Google Fonts serves DM Sans, DM Serif Display and Noto Sans JP; local fallbacks remain available. Lucide icons are used from the installed package.
