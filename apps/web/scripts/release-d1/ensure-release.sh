#!/usr/bin/env bash
# shellcheck disable=SC2154 # The database's settings come from <database>/database.sh.
# Makes sure a release database for this commit exists in D1 and is complete, importing it if
# not (issue 464). `Web deploy` runs it for staging before deploying, then binds the database's
# binding (such as SEARCH_DB) to the database it names, and runs prune.sh once the deploy passes
# its smoke test.
#
#   scripts/release-d1/ensure-release.sh <search|dictionary> <staging|production>
#
# Each build of the dictionary gets its own D1 per database,
# `zenbujapanese-<database>-<env>-<build id>` (build-id.sh), imported from empty and verified
# before anything binds it, so a deploy switches databases atomically and rolling back is
# redeploying the previous commit. An existing database is reused only when it verifies; a
# partial one is deleted and imported again. This script never deletes another build's
# database: prune.sh does, after a deploy succeeds.
#
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, Git LFS, and python3. Writes
# <binding>_NAME and <binding>_ID (such as SEARCH_DB_NAME and SEARCH_DB_ID) to $GITHUB_ENV when
# set.
set -euo pipefail
source "$(dirname "$0")/common.sh"
load_database "${1:-}"
env="${2:-}"
require_environment "$env"
require_import
scratch="${RUNNER_TEMP:-$(mktemp -d)}/release-d1-$database-$env"
config="$scratch/wrangler.json"
mkdir -p "$scratch"

build_id=$(scripts/release-d1/build-id.sh "$database")
name="$name_prefix$env-$build_id"
echo "The $database database: $name"

list() { wrangler d1 list --json; }
database_id() { list | json "next((d['uuid'] for d in data if d['name'] == '$1'), '')"; }
remote() { wrangler d1 execute "$binding" --remote --config "$config" "$@"; }
query() { remote --command "$1" --json | json "data[0]['results'][0]['$2']"; }

write_config() {
  cat > "$config" <<JSON
{
  "name": "zenbujapanese-$database-import",
  "compatibility_date": "2026-09-28",
  "d1_databases": [
    {
      "binding": "$binding",
      "database_name": "$name",
      "database_id": "$1",
      "migrations_dir": "$PWD/$migrations_dir",
      "migrations_table": "d1_migrations"
    }
  ]
}
JSON
}

# A database is complete when its import record names this build, its migrations and schema
# match this commit, and every table holds the rows the local build counted. verify returns 0
# when it is, 1 when it definitely isn't (the check ran and found a difference or a missing
# table), and 2 when it couldn't tell (a command or query failed). Only 1 may delete the
# database: it is usually the one the live site is bound to, so a D1 or network error must never
# cost it its database.
verify() {
  # verify runs where set -e doesn't apply (`verify || status=$?`), so every step returns on
  # failure itself: otherwise a failed query leaves both sides of a comparison empty, and equal.
  # `|| return` passes on checked_query's 1 or 2.
  local imported expected_migrations applied_migrations schema pairs counts expected_counts
  local actual expected
  imported=$(checked_query "SELECT count(*) AS n, max(build_id) AS build_id FROM dictionary_import" \
    "'%s %s' % (data[0]['results'][0]['n'], data[0]['results'][0]['build_id'])") || return
  [ "$imported" = "1 $build_id" ] || { echo "dictionary_import: $imported, expected 1 $build_id"; return 1; }
  expected_migrations=$(cd "$migrations_dir" && ls -1 ./*.sql | sed 's|^\./||' | sort | paste -sd, -) ||
    return 2
  applied_migrations=$(checked_query "SELECT name FROM d1_migrations ORDER BY name" \
    "','.join(r['name'] for r in data[0]['results'])") || return
  [ "$applied_migrations" = "$expected_migrations" ] ||
    { echo "migrations: $applied_migrations, expected $expected_migrations"; return 1; }
  schema=$(scripts/release-d1/schema.sh "$database" "$config") ||
    { echo "couldn't read the schema"; return 2; }
  printf '%s\n' "$schema" | diff "$schema_dump" - || { echo "schema differs from $schema_dump"; return 1; }
  expected_counts=$(checked_query "SELECT row_counts FROM dictionary_import" \
    "data[0]['results'][0]['row_counts']") || return
  pairs=$(echo "$expected_counts" | json "', '.join(f\"'{t}', (SELECT count(*) FROM {t})\" for t in data)") ||
    return 2
  counts=$(checked_query "SELECT json_object($pairs) AS counts" "data[0]['results'][0]['counts']") ||
    return
  actual=$(echo "$counts" | json 'json.dumps(data, sort_keys=True)') || return 2
  expected=$(echo "$expected_counts" | json 'json.dumps(data, sort_keys=True)') || return 2
  [ "$actual" = "$expected" ] || { echo "row counts: $counts, expected $expected_counts"; return 1; }
}

# A query's result through a Python expression over its JSON (`data`), for verify. Returns 1
# when D1 answers that a table doesn't exist, as in a partial import cancelled before its
# migrations or its dictionary_import row (the database is definitely incomplete), and 2 for any
# other failure.
checked_query() {
  local out status=0 err
  err=$(mktemp)
  out=$(remote --command "$1" --json 2> "$err") || status=$?
  if [ "$status" -ne 0 ]; then
    if grep -qi 'no such table' <<<"$out $(cat "$err")"; then
      echo "incomplete: no such table ($1)" >&2
      status=1
    else
      echo "couldn't query D1 ($1):" >&2
      cat "$err" >&2
      status=2
    fi
    rm -f "$err"
    return "$status"
  fi
  rm -f "$err"
  echo "$out" | json "$2" || return 2
}

import_release() {
  echo "Importing $name"
  local oid include
  oid=$(lfs_oid "$source_db")
  include=$(IFS=,; echo "${lfs_inputs[*]}")
  git -C "$repo_root" lfs pull --include="$include"
  [ "$(sha256sum "$repo_root/$source_db" | cut -d' ' -f1)" = "$oid" ] ||
    { echo "$source_db doesn't match its LFS pointer"; exit 1; }

  # Build and check a local copy first: nothing reaches D1 unless it passes the database's
  # checks (for search, the conformance suite) on a copy built through the migrations.
  scripts/release-d1/load-local.sh "$database" "$repo_root/$source_db" "$scratch/local"
  check_local "$scratch/local"

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
  wrangler d1 migrations apply "$binding" --remote --config "$config" || return 1
  local pattern
  for pattern in "${upload_files[@]}"; do
    # Unquoted, so an entry such as examples-*.sql expands, in order; a pattern that matches
    # nothing stays as written and is skipped.
    for file in "$scratch/local/"$pattern; do
      [ -s "$file" ] || continue
      remote --file "$file" --yes || return 1
    done
  done
  # dictionary_import goes last: it marks the import complete. One statement, so a query rather
  # than D1's bulk import.
  remote --command "$(cat "$scratch/local/import.sql")" || return 1
  verify || { echo "$name didn't verify after import"; return 1; }
}

id=$(database_id "$name")
if [ -n "$id" ]; then
  write_config "$id"
  status=0
  verify || status=$?
  case "$status" in
    0) echo "$name is already imported and verified" ;;
    1)
      echo "Deleting $name: it isn't a complete import of this build"
      wrangler d1 delete "$name" --skip-confirmation
      id=""
      ;;
    *)
      # Keep it: it may be the live database, and nothing says it's wrong. Stop the deploy
      # instead, so the live site keeps its database and a rerun checks again.
      echo "Couldn't check $name, so it's left as it is; rerun once D1 answers" >&2
      exit 1
      ;;
  esac
fi
if [ -z "$id" ]; then
  import_release
  id=$(database_id "$name")
fi

echo "${binding}_NAME=$name ${binding}_ID=$id"
if [ -n "${GITHUB_ENV:-}" ]; then
  { echo "${binding}_NAME=$name"; echo "${binding}_ID=$id"; } >> "$GITHUB_ENV"
fi
