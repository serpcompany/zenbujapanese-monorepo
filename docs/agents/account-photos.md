# Photo files in the account service

The account service keeps the files of a learner's Media Library photos and profile photo in
Cloudflare R2 (#867, decision 1; [ADR 0018](../adr/0018-keep-learners-photos-in-r2-by-their-sha-256-apart-from-sync.md)).
The photos themselves, and the words each is on, are sync entities
([`account-entities.md`](account-entities.md)); this doc is their files. The service is
[`account-api.md`](account-api.md), and the routes are in the
[API reference](../api/account-api.md#put-v1photosphotoid).

## Upload and download

A file is named by the SHA-256 of its bytes, which is the ID the iOS app's Media Library already
gives each photo. An app uploads it before the sync change that names it:

1. `PUT /v1/photos/{photoId}` with the bytes, which answers `201` with the file (`id`,
   `contentType`, `byteSize`, `uploadedAt`), or `200` if the account already holds it. If the
   account names the file but its storage lost it, as after a restore, the upload puts it back,
   under a new key as any upload is.
2. A `photo`'s `add` or the `profilePhoto`'s `set` naming it, which the service rejects
   `photo_not_uploaded` until the account holds the file.

`GET /v1/photos/{photoId}` streams the bytes with their type, `Cache-Control: private,
max-age=31536000, immutable` (a file never changes under its ID), `Content-Disposition: attachment`,
and `X-Content-Type-Options: nosniff`. A `404` is `not_found` when the account names no such file
for this app, and `photo_file_missing` when it names the file but storage hasn't it; a client
never deletes a photo for either, since a real deletion comes down in sync. Storage that fails in
any other way, a missing bucket included, is a `500`, never a missing file. Each call to R2 gives
up when R2 hasn't answered in 30 seconds; once it has, a download's bytes stream for as long as
they take, and a stream cut partway is logged (`a photo download was cut`). The website may call
both routes from its own origins (CORS).

**Who may.** Uploading needs `photos:write` or `profile`; downloading `photos:read`, or `profile`
for the profile photo's file alone. An app with only `profile`, such as the website, holds at
most two files it uploaded itself (`photo_files.profile_upload_at`), the profile photo and the one
replacing it, whatever other apps upload; a Media Library photo's file counts once it uploads the
same image. It's answered as though the library held nothing, `201` below two and `409` at two,
and its upload always puts the bytes in R2 (an image the account holds moves to the new key), so
it learns nothing of the library, even from how long an upload takes. It sets the profile photo
only to a file it uploaded, a library photo's included: it has the image. A file stops counting
when the profile photo moves off it, or a day after its upload if it never became the profile
photo.

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
  of a few MB puts a full library near 3 GB. An emptied photo holds its place for its 30 days:
  the service can't tell whether a device has a word queued that brings it back, so it never
  deletes one early. An app with only `profile` isn't held to the 1,000, only to its own two, so
  the library's count tells it nothing.
- **500 words a photo** (`photo_full`), as a list holds 5,000: a photo is on a few words.
- **300 requests a minute** from each account and app to `/v1/photos`, so a first upload of a full
  library takes a few minutes, bound by the device's connection rather than the limit.
- **4 uploads at once in each slot, 2 from one account; 16 downloads, 4 from one account** (`atOnce`,
  `src/http/rate-limit.ts`). The next answers `429` with `Retry-After: 1`. A slot has 512 MB
  ([`api-servers.md`](api-servers.md), The deployer): an upload holds its file, up to 12 MB, while
  it hashes and sends it, and a download streams from R2 without holding the file, keeping its
  turn until the last byte is sent or the connection closes, even before the answer starts (the
  request's abort signal), so one account can neither fill a slot's memory nor take every turn.

What R2 costs at these sizes is the owner's call (#867); the limits are in `photoLimits`
(`src/domain/photo-limits.ts`).

## How a file is kept and deleted

`photo_files` holds each file an account has: its SHA-256, type, size, and R2 key. The key is
`<account ID>/<a new UUID>`, in the account's folder, and new for every upload, never the hash: a
file deleted and uploaded again, or lost and put back, gets a new key, so a deletion waiting for
the old one can never delete the new copy.

Every deletion from R2 goes through `photo_file_deletions`, a queue of keys that names no account,
so it outlives the account it came from:

- **An upload holds its key first.** Before putting the bytes to R2, the service queues the new
  key to be deleted in 24 hours, then cancels that once the file's row is saved or moved to it;
  a key it didn't use is queued for now, and one it replaced for 24 hours on, after any download
  still reading it. An upload cut off between the two, or one whose photo was deleted meanwhile,
  leaves nothing in R2 that no row names or the queue awaits.
- **A file no photo names goes.** When a photo is deleted, or the profile photo replaced or
  removed, the file's row goes and its key is queued, unless the other still names the same file.
  An emptied photo keeps its file until it's deleted, 30 days on.
  A file no photo names 24 hours after its upload goes the same way, in the hourly housekeeping
  (`src/db/housekeeping.ts`), which works through at most 10,000 files, and 10,000 photos of each
  kind, an hour, and stops counting a file an app with only `profile` uploaded a day ago and never
  made the profile photo.
- **Deleting an account** queues its whole folder, `<account ID>/`, in the transaction that
  deletes it, so every key under it goes: one an upload is saving at the same moment, or a file a
  restore left behind, too.
- **The sweep** deletes each queued key that's due from R2, and every object under a queued
  folder, then the row: right after a deletion or a sync that changed something, and every hour,
  so a key R2 didn't take is tried again. Deleting a key R2 hasn't is fine.

## A restore

Photo files aren't in the database's backups: they stay in R2. A database restored from a backup
names the files it had then. A photo deleted since comes back in the account (Back up and
restore, in [`account-api.md`](account-api.md)), and its file answers `photo_file_missing`, which no
app takes as a deletion, until a device that still has the image uploads it again, as one signing
in to the account for the first time does. A photo saved since the
backup is gone from the account, and its file stays in R2 with nothing naming it until the account
is deleted, which the debt list records ([`harness-debt.md`](../harness-debt.md), Delivery).

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
4. **nginx**, in the API host's sites in the nginx repository: a regex location for
   `^/v1/photos/` nested in the account location, with `client_max_body_size 13m;` and its own
   `proxy_pass`, so only photo uploads get past nginx's 1 MB default (the site is in
   [`api-servers.md`](api-servers.md), The API host).
5. **Check it on staging**: an upload answers `201`, a download the same bytes, and deleting the
   account leaves nothing under its ID in the bucket.

`ACCOUNT_API_PHOTOS=dev-memory` keeps files in the process on a local run, for the `verify-service`
skill; the image refuses it.

## Check it

`src/http/photo-files.test.ts` uploads and downloads through the service with the in-memory
stand-in: a file kept under a new key and answered with its type and headers, a second upload
changing nothing, another account's file and an unknown one answering `404`, a lost file answered
`photo_file_missing` and put back by an upload, one put back while its photo is deleted leaving no
stray object, each refused upload, each image type read from its bytes, the 1,000-file cap with an
emptied photo keeping its place for a word sent later, `503` with no storage, the slots for one
account while the service has room and for the service, a download keeping its slot until its
body is sent, cancelled, or cut or its client goes, a cut one logged, a `HEAD` giving its slot back
at once, and CORS for the website. `src/http/download-disconnect.test.ts` runs the real Node
adapter: downloads whose clients leave before the answer starts give their slots back.
`src/http/photos.test.ts` and `src/http/profile-photo.test.ts` hold the photo entities to their
rules, and show a file swept from storage after the sync that deleted its photo, an emptied photo
keeping its file, the hour's housekeeping emptying and deleting a photo and sweeping its file, a
file shared by the profile photo and a Media Library photo kept while either names it, an unnamed
file released after 24 hours, housekeeping past one batch, and an app with only `profile` given the
same answers and R2 puts whether or not the library holds an image, kept to two files of its own
whatever other apps upload, setting a library photo once it uploads the image, and freed of a file
the profile photo moved off or it never set. `src/http/photo-bounds.test.ts` shows a device away
during a thousand word removals from other photos still told of one before them, one away while a
photo is deleted and saved again dropping its old words, one whose cursor predates a forgotten
word removal or photo deletion refused `410`, rereading, and dropping it, and a photo word or photo
the account forgot coming back past its versions. `src/http/delete-account.test.ts`
deletes an account's folder from storage with it, a file no row names included, and then refuses
its token at both routes (`401`). `src/db/postgres.test.ts`, on a real Postgres, uploads one photo
six times at once: one file is kept, and the other copies are swept; and it deletes the file
of an upload saving its row while its account is being deleted. `src/storage/r2.test.ts` runs
the R2 adapter against a stand-in S3 server: each request signed with SigV4 and the body's SHA-256,
an object put, streamed, checked, deleted, and missing, a folder deleted page by page, a missing
bucket never taken for a missing object, a refusal thrown with only its status, a download whose
body outlasts the 30 seconds streamed whole, and a request R2 never answers given up on.
