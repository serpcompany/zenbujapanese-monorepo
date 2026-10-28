# Translate

Translate is the side panel's Translate tab ([`side-panel.md`](side-panel.md)). A learner types
or pastes Japanese or English, or takes in the text selected on the page, and reads its
translation. It translates either way without choosing a language: text with any Japanese in it
goes from Japanese to English, and text with only Latin letters from English to Japanese, as in
the app's Translate.

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
| **Use Selection** | Puts the text selected in the side panel, or else on the page in the active tab, in the box. On a page where Zenbu underlines words, Zenbu's page script reads it and leaves out the furigana, romaji, and meanings Zenbu added; on another page Zenbu reads it itself, which Chrome lets it do on a site the learner allowed and on a tab whose toolbar icon was clicked. With nothing selected it says "Nothing is selected." and leaves the box as it was; on a page the extension can't read, such as a Chrome page, "Can't read the selection on this page. Copy and paste it instead." |
| **Clear** | Empties the box and removes the result. Emptying the box by hand removes it too. |
| **Translate** | Translates the box. Text that is neither Japanese nor English, such as only numbers, gets "Type Japanese or English to translate." and nothing is sent. |

Check: the tab's test, "takes in the selection with Use Selection…", the two selection notices,
"removes the result on Clear…", "removes the result when the box is emptied", and "asks for
Japanese or English…"; `src/translate/selection.test.ts` for where the selection comes from.

## The result

A card with the direction, such as **Japanese → English** or **English → Japanese**, the text as
it was, its translation, "Translated on this device", and **Copy** and **Speak**. **Copy** copies
the translation and then reads **Copied**. **Speak** reads the translation aloud in its language
with a voice on this computer, never one of Chrome's online voices, which would send the text to a
server. With no such voice for the language, **Speak** is off and the card says "There's no
English voice on this computer to speak it." (or Japanese). A new translation replaces the last
one, and an answer that comes after **Clear** is dropped.

Check: the tab's test, "…from Japanese to English", "translates English typed in the box to
Japanese", "copies the translation…", "speaks the translation…", "turns Speak off…", "replaces
the last result…", and "drops an answer that comes after Clear"; `src/translate/speech.test.ts`
for the voice.

## Words in Japanese text

When the text is Japanese, each dictionary word in it is underlined as on a page, and a click on
one opens its word popup under the text ([`word-popup.md`](word-popup.md)). The popup's Open Full
Entry opens the word's Word Detail over the tab; Close or Escape puts the popup away and gives
focus back to the word. The text has the reading aids turned on in Settings: furigana over its
kanji, a romaji line under it, and each word's short meaning ([`settings.md`](settings.md),
Reading Aids). Until the dictionary is ready, the text is plain; the tab asks again, waiting longer
each time as page lookup does, and links the words once it is ready.

Check: `src/translate/source-words.interaction.test.tsx`, and the tab's test, "links the words of
a Japanese source…".

## Downloading and unavailable

Once Chrome's Japanese translation is on this computer, from the welcome tab's Download or
anywhere else, **Translate** translates with no download. Before it is, the first translation
downloads it from that click on **Translate**, which starts it straight away:
"Downloading Chrome's Japanese translation… 42%" with a progress bar, then the translation.
**Translate** waits while it downloads. If the download
doesn't finish, or makes no progress for a minute: "The download didn't finish. Try again.", and
**Translate** tries again. On a computer without the Translator: "Translate isn't available on
this computer.", and nothing is translated. Any other failure: "Translate didn't answer. Try
again."

Check: the tab's test, "downloads the model from the click…", "says Translate isn't available…",
"says the download didn't finish…", and "says Translate didn't answer…";
`src/shared/welcome-translation.interaction.test.tsx`, "the Video tab and Translate translate, and
neither asks to download";
`src/service-worker/translation.test.ts`, "gives up on a download that makes no progress…".

## Not built yet

The Japanese translation of English text is plain: its words don't open the word popup and it has
no reading aids.
