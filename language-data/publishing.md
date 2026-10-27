# Publishing a language-data release

Where releases live, the address they're served at, how the `Language data release` workflow
publishes one with its gzipped copies, and why nothing published is overwritten. What a release
holds, and how it's pinned, is in [`README.md`](README.md).

## Where releases live

The `zenbujapanese-language-data` R2 bucket, in the SERP Cloudflare account. It holds:

| Key | What it is | Written |
| --- | --- | --- |
| `files/<sha256>/<name>` | A release file, content-addressed, so an unchanged file keeps one object across releases. | Once. Never overwritten. |
| `releases/<release>/manifest.json` | A release's manifest. | Once, after every file it names. Never overwritten. |
| `releases.json` | Every release, oldest first: `release`, `manifest_sha256`, `git_commit` (the manifest's), and `published_at` (UTC). The schema is `zenbu.language-data-releases.v1`. | After the manifest. Only ever appended to. |
| `files/<sha256>/<name>.part<N>.gz` | Part N, from 1, of a SQLite or JSON file's gzipped copy, addressed by the part's own SHA-256 ([Gzipped copies](#gzipped-copies)). | Once. Never overwritten. |
| `releases/<release>/compressed.json` | A release's gzipped copies: each SQLite and JSON file's parts, in order. The schema is `zenbu.language-data-compressed.v1`. | Once, after `releases.json` lists the release and every part it names is in. Never overwritten. |

There's no `latest` pointer: a client pins a release ID and checks the manifest's SHA-256 against
`releases.json`, then each file's against the manifest. Each object also records the SHA-256 its
uploader sent in `x-amz-meta-sha256`. That's a label, not a check. Every object but `releases.json`
is served `immutable`, and `releases.json` `no-cache`. No check before merge reads the bucket: CI
compares with the pins.

## Publishing a release

1. Bump [`release.json`](release.json) to the next ID and pin it
   ([Changing the data](README.md#changing-the-data)).
2. Merge to `main`. The [`Language data release`](../.github/workflows/language-data-release.yml)
   workflow runs on every push to `main` that changes `language-data/**` or any other root in
   `release-inputs.json` (a test keeps the two in step), or by hand (Actions → Language data
   release → Run workflow). It:
   1. fails straight away, naming them, when the `language-data-release` environment has no
      `R2_ACCESS_KEY_ID` or `R2_SECRET_ACCESS_KEY` secret;
   2. rebuilds the release from the commit, with the tests and every check the build makes, and
      fails unless it is the pinned release;
   3. reads `releases.json` and fills in the manifest's `previous_release` and
      `previous_manifest_sha256` from its latest entry;
   4. uploads each file that isn't in the bucket yet, then the manifest, then the new
      `releases.json`, after checking the staged release against its pin again, and then the
      gzipped copies of every listed release that has none ([Gzipped copies](#gzipped-copies));
   5. reads it all back: `releases.json`, the manifest's SHA-256, links, and content, which must
      be the pin's, every file's size and SHA-256 (downloading and hashing each one), and the
      release's gzipped copies (downloading, hashing, and unpacking each part).

Only this workflow publishes. In the job that holds the token, every action is pinned by commit
SHA, and Python packages are installed with `--require-hashes` from the hashed
[`requirements.txt`](pipeline/requirements.txt). It runs in the `language-data-release`
environment, which deploys only from `main` and has no required reviewer, by the owner's decision: add one in Settings →
Environments to review each release by hand. Its token is an R2 S3-API token for this bucket
alone, reached at `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com` through the AWS CLI.
`publish.py` takes the bucket and endpoint from `R2_BUCKET` and `R2_ENDPOINT`, and the token from
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, which the workflow sets from the
`R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` secrets. It doesn't use the repository's
`CLOUDFLARE_API_TOKEN`. Never upload from a workstation.

### Immutability

- **A file or manifest is never overwritten.** Each upload is conditional (`If-None-Match: *`)
  and sends its SHA-256 (`x-amz-checksum-sha256`), which R2 checks against the bytes it
  receives. If the key already exists, the object must have the same size and SHA-256, or the
  publish fails. After each upload, the object is read back for its size and SHA-256.
  - The SHA-256 read back is R2's `ChecksumSHA256` when R2 returns one.
  - Otherwise it's the `x-amz-meta-sha256` label, which only says what was meant to be sent.
    A multipart upload's `ChecksumSHA256` is a checksum of checksums, ending in `-<parts>`, so
    it counts as none.

  The `Verify` step downloads and hashes every file, so it doesn't rely on either.
- **A published release doesn't change.** If `releases/<release>/manifest.json` already
  exists, the new manifest must match it in everything but `git_commit`, `workflow_run`,
  `core_sha256`, and `core`.
  - If it matches, the run is a no-op and the published manifest stays as it is. So rerunning,
    or merging a change that leaves the release's content alone, publishes nothing.
  - If the content differs, the publish fails before uploading anything. Since a merged pin never
    changes and every build must be its pin, that takes a pin changed outside a pull request.
- **`releases.json` is only appended to,** under `If-Match` on the ETag read at the start.
  - **Changed before the manifest is written:** releases.json is read again just before the
    manifest upload. If it changed, the publish stops, with only content-addressed files
    uploaded. Running it again links the manifest to the new latest release.
  - **Changed after the manifest is written:** the append fails. The manifest can't be replaced,
    and its `previous_release` may be stale, so a rerun won't list it. It stays in the bucket,
    unlisted and unused. Bump `release.json` to publish again. The workflow's concurrency group
    keeps this from happening between its own runs.
  - **Response to the append lost:** if the append succeeded but its response was lost, the run
    re-reads `releases.json`. If it lists this release with this manifest, the run succeeds.
  - **Run stopped between the manifest and `releases.json`:** the next run lists the release,
    provided no other release was listed in between.

## Gzipped copies

The browser extension downloads a release's SQLite and JSON files gzipped (#941, #956). Chrome's
`DecompressionStream` unpacks gzip, but a gzip stream can't be resumed partway (#943), so each
file's copy comes in parts a stopped download can restart from.

- **Parts.** A file is cut into parts of `part_bytes` of its bytes, 32 MiB, the last one shorter,
  and each part is a gzip stream of its own (level 9, with no timestamp, so the same bytes always
  make the same part). An empty file has one part. Unpacked and joined in order, a file's parts are
  the file, with the manifest's SHA-256.
- **Served as gzip data.** A part is `application/gzip`, with no `Content-Encoding`, so nothing
  between the bucket and the client unpacks it, and its size and ranges count the gzipped bytes
  `compressed.json` lists. The client unpacks it.
- **`compressed.json`** names the `release`, the `manifest_sha256` that `releases.json` lists, and
  `part_bytes`, then lists each of the manifest's SQLite and JSON files in its order: `name`,
  `sha256`, `bytes`, and `parts`, each with its `key`, `bytes`, and `sha256`. Its schema is
  [`language-data-compressed.v1.schema.json`](schemas/language-data-compressed.v1.schema.json),
  and the publisher holds what it writes to it.
- **Written for any release without them.** After `releases.json`, the publisher writes the
  gzipped copies of every listed release with no `compressed.json`, so a release published before
  them gets them on the workflow's next run. A file comes from the staged release, or else from the
  bucket. Every file is packed, and checked against the manifest's SHA-256 both as read and as its
  parts unpack, before any part is uploaded, so a part that doesn't unpack to its file fails the
  publish with nothing uploaded. Parts are uploaded as files are, and `compressed.json` last: a
  client that finds it finds every part it names. A release with a `compressed.json` is skipped, so
  it's never rewritten, and a rerun publishes nothing new.
- **A listed release can have no `compressed.json` yet.** On every run, the newest release is in
  `releases.json` for a minute or so before its copies are written. Releases are packed oldest
  first, so one that can't be packed (a file missing or changed in the bucket) leaves it and every
  release listed after it without copies until the bucket is fixed and the workflow runs again. A
  client that gets a 404 for a listed release's `compressed.json` uses the newest listed release
  that has one, or, if none has, tries again later.
- **Verify** fails without the release's `compressed.json`. The file must match its schema, the
  manifest, and its SQLite and JSON files, cut into parts of `part_bytes`, each part at its
  content-addressed key with its size and SHA-256. With `--hash all`, as the workflow runs it, each
  part is downloaded, hashed, and unpacked: to its share of the file, and with the others to the
  file's SHA-256.

## The public address

Clients read the bucket at **`https://data.zenbujapanese.com`**, an R2 custom domain on the
`zenbujapanese.com` zone, with each key under it: `https://data.zenbujapanese.com/releases.json`.
The name is #941's recommendation, which waits on Francis (its Open question 18). This section is
where it lives: nothing in the repository reads it, so a new name is an edit here, and an
amendment to ADR 0006, which records it. Publishing doesn't use it; the workflow writes through the
S3 endpoint.

The owner sets it up once, by hand, with a Cloudflare token that can edit R2 and the zone, not the
workflow's, which reaches only the bucket's objects. From `apps/web`, where `wrangler` is
installed:

```sh
pnpm exec wrangler r2 bucket domain add zenbujapanese-language-data \
  --domain data.zenbujapanese.com --zone-id <the zenbujapanese.com zone ID> --min-tls 1.2
pnpm exec wrangler r2 bucket cors set zenbujapanese-language-data \
  --file ../../language-data/bucket-cors.json
```

[`bucket-cors.json`](bucket-cors.json) is the bucket's CORS rule, in the format `wrangler` sets: GET
and HEAD from any origin, with the `Range` request header, exposing `Content-Length`,
`Content-Range`, and `ETag`, so a page can read a download's size and resume it.
`test_bucket_cors.py` holds it. A change to it reaches the bucket when the second command runs
again. The browser extension doesn't need it: it lists the address in its `host_permissions`
(#943). The zone's Bot Fight Mode challenges clients that aren't browsers, such as CI runners, so a
check of the address from CI may get a challenge, not the object (#985).
