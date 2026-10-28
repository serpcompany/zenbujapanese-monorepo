# The extension's translations

How the browser extension translates text with Chrome's Translator. The rest of the extension's
guide is in [`extension.md`](extension.md); what the Translate tab shows is in
[`translate.md`](../../apps/extension/docs/product/translate.md).

## Asking for a translation

Any surface translates with `translate(request)` (`src/translation/messages.ts`): it asks how
available the translator is for a direction (`ja` to `en`, or `en` to `ja`), or translates lines of
text. It sends `{ target: 'service-worker', translation }`, and the service worker opens the
offscreen document as for the dictionary and passes it on as `{ target: 'offscreen', translation }`.
The key is `translation`, not `request`, so the dictionary's listeners never answer it, nor the
translation listeners a dictionary request. The offscreen document makes one Translator for each
direction once Chrome says it is `available`, keeps it, and translates each line, leaving a blank
one as it is. It answers `translated`, or `not-available` with Chrome's state, and makes nothing
then; a translation that fails, or doesn't answer within 30 seconds, comes back as `{ type:
'failed', reason }`, and the offscreen document drops that Translator, destroying it, so the next
one makes a new one. A page's text never goes in an error's message.

## Downloading the model

Chrome downloads a model only from a click, and the click's activation lasts a few seconds, so a
page asks `translatorAvailability(direction)` itself in that click and, while the model is
`downloadable` or `downloading`, calls `downloadTranslator(direction, onProgress)` at once, before
any message. It reports the download's progress from 0 to 1 and answers the state; a download with
no progress for 60 seconds is stopped and answers Chrome's state then. The page then translates
through the offscreen document, which makes its own Translator once the model is `available`. The
offscreen document translates with no click once the model is `available`: checked on 2026-10-27 in
Chrome 156, in the headful agent Chrome, by sending a translation from the test content script's
world, with no user gesture, in a Chrome just started. The model is Chrome's, on this computer, and
nothing is sent anywhere to translate.

## One download, from the welcome tab

Chrome's Japanese translation is one language pack, `en_ja`, about 97 MB with Chrome's
translation library, holding both directions' models; the first Translator either way downloads
it. A click makes one Translator: Chrome takes the click's activation with the first `create`,
and a second `create` in the same click fails at once with `NotAllowedError` ("Requires a user
gesture when availability is \"downloading\" or \"downloadable\""). Once the pack is in, the
other direction still reports `downloadable`, also 20 seconds later, and needs a click of its
own, but makes its Translator in about 0.1 seconds with progress `[0, 1]` and no download. During
a download, Chrome 156 reports `downloadable`, not `downloading`, both ways and to every page; a
second page's `create` from its own click joins it, with the same progress, and both finish
together. All measured in Chrome 156.0.8078.48, in the headful agent Chrome, on a fresh profile,
from a real click handler (2026-10-28, #1131).

So the welcome tab's Download makes the `ja` to `en` Translator, the one the Video tab and the
caption on the player need, and that downloads the pack. `chromeModel`
(`src/shared/translation-model.tsx`) is that direction's `translatorAvailability` and
`downloadTranslator`; the Video tab asks the same direction through its services. After it,
neither the Video tab nor Translate asks; Translate's first English to Japanese makes its
Translator from its own Translate click, from the pack. Translate shows the download line only
once a progress event reports `0 < loaded < 1`, so that `[0, 1]` stays "Translating…". The
stand-in Translator (`src/test/translator-stand-in.ts`) holds one pack the same way. A page
that finds `downloading`, which the spec allows and Chrome 156 never reported, shows Chrome's download under way with no Download, and
`useTranslationModel` checks `availability` again every 2 seconds (`recheckMs`) until it changes. Whether the model is in is never
stored: Chrome's `availability` is the one record, so a model Chrome removes is asked for again.
`translation-model.tsx` also holds what pages show of it: `useTranslationModel`, the state from
the page's check to the end of a download, `ModelNotice`, the ask, its progress, and its failure,
and `DownloadProgress`. `src/shared/welcome-translation.interaction.test.tsx` checks the welcome
tab's offer in each of Chrome's states, one Translator from its click, a failure, and the Video
tab and Translate with no ask after it.
