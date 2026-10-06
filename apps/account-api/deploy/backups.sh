#!/usr/bin/env bash
set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

readonly database_container=zenbujapanese-account-db
readonly config_dir=/etc/zenbujapanese-account-api
readonly settings_file="$config_dir/backup.env"
readonly lock_file=/run/zenbujapanese-account-backups.lock
readonly environments=(staging production)
readonly usage="usage: backups.sh                                (back up every environment; cron runs this)
       backups.sh restore <environment>/<backup>.dump <new database>

A restore downloads one backup into a new, empty database beside the others. It never writes to a
database that exists, so it can't overwrite one an environment uses. It moves the restored sync
journal and profile versions past any the apps saw, so they resync rather than miss a change."

log() {
  logger --tag zenbujapanese-account-backups -- "$*" 2>/dev/null || true
  echo "$*" >&2
}

setting() {
  sed -n "s/^$1=//p" "$settings_file" | tail -n 1 | tr -d '\r[:space:]'
}

use_bucket() {
  local name
  [ -r "$settings_file" ] || {
    log "$settings_file is missing, so there's no bucket (docs/agents/account-api.md, Back up and restore)"
    return 1
  }
  bucket="$(setting R2_BUCKET)"
  endpoint="$(setting R2_ENDPOINT)"
  AWS_ACCESS_KEY_ID="$(setting R2_ACCESS_KEY_ID)"
  AWS_SECRET_ACCESS_KEY="$(setting R2_SECRET_ACCESS_KEY)"
  for name in bucket endpoint AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
    [ -n "${!name}" ] || {
      log "$settings_file needs R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY"
      return 1
    }
  done
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION=auto
}

psql_value() {
  docker exec "$database_container" psql --username postgres --dbname "$1" --tuples-only \
    --no-align --command "$2"
}

databases_named() {
  psql_value postgres "select count(*) from pg_database where datname = '$1'"
}

back_up() {
  local environment="$1" stamp="$2" database="account_$1" dump="$work/$1.dump" count
  if ! count="$(databases_named "$database")"; then
    log "$environment: couldn't ask Postgres ($database_container) whether $database exists"
    return 1
  fi
  if [ "$count" != 1 ]; then
    if [ -e "$config_dir/$environment.env" ]; then
      log "$environment: it's set up ($config_dir/$environment.env), but there's no $database database"
      return 1
    fi
    log "$environment: it isn't set up on this server; skipped"
    return 0
  fi
  if ! docker exec "$database_container" pg_dump --username postgres --format custom \
    --dbname "$database" >"$dump"; then
    log "$environment: pg_dump of $database failed"
    return 1
  fi
  if ! aws s3 cp --only-show-errors --endpoint-url "$endpoint" "$dump" \
    "s3://$bucket/$environment/$stamp.dump"; then
    log "$environment: couldn't upload the backup to $bucket"
    return 1
  fi
  log "$environment: backed up $database ($(wc -c <"$dump") bytes) as $environment/$stamp.dump"
}

back_up_all() {
  local environment stamp status=0
  exec 9>>"$lock_file"
  flock --nonblock 9 || {
    log "an earlier backup is still running; this one skips"
    return 0
  }
  stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
  for environment in "${environments[@]}"; do
    back_up "$environment" "$stamp" || status=1
  done
  return "$status"
}

restore() {
  local key="$1" target="$2" dump="$work/restore.dump" owner="account_${1%%/*}" count tables migrations
  [[ "$key" =~ ^(staging|production)/[0-9TZ-]+\.dump$ ]] || {
    echo "not a backup's name: $key" >&2
    return 2
  }
  [[ "$target" =~ ^[a-z][a-z0-9_]{0,62}$ ]] || {
    echo "not a database name (lowercase letters, digits, and _): $target" >&2
    return 2
  }
  count="$(databases_named "$target")" || {
    echo "couldn't ask Postgres ($database_container) whether $target exists" >&2
    return 1
  }
  if [ "$count" != 0 ]; then
    echo "$target already exists; a restore only creates a new database" >&2
    return 1
  fi
  aws s3 cp --only-show-errors --endpoint-url "$endpoint" "s3://$bucket/$key" "$dump" || {
    log "restore: couldn't download $key from $bucket"
    return 1
  }
  docker exec "$database_container" createdb --username postgres --owner "$owner" "$target" ||
    return 1
  docker exec --interactive "$database_container" pg_restore --username postgres --no-owner \
    --role "$owner" --exit-on-error --dbname "$target" <"$dump" || {
    log "restore: pg_restore of $key into $target failed; $target is left for a look"
    return 1
  }
  if [ "$(psql_value "$target" "select to_regprocedure('sync_after_restore()') is not null")" = t ]; then
    psql_value "$target" 'select sync_after_restore()' >/dev/null || {
      log "restore: moving the sync journal and profile versions in $target past the backup's failed; run no environment on it"
      return 1
    }
  fi
  tables="$(psql_value "$target" "select count(*) from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')")"
  migrations=0
  if [ "$(psql_value "$target" "select to_regclass('drizzle.__drizzle_migrations') is not null")" = t ]; then
    migrations="$(psql_value "$target" 'select count(*) from drizzle.__drizzle_migrations')"
  fi
  log "restore: $key is in $target, owned by $owner, with $tables tables and $migrations migrations applied"
}

[ "$(id -u)" = 0 ] || {
  echo "run it as root (cron does)" >&2
  exit 1
}
case "${1:-}" in
  '') mode=back_up_all ;;
  restore)
    [ "$#" = 3 ] || {
      echo "$usage" >&2
      exit 2
    }
    mode=restore
    ;;
  *)
    echo "$usage" >&2
    exit 2
    ;;
esac
use_bucket || exit 1
work="$(mktemp -d)" || exit 1
trap 'rm -rf "$work"' EXIT
if [ "$mode" = restore ]; then
  restore "$2" "$3"
else
  back_up_all
fi
