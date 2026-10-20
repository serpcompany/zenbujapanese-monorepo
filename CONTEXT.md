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

**Word card**:
The short form of a dictionary entry, keyed by Language Reference ID, that an app without the
language data shows.
_Avoid_: flashcard, entry, word page

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
