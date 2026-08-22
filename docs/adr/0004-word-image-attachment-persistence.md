---
status: accepted
---

# Persist the latest Image Text source image for an opened word

When a learner opens a Language Reference Data entry from an Image Text Flow,
Zenbu will automatically create or replace that entry's **Word Image
Attachment**. The attachment is copied into app-owned on-device storage and is
available when the same entry is later opened through ordinary Search, including
after a cold relaunch. Opening Image Text alone does not retain an attachment;
the learner must open the word. Unopened recognized words are not saved.

Version 1 retains one latest attachment per app-owned dictionary-entry identity.
Image bytes are addressed by SHA-256 and shared across entry links, so opening
several words from one photo stores one blob rather than several copies.
Replacing or removing a link deletes an unreferenced blob. A corrupt or missing
index/blob fails closed by showing no attachment. The attachment directory is
excluded from device backup because its contents can be recreated or removed
from Word Detail.

Word Detail labels the thumbnail **Saved Image**, describes the viewer as saved
automatically from Image Text, and exposes **Remove from Word**. Removal completes
the durable write before the thumbnail disappears, preventing an immediate app
termination from restoring deleted context.

A Word Image Attachment is not an Image Text Result, Saved Language Item,
Encounter Example, Media Entry, provider-supplied example, or canonical dictionary
image. It stores no network URL or provider identity and is never uploaded by
this capability. A future multi-image encounter history requires a separate
product and persistence decision rather than silently widening this latest-image
contract.
