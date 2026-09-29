#!/usr/bin/env bash
# Deletes old search databases for an environment (issue 464). `Web deploy` runs it only after the
# deploy that binds <current> passes its smoke test, so <current> is the live database. Keeps
# <current> and the newest other complete one (with a dictionary_import row), for rolling back;
# deletes the rest, including partial imports a cancelled or timed-out run left behind. Keeps any
# database it can't check.
#
#   scripts/search-d1/prune.sh <staging|production> <current database name>
#
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, and python3.
set -euo pipefail
env="${1:?usage: prune.sh <staging|production> <current database name>}"
name="${2:?usage: prune.sh <staging|production> <current database name>}"
prefix="zenbujapanese-search-$env-"
cd "$(dirname "$0")/../.."

wrangler() { pnpm exec wrangler "$@"; }
# JSON on stdin -> the value of a Python expression over it (`data`).
json() { python3 -c "import json, sys; data = json.load(sys.stdin); print($1)"; }
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
