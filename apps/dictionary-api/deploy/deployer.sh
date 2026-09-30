#!/usr/bin/env bash
# Deploys the dictionary service on its server: cron runs it as root every 5 minutes
# (/etc/cron.d/zenbujapanese-dictionary-api; docs/agents/dictionary-api.md, Ship it). It asks the
# registry which image each environment's tag names (ghcr.io/serpcompany/
# zenbujapanese-dictionary-api:staging, :production), and when one changed, deploys it. The
# `Dictionary API deploy` workflow moves the tags; nothing reaches the server. The script takes no
# input and reads no environment variable, so nothing outside the server can make it do anything
# else: changing what it does takes root on the server.
#
# Each environment runs on web_network in one of two slots, both answering to its network alias,
# zenbujapanese-dictionary-api-<environment>, which the server's nginx resolves per request, sending
# a request one slot can't answer to the other. A deploy starts the new image in the free slot,
# waits until its /healthz names the image's release and nginx has seen it, then stops the old one.
# A new image that doesn't come up is removed, the old one keeps serving, and that image isn't
# tried again until the tag moves. It touches only its own containers and this repository's images,
# and never nginx. It writes to the journal: journalctl -t zenbujapanese-dictionary-api.

set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

readonly repository=ghcr.io/serpcompany/zenbujapanese-dictionary-api
readonly network=web_network
readonly config_dir=/etc/zenbujapanese-dictionary-api
readonly state_dir=/var/lib/zenbujapanese-dictionary-api
readonly lock_file=/run/zenbujapanese-dictionary-api.lock
readonly slot_label=zenbujapanese.dictionary-api.slot
readonly environment_label=zenbujapanese.dictionary-api.environment
# What a container may use, so it can't starve the server's other services. It needs about 1.4 GB
# at its peak, the half minute after it starts, and about 750 MiB after.
readonly container_limits=(
  --memory 4g --memory-swap 4g --cpus 4 --pids-limit 512
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3
)
# What it may do: nothing it doesn't need. It runs as the image's non-root user and writes nothing.
readonly container_security=(
  --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:size=64m
)
# How long a new container may take to answer /healthz: it hashes the app's data and loads its
# worker threads first, a few seconds on a small server.
readonly ready_seconds=180
# nginx keeps the alias's addresses this long (resolver valid=5s in its site); wait past it before
# stopping the old slot, so nginx knows the new one.
readonly nginx_resolve_seconds=10

log() {
  logger --tag zenbujapanese-dictionary-api -- "$*" 2>/dev/null || true
  echo "$*" >&2
}

# One environment's slot containers that are running.
running_slots() {
  docker ps --filter "label=$environment_label=$1" --format '{{.Names}}'
}

# The build a container's /healthz names; fails while it isn't ready.
build_of() {
  docker exec "$1" node -e "
    fetch('http://127.0.0.1:' + process.env.PORT + '/healthz')
      .then(response => (response.ok ? response.json() : Promise.reject(response.status)))
      .then(health => console.log(health.build), () => process.exit(1))" 2>/dev/null
}

# Removes this repository's images, but those any environment's slot uses and the ones given: the
# images a deploy replaced, which a rollback deploys again (a later deploy may remove them; the
# rollback then pulls them again), and the images the tags name. Each goes by its references in
# this repository, so an image another repository also names stays.
prune() {
  local keep id repository_name tag digest
  keep="$(
    printf '%s\n' "$@"
    docker ps --all --quiet --filter "label=$slot_label" |
      xargs --no-run-if-empty docker inspect --format '{{.Image}}'
  )"
  # Every image, not `--filter reference=`, which leaves out an image pulled by digest alone.
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

# Starts `image` in the environment's free slot, and once it answers, stops the others.
deploy() {
  local environment="$1" image="$2" name="zenbujapanese-dictionary-api-$1" release reference
  local running container slot="" candidate new build waited=0 replaced=()
  release="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image" |
    sed -n 's/^DICTIONARY_API_RELEASE=//p')"
  [[ "$release" =~ ^[A-Za-z0-9._-]+$ ]] || {
    log "$environment: $image names no DICTIONARY_API_RELEASE"
    return 1
  }
  # Run it by its digest, so `docker ps` names the image rather than its ID.
  reference="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image" |
    grep --max-count 1 "^$repository@sha256:")" || reference="$image"

  # A stopped slot container serves nothing; clear it, so its slot is free.
  for container in $(docker ps --all --filter "label=$environment_label=$environment" \
    --filter status=exited --filter status=created --format '{{.Names}}'); do
    docker rm "$container" >/dev/null
  done
  running="$(running_slots "$environment")"
  for candidate in a b; do
    if ! grep --quiet --line-regexp "$name-$candidate" <<<"$running"; then
      slot="$candidate"
      break
    fi
  done
  [ -n "$slot" ] || {
    log "$environment: both slots are running; stop one with docker rm -f"
    return 1
  }

  new="$name-$slot"
  log "$environment: starting $reference (release $release) in slot $slot"
  # No restart policy until it answers, so a crash shows at once rather than as a restart loop.
  docker run --detach --name "$new" \
    --label "$environment_label=$environment" --label "$slot_label=$slot" \
    --network "$network" --network-alias "$name" --env-file "$config_dir/$environment.env" \
    "${container_limits[@]}" "${container_security[@]}" "$reference" >/dev/null || {
    log "$environment: couldn't start $reference"
    docker rm --force "$new" >/dev/null 2>&1
    return 1
  }
  until build="$(build_of "$new")"; do
    if [ "$(docker inspect --format '{{.State.Running}}' "$new")" != true ] ||
      [ "$waited" -ge "$ready_seconds" ]; then
      log "$environment: $reference didn't answer /healthz; kept the running version. Its log:"
      docker logs --tail 80 "$new" 2>&1 | while read -r line; do log "  $line"; done
      docker rm --force "$new" >/dev/null
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
  if [[ "$build" != *"-$release" ]]; then
    log "$environment: $reference answers as $build, not release $release; kept the running version"
    docker rm --force "$new" >/dev/null
    return 1
  fi
  docker update --restart unless-stopped "$new" >/dev/null

  # Once nginx has resolved the alias to both slots, stopping the old one moves every request to
  # the new one. A stopped container finishes its requests first (SIGTERM).
  [ -z "$running" ] || sleep "$nginx_resolve_seconds"
  for container in $running; do
    replaced+=("$(docker inspect --format '{{.Image}}' "$container")")
    docker stop --time 30 "$container" >/dev/null
    docker rm "$container" >/dev/null
  done
  log "$environment: deployed $reference as $build in slot $slot"
  prune "${replaced[@]}"
}

# Deploys the image the environment's tag names, if it isn't what runs and hasn't failed.
check() {
  local environment="$1" image running container current="" failed_file
  [ -r "$config_dir/$environment.env" ] || return 0 # Not set up on this server.
  failed_file="$state_dir/failed-$environment"
  # Fetches only the tag's manifest unless it names a new image.
  docker pull --quiet "$repository:$environment" >/dev/null 2>&1 || {
    log "$environment: couldn't read $repository:$environment from the registry"
    return 1
  }
  image="$(docker image inspect --format '{{.Id}}' "$repository:$environment")" || return 1
  running="$(running_slots "$environment")"
  for container in $running; do
    [ "$(docker inspect --format '{{.Image}}' "$container")" = "$image" ] && current="$container"
  done
  if [ -n "$current" ]; then
    # Up to date. A slot left beside it (a deploy cut short) goes, once the current one answers.
    for container in $running; do
      if [ "$container" != "$current" ] && build_of "$current" >/dev/null; then
        log "$environment: stopping $container, left from an earlier deploy"
        docker stop --time 30 "$container" >/dev/null
        docker rm "$container" >/dev/null
      fi
    done
    return 0
  fi
  [ "$(cat "$failed_file" 2>/dev/null)" = "$image" ] && return 0
  if deploy "$environment" "$image"; then
    rm -f "$failed_file"
  else
    echo "$image" >"$failed_file"
    return 1
  fi
}

[ "$(id -u)" = 0 ] || {
  echo "run it as root (cron does)" >&2
  exit 1
}
mkdir -p "$state_dir"
# One run at a time: a deploy can outlast the 5 minutes. /run is root's, so no other user can
# plant the lock file.
exec 9>>"$lock_file"
flock --nonblock 9 || exit 0

status=0
for environment in staging production; do
  check "$environment" || status=1
done
exit "$status"
