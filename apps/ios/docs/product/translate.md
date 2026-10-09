# Translate

Translate is the app's second tab. Two people share one iPhone: either one speaks Japanese or
English, in any order, without choosing a language. What they say appears as it is spoken, its
translation appears under it, and after they pause the translation is spoken aloud. Every
Japanese word on the tab opens the same dictionary sheet the Player uses. It works the same on an
iPad and a Mac, which use their own microphone and speakers ([iPad and
Mac](index.md#ipad-and-mac)).

Everything runs on the iPhone: Apple's speech recognition, Apple Translation, and the system
voice. Nothing anyone says is sent to a server, and nothing costs money. The one thing that leaves
the iPhone is a sentence the learner bookmarks, once they sign in to a Zenbu account (bookmarks
made before signing in go then too): that sentence and its translation sync to their other devices
([Translations](#translations)), and nothing else of the conversation does. The first conversation downloads
Apple's Japanese and English speech recognition and translation once, with progress shown above
the Start button; after that, Translate works without a connection. There is no Online
engine yet, so there is no Online/Offline switch and no cost or model details.

## The tab's home

The tab opens on five ways to translate. It has a small **Translate** title with a
**Translations** button (a clock), an illustration of the selected option, the five options listed with a description each,
and **Start** above the tab bar. The selected option is tinted with a checkmark, and the choice
is remembered.

| Option | What **Start** does |
| --- | --- |
| **Conversation** | Two-way and live. Each turn is detected as Japanese or English. Translations play out loud, and the microphone keeps listening while they play, so someone who keeps talking isn't lost. A translation never starts while someone is talking. The speaker button silences them. |
| **Listening** | One-way and live, for a TV, a guide, or announcements. Hears Japanese and English, each sentence detected as either, from a distance and without voice isolation. The translation leads each card (English under Japanese speech, Japanese under English), and each translation plays as soon as it's ready. With earphones the microphone keeps listening; on the iPhone's speaker it waits while each translation plays, so it doesn't hear itself. |
| **Text** | Opens the typing screen, ready to type or paste. |
| **Document Upload** | Opens the file picker for a PDF, a photo, or a text file. Its text opens on the typing screen, translated. A PDF's own text is used. A scanned PDF (its first 10 pages) or a photo is read with on-device text recognition. A text file can be UTF-8, UTF-16, Shift-JIS, or EUC-JP. Only the first 5,000 characters are translated. A file with no text shows **Couldn't read this document**. |
| **Camera** | Offers **Take Photo**, **Photo Library**, and **Files**, then opens the images in [Image Search](#image-search), where tapping a word looks it up. On the Mac it offers **Photo Library**, **Files**, and **Paste Image** instead. |

## Typing to translate

The typing screen is one large card reading **Translate anything**. Translate detects the
language:
text with any kana or kanji is Japanese and is translated into English, and text with only Latin
letters is English and is translated into Japanese. There is no swap button. The translation
appears in the same card under a divider, with a label such as **English → Japanese** and
buttons to copy and speak it; Japanese in it is underlined and tappable. An ✕ clears the text.
If Apple's Japanese language isn't downloaded, the card offers **Download Japanese**, which shows
Apple's download prompt. The typing screen's **•••** menu holds **Furigana**.

## Starting a live mode

The first time, **Start** brings up iOS's request for the microphone. If access was turned off,
**Start** shows **Allow the microphone** with **Open Settings** and **Cancel**. A missing
translation download shows **Download Japanese**, and a missing speech download explains that it
needs a connection once. Nothing stays on the home screen afterward.

## The conversation

The conversation replaces the tab's home and fills the screen: the tab bar is hidden while it's
open. The top bar has only Back and a **•••** menu with the layout (**Cards** or **Two Panes**)
and **Furigana**; there's no title. To change mode, leave and pick another option on the home.

Along the bottom are the conversation's controls:

- a speaker button that mutes spoken translations and turns them back on
  (not in Listening);
- the speech speed, **−** and **+** in steps of 0.1 from 0.5× to 2.0×, remembered for the next
  conversation;
- the timer with a pause button. The timer is red while listening and gray while paused, and the
  button is a red pause while listening and a blue play while paused.

VoiceOver reads what's happening (**Listening**, **Hearing speech**, **2 waiting for a pause**,
**Speaking English**, **Paused**…). There is no stop button.

Translate shows Japanese without furigana unless **Furigana** is on. One setting covers
conversations, transcripts, and typed or document translations, and each of those screens has it
in its **•••** menu. Translate keeps its own
reading aids: the rest of the app's Reading Aids (furigana, romaji, word meanings) don't apply on
the tab. Conversation text is one Dynamic Type size larger than the rest of the app.

- **Cards.** Each sentence is a card with small corners, its source above a hairline and its
  translation below. Cards in one speaker's turn sit close together, and a new turn starts after a
  wider gap; there are no language labels. The sentence being heard has a tinted fill and an
  accent outline, grows as it's recognized, and shows a provisional translation in italics. Once
  the speaker finishes the sentence, the card keeps that translation until the final one replaces
  it, so a long sentence never goes back to **Translating…**. When what was heard splits into
  several sentences, each card shows **Translating…** until its own translation arrives, since
  the provisional one covered them all. A card turns active again while its translation is spoken.
- **Two Panes.** Japanese fills a dark pane on top and English a light pane below, as in Owll
  Translator. Each pane holds the whole conversation in its language: what was said in it and
  the translation of what was said in the other. The newest line is bold, earlier lines are dimmed,
  and the line being spoken is highlighted. The sentence being heard grows in its own pane while
  its provisional translation grows in the other. Each pane follows its newest line. The layout
  chosen in **•••** is remembered.
- **Long speech.** A speaker who keeps talking stays one turn. Its text is held until they pause,
  then shows as one card per sentence. The audio waits (**3 waiting for a pause**) and plays in
  order, starting about 2 seconds after the speaker stops: each sentence plays as soon as its own
  translation is ready, so a long monologue doesn't wait for the whole of it. A turn that runs for
  30 seconds without a pause plays what's waiting anyway.
- **Scrolling.** The list follows the newest text. Scrolling up stops following and shows
  **Jump to Latest**.
- **Elsewhere in the app.** On a word's full entry opened from the conversation, where the tab
  bar is back, a full-width bar above the tab bar shows the timer and button with a status line,
  reading **Conversation still listening · Return** or **Conversation paused · Return** on other
  tabs; tapping it returns to the conversation.

## Pausing and leaving

Pausing turns off the microphone and playback; resuming continues the same conversation with a
fresh silence timer. While a conversation is listening, the screen doesn't dim or lock, so a
hands-free conversation isn't paused by Auto-Lock; once it pauses or ends, Auto-Lock works again.

- **Back** pauses and asks **Leave this conversation?** with **Save and Exit**, **Exit Without
  Saving**, and **Cancel**, which resumes. With nothing said yet, Back just leaves.
- **Silence.** After 2 minutes 50 seconds with no speech, **Are you still there?** counts down
  10 seconds with **Pause** and **Keep Listening**. Speech also dismisses it. With no answer, the
  conversation pauses (it doesn't end), and an alert, **Paused after 3 minutes of silence**,
  offers **Resume** and **Not Now**.
- **Background.** When the app goes to the background, the conversation pauses, and on return an
  alert reads **Paused while you were away**.
- **Interruptions.** A call or another app taking the microphone stops listening; an alert says what
  happened, with **Try Again**.

## Translations

The **Translations** button opens every saved conversation, newest first, in one list: each row shows its
first sentence and a line such as **Today, 09:12 · 6 turns · 82% known**. The percentage is the
share of the Japanese that was spoken, particles aside, made of words marked known, counted the
way the Player counts captions; it updates as words are marked known, and a conversation with no
Japanese spoken shows none. The transcript's header shows it too. **All** and **Bookmarked** at the
top switch to the bookmarked sentences, newest bookmark first, each with its translation. Search, in the toolbar, matches the
Japanese or the English. Long-pressing a row offers **Copy**, **Share**, and **Delete**; the
**•••** menu offers **Delete All…**. Deleting a conversation, or all of them, asks first, and
there's no swipe to delete. Conversations are kept until they're deleted. **Translations** in
Account opens the same screen, inside Account, and a deletion in either shows in both. The
conversation in progress isn't listed until it ends, and while one is live, transcripts have no
speaker button, so a replay can't talk over it. A conversation
opens as its transcript, with its length, turns, and mode above it. Each turn is a group of
cards like the conversation's, and every Japanese word is tappable. Each sentence has a speaker
button that plays its translation again, at the conversation's speech speed, and a bookmark. Its
**•••** menu offers **Furigana**, **Copy Transcript**, **Share**, and **Delete Conversation**.

A conversation is saved after every translated sentence, so closing the app loses nothing; **Exit
Without Saving** deletes it. Conversations are stored only on the device, one file each, and never
sync.

**Bookmarks on every device.** Signed in to a Zenbu account, the learner's bookmarked sentences
are the same on every device running this app ([Zenbu account and
sync](index.md#zenbu-account-and-sync)). Only a bookmarked sentence syncs: its text, its
translation, which language it was said in, and when it was bookmarked; never the conversation
around it, or any sentence that isn't bookmarked. A sentence bookmarked on another device is listed
under **Bookmarked** here even though its conversation isn't on this iPhone: it shows on its own, the
sentence and its translation, with the same speaker and bookmark buttons, and there's no
conversation to open. Un-bookmarking a sentence, here or anywhere, un-bookmarks it everywhere, and
deleting a conversation un-bookmarks its sentences everywhere too. Bookmarks synced from other
devices are kept in a small file of their own beside the conversations, and nothing else from those
devices is.
Browsing Translations never turns on the microphone.

## Looking up words

Every Japanese word in the cards, saved Translations, and typed results is underlined and opens Word Detail
at half height, as in the Player; particles and punctuation aren't linked. **Open Full Entry**
opens the word inside the tab it was tapped in: Translate, or Account from Account →
**Translations**. Looking a word up doesn't pause listening.

## Image Search

Translate's **Camera** option opens Image Search: **Start** offers **Take Photo**, **Photo
Library**, and **Files**, and the chosen images open on the Image Search screen, in the
Translate tab. Other ways in open the same screen there, from any tab:

- an image dragged onto the window, on every device, up to 8 at a time, with the same limits as
  **Files**;
- on the Mac and with a hardware keyboard, **Search an Image…** (⌘⇧I), which goes back to
  Translate's first screen, chooses **Camera** when no conversation is running, and offers the
  same sources;
- on the Mac, **Paste Image** in place of **Take Photo**, which macOS can't show, and a photo
  taken on an iPhone or iPad through **File → Import from iPhone or iPad**
  ([iPad and Mac](index.md#ipad-and-mac)).

Image Search recognizes Japanese text in one or more selected images. It reads both
horizontal and vertical (縦書き) Japanese; vertical columns are read top to bottom, right to
left, and English elsewhere in the image does not hide the Japanese.

A segmented control switches between four views, and Image Search remembers the last one
(**Both** at first). The toolbar is the same in every view: a close button and a **•••** menu
with **Copy Text**, **Share Image**, and **Show Words on Image**, which shows or hides the word
marks on the image.

- **Photo** shows the image, aligned to the top, with every recognized word marked in the
  accent color. Words in vertical lines are tinted chips that alternate shade down each
  column; words in horizontal lines are underlined.
- **Both** fits the same marked, tappable image at the top and lists each recognized Japanese
  line below it in the Player's caption cards, with furigana, word underlines, and the line's
  translation. The first card's line is outlined on the image; tapping a card outlines its
  line, and tapping a word on the image scrolls the cards to its line.
- **Text** shows the recognized Japanese as paragraphs in the same caption cards, one text
  size larger. Lines that wrap, such as book columns, are joined; list items and lines that
  end a sentence stay separate.
- **Translate** has two sections. **Translation** shows each paragraph with its natural
  translation. **Context** says in a few sentences what the text is and what it's for, then
  lists idioms, proverbs, and set expressions inside longer text with their dictionary
  meanings; each opens its Word Detail. An idiom that is a whole paragraph, as in a list of
  proverbs, isn't repeated there, since Translation already gives its meaning.

Translation uses Apple Translation, preparing Apple's language resources first when needed.
Where Apple Translation isn't available, Apple Intelligence's on-device model translates
instead, and the Translate view says so. Both and Text show line and paragraph translations under their
cards, following the Translations reading-aid preference, as soon as translation is ready
without a download; choosing Translate starts a download when one is needed.

Context needs Apple Intelligence; when it's off or still downloading, the Translate view says so, and on
devices that can't run it the section is hidden. The on-device model only picks idioms and
describes the text. Idioms are shown only when they're dictionary entries, with the
dictionary's meaning, and those meanings are given to the model whenever it translates or
describes the text, because on its own it misreads idioms word by word.

Tapping a word in any view opens its Word Detail in a half-height sheet that can be dragged to
full height, as in the Player. The view behind stays usable, so tapping another word switches
the sheet, and nothing behind it moves when a word opens. A word with several possible entries opens a
**Choose** list that uses Search's result rows, and one with none shows a no-entry state. The
sheet's top bar has a close button and **Open Full Entry**, which continues to the normal
full-screen dictionary route in the Translate tab. Words use the same
Kuromoji parser family as the Zenbu browser extension and other linked Japanese in the app.

A learner can also copy the recognized text and share the selected source image.

The Image Search session itself is temporary. Opening a recognized word associates the
source image with that word as Encounter Media, which then appears in the Media Library.
