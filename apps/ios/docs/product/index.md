# iOS product documentation

This folder describes user-facing behavior that exists in the Zenbu Japanese iOS app.
It is updated with the implementation and is not a roadmap or an ideas backlog.

The current app has two tabs:

- **Search** opens the [Dictionary](dictionary.md) Product Experience.
- **Account** opens personal content, preferences, language-resource management, support, and credits.

## Account

Account is a supporting navigation area rather than a separate Product Experience. There is no
sign-in yet; the tab holds on-device content and preferences. It provides:

- the Media Library;
- independent Furigana and Romaji preferences;
- management of optional frequency dictionaries;
- Help & Support and the Privacy Policy, which open the Zenbu website; and
- the app's name, version, and description above source credits and attributions.

Rows use Settings-style tinted icon tiles in grouped cards without section headings.

Frequency Dictionaries includes JLPT Levels and TUBELEX YouTube Japanese in the app and offers
Japanese Wikipedia plus nine checksum-pinned optional packs for Netflix, novels,
slice-of-life anime, NHK, shonen anime, Japanese dictionary definitions, visual novels,
television, and broad web Japanese. Optional packs are downloaded on request and mapped
locally into Zenbu's dictionary. A learner can enable any number of installed packs,
including none. A newly downloaded pack is enabled automatically. JLPT Levels and TUBELEX can
be disabled but not removed, and removing an optional pack also disables it. A new install
enables JLPT Levels first and TUBELEX second. JLPT Levels marks words with an estimated N5–N1
level from Jonathan Waller's lists; JLPT publishes no official vocabulary list, so the app
presents levels as unofficial study estimates.

The screen lists one row per pack in three sections. **Enabled** holds packs that are
switched on, in priority order; Edit reorders them. Ranks appear in this order, and Search
sorts by the first pack, breaking ties with each next pack. **Installed** holds downloaded packs that are switched off, and
**Available** offers a download button for each remaining pack. A row's subtitle shows its
domain and size, or a download failure. Swiping a row reveals Details and Remove, and Update
when a newer version exists. When the app upgrades from the single active pack, that pack
becomes the only enabled one. An update that adds a bundled pack, such as JLPT Levels, enables
it once at the top of the learner's list; disabling it afterward is remembered.

### Media Library

The current Media Library works like a small saved-photo album. It contains images associated
with words through Image Search or Word Detail. Each image appears once with all of its
associated words, even when several words share it. A learner can view an image, remove its
association from one word, or delete the image and all of its word associations.

These images are stored locally and participate in normal system-managed device backup. The
Media Library is not currently a general file store, import system, analysis tool, sync service,
or publishing destination.
