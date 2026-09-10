#!/usr/bin/env bash
# Move staged drops from public/new/ into shipped paths (one-time promote).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NEW="$ROOT/public/new"
mkdir -p "$ROOT/public/models/items" "$ROOT/public/models/settlement" "$ROOT/public/models/world" "$ROOT/public/sounds"

move_glb() {
  local src="$1" dest="$2"
  if [[ -f "$NEW/$src" ]]; then
    mv "$NEW/$src" "$dest"
    echo "moved $src -> $dest"
  else
    echo "skip (missing): $NEW/$src" >&2
    return 1
  fi
}

move_ogg() {
  local src="$1" dest="$2"
  if [[ -f "$NEW/$src" ]]; then
    mv "$NEW/$src" "$dest"
    echo "moved $src -> $dest"
  else
    echo "skip (missing): $NEW/$src" >&2
    return 1
  fi
}

missing=0
move_glb "Fishing Rod by Quaternius - 0YAR0Lg58p.glb" "$ROOT/public/models/items/fishing_rod.glb" || missing=1
move_glb "Wood Water Trough by Oliver Herklotz - eWOPxWJkqL3.glb" "$ROOT/public/models/settlement/animal_trough.glb" || missing=1
move_glb "Bear Trap by Quaternius - fqv7qtGQYH.glb" "$ROOT/public/models/world/bear_trap.glb" || missing=1
move_ogg "drink.ogg" "$ROOT/public/sounds/action-drink-01.ogg" || missing=1
move_ogg "cooking-on-stove.ogg" "$ROOT/public/sounds/action-cook-01.ogg" || missing=1

if [[ $missing -ne 0 ]]; then
  echo "Some files were missing under public/new/ — add them and re-run." >&2
  exit 1
fi

rmdir "$NEW" 2>/dev/null || true
echo "Done."
