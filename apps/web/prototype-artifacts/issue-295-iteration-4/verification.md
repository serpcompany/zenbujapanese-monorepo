# Verification

- Lint, TypeScript, production build pass.
- All six full-page screenshots visually inspected (1440 × 1000 desktop / 390 × 844 mobile), production capture with development switcher absent.
- Pointer A → B and keyboard B → C update URL.
- Search `test` preserves C and shows explicit unsupported-fixture state.
- Mobile menu opens with expanded state; links target real sections.
- C example disclosure reveals the bilingual sentence.
- Listen button enters “Playing device voice…” using available Japanese voice. This checks the browser API, not a human listening verdict or recording quality.
- Production browser error collection empty; mobile document width fits viewport.
- Local development server remains running on port 3000.

Tradeoffs: A exposes examples inline; B puts meanings and linguistic evidence side by side on desktop, stacking on mobile; C keeps meanings visible and discloses examples. No design is approved yet.
