# Publishing a language-data release

Where releases live, how the `Language data release` workflow publishes one, and why nothing
published is overwritten. What a release holds, and how it's pinned, is in
[`README.md`](README.md).

## Where releases live

The `zenbujapanese-language-data` R2 bucket, in the SERP Cloudflare account. It holds:

| Key | What it is | Written |
| --- | --- | --- |
| `files/<sha256>/<name>` | A release file, content-addressed, so an unchanged file keeps one object across releases. | Once. Never overwritten. |
| `releases/<release>/manifest.json` | A release's manifest. | Once, after every file it names. Never overwritten. |
| `releases.json` | Every release, oldest first: `release`, `manifest_sha256`, `git_commit` (the manifest's), and `published_at` (UTC). The schema is `zenbu.language-data-releases.v1`. | Last. Only ever appended to. |

There's no `latest` pointer: a client pins a release ID and checks the manifest's SHA-256 against
`releases.json`, then each file's against the manifest. Each object also records the SHA-256 its
uploader sent in `x-amz-meta-sha256`. That's a label, not a check. Files and manifests are served
`immutable`, and `releases.json` `no-cache`.
The bucket has no public domain yet, and no check needs one: CI compares with the pins.

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
      `releases.json`, after checking the staged release against its pin again;
   5. reads it all back: `releases.json`, the manifest's SHA-256, links, and content, which must
      be the pin's, and every file's size and SHA-256 (downloading and hashing each one).

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
  exists, the new manifest must match it in everything but `git_commit`, `workflow_run`, and
  `core_sha256`.
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
