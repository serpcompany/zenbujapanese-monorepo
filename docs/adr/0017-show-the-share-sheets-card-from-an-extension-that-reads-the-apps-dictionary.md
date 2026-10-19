---
status: accepted
---

# Show the share sheet's card from an extension that reads the app's dictionary

Zenbu's card in the share sheet (#394) is a Share extension, `ZenbuShare`, that runs the shared
dictionary core itself and shows its answer in the sheet, without opening the app. It reads the
app's own copy of the dictionary's files, which a package target of their own puts only in the
app, and it hands words it saves to the app through an App Group.

- **The dictionary's files are the `DictionaryData` target,** and only the app links it. The
  extension links `SearchExperience`, whose code finds the files in the app it is part of
  (`BundledData`), so the device keeps one copy of the 556 MB.
- **The extension runs light.** It maps the tokenizer's dictionary from a file it unpacks once,
  where the app unpacks it into memory, never opens Sudachi, and reads a photo at 2,048 pixels, to
  stay under the memory iOS gives an extension.
- **The app keeps the learner's data.** The app keeps copies of its word lists and known words in
  the App Group for the extension to read. The extension writes each change it makes to an inbox
  there, and the app applies them through its own stores, so the account syncs them as the app's
  own changes.
- **The card has no Open in Zenbu button.**

## Why

- **It is the route Apple supports.** Apple documents no way for a Share or Action extension to
  open its app (`NSExtensionContext.open(_:completionHandler:)` is documented only for Today and
  iMessage extensions), so an extension built to open Zenbu risks App Review. The owner chose the
  card on 2026-10-19 from three prototypes, for that and because it keeps the learner in the app
  they were reading.
- **A second copy of the dictionary would double the app on the device.** Xcode copies a package
  target's resources into every target that links it. With the files in `SearchExperience`, the
  extension carried its own 542 MB, a 1.3 GB app. Making `SearchExperience` a dynamic framework
  didn't help: Xcode still copied the resources into both. An extension may read its containing
  app's bundle, so the data's own target, linked by the app alone, leaves one copy.
- **Not the App Group container either.** Copying the files there would also keep two copies, and
  the card would fail until the app had run once and copied 556 MB.
- **An inbox, not a shared store.** If the app and the extension wrote one file, the running app
  would overwrite the extension's change with its own copy, and the account would never see the
  change. Changes the app applies itself are recorded and synced like any other.

## Considered

- **Open the app (option A),** as Francis's held build does: little code, but App Review may reject
  it, and the learner leaves what they were reading.
- **A full-screen action in the action list (option C),** as Oyomi's OCR does: the same engine in a
  different extension point. Set aside; this work is what it would reuse.
- **The service's word cards** ([ADR 0014](0014-let-signed-in-apps-fetch-word-cards-from-the-dictionary-service.md)):
  no data in the extension, but they need a network and an account, where everything in Zenbu runs
  on the device.

## Consequences

- The project has a second target to sign: the extension's App ID (`<app>.share`) and the App
  Group need the team's provisioning, which automatic signing registers on the first build.
- `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` move to the project, so the app and the
  extension can't disagree.
- The extension holds its own copy of the package's code (38 MB in a Debug build).
- The card uses the default reading aids and frequency dictionaries, not the learner's, until
  those are shared too.
- [`ios-share-sheet.md`](../agents/ios-share-sheet.md) has how it's built and its memory, and the
  product docs' [Share sheet](../../apps/ios/docs/product/share-sheet.md) what it does.
