#!/usr/bin/env bash
# shellcheck disable=SC2154 # The database's settings come from <database>/database.sh.
# Prints a release database's build ID: a hash of everything that shapes its contents, so a
# change to any of them imports a new database instead of reusing an old one (issue 464).
#   - the artifact, by the SHA-256 in its Git LFS pointer (no download needed);
#   - the database's other inputs (<database>/database.sh's build_inputs): its migrations and
#     schema, any other source files, and the code that precomputes its rows;
#   - the import scripts: the shared ones in this directory and the database's own, but not
#     another database's.
# Reads committed blobs from HEAD, so a checkout builds the same ID everywhere.
#
#   scripts/release-d1/build-id.sh <search|dictionary>
set -euo pipefail
source "$(dirname "$0")/common.sh"
load_database "${1:-}"
artifact_sha=$(lfs_oid "$source_db")
[ -n "$artifact_sha" ] || { echo "$source_db is not a Git LFS pointer at HEAD" >&2; exit 1; }
scripts=apps/web/scripts/release-d1
{
  echo "artifact $artifact_sha"
  git -C "$repo_root" ls-tree HEAD -- "$scripts/" | awk '$2 == "blob"'
  git -C "$repo_root" ls-tree -r HEAD -- "${build_inputs[@]}" "$scripts/$database" |
    grep -v '\.test\.ts$'
} | sha256sum | cut -c1-12
