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
| **Conversation** | Two-way. Each turn is detected as Japanese or English. Translations play out loud, and the microphone is off while they play. |
| **Listening** | One-way, for a TV, a guide, or announcements. Hears Japanese only, from a distance and without voice isolation. English leads each card, and each translation plays as soon as it's ready. With earphones the microphone keeps listening; on the iPhone's speaker it waits while each translation plays, so it doesn't hear itself. |
| **Text Only** | Like Conversation, but nothing plays, so the microphone never turns off between turns. |

The first time, iOS asks for the microphone. If access is off, a banner reads **Microphone access
is off** with **Open Settings**.

## The conversation

The conversation replaces the tab's home, and the tab bar stays visible. The top bar has Back;
the title **Japanese ⇄ English** (**Japanese → English** in Listening), which opens a menu with
**Play Translations Aloud** (turning it off switches to Text Only) and **Change Mode…**; and, on
the right, a pill with the timer and a pause button, like the iOS screen-recording indicator. The
timer is red while listening and gray while paused, and the button is a red pause while listening
and a blue play while paused. VoiceOver reads what's happening (**Listening**, **Hearing speech**,
**2 waiting for a pause**, **Speaking English · mic off**, **Paused**…). There is no stop button.

- **Cards.** Each sentence is a card in the Player's caption style, under a label such as
  **日本語 → EN** for each speaker's turn. The sentence being heard has a tinted fill and an
  accent outline, grows as it's recognized, and shows a provisional translation in italics; once
  the speaker finishes the sentence, it gets its final translation. A card turns active again
  while its translation is spoken, with **Speaking English** or **Speaking Japanese** under it.
- **Long speech.** A speaker who keeps talking gets one card per sentence in the same turn.
  Translations show at once, but their audio waits (**3 waiting for a pause**) and plays in order
  when the speaker pauses. A
  turn that runs for 30 seconds without a pause plays what's waiting anyway.
- **Scrolling.** The list follows the newest text. Scrolling up stops following and shows
  **Jump to Latest**.
- **Elsewhere in the app.** On other tabs, and on a word's full entry opened from the conversation, a full-width bar above the
  tab bar shows the same timer and button with a status line, reading **Conversation still listening ·
  Return** or **Conversation paused · Return** on other tabs; tapping it returns to the
  conversation.
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
first sentence and a line such as **Today, 09:12 · 6 turns**. Search, in the toolbar, matches the
Japanese or the English. Long-pressing a row offers **Copy**, **Share**, and **Delete**; the
**•••** menu offers **Keep History** (30 Days, 1 Year, or Forever) and **Delete All…**. Deleting
a conversation, or all of them, asks first, and there's no swipe to delete. Choosing a shorter
Keep History removes older conversations right away, and again at each launch. A conversation
opens as its transcript, with its length, turns, and mode above it; each turn names its language,
and every Japanese word is tappable. Its **•••** menu offers **Copy Transcript**, **Share**, and
**Delete Conversation**.

A conversation is saved after every translated sentence, so closing the app loses nothing; **Exit
Without Saving** deletes it. Conversations are stored only on the device, one file each.
Browsing History never turns on the microphone.

## Looking up words

Every Japanese word in the cards, History, and typed results is underlined and opens Word Detail
at half height, as in the Player; particles and punctuation aren't linked. **Open Full Entry**
opens the word inside the Translate tab. Looking a word up doesn't pause listening.
