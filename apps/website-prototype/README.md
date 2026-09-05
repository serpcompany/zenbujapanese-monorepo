# Throwaway dictionary prototype · set two

Question: which entry hierarchy is clearest for everyday lookup? No variant is approved; this branch captures three options for issue #298.

```sh
cd apps/website-prototype
npm install
npm run dev
```

- http://localhost:3200/?variant=A — Quiet index: compact centered hero, two-column cards. Easy scanning across words, narrower examples.
- http://localhost:3200/?variant=B — Field notes: split hero, horizontal entry cards with dedicated meaning and example columns. Highest desktop density; stacks on mobile.
- http://localhost:3200/?variant=C — Open book: centered typographic hero, small index rail, generous single-column cards. More breathing room, more scrolling.

Use the floating bar or left/right arrow keys to cycle. It is hidden in production builds. Query parameter survives reload; reading preferences and search state are deliberately in memory. Search is submit-first over the six fixture entries. Empty input returns all entries.

All entries show Japanese, furigana above the kanji, independent romaji, definition, part of speech, illustrative frequency and pitch, plus a speaker. Five contain example sentences; 時間 intentionally does not. The speaker uses browser device speech and may not reproduce the displayed pitch. These are authored demonstration fixtures, not canonical data.

Sources and the shadcn/ui MIT notice are in [THIRD-PARTY.md](THIRD-PARTY.md). New Vite surface is necessary because this branch has no existing website package or route. All changes are inside this throwaway website directory; the iOS product is untouched.

Verification: `npm run build` passes. Browser reviewed A/B/C at 1440×1000 and 390×844, with no horizontal overflow. Both toggles independently hide and restore their entry text on every design at both sizes. Submit search returns yesterday; the speaker reached the device speech `onstart` event. Audio output quality was not independently listened to. Switcher cycles C→A and updates the URL. Screenshots in `proof/` capture every design at desktop/mobile sizes.
