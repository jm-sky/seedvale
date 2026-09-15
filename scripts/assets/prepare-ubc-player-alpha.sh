#!/usr/bin/env bash
# Compose UBC male Peasant/Ranger + UAL1 subset into public/models/characters/ubc/.
# Sources stay in _temp/. Re-run after changing the compose/extract scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/seedvale-ubc-player.XXXXXX")"
OUT="$ROOT/public/models/characters/ubc"
UAL1="$ROOT/_temp/Models/packs/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb"

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

if [[ ! -f "$UAL1" ]]; then
  echo "missing $UAL1" >&2
  exit 1
fi

mkdir -p "$OUT" "$WORK/outfits" "$WORK/anims"

python3 "$ROOT/scripts/assets/compose_ubc_player.py" --root "$ROOT" --out-dir "$WORK/outfits"
python3 "$ROOT/scripts/assets/extract_glb_clips.py" \
  --in "$UAL1" \
  --out "$WORK/anims/ual1_player.glb" \
  --keep Idle_Loop,Walk_Loop,Sprint_Loop,Sword_Attack,Sword_Idle,Interact,Death01,Hit_Chest,Punch_Jab,Punch_Cross,Roll,Pistol_Idle_Loop,Pistol_Aim_Neutral,Pistol_Shoot,Crouch_Idle_Loop,Crouch_Fwd_Loop,Jump_Start,Jump_Loop,Jump_Land,Swim_Idle_Loop,Swim_Fwd_Loop,Idle_Torch_Loop

optimize() {
  local src="$1"
  local dest="$2"
  local extra="${3:-}"
  local tmp="$WORK/$(basename "$dest").tmp.glb"
  # Do not use `gltf-transform optimize` — its flatten/join would collapse the UBC armature.
  npx --yes @gltf-transform/cli copy "$src" "$tmp"
  npx --yes @gltf-transform/cli resize "$tmp" "$tmp" --width 512 --height 512
  npx --yes @gltf-transform/cli webp "$tmp" "$tmp"
  npx --yes @gltf-transform/cli prune "$tmp" "$tmp"
  # -kn keeps bone names for the mixer / hand socket. -ac (anims) keeps bind-pose tracks.
  # shellcheck disable=SC2086
  npx --yes gltfpack -cc -kn $extra -i "$tmp" -o "$dest"
  echo "wrote $dest ($(du -h "$dest" | cut -f1))"
}

optimize "$WORK/outfits/male_peasant.gltf" "$OUT/male_peasant.glb"
optimize "$WORK/outfits/male_ranger.gltf" "$OUT/male_ranger.glb"
optimize "$WORK/anims/ual1_player.glb" "$OUT/ual1_player.glb" "-ac"

# Brown albedo variants are swapped at runtime onto MI_Peasant / MI_Ranger (plan items-player-034).
# Install sharp in a temp dir — project node_modules may not have it, and
# `npx --package=sharp node -e` does not resolve the package from the repo root.
SHARP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/seedvale-sharp.XXXXXX")"
(
  cd "$SHARP_DIR"
  npm install --silent sharp@0.33.5
  node -e '
const sharp = require("sharp");
const fs = require("fs");
const jobs = [
  [process.argv[1], process.argv[3]],
  [process.argv[2], process.argv[4]],
];
(async () => {
  for (const [src, dest] of jobs) {
    if (!fs.existsSync(src)) {
      console.error("missing alt albedo", src);
      process.exit(1);
    }
    await sharp(src).resize(512, 512, { fit: "inside" }).webp({ quality: 80 }).toFile(dest);
    console.log("wrote", dest);
  }
})().catch((err) => { console.error(err); process.exit(1); });
' \
    "$WORK/outfits/male_peasant_brown.png" \
    "$WORK/outfits/male_ranger_brown.png" \
    "$OUT/male_peasant_brown.webp" \
    "$OUT/male_ranger_brown.webp"
)
rm -rf "$SHARP_DIR"
