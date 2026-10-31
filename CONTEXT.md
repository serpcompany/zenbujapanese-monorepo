# Zenbu Japanese

One Japanese dictionary shared by every Zenbu app: the Zenbu Japanese app, the website, and later
the browser extension.

## Language

**Zenbu Japanese app**:
The one app built from `apps/ios` for iPhone, iPad, and Mac, with one bundle ID and one App Store
record. iPhone, iPad, and Mac are its platforms, not separate apps (ADR 0015).
_Avoid_: Mac app or iPad app (as a product of its own), iOS app (for what also runs on the Mac)

**Look Up**:
The app's first tab, where a learner types, draws, or picks Japanese or English and reads the
dictionary's results. Its code keeps the name search (`SearchView`, `search.*` identifiers).
_Avoid_: Search (for the tab)

**search**:
The shared core's matching and ranking of a query (`packages/dictionary-core/src/search/`), which
Look Up, the website, and the dictionary service all run. Translate's Image Search and the
Player's YouTube search are other features.
_Avoid_: Look Up (for the core)

**Language Reference ID**:
Zenbu's permanent identity for a dictionary entry. Anything a learner saves or syncs refers to a
word by it.
_Avoid_: word ID, entry ID, ent_seq

**JMdict entry number**:
JMdict's own permanent number for an entry (`ent_seq`). It is the public ID at the end of a word
page URL and never keys learner data.
_Avoid_: word ID, Language Reference ID

**Site locale**:
The language a reader picks for the website, named by the URL prefix (none for English). It sets
the interface language and, where JMdict has them, the language of the meanings.
_Avoid_: dictionary language, language pair

**Known**:
A learner's own mark that they know a word or kanji. A linked app may set it, but only the
learner clears it.
_Avoid_: learned, mastered, "knows it" (Tomo's stage, which can set Known but isn't it)

**Learning**:
A word or kanji the learner marked as one they're learning: one of its three states, with
Unknown and Known. An app that shows only Known counts it as not known.
_Avoid_: studying, in progress, a "Learning list" (it's a state, not a list)

**Word card**:
The short form of a dictionary entry, keyed by Language Reference ID: the data. An app without the
language data shows it, and the browser extension's Word popup draws it.
_Avoid_: flashcard, entry, word page, word popup (the Word popup is where the extension shows it)

**Browser extension**:
The Zenbu Japanese extension for Chrome, built from `apps/extension`: its side panel, Settings
page, and what it draws on the pages a learner reads. The app's share-sheet
extension, `ZenbuShare`, is another thing.
_Avoid_: extension (alone, where the Share extension could be meant), plugin, add-on

**Page script**:
The browser extension's content script that underlines words and opens the Word popup on a site
Zenbu has (`apps/extension/src/content/page-lookup.ts`), registered at run time for those sites.
_Avoid_: content script (alone, where the YouTube, Netflix, or test one could be meant)

**Side panel**:
The browser extension's panel beside the page, Chrome's side panel: a tab bar with Player,
Translate, and Account, each tab with its own pages, such as Image Search. A word's card
and full entry are not its pages: they open in the Word popup (#1124), or from the Player tab in
the Word sheet. It has no Look Up,
since the extension has no dictionary search; the website has one (#1129, D3).
_Avoid_: sidebar, drawer, popup (the Word popup is another thing, and there is no toolbar popup)

**Word popup**:
What the browser extension shows for the word a learner clicks, over a page, or for a word in
Translate or in the Account tab's saved words, on the page beside the panel (in the panel where
the page can't show it): the
surface, which draws that word's Word card and its romaji, and expands in place into its full
entry. A word in the Transcript opens in the Word sheet instead.
_Avoid_: word card (the Word card is the entry the popup draws, not the popup), tooltip

**Word sheet**:
The sheet over the lower half of the browser extension's Player tab that a word clicked in the
Transcript opens, pausing the video: the Word popup's surface drawn in the panel, never on the
page, with a handle to full height and an X that plays the video again (#1172).
_Avoid_: Word popup (the popup is over a page; the sheet is in the panel), drawer, bottom sheet

**Zenbu Captions**:
The Japanese lines the browser extension gets for a YouTube or Netflix video and shows itself, in the side
panel's Player tab and as a caption on the player; also the switch that fetches them as soon as a
video opens and draws them on the player in place of the site's. A site's own captions are
the site's, which the extension hides while it draws its own.
_Avoid_: subtitles, YouTube captions or Netflix subtitles (for the extension's), Live Captions (heard speech, not built)

**Transcript**:
The side panel's Player tab in the browser extension: a YouTube or Netflix video's Zenbu Captions
under a control bar, one card for each line with its time range, the line playing marked, a card's
click playing from its line, and a word's click opening the Word sheet. The caption on the player
shows one line at a time instead.
_Avoid_: subtitles, captions (the lines themselves, or the player's caption)

**Player tab**:
The browser extension's side panel tab that holds the Transcript, or Recent when no video is open,
which was its Video tab. Its code keeps the old name: `VideoTab`, `src/video-tab/`, `video-tab-port.ts`, the product
doc `video-tab.md`, and the tests' "Video tab:" check names are all the Player tab.
_Avoid_: Video tab (for the tab; the code's name only)

**Caption on the player**:
The line being heard that the browser extension draws on a site's video player, with its words,
English, and popup, and the line controls beside it: previous, play or pause, next, Repeat line,
and the speed. One line at a time, as the Transcript shows them all.
_Avoid_: overlay, subtitles, the player's captions (the site's own)

**Video follower**:
The browser extension's view of the video on a page: its time, whether it plays, its speed, and
whether an ad shows, with seek, play, pause, and speed. YouTube and Netflix each have one.
_Avoid_: player (the site's own, or the Player tab in the app and the extension)

**Translation module**:
The browser extension's one way to translate (`apps/extension/src/translation/`), on Chrome's
on-device Translator, which its Translate and Player tabs use and its other surfaces will. The app's
Translate uses Apple Translation instead.
_Avoid_: translator (Chrome's Translator is the API under it), Translate (the tab)

**Linked app**:
An app outside the Zenbu apps, such as Tomodachi, in which a learner links their Zenbu
account.
_Avoid_: Zenbu app, client

**Subscription**:
What a learner bought in one store, the App Store or Stripe, kept by that store's own ID. An
account may hold more than one, from either store.
_Avoid_: plan, entitlement

**Entitlement**:
The account's one answer to whether its paid features are on, made from its subscriptions, with
the source, product, status, and expiry of the one that counts.
_Avoid_: subscription (for the account's answer), license

**appAccountToken**:
The random UUID an App Store purchase carries to name the Zenbu account it's for. It isn't the
Zenbu user ID, and it never changes.
_Avoid_: user ID, account ID
