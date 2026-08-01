# Saved Language Items — round 1 prototype

> PROTOTYPE — throwaway decision aid, not production UI.

Three variants of saved-material organization and navigation, switchable with
`?variant=A`, `?variant=B`, or `?variant=C` on one mobile-first prototype page.

Run from the repository root:

```sh
python3 -m http.server 4173
```

Then open:

`http://localhost:4173/prototypes/saved-language-items/?variant=A`

The variants deliberately disagree about the product boundary:

- **A — Saved**: one app-level destination, organized by type and lightweight tags.
- **B — Lookup Bookmarks**: a Lookup-owned area organized into named lists, with image results coordinated beside it.
- **C — Notebook**: one app-level destination organized around learner-created notebooks and encounter context.

The first decision this round is intended to settle is the default mental model,
not final visual styling.
