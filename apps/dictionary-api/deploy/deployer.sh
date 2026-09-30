#!/usr/bin/env bash
set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

readonly repository=ghcr.io/serpcompany/zenbujapanese-dictionary-api
readonly network=zenbujapanese-dictionary-api
readonly nginx_container=nginx
readonly config_dir=/etc/zenbujapanese-dictionary-api
readonly registry_file="$config_dir/registry.env"
readonly state_dir=/var/lib/zenbujapanese-dictionary-api
readonly lock_file=/run/zenbujapanese-dictionary-api.lock
readonly slot_label=zenbujapanese.dictionary-api.slot
readonly environment_label=zenbujapanese.dictionary-api.environment
readonly signer_identity=https://github.com/serpcompany/zenbujapanese-monorepo/.github/workflows/dictionary-api-deploy.yml@refs/heads/main
readonly signer_issuer=https://token.actions.githubusercontent.com
readonly container_limits=(
  --memory 4g --memory-swap 4g --cpus 4 --pids-limit 512
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3
)
readonly container_security=(
  --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges --read-only
  --tmpfs /tmp:size=64m
)
readonly ready_seconds=180
readonly health_timeout_ms=3000
readonly nginx_resolve_seconds=10

log() {
  logger --tag zenbujapanese-dictionary-api -- "$*" 2>/dev/null || true
  echo "$*" >&2
}

run_dir="$(mktemp -d)" || exit 1
trap 'rm -rf "$run_dir"' EXIT

use_registry_login() {
  local username token
  [ -e "$registry_file" ] || return 0
  username="$(sed -n 's/^GHCR_USERNAME=//p' "$registry_file" | tail -n 1 | tr -d '\r[:space:]')"
  token="$(sed -n 's/^GHCR_TOKEN=//p' "$registry_file" | tail -n 1 | tr -d '\r[:space:]')"
  if [ -z "$username" ] || [ -z "$token" ]; then
    log "$registry_file needs both GHCR_USERNAME and GHCR_TOKEN"
    return 1
  fi
  mkdir -p "$run_dir/docker"
  printf '{"auths":{"%s":{"auth":"%s"}}}\n' "${repository%%/*}" \
    "$(printf '%s:%s' "$username" "$token" | base64 --wrap 0)" >"$run_dir/docker/config.json"
  export DOCKER_CONFIG="$run_dir/docker"
}

running_slots() {
  docker ps --filter "label=$environment_label=$1" --format '{{.Names}}'
}

build_of() {
  timeout 10 docker exec "$1" node -e "
    fetch('http://127.0.0.1:' + process.env.PORT + '/healthz', { signal: AbortSignal.timeout($health_timeout_ms) })
      .then(response => (response.ok ? response.json() : Promise.reject(response.status)))
      .then(health => console.log(health.build), () => process.exit(1))" 2>/dev/null
}

release_of() {
  docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" |
    sed -n 's/^DICTIONARY_API_RELEASE=//p'
}

digest_reference_of() {
  docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$1" |
    grep --max-count 1 "^$repository@sha256:[0-9a-f]\{64\}$"
}

signed_on_main() {
  cosign verify --certificate-identity "$signer_identity" \
    --certificate-oidc-issuer "$signer_issuer" "$1" >/dev/null 2>&1
}

network_ready() {
  [ "$(docker network inspect --format '{{.Internal}}' "$network" 2>/dev/null)" = true ] &&
    docker network inspect --format '{{range .Containers}}{{.Name}}{{println}}{{end}}' "$network" |
    grep --quiet --line-regexp --fixed-strings "$nginx_container"
}

on_network() {
  docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$1" 2>/dev/null |
    grep --quiet --line-regexp --fixed-strings "$network"
}

has_alias() {
  docker inspect --format "{{range (index .NetworkSettings.Networks \"$network\").Aliases}}{{println .}}{{end}}" "$1" 2>/dev/null |
    grep --quiet --line-regexp --fixed-strings "$2"
}

give_alias() {
  docker network disconnect "$network" "$1" >/dev/null &&
    docker network connect --alias "$2" "$network" "$1" >/dev/null
}

retire() {
  docker stop --time 30 "$1" >/dev/null
  docker rm --volumes "$1" >/dev/null
}

prune() {
  local keep id repository_name tag digest
  keep="$(
    printf '%s\n' "$@"
    docker ps --all --quiet --filter "label=$slot_label" |
      xargs --no-run-if-empty docker inspect --format '{{.Image}}'
  )"
  while read -r id repository_name tag digest; do
    [ "$repository_name" = "$repository" ] || continue
    [ "$tag" = staging ] || [ "$tag" = production ] && continue
    grep --quiet --fixed-strings --line-regexp "$id" <<<"$keep" && continue
    if [ "$tag" != '<none>' ]; then
      docker image rm "$repository_name:$tag" >/dev/null 2>&1 || true
    elif [ "$digest" != '<none>' ]; then
      docker image rm "$repository_name@$digest" >/dev/null 2>&1 || true
    fi
  done < <(docker image ls --no-trunc --digests --format '{{.ID}} {{.Repository}} {{.Tag}} {{.Digest}}')
}

deploy() {
  local environment="$1" reference="$2" release="$3" name="zenbujapanese-dictionary-api-$1"
  local running container slot="" candidate new cidfile="$run_dir/$1.cid" build deadline
  local replaced=()

  for container in $(docker ps --all --filter "label=$environment_label=$environment" \
    --filter status=exited --filter status=created --format '{{.ID}}'); do
    docker rm --volumes "$container" >/dev/null
  done
  running="$(running_slots "$environment")"
  for candidate in a b; do
    if [ -z "$(docker ps --all --quiet --filter "name=^/$name-$candidate\$")" ]; then
      slot="$candidate"
      break
    fi
  done
  [ -n "$slot" ] || {
    log "$environment: both slots' names are taken ($name-a, $name-b); remove the one that isn't serving"
    return 2
  }

  log "$environment: starting $reference (release $release) in slot $slot"
  if ! docker run --detach --cidfile "$cidfile" --name "$name-$slot" \
    --label "$environment_label=$environment" --label "$slot_label=$slot" \
    --network "$network" --env-file "$config_dir/$environment.env" \
    "${container_limits[@]}" "${container_security[@]}" "$reference" >/dev/null; then
    log "$environment: couldn't start $reference"
    [ -s "$cidfile" ] && docker rm --force --volumes "$(cat "$cidfile")" >/dev/null 2>&1
    return 2
  fi
  new="$(cat "$cidfile")"

  deadline=$((SECONDS + ready_seconds))
  until build="$(build_of "$new")"; do
    if [ "$(docker inspect --format '{{.State.Running}}' "$new")" != true ] ||
      [ "$SECONDS" -ge "$deadline" ]; then
      log "$environment: $reference didn't answer /healthz; kept the running version. Its log:"
      docker logs --tail 80 "$new" 2>&1 | while read -r line; do log "  $line"; done
      docker rm --force --volumes "$new" >/dev/null
      return 1
    fi
    sleep 2
  done
  if [[ "$build" != *"-$release" ]]; then
    log "$environment: $reference answers as $build, not release $release; kept the running version"
    docker rm --force --volumes "$new" >/dev/null
    return 1
  fi
  if ! give_alias "$new" "$name"; then
    log "$environment: couldn't give $reference the network alias $name; kept the running version"
    docker rm --force --volumes "$new" >/dev/null
    return 2
  fi
  docker update --restart unless-stopped "$new" >/dev/null

  [ -z "$running" ] || sleep "$nginx_resolve_seconds"
  for container in $running; do
    replaced+=("$(docker inspect --format '{{.Image}}' "$container")")
    retire "$container"
  done
  log "$environment: deployed $reference as $build in slot $slot"
  prune "${replaced[@]}"
}

finish() {
  local environment="$1" current="$2" release="$3" running="$4"
  local name="zenbujapanese-dictionary-api-$1" build container
  build="$(build_of "$current")" || return 1
  [[ "$build" == *"-$release" ]] || return 1
  if ! has_alias "$current" "$name"; then
    log "$environment: giving $current, left from a deploy cut short, the network alias"
    give_alias "$current" "$name" || return 1
    sleep "$nginx_resolve_seconds"
  fi
  [ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$current")" = unless-stopped ] ||
    docker update --restart unless-stopped "$current" >/dev/null
  for container in $running; do
    [ "$container" = "$current" ] && continue
    log "$environment: stopping $container, left from an earlier deploy"
    retire "$container"
  done
}

check() {
  local environment="$1" image reference release running container current="" error
  local failed_file="$state_dir/failed-$environment" failed_image failed_at failed_why
  if [ ! -r "$config_dir/$environment.env" ]; then
    log "$environment: skipped; it isn't set up on this server ($config_dir/$environment.env is missing)"
    return 0
  fi
  if ! error="$(docker pull --quiet "$repository:$environment" 2>&1 >/dev/null)"; then
    log "$environment: couldn't read $repository:$environment from the registry: $(tr '\n' ' ' <<<"$error")"
    return 1
  fi
  image="$(docker image inspect --format '{{.Id}}' "$repository:$environment")" || return 1
  release="$(release_of "$image")"
  [[ "$release" =~ ^[A-Za-z0-9._-]+$ ]] || {
    log "$environment: $image names no DICTIONARY_API_RELEASE; not deploying it"
    return 1
  }

  running="$(running_slots "$environment")"
  for container in $running; do
    on_network "$container" || continue
    [ "$(docker inspect --format '{{.Image}}' "$container")" = "$image" ] && current="$container"
  done
  if [ -n "$current" ]; then
    finish "$environment" "$current" "$release" "$running" && return 0
    if has_alias "$current" "zenbujapanese-dictionary-api-$environment"; then
      log "$environment: $current doesn't answer /healthz as release $release; left as it is"
      return 1
    fi
    log "$environment: $current, left from a deploy cut short, doesn't answer as release $release; removing it"
    docker rm --force --volumes "$current" >/dev/null
  fi

  if [ -r "$failed_file" ] && read -r failed_image failed_at failed_why <"$failed_file" &&
    [ "$failed_image" = "$image" ]; then
    log "$environment: skipping $image, which failed at $failed_at: $failed_why. It's tried again when the tag moves, or after: rm $failed_file"
    return 1
  fi
  if ! reference="$(digest_reference_of "$image")"; then
    log "$environment: $image has no digest in $repository; not deploying it"
    return 1
  fi
  if ! command -v cosign >/dev/null; then
    log "$environment: cosign isn't installed, so no image can be verified; not deploying $reference"
    return 1
  fi
  if ! signed_on_main "$reference"; then
    log "$environment: $reference isn't signed by the Dictionary API deploy workflow on main; not deploying it"
    return 1
  fi
  if [ "$(docker image inspect --format '{{len .Config.Volumes}}' "$image")" != 0 ]; then
    log "$environment: $reference declares volumes, which a slot never needs; not deploying it"
    return 1
  fi
  if ! network_ready; then
    log "$environment: the $network network is missing, isn't internal, or doesn't have $nginx_container on it, so a slot there couldn't serve; not deploying (docs/agents/dictionary-api.md, Set up the server)"
    return 1
  fi

  deploy "$environment" "$reference" "$release"
  case $? in
    0) rm -f "$failed_file" ;;
    1)
      printf '%s %s %s\n' "$image" "$(date -u +%FT%TZ)" "it didn't answer /healthz as release $release (see the log above it)" >"$failed_file"
      return 1
      ;;
    *) return 1 ;;
  esac
}

[ "$(id -u)" = 0 ] || {
  echo "run it as root (cron does)" >&2
  exit 1
}
mkdir -p "$state_dir"
exec 9>>"$lock_file"
flock --nonblock 9 || {
  log "an earlier run is still deploying; this one skips"
  exit 0
}
use_registry_login || exit 1

status=0
for environment in staging production; do
  check "$environment" || status=1
done
exit "$status"
