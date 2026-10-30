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

Under the buttons, an **Image** row, as the app's Translate holds Image Search, opens Image Search
over the tab. Reading text in pictures isn't built yet, so the page says "Reading text in pictures
is coming soon", with no button, and Back finds Translate as it was
(`src/side-panel/panel.interaction.test.tsx`, "opens Image Search from the Image row on
Translate"; `e2e/side-panel-tabs.spec.ts`).

Check: the tab's test, "takes in the selection with Use Selection…", the two selection notices,
"removes the result on Clear…", "removes the result when the box is emptied", and "asks for
Japanese or English…"; `src/translate/selection.test.ts` for where the selection comes from.

## The result

A card with the direction, such as **Japanese → English** or **English → Japanese**, the text as
it was, its translation, "Translated on this device", and **Copy** and **Speak**. **Copy** copies
the translation and then reads **Copied**. **Speak** reads the translation aloud in its language
with the best voice on this computer, chosen as Pronounce chooses one
([`word-popup.md`](word-popup.md), Its actions), US English before other English as in the app,
and never one of Chrome's online voices, which would send the text to a server. With no such voice
for the language, **Speak** is off and the card says "There's no English voice on this computer to
speak it." (or Japanese). A new translation replaces the last one, and an answer that comes after
**Clear** is dropped.

Check: the tab's test, "…from Japanese to English", "translates English typed in the box to
Japanese", "copies the translation…", "speaks the translation…", "turns Speak off…", "replaces
the last result…", and "drops an answer that comes after Clear"; `src/translate/speech.test.ts`
for the voice.

## Words in Japanese text

When the text is Japanese, each dictionary word in it is underlined, half a rem from the word
before it as in the Player tab's transcript ([`video-tab.md`](video-tab.md), Words), and a click on
one opens its card on the page in the tab the learner is on, as the word popup, beside the side
panel's edge and level with the word; the panel shows no card ([`word-popup.md`](word-popup.md),
A word's card from the side panel). Escape, in the panel or on the page, or a press outside it
puts it away. A word opened from the keyboard, with Enter or Space, shows its card under the text
instead, with focus in it, since focus can't move from the panel into the page (the owner's
decision on #1124); Escape gives focus back to the word. Where that tab can't show one, such as a `chrome://` page, the Chrome Web Store, a
PDF, or a site where Zenbu is off, the popup opens under the text instead, at its size on a page.
There Escape or a press outside the popup puts it away; Escape gives focus back to the word, and
a press leaves focus where it lands. While the popup's ••• menu is open, a press closes only the
menu. Either way, the card's Open Full Entry expands it in place into the word's full entry; it
opens no page over the tab. The text has the reading aids turned on in
Settings: furigana over its kanji, a romaji line under it, and each word's short meaning ([`settings.md`](settings.md),
Reading Aids). A meaning is in the muted foreground, half a rem from the word before it; one wider
than its column is cut with an ellipsis, and its sense's full text is its tooltip and what a screen
reader reads. Until the dictionary is ready, the text is plain; the tab asks again, waiting longer
each time as page lookup does, and links the words once it is ready.

Check: `src/translate/source-words.interaction.test.tsx` ("opens a word's card on the page…",
"lets go of the word when the page closes its card…", "shows the card under the line, at the
popup's size, when the page can't show one", "opens the word popup under the line where nothing
can show it on the page, and Open Full Entry expands it there", "shows a word's card in the
panel, with focus in it, when Enter opens it…", the same for Space, and "opens a word's card on
the page from a click after a key opened one in the panel…"), and the tab's test, "links the
words of a Japanese source to their card on the page, with no card in the panel", "shows a source
word's card in the panel, with focus in it, when a key opens it" and "expands a source word's
popup in place where the page can't show its card". The spacing, colour and tooltip are checked in the Player tab's transcript,
which draws the same line (`e2e/transcript-meanings.spec.ts`).

## Downloading and unavailable

Once Chrome's Japanese translation is on this computer, from the welcome tab's Download or
anywhere else, **Translate** translates both ways with no ask and no download line. Chrome still
reports English to Japanese as a download until a page makes its translator, and makes it only
from a click, so the first English to Japanese makes it from that click on **Translate**: about
a tenth of a second from the pack already in, under "Translating…". Before the pack is in, the
first translation downloads it from that click on **Translate**, which starts it straight away.
The tab says "Translating…" until Chrome reports bytes still to load, then
"Downloading Chrome's Japanese translation… 42%" with a progress bar, then the translation.
**Translate** waits while it downloads. If the download
doesn't finish, or makes no progress for a minute: "The download didn't finish. Try again.", and
**Translate** tries again. On a computer without the Translator: "Translate isn't available on
this computer.", and nothing is translated. Any other failure: "Translate didn't answer. Try
again."

Check: the tab's test, "downloads the model from the click…", "says Translating… until Chrome
reports bytes still loading…", "says Translate isn't available…",
"says the download didn't finish…", and "says Translate didn't answer…";
`src/shared/welcome-translation.interaction.test.tsx`, "the Video tab and Translate translate both
ways, and neither asks to download";
`src/service-worker/translation.test.ts`, "gives up on a download that makes no progress…".

## Not built yet

The Japanese translation of English text is plain: its words don't open the word popup and it has
no reading aids.
