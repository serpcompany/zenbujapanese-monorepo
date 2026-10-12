#!/bin/bash
set -u

usage() {
  echo "Usage: run.sh <name> [--device iphone|ipad] <Class[/test] or Class.test>..." >&2
  echo "Builds the app for testing on this checkout's own Simulator, runs those UI tests," >&2
  echo "and keeps the proof in tmp/agent/verify/<date>-<name>/." >&2
  exit 2
}

[ $# -ge 2 ] || usage
name=$1
shift
device=iphone
if [ "$1" = "--device" ]; then
  [ $# -ge 3 ] || usage
  device=$2
  shift 2
fi

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1
run="tmp/agent/verify/$(date +%F)-$name"
mkdir -p "$run/shots"
udid=$(python3 apps/ios/Tools/simulator.py --device "$device") || exit 1
build=$(python3 apps/ios/Tools/simulator.py derived-data) || exit 1
printf 'RUN=%s\nUDID=%s\nBUILD=%s\nDEVICE=%s\n' "$run" "$udid" "$build" "$device" >"$run/run.env"

{
  echo "simulator: $(xcrun simctl list devices | grep "$udid" | sed 's/^ *//')"
  echo "xcode: $(xcodebuild -version | tr '\n' ' ')(.xcode-version pins $(cat .xcode-version))"
  echo "commit: $(git rev-parse --short HEAD) on $(git branch --show-current), $(git status --porcelain | wc -l | tr -d ' ') files changed since"
  echo "other Simulators running: $(xcrun simctl list devices | grep Booted | grep -vc "$udid")"
} | tee "$run/doctor.txt"

xcrun simctl boot "$udid" 2>/dev/null
xcrun simctl bootstatus "$udid" -b >/dev/null

arguments=(-project apps/ios/ZenbuJapanese.xcodeproj -scheme ZenbuJapanese
  -destination "platform=iOS Simulator,id=$udid" -derivedDataPath "$build"
  ONLY_ACTIVE_ARCH=YES ARCHS=arm64 ZENBU_BUNDLE_ID_SUFFIX=.uitests)

xcodebuild "${arguments[@]}" build-for-testing >"$run/build.log" 2>&1
built=$?
grep -a -E '^\*\* |: error: ' "$run/build.log"
if [ "$built" -ne 0 ]; then
  xcrun simctl shutdown "$udid"
  echo "The build failed. Its log is $run/build.log"
  exit 1
fi

only=()
for test in "$@"; do
  only+=("-only-testing:ZenbuJapaneseUITests/${test/.//}")
done

xcrun simctl io "$udid" recordVideo --codec h264 --force "$run/run.mp4" >"$run/video.log" 2>&1 &
video=$!
rm -rf "$run/run.xcresult"
xcodebuild "${arguments[@]}" "${only[@]}" -resultBundlePath "$run/run.xcresult" \
  test-without-building >"$run/test.log" 2>&1 &
tests=$!
frames=0
while kill -0 "$tests" 2>/dev/null; do
  if [ "$frames" -lt 150 ]; then
    xcrun simctl io "$udid" screenshot --type=jpeg "$run/shots/$(date +%H%M%S).jpg" >/dev/null 2>&1
    frames=$((frames + 1))
  fi
  sleep 3
done
wait "$tests"
result=$?
kill -INT "$video" 2>/dev/null
wait "$video" 2>/dev/null
xcrun simctl shutdown "$udid"

grep -a -E "^Test Case .* (passed|failed)|: error: " "$run/test.log"
executed=$(grep -a -E "^[[:space:]]+Executed [0-9]+ tests?, with" "$run/test.log" | tail -n 1)
echo "$executed"
echo "Proof: $run (run.xcresult, run.mp4, shots/, doctor.txt)"
ran=$(sed -E 's/^[[:space:]]+Executed ([0-9]+) .*/\1/' <<<"$executed")
if [ "$result" -eq 0 ] && [ "${ran:-0}" -eq 0 ]; then
  echo "No test ran: nothing in ZenbuJapaneseUITests is named $*. The run proves nothing."
  exit 1
fi
exit "$result"
