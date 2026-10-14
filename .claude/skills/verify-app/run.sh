#!/bin/bash
set -u

usage() {
  echo "Usage: run.sh <name> [--device iphone|ipad] [--keep] [--record] <Class[/test] or Class.test>..." >&2
  echo "Runs those UI tests on this checkout's own Simulator and keeps the result in" >&2
  echo "tmp/agent/verify/<date>-<name>/. It boots the Simulator only when it isn't up, builds" >&2
  echo "only what changed, and shuts the Simulator down at the end unless --keep leaves it up" >&2
  echo "for the next run. --record adds a screen recording and screenshots." >&2
  exit 2
}

[ $# -ge 2 ] || usage
name=$1
shift
device=iphone
keep=no
record=no
while [ $# -gt 0 ]; do
  case $1 in
    --device)
      [ $# -ge 2 ] || usage
      device=$2
      shift 2
      ;;
    --keep)
      keep=yes
      shift
      ;;
    --record)
      record=yes
      shift
      ;;
    --*) usage ;;
    *) break ;;
  esac
done
[ $# -ge 1 ] || usage

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1
run="tmp/agent/verify/$(date +%F)-$name"
mkdir -p "$run"
udid=$(python3 apps/ios/Tools/simulator.py --device "$device") || exit 1
build=$(python3 apps/ios/Tools/simulator.py derived-data) || exit 1
printf 'RUN=%s\nUDID=%s\nBUILD=%s\nDEVICE=%s\n' "$run" "$udid" "$build" "$device" >"$run/run.env"

leave_the_simulator() {
  if [ "$keep" = yes ]; then
    echo "The Simulator stays up for the next run. Shut it down when the work is done:"
    echo "  python3 apps/ios/Tools/simulator.py shutdown"
  else
    python3 apps/ios/Tools/simulator.py shutdown >/dev/null
  fi
}

began=$SECONDS
booted=$(python3 apps/ios/Tools/simulator.py boot --device "$device") || exit 1
{
  echo "simulator: $booted ($udid)"
  echo "xcode: $(xcodebuild -version | tr '\n' ' ')(.xcode-version pins $(cat .xcode-version))"
  echo "commit: $(git rev-parse --short HEAD) on $(git branch --show-current), $(git status --porcelain | wc -l | tr -d ' ') files changed since"
  echo "other Simulators running: $(xcrun simctl list devices | grep Booted | grep -vc "$udid")"
} | tee "$run/doctor.txt"
up=$SECONDS

arguments=(-project apps/ios/ZenbuJapanese.xcodeproj -scheme ZenbuJapanese
  -destination "platform=iOS Simulator,id=$udid" -derivedDataPath "$build"
  ONLY_ACTIVE_ARCH=YES ARCHS=arm64 ZENBU_BUNDLE_ID_SUFFIX=.uitests)

xcodebuild "${arguments[@]}" build-for-testing >"$run/build.log" 2>&1
built=$?
grep -a -E '^\*\* |: error: ' "$run/build.log"
if [ "$built" -ne 0 ]; then
  leave_the_simulator
  echo "The build failed. Its log is $run/build.log"
  exit 1
fi
ready=$SECONDS

only=()
for test in "$@"; do
  only+=("-only-testing:ZenbuJapaneseUITests/${test/.//}")
done

rm -rf "$run/run.xcresult" "$run/run.mp4" "$run/shots"
xcodebuild "${arguments[@]}" "${only[@]}" -resultBundlePath "$run/run.xcresult" \
  test-without-building >"$run/test.log" 2>&1 &
tests=$!
proof="run.xcresult, test.log, doctor.txt"
if [ "$record" = yes ]; then
  proof="$proof, run.mp4, shots/"
  mkdir -p "$run/shots"
  xcrun simctl io "$udid" recordVideo --codec h264 --force "$run/run.mp4" >"$run/video.log" 2>&1 &
  video=$!
  frames=0
  while kill -0 "$tests" 2>/dev/null && [ "$frames" -lt 150 ]; do
    xcrun simctl io "$udid" screenshot --type=jpeg "$run/shots/$(date +%H%M%S).jpg" >/dev/null 2>&1
    frames=$((frames + 1))
    sleep 3
  done
fi
wait "$tests"
result=$?
if [ "$record" = yes ]; then
  kill -INT "$video" 2>/dev/null
  wait "$video" 2>/dev/null
fi
tested=$SECONDS
leave_the_simulator

grep -a -E "^Test Case .* (passed|failed)|: error: " "$run/test.log"
executed=$(grep -a -E "^[[:space:]]+Executed [0-9]+ tests?, with" "$run/test.log" | tail -n 1)
echo "$executed"
echo "Took $((tested - began)) s: $((up - began)) s for the Simulator, $((ready - up)) s for the build, $((tested - ready)) s for the tests"
echo "Proof: $run ($proof)"
ran=$(sed -E 's/^[[:space:]]+Executed ([0-9]+) .*/\1/' <<<"$executed")
if [ "$result" -eq 0 ] && [ "${ran:-0}" -eq 0 ]; then
  echo "No test ran: nothing in ZenbuJapaneseUITests is named $*. The run proves nothing."
  exit 1
fi
exit "$result"
