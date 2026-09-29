# shellcheck shell=bash disable=SC2034 # Sets variables for the scripts that source it.
# Shared by the release database scripts (issue 464); sourced, not run. Each release database
# (search, dictionary) is one D1 per build of the dictionary, described by <database>/database.sh:
#
#   binding         the Worker binding, such as SEARCH_DB
#   migrations_dir  its Drizzle migrations, relative to apps/web
#   schema_dump     the schema those migrations build, relative to apps/web
#   persist_dir     the default local build directory, relative to apps/web
#   source_db       the artifact recorded in dictionary_import, relative to the repository root;
#                   it must be a Git LFS file
#   lfs_inputs      every Git LFS file the import reads, relative to the repository root
#   build_inputs    everything else that shapes the database, relative to the repository root
#   tables          the tables whose row counts the deploy checks
#   upload_files    the SQL files the local build writes and the import uploads, in order
#   build_rows      function <source_db> <build dir>: writes upload_files into <build dir>,
#                   loading each into the local D1 there with `local_d1 execute --file`
#   check_local     function <persist dir>: checks a finished local build before it reaches D1
#   import_sources  optional function: prints the JSON for dictionary_import's `sources` column
#   unimplemented   optional: why this database can't be imported yet
#
# Sourcing this file from a script in scripts/release-d1 cds to apps/web and defines
# load_database <search|dictionary>, which reads that file and sets `database`, `name_prefix`
# (`zenbujapanese-<database>-`), `local_name`, and `repo_root`.
set -euo pipefail
release_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$release_dir" rev-parse --show-toplevel)"
cd "$release_dir/../.."

release_databases=(search dictionary)

load_database() {
  database="${1:-}"
  case " ${release_databases[*]} " in
    *" $database "*) ;;
    *) echo "unknown release database '$database': expected one of ${release_databases[*]}" >&2; exit 1 ;;
  esac
  unimplemented=""
  # shellcheck source=/dev/null
  source "$release_dir/$database/database.sh"
  name_prefix="zenbujapanese-$database-"
  local_name="${name_prefix}local"
}

# Stops with `unimplemented` for a database whose import doesn't exist yet, before anything
# touches D1.
require_import() {
  [ -z "$unimplemented" ] || { echo "The $database database can't be imported yet: $unimplemented" >&2; exit 1; }
}

require_environment() {
  case "${1:-}" in staging | production) ;; *) echo "unknown environment '${1:-}'" >&2; exit 1 ;; esac
}

wrangler() { pnpm exec wrangler "$@"; }
# JSON on stdin -> the value of a Python expression over it (`data`).
json() { python3 -c "import json, sys; data = json.load(sys.stdin); print($1)"; }
# A SQL string literal.
sql_text() { printf "'%s'" "${1//\'/\'\'}"; }
# The SHA-256 in a Git LFS pointer at HEAD, relative to the repository root.
lfs_oid() {
  git -C "$repo_root" show "HEAD:$1" | sed -n 's/^oid sha256://p'
}
