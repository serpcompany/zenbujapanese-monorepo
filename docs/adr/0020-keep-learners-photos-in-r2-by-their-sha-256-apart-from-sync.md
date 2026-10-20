---
status: accepted
---

# Keep learners' photos in R2, by their SHA-256, apart from sync

A learner's Media Library photos and profile photo follow their Zenbu account (#867). The owner
chose Cloudflare R2 for their files (#867, decision 1). The account service keeps each file in an
R2 bucket for its environment, names it by the SHA-256 of its bytes, and takes it through its own
routes, `PUT` and `GET /v1/photos/{photoId}`, while the photos and the words each is on sync as
entities through `POST /v1/sync`, like everything else an account keeps
([ADR 0013](0013-run-accounts-and-sync-in-their-own-service-on-the-api-servers.md)).

## Why

- **Sync's bodies are small.** A sync request is at most 64 KB, so the journal stays fast and
  every change stays one row. A photo's file is up to 12 MB.
- **The app already names photos by their hash.** The iOS app's Media Library keys each photo by
  its SHA-256, so the account's ID is the device's, two devices that save one image hold one photo,
  and the service can check every upload against its name.
- **An upload is idempotent.** The same bytes under the same name change nothing, so an app that
  lost an answer uploads again.
- **R2 holds files; Postgres holds rules.** The database keeps which file is whose, and the R2
  key, and the database's backups stay small.

## Costs

- **Two steps.** An app uploads a file before the change that names it, and a change sent first
  is rejected (`photo_not_uploaded`).
- **A file is kept as sent.** The service never re-encodes or resizes it, since that would change
  its name. A smaller copy would be the app's to make, under its own hash.
- **A queue to delete.** R2 is outside the database's transactions, so every deletion from it goes
  through a queue the service sweeps, and an upload holds its key there until its row is saved.
- **Backups don't hold photos.** A restored database can name a file deleted since, or miss one
  saved since (`docs/agents/account-photos.md`, A restore).
- **A second store to set up and pay for**, in each environment, and nginx's body limit raised for
  the photo routes.
