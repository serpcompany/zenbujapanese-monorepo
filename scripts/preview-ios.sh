#!/usr/bin/env bash
set -euo pipefail
exec /usr/bin/python3 "$(cd "$(dirname "$0")" && pwd)/preview_ios.py" "$@"
