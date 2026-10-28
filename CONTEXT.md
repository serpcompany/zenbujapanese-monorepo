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

**Side panel**:
The browser extension's panel beside the page, Chrome's side panel: a tab bar with Video,
Translate, Images, Words, and Recent, each tab with its own pages, such as a word's.
_Avoid_: sidebar, drawer, popup (the Word popup is another thing, and there is no toolbar popup)

**Word popup**:
What the browser extension shows over a page for the word a learner points at: the surface,
which draws that word's Word card and its romaji.
_Avoid_: word card (the Word card is the entry the popup draws, not the popup), tooltip

**Zenbu Captions**:
The Japanese lines the browser extension gets for a YouTube video and shows itself, in the side
panel's Video tab and as a caption on the player; also the switch that fetches them as soon as a
video opens. YouTube's own captions are the site's, which the extension can hide.
_Avoid_: subtitles, YouTube captions (for the extension's), Live Captions (heard speech, not built)

**Video follower**:
The browser extension's view of the video on a page: its time, whether it plays, its speed, and
whether an ad shows, with seek, play, pause, and speed. YouTube has one; Netflix's is to come.
_Avoid_: player (the site's own, or the app's Player tab)

**Translation module**:
The browser extension's one way to translate (`apps/extension/src/translation/`), on Chrome's
on-device Translator, which its Translate tab uses and its other surfaces will. The app's
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
