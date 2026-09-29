#!/usr/bin/env bash
# Prints the search database's build ID: a hash of everything that shapes its contents, so a
# change to any of them imports a new database instead of reusing an old one (issue 464).
#   - the artifact, by the SHA-256 in its Git LFS pointer (no download needed);
#   - the search migrations and schema;
#   - the import scripts;
#   - the search core, which precomputes search_cache.
# Reads committed blobs from HEAD, so a checkout builds the same ID everywhere.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
source_db=apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3
artifact_sha=$(git show "HEAD:$source_db" | sed -n 's/^oid sha256://p')
[ -n "$artifact_sha" ] || { echo "$source_db is not a Git LFS pointer at HEAD" >&2; exit 1; }
{
  echo "artifact $artifact_sha"
  git ls-tree -r HEAD -- \
    apps/web/drizzle/search \
    apps/web/src/db/search-schema.ts \
    apps/web/scripts/search-d1 \
    apps/web/src/lib/dictionary/search |
    grep -v '\.test\.ts$'
} | sha256sum | cut -c1-12
