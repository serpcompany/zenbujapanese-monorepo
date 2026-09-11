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

### Media Library

The current Media Library works like a small saved-photo album. It contains images associated
with words through Image Search or Word Detail. Each image appears once with all of its
associated words, even when several words share it. A learner can view an image, remove its
association from one word, or delete the image and all of its word associations.

These images are stored locally and participate in normal system-managed device backup. The
Media Library is not currently a general file store, import system, analysis tool, sync service,
or publishing destination.
