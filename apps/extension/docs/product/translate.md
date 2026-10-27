# Translate

Translate is in the side panel, under the dictionary's status, until the panel has tabs (#978),
when it becomes the Translate tab. A learner types or pastes Japanese or English, or takes in the
text selected on the page, and reads its translation. It translates either way without choosing a
language: text with any Japanese in it goes from Japanese to English, and text with only Latin
letters from English to Japanese, as in the app's Translate.

Everything runs on this computer, with Chrome's own on-device Translator. Nothing is sent to a
server and nothing costs money. It needs a Chrome that has the Translator (138 or later, on a
computer Chrome supports it on).

## How Translate is checked

`src/translate/translate-tab.interaction.test.tsx` draws the tab in happy-dom on the real
translation module, with a stand-in Translator in place of Chrome's.
`src/service-worker/translation.test.ts` sends a line from a content script through the service
worker and the offscreen document to the stand-in and back. In Chrome, by hand or by an agent:
the side panel translates a Japanese line and an English one, and the offscreen document
translates with no click once the model is downloaded (2026-10-27, Chrome 156).

## The box and its buttons

A box, "Type or paste Japanese or English", then **Use Selection** and **Clear**, with
**Translate** at the right.

| Button | What it does |
| --- | --- |
| **Use Selection** | Puts the text selected in the side panel, or else on the page in the active tab, in the box. With nothing selected it says "Nothing is selected." and leaves the box as it was; on a page the extension can't read, such as a Chrome page, "Can't read the selection on this page. Copy and paste it instead." |
| **Clear** | Empties the box and removes the result. Emptying the box by hand removes it too. |
| **Translate** | Translates the box. Text that is neither Japanese nor English, such as only numbers, gets "Type Japanese or English to translate." and nothing is sent. |

Check: the tab's test, "takes in the selection with Use Selection…", the two selection notices,
"removes the result on Clear…", "removes the result when the box is emptied", and "asks for
Japanese or English…"; `src/translate/selection.test.ts` for where the selection comes from.

## The result

A card with the direction, such as **Japanese → English** or **English → Japanese**, the text as
it was, its translation, "Translated on this device", and **Copy** and **Speak**. **Copy** copies
the translation and then reads **Copied**. **Speak** reads the translation aloud in its language
with the browser's voices. A new translation replaces the last one, and an answer that comes after
**Clear** is dropped.

Check: the tab's test, "…from Japanese to English", "translates English typed in the box to
Japanese", "copies the translation…", "speaks the translation…", "replaces the last result…",
and "drops an answer that comes after Clear".

## Downloading and unavailable

The first translation in a direction downloads Chrome's model for it, from that click on
**Translate**: "Downloading Japanese for Translate… 42%" with a progress bar, then the
translation. **Translate** waits while it downloads. If the download doesn't finish: "The download
didn't finish. Try again." On a computer without the Translator: "Translate isn't available on
this computer.", and nothing is translated. Any other failure: "Translate didn't answer. Try
again."

Check: the tab's test, "downloads the model from the click…", "says Translate isn't available…",
"says the download didn't finish…", and "says Translate didn't answer…".

## Not built yet

Words in the text and its translation don't open the word popup, and the source has no reading
aids (#957). In the release build, Use Selection reads the page once the extension has
`activeTab` (#959).
