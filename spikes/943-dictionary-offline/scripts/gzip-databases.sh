#!/bin/bash
set -euo pipefail
W=$(cd "$(dirname "$0")/../../.." && pwd)
R=$W/apps/ios/Modules/Sources/SearchExperience/Resources
O=$W/tmp/agent/gz
mkdir -p "$O"
for f in LanguageReferenceData.sqlite3 CompoundPitch.sqlite3 JLPTLevelPack.sqlite3 TUBELEXFrequencyPack.sqlite3 ExampleWordIndex.sqlite3 KanjiStrokeData.sqlite3 RankedLists.sqlite3; do
  gzip -9 -c "$R/$f" > "$O/$f.gz"
done
ls -l "$O"
