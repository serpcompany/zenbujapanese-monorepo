#!/bin/bash
set -u

usage() {
  echo "Usage: run.sh <name> dictionary|account [[<status>:]<path>]..." >&2
  echo "Starts the service from this checkout on its own port, waits until it is healthy, asks" >&2
  echo "for each path (expecting 200, or the status given), keeps every answer and the service's" >&2
  echo "log in tmp/agent/verify/<date>-<name>/, and stops the service." >&2
  exit 2
}

[ $# -ge 2 ] || usage
name=$1
service=$2
shift 2

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1
case "$service" in
  dictionary)
    folder=apps/dictionary-api
    base=$(node tools/checks/ports.mjs | awk '$1 == "dictionary" { print $2 }')
    ;;
  account)
    folder=apps/account-api
    base=http://localhost:8789
    ;;
  *) usage ;;
esac
port=${base##*:}
run="tmp/agent/verify/$(date +%F)-$name"
mkdir -p "$run"
log="$root/$run/service.log"

holder=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -n 1)
if [ -n "$holder" ]; then
  echo "Port $port is taken by process $holder, running from $(lsof -a -p "$holder" -d cwd -Fn | sed -n 's/^n//p')."
  echo "Stop it first: this run checks the service this checkout starts, and no other."
  exit 1
fi

secrets=$(mktemp -d)
pid=
finish() {
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    wait "$pid" 2>/dev/null
  fi
  rm -rf "$secrets"
}
trap finish EXIT

authorization=()
if [ "$service" = dictionary ]; then
  token=$(openssl rand -hex 24)
  printf 'Authorization: Bearer %s\n' "$token" >"$secrets/authorization"
  authorization=(-H "@$secrets/authorization")
  export DICTIONARY_API_TOKEN=$token
fi

(cd "$folder" && PORT=$port exec node --env-file-if-exists=.env --import tsx src/server.ts) >"$log" 2>&1 &
pid=$!
printf 'RUN=%s\nSERVICE=%s\nBASE=%s\n' "$run" "$service" "$base" >"$run/run.env"

healthy=
for _ in $(seq 1 120); do
  kill -0 "$pid" 2>/dev/null || break
  if curl -fsS -o "$run/healthz.json" "$base/healthz" 2>/dev/null; then
    healthy=yes
    break
  fi
  sleep 2
done
if [ -z "$healthy" ]; then
  echo "The service didn't become healthy at $base/healthz. The end of its log ($run/service.log):"
  tail -n 15 "$log"
  exit 1
fi

{
  echo "service: $service, started from $(lsof -a -p "$pid" -d cwd -Fn | sed -n 's/^n//p')"
  echo "address: $base (process $pid)"
  echo "commit: $(git rev-parse --short HEAD) on $(git branch --show-current), $(git status --porcelain | wc -l | tr -d ' ') files changed since"
  echo "health: $(cat "$run/healthz.json")"
} | tee "$run/doctor.txt"

: >"$run/requests.txt"
number=0
unexpected=0
for request in "$@"; do
  expected=200
  path=$request
  case "$request" in
    [1-5][0-9][0-9]:*)
      expected=${request%%:*}
      path=${request#*:}
      ;;
  esac
  number=$((number + 1))
  answer=$(printf '%s/%02d' "$run" "$number")
  encoded=$(node -e 'process.stdout.write(process.argv[1].replace(/[^\x00-\x7f]+/g, encodeURIComponent))' "$path")
  status=$(curl -sS -o "$answer.body" -D "$answer.headers" -w '%{http_code}' \
    ${authorization[@]+"${authorization[@]}"} "$base$encoded")
  size=$(wc -c <"$answer.body" | tr -d ' ')
  printf '%02d %s (expected %s) %s, %s bytes\n' "$number" "$status" "$expected" "$path" "$size" |
    tee -a "$run/requests.txt"
  [ "$status" = "$expected" ] || unexpected=$((unexpected + 1))
done

echo "Proof: $run (doctor.txt, requests.txt, each answer's .body and .headers, service.log)"
if [ "$unexpected" -gt 0 ]; then
  echo "$unexpected of $number answers had another status than expected."
  exit 1
fi
