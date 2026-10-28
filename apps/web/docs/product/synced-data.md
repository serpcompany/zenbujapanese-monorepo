# What an account syncs

A subscriber signed in on zenbujapanese.com sees what their Zenbu account syncs, and changes what
the website has a feature for, on pages under `/account/` (#934). The website keeps none of it in
the browser: each page reads the account when it opens, and each change goes to the account at
once, as a sync change by the rules every app's sync follows, so an app sees it at its next sync
and the website sees an app's at its next read ([`account-client-rules.md`](../../../../docs/agents/account-client-rules.md),
Keeping no copy). The word page's and kanji details' learner actions change the same data
([Dictionary](dictionary.md#word-page)).

Abbreviations: paths are under `apps/web/`. **Data page tests** are
`src/components/account/synced/synced-area.interaction.test.tsx` and
`src/components/account/synced/synced-kept.interaction.test.tsx`, which click through the pages in
a DOM with a stand-in for the service's sync routes (`src/test/synced-stand-in.ts`). **Synced
spec** is `e2e/synced-data.spec.ts`, the browser tests at a desktop and a phone width, with the
same stand-in. **Service tests** are the account service's `kind-reads.test.ts`, which reads one
kind, and `website-copy.test.ts`, where the website's copy and an app's sync client make changes
and end holding the same account ([`account-api.md`](../../../../docs/agents/account-api.md), Check
it).

## The pages

**Your synced data.** `/account/` has a section after the subscription that says what the account
syncs and links a page for each kind, as the app's Account tab has a row for each: Known Words,
Lists, Notes, Media Library, Recent videos (the Player's Recent), Bookmarked sentences
(Translate's), Recent searches, and Settings. Where the account needs a subscription for that
(the service's `cloudAccess` is `subscription_required`), it says seeing and changing them here
needs a subscription, as syncing does, and links the Subscription section above it, where #924's
purchase is.

- Source: #934, the owner's decisions of 2026-10-26: all synced data; editable where the website
  has the feature, and read-only, until it has, for the Player's Recent, Translate's bookmarks,
  the Media Library's photos, and the app's settings; a subscription required, with no
  browser-only store for free accounts; the website's and the apps' designs, which Devin adjusts.
  The app's Account tab (`apps/ios/docs/product/index.md`, Account).
- Check: Data page tests, "links each kind of synced data" and "points an account without a
  subscription to the subscription instead"; Synced spec, "the account page links each kind, and
  Lists opens to the lists with their word counts".

**Each page.** `/account/known-words/`, `/account/lists/` (and one list at `?list=<its ID>`),
`/account/notes/`, `/account/media-library/`, `/account/recent-videos/`, `/account/bookmarks/`,
`/account/recent-searches/`, and `/account/settings/`, in English and under `/ja/`, each with the
account pages' header, a link back to Your account, and `noindex, nofollow`, in no sitemap, kept
out of the edge's page cache, as the other account pages are ([Account pages](account.md)). Each
reads only its own kinds, after the session, and draws once it has read them all: "Loading…" until
then, nothing drawn in two steps. Signed out, it says so and links Sign in and Create an account;
without a subscription (the service answers `402`), it says so and links the subscription; when
the service can't answer, it says why, with Try again.

- Source: #934; the account pages' rules (#468).
- Check: Data page tests, "say signed out when the browser has no session, and read nothing",
  "point an account without a subscription to the subscription, changing nothing", and "say the
  service could not answer, and read again when asked"; Synced spec, "without a subscription, a
  page of synced data points to the subscription" and "signed out, a page of synced data offers
  signing in, and the Japanese one says it in Japanese"; `e2e/account.spec.ts`, "/account/lists/ is
  noindex, with the site's header and footer" and "no sitemap lists them";
  `src/lib/account/pages.test.ts`; `src/app/routes.test.ts`.

**Changes.** A change disables its button while it's sent, then the page reads its kinds again, so
it shows the account as it is, a change from another device included. A change made elsewhere
first shows the account's copy and says so; a note keeps the learner's text as a new note beside
the other, as the app does; a refused change says why (a list gone, full, or one too many; a note
too long) and changes nothing.

- Source: the client rules ([`account-client-rules.md`](../../../../docs/agents/account-client-rules.md)).
- Check: Data page tests, "renames a list, refuses a name the rule refuses, and shows another
  device's rename when it came first", "keeps the learner’s text as a new note when the note
  changed elsewhere first", and "opens one list: its words most recently added first, Known marked
  and Learning not, one removed, and a refusal said"; Service tests.

## Each kind

A word or kanji names its headword and reading, and links to its page: a word's own page, or the
kanji's search, which opens its details. The page asks the website where the words and kanji it
shows have pages (`/dictionary/pages.json`, which asks the dictionary service's `/v1/pages`, at
most 100 of each at a time) before it draws them, so a link never changes once drawn, and one list
asks only for its own words. While the dictionary can't answer, a word links to the search for its
headword, and a kanji to its search.

- Source: #934, the app's Word Detail from a saved word.
- Check: Data page tests, "draws no word until the dictionary has said where each word's page
  is" and "links a word to its search while the dictionary can't say where its page is";
  `src/lib/account/item-pages.test.ts`; `src/app/[locale]/dictionary/pages.json/route.test.ts`;
  Synced spec, "a word opens its own page, and a note on a word the dictionary dropped is listed
  without a word".

**Known Words.** Every word and kanji marked known, most recently marked first, with how many, a
box that narrows them by headword or reading, and Mark as Unknown on each.

The website doesn't show Learning yet, though the iOS app shows and sets it (#1051): a word or kanji
set Learning is shown as not known. It isn't on Known Words or badged Known on a list, and a word
page's Known dialog says it isn't marked Known and offers Mark as Known, which makes it Known.
Nothing else the website does ends Learning: Mark as Unknown on a word set Learning since the page
read it leaves it Learning ([client
rules](../../../../docs/agents/account-client-rules.md#keeping-no-copy)). A synced search results
filter of Learning shows as "Learning words" under Settings.

- Source: the app's Known Words (`apps/ios/docs/product/index.md`); #1035, #1043, #1045, and #1051.
- Check: Data page tests, "lists every word and kanji marked known, most recently marked first, not
  one set Learning, and marks one unknown"; the dialog's tests, "a word another app set Learning is
  not Known, as the website shows only Known, and Mark as Known makes it Known" and "Mark as Unknown
  never ends Learning: a word set Learning elsewhere since the dialog read it stays Learning"; the
  service's `website-copy.test.ts`, "a word an app set Learning stays Learning through the website,
  which shows it not known, until the learner marks it Known there" and, as the iOS app sends every
  state (#1051), "with an app that sends every state as set, a stale website change never ends
  Learning or makes it Known"; Synced spec, "a new list is made, and Known Words marks a word
  unknown".

**Lists.** Every list in the learner's order, each with how many words it holds and linking to the
list; New List, which takes a name by the account's rule (1 to 500 characters once trimmed) and
puts the list last; and on each list, Move up and Move down, Rename, and Delete, which asks first
when the list has words. A list shows its words most recently added first, with Known on the ones
marked known, a box that narrows them, Remove on each, and Rename and Delete; a list the account
no longer has says so.

- Source: the app's Lists (`apps/ios/docs/product/index.md`); the account rules' list name.
- Check: Data page tests, "shows every list in its order with its word count, makes one after the
  last, and moves one", "deletes an empty list at once, and asks before deleting one that has
  words", "opens one list: its words most recently added first, Known marked and Learning not, one
  removed, and a refusal said", and "says a list the account no longer has is gone"; Synced spec, "a list opens to
  its words, newest first, with Known marked, and a word comes off it".

**Notes.** Every note on a word or kanji, newest change first, each with Edit, which saves a text
by the account's rule (1 to 10,000 characters, never cut), and Delete, which asks first. Under
**Notes Without a Word**, the notes on a word or kanji the dictionary has no page for (one a
dictionary update dropped, which `RetiredEntries.json` names, or a kanji it lacks) and those an
earlier version saved under a note identity, each with the headword it was saved on, Copy, and
Delete, as the app's list has.

- Source: the app's notes and Notes Without a Word (`apps/ios/docs/product/saved-data.md`).
- Check: Data page tests, "changes a note's text, holding it to the rule, and asks before deleting
  one", "lists a note whose word has no page under Notes Without a Word, with the word it was saved
  on, to copy or delete", and "lists a note on a word or kanji a dictionary update dropped under
  Notes Without a Word too, and links the others to their pages"; Synced spec, "a note is changed,
  a recent search cleared, and a frequency dictionary chosen", and "a word opens its own page, and
  a note on a word the dictionary dropped is listed without a word".

**Media Library, Recent videos, and Bookmarked sentences.** As they are, with nothing to change,
since only the app has these features: each photo with its image, read from the account as it
scrolls into view a few at a time in a frame of its own size, its name, when it was saved, and the
words it's on (or that the account has lost its file); the 50 videos the Player watched most
recently, newest first, each linking to YouTube, with its channel, when, and how far in; and each
bookmarked sentence, newest first, with its translation and language.

- Source: #934 (read-only until the website has these features).
- Check: Data page tests, "the Media Library: each photo, its file, when it was saved, and the words
  it is on", "a photo whose file the account lost says so", and "Player's Recent and Translate's
  bookmarks, newest first, with nothing to change".

**Recent searches.** The account's 50 most recent searches, newest first, each linking to its
search, with Remove, and Clear All, which asks first.

A subscriber's searches on the website go into them as the app's do: each search the learner asks
for, as the box submits it, a reading refinement, a kanji picked from radicals (the box's text with
the kanji), or a recent search picked here, normalized as the core normalizes a query, once the
results page has drawn. A search page reached any other way (a link, the address bar, a reload, or
Back) adds nothing, as a link opened in the app adds nothing. Recording draws nothing and changes
nothing the page shows, so its HTML and cache stay as they were: in the browser, it asks the
account for its search key (a `POST /v1/sync` with no changes), then sends the search under its ID
through `AccountCopy`; the account keeps the later time of a query searched again and the 50
latest. Signed out, nothing is kept or sent, and without a subscription the account refuses the key
before any search is sent.

- Source: the app's Recent searches (`RecentSearchStore`, `SearchView.completeSubmission`); the
  client rules ([`account-client-rules.md`](../../../../docs/agents/account-client-rules.md),
  Recent searches and Keeping no copy); #934.
- Check: Data page tests, "lists them newest first, linked to their search, removes one, and
  clears the rest after asking" and "picking one searches it again, as the app does, so it goes up
  as the newest"; `src/components/dictionary/record-search.interaction.test.tsx`; the search box's
  and radical panel's tests; Synced spec, "a note is changed, a recent search cleared, and a
  frequency dictionary chosen"; `e2e/recent-searches.spec.ts`.

**Settings.** The frequency dictionaries the app ranks words by, in their order, with Move up,
Move down, and Remove on each, and Add on the others; until the learner chooses, it says the app
uses its own, JLPT Levels then YouTube. Under In the app, each setting the learner changed in the
app, by its name in the app, with its value, as it is.

- Source: the app's Frequency Dictionaries and settings (`apps/ios/docs/product/index.md`); the
  settings the service syncs (`packages/account-rules/src/settings.ts`).
- Check: Data page tests, "shows the app's own frequency dictionaries until chosen, then sets the
  account's in their order"; Synced spec, "a note is changed, a recent search cleared, and a
  frequency dictionary chosen".
