#!/usr/bin/env bash
set -euo pipefail

FILE_PATH="${1:?Usage: $0 <trace.json>}"

python3 "$(dirname "$0")/analyze_trace.py" "$FILE_PATH"
