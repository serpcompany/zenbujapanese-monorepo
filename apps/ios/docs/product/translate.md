# Translate

Translate is the app's second tab. Two people share one iPhone: either one speaks Japanese or
English, in any order, without choosing a language. What they say appears as it is spoken, its
translation appears under it, and after they pause the translation is spoken aloud. Every
Japanese word on the tab opens the same dictionary sheet the Player uses.

Everything runs on the iPhone: Apple's speech recognition, Apple Translation, and the system
voice. Nothing is sent to a server, and nothing costs money. The first conversation downloads
Apple's Japanese and English speech recognition and translation once, with progress shown beside
the microphone button; after that, Translate works without a connection. There is no Online
engine yet, so there is no Online/Offline switch and no cost or model details.

## Typing to translate

The tab has a small **Translate** title with a History button, and one large card reading
**Translate anything**; tapping anywhere in it starts typing. Translate detects the language:
text with any kana or kanji is Japanese and is translated into English, and text with only Latin
letters is English and is translated into Japanese. There is no swap button. The translation
appears in the same card under a divider, with a label such as **English → Japanese** and
buttons to copy and speak it; Japanese in it is underlined and tappable. An ✕ clears the text.
If Apple's Japanese language isn't downloaded, the card offers **Download Japanese**, which shows
Apple's download prompt.

## Starting

The microphone button in the card's corner opens **Live translation modes**, a sheet listing
each mode with a description; the selected one is tinted with a checkmark, and the choice is
remembered. **Start** closes the sheet and starts right away:

| Mode | What it does |
| --- | --- |
| **Conversation** | Two-way. Each turn is detected as Japanese or English. Translations play out loud, and the microphone keeps listening while they play, so someone who keeps talking isn't lost. A translation never starts while someone is talking. |
| **Listening** | One-way, for a TV, a guide, or announcements. Hears Japanese only, from a distance and without voice isolation. English leads each card, and each translation plays as soon as it's ready. With earphones the microphone keeps listening; on the iPhone's speaker it waits while each translation plays, so it doesn't hear itself. |
| **Text Only** | Like Conversation, but nothing plays, so the microphone never turns off between turns. |

The first time, iOS asks for the microphone. If access is off, a banner reads **Microphone access
is off** with **Open Settings**.

## The conversation

The conversation replaces the tab's home and fills the screen: the tab bar is hidden while it's
open. The top bar has Back, the title **Japanese ⇄ English** (**Japanese → English** in
Listening), and a **•••** menu with the layout (**Cards** or **Two Panes**), **Furigana**, and
**Change Mode…**.

Along the bottom are the conversation's controls:

- a speaker button that mutes spoken translations, switching to Text Only, and turns them back on
  (not in Listening);
- the speech speed, **−** and **+** in steps of 0.1 from 0.5× to 2.0×, remembered for the next
  conversation;
- the timer with a pause button. The timer is red while listening and gray while paused, and the
  button is a red pause while listening and a blue play while paused.

VoiceOver reads what's happening (**Listening**, **Hearing speech**, **2 waiting for a pause**,
**Speaking English**, **Paused**…). There is no stop button.

Translate shows Japanese without furigana unless **Furigana** is on in the **•••** menu. That
choice is Translate's own: Reading Aids still sets furigana for the rest of the app. Conversation
text is one Dynamic Type size larger than the rest of the app.

- **Cards.** Each sentence is a card with small corners, its source above a hairline and its
  translation below. Cards in one speaker's turn sit close together, and a new turn starts after a
  wider gap; there are no language labels. The sentence being heard has a tinted fill and an
  accent outline, grows as it's recognized, and shows a provisional translation in italics. Once
  the speaker finishes the sentence, the card keeps that translation until the final one replaces
  it, so a long sentence never goes back to **Translating…**. A card turns active again while its
  translation is spoken.
- **Two Panes.** Japanese fills a dark pane on top and English a light pane below, as in Owll
  Translator. Each pane holds the whole conversation in its language: what was said in it and
  the translation of what was said in the other. The newest line is bold, earlier lines are dimmed,
  and the line being spoken is highlighted. The sentence being heard grows in its own pane while
  its provisional translation grows in the other. Each pane follows its newest line. The layout
  chosen in **•••** is remembered.
- **Long speech.** A speaker who keeps talking stays one turn. Its text is held until they pause,
  then shows as one or more cards. The audio waits (**3 waiting for a pause**) and plays in order
  about 2 seconds after the speaker stops. A turn that runs for 30 seconds without a pause plays
  what's waiting anyway.
- **Scrolling.** The list follows the newest text. Scrolling up stops following and shows
  **Jump to Latest**.
- **Elsewhere in the app.** On a word's full entry opened from the conversation, where the tab
  bar is back, a full-width bar above the tab bar shows the timer and button with a status line,
  reading **Conversation still listening · Return** or **Conversation paused · Return** on other
  tabs; tapping it returns to the conversation.
- **Modes.** **Change Mode…** reopens Live translation modes with **Done**; switching between
  Conversation and Text Only keeps the conversation, and switching to or from Listening saves it
  and starts a new one.

## Pausing and leaving

Pausing turns off the microphone and playback; resuming continues the same conversation with a
fresh silence timer.

- **Back** pauses and asks **Leave this conversation?** with **Save and Exit**, **Exit Without
  Saving**, and **Cancel**, which resumes. With nothing said yet, Back just leaves.
- **Silence.** After 2 minutes 50 seconds with no speech, **Are you still there?** counts down
  10 seconds with **Pause** and **Keep Listening**. Speech also dismisses it. With no answer, the
  conversation pauses (it doesn't end), and a card explains why with **Resume**.
- **Background.** When the app goes to the background, the conversation pauses, with a card
  reading **Paused while you were away**.
- **Interruptions.** A call or another app taking the microphone stops listening; a card says what
  happened, with **Try Again**.

## History

The History button opens every saved conversation, newest first, in one list: each row shows its
first sentence and a line such as **Today, 09:12 · 6 turns**. **All** and **Bookmarked** at the
top switch to the bookmarked sentences, each with its translation. Search, in the toolbar, matches the
Japanese or the English. Long-pressing a row offers **Copy**, **Share**, and **Delete**; the
**•••** menu offers **Delete All…**. Deleting a conversation, or all of them, asks first, and
there's no swipe to delete. How long conversations are kept is **Keep Translations** in Account
(30 Days, 1 Year, or Forever). Choosing a shorter time removes older conversations right away,
and again at each launch. A conversation
opens as its transcript, with its length, turns, and mode above it. Each turn is a group of
cards like the conversation's, and every Japanese word is tappable. Each sentence has a speaker
button that plays its translation again, at the conversation's speech speed, and a bookmark. Its
**•••** menu offers **Copy Transcript**, **Share**, and **Delete Conversation**.

A conversation is saved after every translated sentence, so closing the app loses nothing; **Exit
Without Saving** deletes it. Conversations are stored only on the device, one file each.
Browsing History never turns on the microphone.

## Looking up words

Every Japanese word in the cards, History, and typed results is underlined and opens Word Detail
at half height, as in the Player; particles and punctuation aren't linked. **Open Full Entry**
opens the word inside the Translate tab. Looking a word up doesn't pause listening.
