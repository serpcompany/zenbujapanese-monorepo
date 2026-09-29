#!/usr/bin/env bash
# Deletes a release database's old builds for an environment (issue 464). `Web deploy` runs it
# only after the deploy that binds <current> passes its smoke test, so <current> is the live
# database. Keeps <current> and the newest other complete one (with a dictionary_import row), for
# rolling back; deletes the rest, including partial imports a cancelled or timed-out run left
# behind. Keeps any database it can't check, and never touches another database's builds.
#
#   scripts/release-d1/prune.sh <search|dictionary> <staging|production> <current database name>
#
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, and python3.
set -euo pipefail
usage="usage: prune.sh <search|dictionary> <staging|production> <current database name>"
source "$(dirname "$0")/common.sh"
load_database "${1:?$usage}"
env="${2:?$usage}"
name="${3:?$usage}"
require_environment "$env"
prefix="$name_prefix$env-"
# The live database must be one of this database's builds for this environment, or every
# build would count as old.
case "$name" in "$prefix"?*) ;; *) echo "$name isn't a $database database for $env" >&2; exit 1 ;; esac

list() { wrangler d1 list --json; }

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
