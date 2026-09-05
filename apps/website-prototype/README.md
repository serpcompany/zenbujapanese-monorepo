# Issue 298 — design set one (throwaway)

Latest decision: owner selected A. The selected view now uses the approved Nova/Neutral/Blue/Inter theme, title-only hero, official Base Nova frequency Badge, native-style katakana pitch contour, natural Listen control, and working `/entry/:word?variant=A` fixture pages. Both reading preferences survive entry/back navigation in memory. No header/footer. Current screenshots use `A-selected-*` and `A-entry-*`; B/C below describe prior explorations, not the selected direction. `npx tsc --noEmit` and build pass.

Question: which hierarchy makes dictionary entries easiest to read? Three independent layouts at `/`, selected with `?variant=A`, `B`, or `C`.

Run `npm install && npm run dev` from this directory. Preview: http://localhost:3100/?variant=A. The development switcher cycles with buttons or left/right keys and preserves its variant in the URL. Reading controls and query are in-memory. No existing web app was present, so this is a separately named Vite prototype beside `apps/ios`.

- A, Quiet dictionary: centered search and generous horizontal entry cards. Best for scanning definitions with stable reading alignment; uses more vertical space.
- B, Reading room: split hero, editorial context rail, serif Japanese and definitions. More deliberate reading rhythm; first result sits lower on phones.
- C, Word collection: contained hero and three-column card collection. Shows more words together on desktop; less direct comparison across definitions.

Six illustrative fixtures, including kanji and an entry without examples. Frequency ranks are invented fixtures, not a corpus claim. Device speech uses an installed Japanese voice and explicitly reports availability; it is not a pitch-accent recording. No audible correctness claim. Google Fonts requires network access with local fallbacks.

Verified in Chromium at 1440×1100 and 390×844: all variants, zero horizontal overflow, reading switches independently hide their matching text, search narrows to today, input arrow keys do not switch designs, switcher wraps C → A. Japanese device speech was invoked and UI reported playback (not independently listened to). `npm run build` passed. Screenshots: `../../evidence/issue-298-set-one/`.

No design is selected or promoted. Source and licensing: [SOURCES.md](SOURCES.md).
