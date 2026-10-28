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
world, with no user gesture, in a Chrome just started. Each direction has its own model. The model
is Chrome's, on this computer, and nothing is sent anywhere to translate.
