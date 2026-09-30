#!/usr/bin/env bash
# Deploys an image of the dictionary service to one environment on this server, without downtime.
# The `Dictionary API deploy` workflow runs it over SSH (ci-deploy.sh) as the deploy user. Each
# environment's key is restricted to this script and its environment, in authorized_keys:
#
#   restrict,command="/usr/local/bin/zenbujapanese-dictionary-api-deploy staging" ssh-ed25519 …
#
# so the workflow can ask for only:
#
#   deploy ghcr.io/serpcompany/zenbujapanese-dictionary-api@sha256:<digest>
#   status
#
# The service runs on the server's Docker network (web_network) in one of two slots, both answering
# to the environment's network alias, zenbujapanese-dictionary-api-<environment>. The server's nginx
# resolves that alias per request and sends a request the one slot can't answer to the other
# (docs/agents/dictionary-api.md, Ship it). A deploy starts the new image in the free slot, waits
# until its /healthz names the image's release and nginx has seen it, then stops the old one. If
# the new one doesn't come up, it's removed and the old one keeps serving. Nothing here touches
# nginx.

set -euo pipefail

repository="${DICTIONARY_API_REPOSITORY:-ghcr.io/serpcompany/zenbujapanese-dictionary-api}"
network="${DICTIONARY_API_NETWORK:-web_network}"
config_dir="${DICTIONARY_API_CONFIG_DIR:-/etc/zenbujapanese-dictionary-api}"
slot_label=zenbujapanese.dictionary-api.slot
environment_label=zenbujapanese.dictionary-api.environment
# How long a new container may take to answer /healthz: it hashes the app's data and loads its
# worker threads first, a few seconds on a small server.
ready_seconds=180
# nginx keeps the alias's addresses this long (resolver valid=5s in its site); wait past it before
# stopping the old slot, so nginx knows the new one.
nginx_resolve_seconds=10

fail() {
  echo "error: $*" >&2
  exit 1
}

environment="${1:-}"
case "$environment" in
  staging | production) ;;
  *) fail "usage: host-deploy.sh <staging|production> [deploy <image>|status]" ;;
esac
name="zenbujapanese-dictionary-api-$environment"
env_file="$config_dir/$environment.env"

# This environment's slot containers, running or not.
slot_containers() {
  docker ps --all --filter "label=$environment_label=$environment" --format '{{.Names}}'
}

# The build a container's /healthz names; fails while it isn't ready.
build_of() {
  docker exec "$1" node -e "
    fetch('http://127.0.0.1:' + process.env.PORT + '/healthz')
      .then(response => (response.ok ? response.json() : Promise.reject(response.status)))
      .then(health => console.log(health.build), () => process.exit(1))" 2>/dev/null
}

status() {
  local container
  for container in $(slot_containers); do
    echo "$container $(docker inspect --format '{{.Config.Image}} {{.State.Status}}' "$container")" \
      "build=$(build_of "$container" || echo none)"
  done
}

# Removes this repository's images, but those any environment's slot uses and the ones given: the
# images a deploy replaced, which a rollback deploys again (a later deploy of the other environment
# may remove them; a rollback then pulls them again). Each goes by its references in this
# repository, so an image another repository also names stays.
prune() {
  local keep id repository_name tag digest
  keep="$(
    printf '%s\n' "$@"
    docker ps --all --quiet --filter "label=$slot_label" |
      xargs --no-run-if-empty docker inspect --format '{{.Image}}'
  )"
  # Every image, not `--filter reference=`, which leaves out an image pulled by digest alone: how
  # this script pulls them all.
  while read -r id repository_name tag digest; do
    [ "$repository_name" = "$repository" ] || continue
    grep --quiet --fixed-strings --line-regexp "$id" <<<"$keep" && continue
    if [ "$tag" != '<none>' ]; then
      docker image rm "$repository_name:$tag" >/dev/null 2>&1 || true
    elif [ "$digest" != '<none>' ]; then
      docker image rm "$repository_name@$digest" >/dev/null 2>&1 || true
    fi
  done < <(docker image ls --no-trunc --digests --format '{{.ID}} {{.Repository}} {{.Tag}} {{.Digest}}')
}

deploy() {
  local image="$1" release container slot="" candidate new build waited=0
  local running=() replaced=()
  [ -r "$env_file" ] || fail "$env_file, which holds the $environment DICTIONARY_API_TOKEN, is missing"
  docker pull --quiet "$image" >/dev/null
  release="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image" |
    sed -n 's/^DICTIONARY_API_RELEASE=//p')"
  [ -n "$release" ] || fail "$image names no DICTIONARY_API_RELEASE"

  # A stopped slot container serves nothing; clear it, so its slot is free.
  for container in $(slot_containers); do
    if [ "$(docker inspect --format '{{.State.Running}}' "$container")" = true ]; then
      running+=("$container")
    else
      docker rm "$container" >/dev/null
    fi
  done
  for candidate in a b; do
    if ! printf '%s\n' "${running[@]}" | grep --quiet --line-regexp "$name-$candidate"; then
      slot="$candidate"
      break
    fi
  done
  [ -n "$slot" ] || fail "both slots are running ($(status | tr '\n' ';')); stop one with docker rm -f"

  new="$name-$slot"
  # No restart policy until it answers, so a crash shows at once rather than as a restart loop.
  docker run --detach --name "$new" \
    --label "$environment_label=$environment" --label "$slot_label=$slot" \
    --network "$network" --network-alias "$name" --env-file "$env_file" "$image" >/dev/null
  until build="$(build_of "$new")"; do
    if [ "$(docker inspect --format '{{.State.Running}}' "$new")" != true ] ||
      [ "$waited" -ge "$ready_seconds" ]; then
      echo "error: $image didn't answer /healthz in slot $slot; its log:" >&2
      docker logs --tail 80 "$new" >&2 || true
      docker rm --force "$new" >/dev/null
      fail "kept the running version"
    fi
    sleep 2
    waited=$((waited + 2))
  done
  if [[ "$build" != *"-$release" ]]; then
    docker rm --force "$new" >/dev/null
    fail "the new container answers as $build, not release $release; kept the running version"
  fi
  docker update --restart unless-stopped "$new" >/dev/null

  # Once nginx has resolved the alias to both slots, stopping the old one moves every request to
  # the new one. A stopped container finishes its requests first (SIGTERM).
  [ "${#running[@]}" -eq 0 ] || sleep "$nginx_resolve_seconds"
  for container in "${running[@]}"; do
    replaced+=("$(docker inspect --format '{{.Image}}' "$container")")
    docker stop --time 30 "$container" >/dev/null
    docker rm "$container" >/dev/null
  done
  prune "${replaced[@]}"
  echo "deployed $image to $environment as $build in slot $slot"
}

# One deploy at a time on this server.
exec 9>"/tmp/zenbujapanese-dictionary-api-deploy.lock"
flock --nonblock 9 || fail "another deploy is running on this server"

request="${SSH_ORIGINAL_COMMAND:-${*:2}}"
case "$request" in
  status)
    status
    ;;
  "deploy $repository@sha256:"*)
    image="${request#deploy }"
    [[ "${image#"$repository@sha256:"}" =~ ^[0-9a-f]{64}$ ]] || fail "not an image digest: $image"
    deploy "$image"
    ;;
  *)
    fail "this key may run only: deploy $repository@sha256:<digest>, or status"
    ;;
esac
