#!/bin/bash
set -euo pipefail
SPIKE=$(cd "$(dirname "$0")/.." && pwd)
B=$SPIKE/../../tmp/agent/build
V=$SPIKE/vendor/sqlite-fts4
EMSDK_VERSION=${EMSDK_VERSION:-4.0.15}
mkdir -p "$B" "$V"
cd "$B"
[ -d emsdk-main ] || { curl -sL https://github.com/emscripten-core/emsdk/archive/refs/heads/main.tar.gz -o emsdk.tar.gz; tar xzf emsdk.tar.gz; }
[ -d sqlite-src-3540100 ] || { curl -sLO https://sqlite.org/2026/sqlite-src-3540100.zip; unzip -q sqlite-src-3540100.zip; }
cd emsdk-main
./emsdk install "$EMSDK_VERSION" | tail -3
./emsdk activate "$EMSDK_VERSION" | tail -2
source ./emsdk_env.sh >/dev/null 2>&1
cd "$B/sqlite-src-3540100"
[ -f Makefile ] || ./configure --enable-all
make sqlite3.c
cd ext/wasm
grep -q 'SQLITE_ENABLE_FTS4' GNUmakefile || sed -i '' 's/^  -DSQLITE_ENABLE_FTS5 \\$/  -DSQLITE_ENABLE_FTS5 \\\n  -DSQLITE_ENABLE_FTS4 \\/' GNUmakefile
sed -i '' 's/^sed -i -e /sed -i '"''"' -e /' GNUmakefile
make npm | tail -4
cp jswasm/sqlite3-bundler-friendly.mjs "$V/sqlite3.mjs"
cp jswasm/sqlite3.wasm "$V/sqlite3.wasm"
ls -la "$V"
