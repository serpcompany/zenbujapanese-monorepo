---
status: accepted
---

# Preserve Encounter Media for words opened from Image Text

When a learner opens a Language Reference Data entry from an Image Text Flow,
Zenbu automatically preserves one **Encounter Example** linking that word to the
source image as **Encounter Media**. The media is copied into app-owned on-device
storage and remains available from Word Detail and the Media Library after a cold
relaunch. Opening Image Text alone does not retain the image; the learner must
open a word. Unopened recognized words are not saved.

The learner may also add another image from Word Detail through Apple's native
Photo Library picker. Each successful selection creates another association;
choosing the same image again remains idempotent.

One word may have many Encounter Media associations, and one image may be shared
by many words. Image bytes are addressed by SHA-256, so reopening the same word
from the same image is idempotent and opening several words from one image stores
one blob. Removing an association in Word Detail preserves any other word's
association. Deleting Encounter Media from the Media Library removes every
association and its blob. A corrupt or missing index/blob fails closed by showing
no media. Because these records are learner-retained and may not be recreatable,
they participate in the iPhone's normal system-managed backup.

Word Detail shows the latest thumbnail and the number of associated images. Its
native paged viewer exposes **Remove from Word** for the selected association.
The Media Library shows each retained image once with all associated words and
supports deleting the media itself. Durable writes complete before either view
refreshes.

Encounter Media is not an Image Text Result, Saved Language Item, Media Entry,
provider-supplied example, or canonical dictionary image. It stores no network
URL or provider identity and is never uploaded by this capability. The lightweight
Media Library in version 1 manages Encounter Media only; importing and analyzing
larger works remains a separate Media Entry contract.
