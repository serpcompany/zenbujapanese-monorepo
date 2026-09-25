# iOS product documentation

This folder describes user-facing behavior that exists in the Zenbu Japanese iOS app.
It is updated with the implementation and is not a roadmap or an ideas backlog.

The current app has two tabs:

- **Search** opens the [Lookup](lookup.md) Product Experience.
- **You** opens personal content, preferences, language-resource management, and credits.

## You

You is a supporting navigation area rather than a separate Product Experience. It provides:

- the Media Library;
- independent Furigana and Romaji preferences;
- management of optional frequency dictionaries and Japanese Text Analysis resources; and
- source credits and attributions.

Frequency Dictionaries offers checksum-pinned optional packs for streaming,
fiction, news, anime, Japanese dictionary definitions, television, online video,
and broad web Japanese. These packs download directly from their public source
catalog, are mapped locally into Zenbu's dictionary, and can be activated or
removed independently. Their rows disclose that occurrence counts, tokenizer
details, provenance, and redistribution terms are not published by the catalog.
Each compact pack card shows its current status, source domain, storage or download
size, source link, and available actions.

### Media Library

The current Media Library works like a small saved-photo album. It contains images associated
with words through Image Search or Word Detail. Each image appears once with all of its
associated words, even when several words share it. A learner can view an image, remove its
association from one word, or delete the image and all of its word associations.

These images are stored locally and participate in normal system-managed device backup. The
Media Library is not currently a general file store, import system, analysis tool, sync service,
or publishing destination.
