#!/usr/bin/env bash
# Compose UBC Fantasy outfits + UAL1 subset into public/models/characters/ubc/.
# Male player meshes, female Peasant/Wizard/Ranger, unhelmeted male Knight
# singleton for guards, npc-040 hair/beard variants under ubc/npc/, hair_1/2.webp.
# Female hair is Long / Buns (not BuzzedFemale). Sources stay in _temp/.
# Re-run after changing the compose/extract scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/seedvale-ubc-player.XXXXXX")"
OUT="$ROOT/public/models/characters/ubc"
UAL1="$ROOT/_temp/Models/packs/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb"
OUTFITS=(
  male_peasant
  male_ranger
  male_knight
  male_knight_unhelmeted
  male_knight_cloth
  male_noble
  male_wizard
  female_peasant
  female_wizard
  female_ranger
)
NPC_TINTS=(
  npc_peasant
  npc_woodcutter
  npc_wizard
  npc_ranger
  npc_knight
)
ACCESSORIES=(
  male_leather_pauldron
  male_ranger_pauldron
  male_knight_pauldron_spike
  male_knight_pauldron_round
)

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

for name in "${OUTFITS[@]}"; do
  optimize "$WORK/outfits/${name}.gltf" "$OUT/${name}.glb"
done
mkdir -p "$OUT/accessories"
for name in "${ACCESSORIES[@]}"; do
  optimize "$WORK/outfits/accessories/${name}.gltf" "$OUT/accessories/${name}.glb"
done
mkdir -p "$OUT/npc"
shopt -s nullglob
for gltf in "$WORK/outfits/npc"/*.gltf; do
  name="$(basename "$gltf" .gltf)"
  optimize "$gltf" "$OUT/npc/${name}.glb"
done
optimize "$WORK/anims/ual1_player.glb" "$OUT/ual1_player.glb" "-ac"

# Brown albedo variants are swapped at runtime onto MI_* outfit materials.
# NPC profession tints (T_Peasant_3 / T_Peasant_2 / T_Wizard_3 / T_Ranger_2 / T_Knight_3) live beside them.
# Install sharp in a temp dir — project node_modules may not have it, and
# `npx --package=sharp node -e` does not resolve the package from the repo root.
SHARP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/seedvale-sharp.XXXXXX")"
SHARP_ARGS=()
for name in "${OUTFITS[@]}"; do
  if [[ -f "$WORK/outfits/${name}_brown.png" ]]; then
    SHARP_ARGS+=("$WORK/outfits/${name}_brown.png" "$OUT/${name}_brown.webp")
  fi
done
for name in "${NPC_TINTS[@]}"; do
  SHARP_ARGS+=("$WORK/outfits/${name}.png" "$OUT/${name}.webp")
done
for name in hair_1 hair_2; do
  SHARP_ARGS+=("$WORK/outfits/${name}.png" "$OUT/${name}.webp")
done
(
  cd "$SHARP_DIR"
  npm install --silent sharp@0.33.5
  node -e '
const sharp = require("sharp");
const fs = require("fs");
const args = process.argv.slice(1);
(async () => {
  for (let i = 0; i < args.length; i += 2) {
    const src = args[i];
    const dest = args[i + 1];
    if (!fs.existsSync(src)) {
      console.error("missing alt albedo", src);
      process.exit(1);
    }
    await sharp(src).resize(512, 512, { fit: "inside" }).webp({ quality: 80 }).toFile(dest);
    console.log("wrote", dest);
  }
})().catch((err) => { console.error(err); process.exit(1); });
' \
    "${SHARP_ARGS[@]}"
)
rm -rf "$SHARP_DIR"
