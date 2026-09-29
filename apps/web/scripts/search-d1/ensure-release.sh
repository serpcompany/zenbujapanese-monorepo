#!/usr/bin/env bash
# Makes sure the search database for this commit exists in D1 and is complete, importing it if
# not (issue 464). `Web deploy` runs it for each environment before deploying, then binds
# SEARCH_DB to the database it names.
#
#   scripts/search-d1/ensure-release.sh <staging|production>
#
# Each build of the dictionary gets its own D1, `zenbujapanese-search-<env>-<build id>`
# (build-id.sh), imported from empty and verified before anything binds it, so a deploy
# switches databases atomically and rolling back is redeploying the previous commit. An existing
# database is reused only when it verifies; a partial one is deleted and imported again. The two
# newest databases per environment are kept, the one deployed now and the one before it.
#
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, Git LFS, and python3. Writes
# SEARCH_DB_NAME and SEARCH_DB_ID to $GITHUB_ENV when set.
set -euo pipefail
env="${1:?usage: ensure-release.sh <staging|production>}"
case "$env" in staging | production) ;; *) echo "unknown environment $env" >&2; exit 1 ;; esac
cd "$(dirname "$0")/../.."
source_db=../ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3
scratch="${RUNNER_TEMP:-$(mktemp -d)}/search-d1-$env"
config="$scratch/wrangler.json"
mkdir -p "$scratch"

build_id=$(scripts/search-d1/build-id.sh)
name="zenbujapanese-search-$env-$build_id"
prefix="zenbujapanese-search-$env-"
echo "Search database: $name"

wrangler() { pnpm exec wrangler "$@"; }
# JSON on stdin -> the value of a Python expression over it (`data`).
json() { python3 -c "import json, sys; data = json.load(sys.stdin); print($1)"; }
list() { wrangler d1 list --json; }
database_id() { list | json "next((d['uuid'] for d in data if d['name'] == '$1'), '')"; }
remote() { wrangler d1 execute SEARCH_DB --remote --config "$config" "$@"; }
query() { remote --command "$1" --json | json "data[0]['results'][0]['$2']"; }

write_config() {
  cat > "$config" <<JSON
{
  "name": "zenbujapanese-search-import",
  "compatibility_date": "2026-09-28",
  "d1_databases": [
    {
      "binding": "SEARCH_DB",
      "database_name": "$name",
      "database_id": "$1",
      "migrations_dir": "$PWD/drizzle/search",
      "migrations_table": "d1_migrations"
    }
  ]
}
JSON
}

# A database is complete when its import record names this build, its migrations and schema
# match this commit, and every table holds the rows the local build counted.
verify() {
  local imported expected_migrations applied_migrations pairs counts expected_counts
  imported=$(remote --command "SELECT count(*) AS n, max(build_id) AS build_id FROM dictionary_import" --json |
    json "'%s %s' % (data[0]['results'][0]['n'], data[0]['results'][0]['build_id'])") || return 1
  [ "$imported" = "1 $build_id" ] || { echo "dictionary_import: $imported, expected 1 $build_id"; return 1; }
  expected_migrations=$(cd drizzle/search && ls -1 ./*.sql | sed 's|^\./||' | sort | paste -sd, -)
  applied_migrations=$(remote --command "SELECT name FROM d1_migrations ORDER BY name" --json |
    json "','.join(r['name'] for r in data[0]['results'])")
  [ "$applied_migrations" = "$expected_migrations" ] ||
    { echo "migrations: $applied_migrations, expected $expected_migrations"; return 1; }
  scripts/search-d1/schema.sh "$config" | diff src/db/search-schema.sql - ||
    { echo "schema differs from src/db/search-schema.sql"; return 1; }
  expected_counts=$(query "SELECT row_counts FROM dictionary_import" row_counts)
  pairs=$(echo "$expected_counts" | json "', '.join(f\"'{t}', (SELECT count(*) FROM {t})\" for t in data)")
  counts=$(query "SELECT json_object($pairs) AS counts" counts)
  [ "$(echo "$counts" | json 'json.dumps(data, sort_keys=True)')" = \
    "$(echo "$expected_counts" | json 'json.dumps(data, sort_keys=True)')" ] ||
    { echo "row counts: $counts, expected $expected_counts"; return 1; }
}

import_release() {
  echo "Importing $name"
  local oid
  oid=$(git show "HEAD:apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3" |
    sed -n 's/^oid sha256://p')
  (cd "$(git rev-parse --show-toplevel)" &&
    git lfs pull --include=apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3)
  [ "$(sha256sum "$source_db" | cut -d' ' -f1)" = "$oid" ] || { echo "$source_db doesn't match its LFS pointer"; exit 1; }

  # Build and check a local copy first: nothing reaches D1 unless the conformance suite passes on
  # a database built through the migrations.
  scripts/search-d1/load-local.sh "$source_db" "$scratch/local"
  ZENBU_SEARCH_D1=1 ZENBU_SEARCH_D1_PATH="$scratch/local" \
    pnpm exec vitest run src/lib/dictionary/search/conformance.test.ts

  local id
  wrangler d1 create "$name" > /dev/null
  id=$(database_id "$name")
  [ -n "$id" ] || { echo "couldn't create $name"; exit 1; }
  write_config "$id"
  # A failed import deletes its database, so no partial one outranks the live one when pruning.
  load_remote || {
    echo "Importing $name failed; deleting it"
    wrangler d1 delete "$name" --skip-confirmation
    exit 1
  }
}

# Called in an || list, where set -e doesn't apply, so each step returns on failure itself.
load_remote() {
  local file
  wrangler d1 migrations apply SEARCH_DB --remote --config "$config" || return 1
  for file in rows.sql cache.sql; do
    [ -s "$scratch/local/$file" ] || continue
    remote --file "$scratch/local/$file" --yes || return 1
  done
  # dictionary_import goes last: it marks the import complete. One statement, so a query rather
  # than D1's bulk import.
  remote --command "$(cat "$scratch/local/import.sql")" || return 1
  verify || { echo "$name didn't verify after import"; return 1; }
}

id=$(database_id "$name")
if [ -n "$id" ]; then
  write_config "$id"
  if verify; then
    echo "$name is already imported and verified"
  else
    echo "Deleting incomplete $name"
    wrangler d1 delete "$name" --skip-confirmation
    id=""
  fi
fi
if [ -z "$id" ]; then
  import_release
  id=$(database_id "$name")
fi

# Keep this database and the newest other complete one (with a dictionary_import row), which
# the environment runs until this deploy. Others, including partial imports a cancelled or timed-out
# run left behind, are deleted, so a partial database never outranks the live one.
# Prints 1 for a complete import, 0 for a partial one (no or empty dictionary_import), and
# anything else when it can't tell, which keeps the database.
completed() {
  curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/$1/query" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' \
    --data '{"sql": "SELECT count(*) AS n FROM dictionary_import"}' |
    json "data['result'][0]['results'][0]['n'] if data.get('success') else
      0 if 'no such table' in json.dumps(data.get('errors')) else 'unknown'" || echo unknown
}
kept=""
list | json "'\n'.join(f\"{d['uuid']} {d['name']}\" for d in sorted(data, key=lambda d: d['created_at'], reverse=True)
  if d['name'].startswith('$prefix') and d['name'] != '$name')" |
  while read -r uuid old; do
    [ -n "$old" ] || continue
    state=$(completed "$uuid")
    if [ "$state" = 1 ] && [ -z "$kept" ]; then
      kept=$old
      echo "Keeping $old"
    elif [ "$state" = 1 ] || [ "$state" = 0 ]; then
      echo "Deleting old $old"
      wrangler d1 delete "$old" --skip-confirmation
    else
      echo "Keeping $old: couldn't tell whether its import completed"
    fi
  done

echo "SEARCH_DB_NAME=$name SEARCH_DB_ID=$id"
if [ -n "${GITHUB_ENV:-}" ]; then
  { echo "SEARCH_DB_NAME=$name"; echo "SEARCH_DB_ID=$id"; } >> "$GITHUB_ENV"
fi
