# Photo files in the account service

The account service keeps the files of a learner's Media Library photos and profile photo in
Cloudflare R2 (#867, decision 1; [ADR 0017](../adr/0017-keep-learners-photos-in-r2-by-their-sha-256-apart-from-sync.md)).
The photos themselves, and the words each is on, are sync entities
([`account-entities.md`](account-entities.md)); this doc is their files. The service is
[`account-api.md`](account-api.md), and the routes are in the
[API reference](../api/account-api.md#put-v1photosphotoid).

## Upload and download

A file is named by the SHA-256 of its bytes, which is the ID the iOS app's Media Library already
gives each photo. An app uploads it before the sync change that names it:

1. `PUT /v1/photos/{photoId}` with the bytes, which answers `201` with the file (`id`,
   `contentType`, `byteSize`, `uploadedAt`), or `200` if the account already holds it.
2. A `photo`'s `add` or the `profilePhoto`'s `set` naming it, which the service rejects
   `photo_not_uploaded` until the account holds the file.

`GET /v1/photos/{photoId}` answers the bytes with their type, and `Cache-Control: private,
max-age=31536000, immutable`: a file never changes under its ID. Uploading needs `photos:write` or
`profile`; downloading needs `photos:read`, or `profile` for the profile photo's file alone, so a
website that shows the profile never reads the Media Library.

The service refuses bytes whose SHA-256 isn't the ID (`400 photo_digest_mismatch`), bytes that
aren't a JPEG, PNG, HEIC, HEIF, AVIF, GIF, WebP, TIFF, or BMP image, by their first bytes rather
than their `Content-Type` (`415 unsupported_photo`), a file over 12 MB (`413 too_large`), and a
1,001st file (`409 too_many_photos`). It keeps the bytes as they came: re-encoding or resizing
would change the hash the photo is named by.

## The limits, and why

- **12 MB a file**: the largest image file the iOS app imports from Files or a drop. Its camera and
  photo library copies are JPEGs of at most 4,096 pixels, a few MB, and its profile photo a 512
  pixel JPEG, so nothing the app makes today is refused.
- **1,000 files an account**, the profile photo's included: room for a Media Library far larger than
  a learner builds by hand, while bounding what one account can store at 12 GB. A typical photo
  of a few MB puts a full library near 3 GB.
- **500 words a photo** (`photo_full`), as a list holds 5,000: a photo is on a few words.
- **300 requests a minute** from each account and app to `/v1/photos`, so a first upload of a full
  library takes a few minutes, bound by the device's connection rather than the limit.
- **4 uploads at once** in each slot, and the next answers `429` with `Retry-After: 1`: a slot has
  512 MB of memory ([`api-servers.md`](api-servers.md), The deployer), and each upload holds its
  file, up to 12 MB, while it hashes and sends it.

What R2 costs at these sizes is the owner's call (#867); the limits are in `photoLimits`
(`src/domain/photo-files.ts`).

## How a file is kept and deleted

`photo_files` holds each file an account has: its SHA-256, type, size, and R2 key. The key is
`<account ID>/<a new UUID>`, keyed by account, and new for every upload, never the hash: a file
deleted and uploaded again gets a new key, so a deletion waiting for the old one can never delete
the new copy.

Every deletion from R2 goes through `photo_file_deletions`, a queue of keys that names no account,
so it outlives the account it came from:

- **An upload holds its key first.** Before putting the bytes to R2, the service queues the new
  key to be deleted in 24 hours, then cancels that once the file's row is saved. An upload cut
  off between the two leaves nothing in R2 for good.
- **A file no photo names goes.** When a photo is deleted, or its last word removed, or the
  profile photo replaced or removed, the file's row goes and its key is queued, unless the other
  still names the same file. A file no photo names 24 hours after its upload goes the same way,
  in the hourly housekeeping (`src/db/housekeeping.ts`).
- **Deleting an account** queues every key the account has in the transaction that deletes it.
- **The sweep** deletes each queued key that's due from R2, then its row: right after a deletion
  or a sync that changed something, and every hour, so a key R2 didn't take is tried again.
  Deleting a key R2 hasn't is fine.

## A restore

Photo files aren't in the database's backups: they stay in R2. A database restored from a backup
names the files it had then. A photo deleted since comes back in the account (Back up and
restore, in [`account-api.md`](account-api.md)), and its file, deleted since, answers `404`: the
app deletes such a photo again. A photo saved since the backup is gone from the account, and its
file stays in R2 with nothing naming it, which the debt list records
([`harness-debt.md`](../harness-debt.md), Delivery).

## Set it up

Nothing here is created by an agent; the owners make each of these.

1. **A bucket for each environment** (Cloudflare dashboard → R2 Object Storage → Create bucket):
   `zenbujapanese-account-photos-staging` and `zenbujapanese-account-photos-production`, Standard
   storage, no public access, no custom domain, and no lifecycle rule: the service deletes.
2. **A token for each** (R2 → Manage API tokens → Create Account API token): Object Read & Write,
   applied to that environment's bucket alone. It shows an Access Key ID and a Secret Access Key
   once.
3. **Each environment's file** (`sudoedit /etc/zenbujapanese-account-api/staging.env`):
   ```sh
   ACCOUNT_API_PHOTOS=r2
   R2_ENDPOINT=https://<cloudflare account id>.r2.cloudflarestorage.com
   R2_PHOTOS_BUCKET=zenbujapanese-account-photos-staging
   R2_ACCESS_KEY_ID=<the token's access key ID>
   R2_SECRET_ACCESS_KEY=<the token's secret>
   ```
   The deployer deploys the environment again within 5 minutes, and the service's `listening` log
   line says `"photos":"r2"`.
4. **nginx**, in the API host's sites in the nginx repository: `photos` in the account location,
   `location ~ ^/v1/(auth|me|sync|photos|health)(/|$)`, and `client_max_body_size 13m;` in it, since
   nginx refuses a body over 1 MB by default ([`api-servers.md`](api-servers.md), The API host).
5. **Check it on staging**: an upload answers `201`, a download the same bytes, and deleting the
   account leaves nothing under its ID in the bucket.

`ACCOUNT_API_PHOTOS=dev-memory` keeps files in the process on a local run, for the `verify-service`
skill; the image refuses it.

## Check it

`src/http/photo-files.test.ts` uploads and downloads through the service with the in-memory
stand-in: a file kept under a new key and answered with its type and cache headers, a second upload
changing nothing, another account's file and an unknown one answering `404`, each refused upload,
each image type read from its bytes, the 1,000-file cap, `503` with no storage, and a fifth upload
at once turned away until one of four finishes.
`src/http/photos.test.ts` and `src/http/profile-photo.test.ts` hold the photo entities to their
rules, and show a released file swept from storage, a file shared by the profile photo and a Media
Library photo kept while either names it, an unnamed file released after 24 hours, and an app with
only `profile` reading the profile photo's file and no other. `src/http/delete-account.test.ts`
deletes an account's files from storage with it. `src/storage/r2.test.ts` runs the R2 adapter
against a stand-in S3 server: each request signed with SigV4 and the body's SHA-256, an object put,
read, deleted, and missing, and a refusal thrown with only its status.
