# Plan: Modular Quaternius Player Character

**Created:** 2026-08-20
**Status:** `verification needed` 🔍 (technical checks green; browser playtest 2026-08-20 found + fixed a broken outfit skin bind, re-check pending — see "Found and fixed" below)
**Priority:** 🟡 medium · **Effort:** M
**Depends on:** —
**Domain:** `items-player`

## Cel

Replace the player character model (previously `public/models/characters/Adventurer.glb`,
Quaternius "Ultimate Modular Men") with the Quaternius "Universal Base
Characters" + "Modular Character Outfits" packs already present under
`public/models/_main_character/`, equip the male base character with the
Peasant outfit, and prepare the architecture (not the UI) for a later female
character without another `PlayerController` rewrite.

## Asset findings (verified from the actual glTF, not filenames)

- Base character (`Superhero_Male_FullBody.gltf`) and outfit
  (`Male_Peasant.gltf`) share **one 65-joint rig**: identical joint names and
  order (`root, pelvis, spine_01, spine_02, spine_03, neck_01, Head,
  clavicle_l, upperarm_l, ...`). The outfit's 4 meshes
  (`Male_Peasant_Arms/Body/Feet/Legs`) are already `SkinnedMesh` nodes bound
  to that skin — no offline Blender re-rig needed.
- **Neither file ships any animation clips.** The old `Adventurer.glb` pack's
  `Idle/Walk/Run/Sword_Slash` clips live on a *different*, incompatible
  62-joint Mixamo-style skeleton (`Root, Body, Hips, Torso, Chest,
  Shoulder.L, ...`) — they cannot drive the new rig.
- Source (not in this repo): `Universal Animation Library[Standard]`'s
  `Unreal-Godot/UAL1_Standard.glb` (non-root-motion variant — confirmed the
  root joint's translation track is static across the file; the `_RM`
  variant bakes real root displacement and was **not** used, since
  `PlayerController` already drives position/rotation from code, not root
  motion) has the **exact same 65-joint rig** and 43 named clips including
  `Idle_Loop`, `Walk_Loop`, `Sprint_Loop`, `Sword_Attack`. Trimmed to those 4
  clips and meshopt-compressed (`gltf-transform`) from 7.6 MB → 226 KB, and
  copied into the repo as `public/models/_main_character/animations/player_locomotion.glb`.
- Fixed a pre-existing broken asset bug found while wiring this up: the
  shipped `Superhero_Male_FullBody.gltf` referenced two texture files with a
  mangled `_png.png` suffix (`T_Hair_1_Normal_png.png`,
  `T_Eye_Normal_png.png`) that don't exist on disk (the real files are
  `T_Hair_1_Normal.png` / `T_Eye_Normal.png`) — a Blender glTF-exporter
  artifact. These normal maps back the eyebrow/eye materials and would 404
  in-browser. Fixed the two URIs directly in the source `.gltf`.
- The raw male base + outfit source files ship at 4096×4096 texture
  resolution (~47 MB combined for just the male base + Peasant outfit).
  Converted to an optimized `.glb` per file (`gltf-transform`: textures
  resized to 1024×1024 + WebP), landing at 831 KB (base) + 882 KB (outfit) —
  roughly 2× the old `Adventurer.glb` (434 KB), still small. Female base
  character + Ranger outfits are left as unconverted raw source files (see
  `docs/assets/MODELS.md` M50) — out of scope per this task.
- **Found and fixed during implementation (browser playtest 2026-08-20):**
  the first version of `base_male.glb`/`outfit_male_peasant.glb` also ran
  through `gltf-transform meshopt --level medium` (matching this repo's
  standard `gltfpack -cc` asset-prep convention, `docs/assets/CREDITS.md`).
  That compressed the outfit into a visible tangle of misplaced geometry —
  walk/run/jump and the bare body looked correct, but the Peasant outfit
  rendered as scrambled shapes. Root-caused with a headless three.js
  `GLTFLoader` script (`tsc`/lint/build/test can't catch a bad skin bind —
  only a real load+skin computation shows it): meshopt's default per-mesh
  quantization volume corrupted the `inverseBindMatrices` accessor
  independently for each of the outfit's 3–5 internal skin definitions —
  `skeleton.boneInverses[0]`'s scale came out as `0.899`/`0.373`/etc. per
  mesh instead of matching the base's `0.062` — so the outfit's vertices
  collapsed toward the wrong bone transforms once rebound to the base
  skeleton. Fix: drop the `meshopt` geometry-compression pass for these two
  files — texture compression alone (no skin data touched) is safe. The
  animation library file (`player_locomotion.glb`) has no skin/mesh data of
  its own, so meshopt is safe there and was kept. **Do not** re-add meshopt
  geometry compression to `base_male.glb`/`outfit_male_peasant.glb` without
  re-verifying `skeleton.boneInverses` post-conversion (see
  `docs/assets/CREDITS.md`'s note on these two files).

## Architecture

- `src/player/characterConfig.ts` — `CharacterSex = 'male' | 'female'`,
  `PlayerCharacterConfig { sex, outfit? }`, `DEFAULT_PLAYER_CHARACTER =
  { sex: 'male', outfit: 'peasant' }`, and `resolveCharacterModelUrls()`
  (throws for `'female'` today — no wired model, see limitations).
- `src/player/loadPlayerCharacter.ts` — `loadPlayerCharacterModel(config)`
  extends the existing `assets/loadGltf.ts` cache/clone primitives
  (`loadGltfAsset`) rather than a new pipeline: loads base + outfit + the
  animation-only glb in parallel, then rebinds the outfit's `SkinnedMesh`es
  onto the **base character's own `THREE.Skeleton`** (`mesh.bind(baseSkeleton,
  mesh.bindMatrix)`) instead of keeping the outfit's cloned skeleton — one
  skeleton drives every mesh (3 base + 4 outfit), no duplicated bones.
- `PlayerController.create()` now takes a `characterConfig:
  PlayerCharacterConfig = DEFAULT_PLAYER_CHARACTER` parameter (previously a
  raw `modelUrl` string) and calls `loadPlayerCharacterModel()` instead of
  `loadGltfAnimated()`. Everything else (`AnimationMixer`, capsule fallback,
  positioning/movement/rotation, held-tool socket, melee) is unchanged.
- `findAction()`'s clip-name search lists gained the new rig's clip names
  alongside the old ones (`Idle_Loop`, `Walk_Loop`, `Sprint_Loop`,
  `Sword_Attack`), so the same `PlayerController` code plays either rig's
  clips without a second animation system.
- `src/assets/assetAnchorData.ts`'s `RIGHT_HAND_BONE_NAMES` gained `'hand_r'`
  (the new rig's right-hand bone) alongside the existing `WristR`/Mixamo
  aliases, so `findRightHandSocket()`/held-tool mounting resolve on both
  rigs without a parallel socket-lookup path.
- `src/assets/assetIndex.ts` (Asset Alignment Browser dev tool) now resolves
  the player entry's URL through `resolveCharacterModelUrls()` instead of
  the removed `PLAYER_MODEL_URL` constant.

## Limitations / follow-up

- **Female character not wired.** `resolveCharacterModelUrls({sex:
  'female', ...})` throws by design — the female base + outfit assets exist
  only as raw, unoptimized source files (`docs/assets/MODELS.md` M50).
  Wiring it is: run the same `gltf-transform` conversion used for the male
  assets, add the resulting URLs to `CHARACTER_DEFS.female` in
  `characterConfig.ts`. No `PlayerController` changes needed — this is
  exactly the seam plan asked for.
- **Held-tool grip transforms unverified on the new rig.** `HELD_ATTACH`'s
  per-tool position/rotation values (`items/heldToolVisual.ts`) were tuned
  against the old rig's `WristR` bone-local axis convention. The new rig's
  `hand_r` bone may have a different local-axis convention; whether tools
  sit in-hand correctly is unverified — needs a browser check, and possibly
  a `HELD_ATTACH` re-tune specific to the new rig if it looks wrong. Tools
  whose asset already declares a `grip` anchor (`mountByAnchorPair`) are
  less at risk since that path solves alignment from anchor pairs rather
  than a hardcoded bone-local offset.
- **Weapon grip orientation still unconfirmed** beyond the finding above —
  a partial browser check (2026-08-20) confirmed movement/animation/skeleton
  are correct, but held-tool orientation on the new `hand_r` bone hasn't
  specifically been looked at yet.

## Found and fixed (browser playtest 2026-08-20)

User report: character walks/runs/jumps correctly, but the Peasant outfit
renders as "a tangle of weird shapes". Root cause (found with a headless
`GLTFLoader` + manual CPU-skinning reproduction, since `tsc`/lint/build/test
have no way to catch a bad skin bind): the first `base_male.glb`/
`outfit_male_peasant.glb` conversion additionally ran `gltf-transform
meshopt --level medium` (this repo's usual `gltfpack -cc` asset-prep
convention). Its default per-mesh quantization volume corrupted the
outfit's `inverseBindMatrices` independently for each of its internal skin
definitions — verified `skeleton.boneInverses[0]`'s scale coming out as
`0.899`/`0.373`/etc. per outfit mesh instead of matching the base's `0.062`
— so once the outfit's meshes were rebound onto the base skeleton (correct
by design — see Architecture above), their vertices collapsed toward the
wrong bone transforms. The base body and skeleton/animations were
unaffected because they don't go through this rebind path.

Fix: re-generated `base_male.glb`/`outfit_male_peasant.glb` with texture
compression only (no `meshopt` pass) — 831 KB / 882 KB instead of 436 KB /
484 KB, confirmed the same headless test now reproduces sane per-body-part
bounding boxes (torso/legs/feet/arms each in their correct region relative
to the base body, matching the base's own skinning). `docs/assets/CREDITS.md`
carries a permanent warning against re-adding meshopt to these two files.

## Implementation summary

Files changed: `src/player/characterConfig.ts` (new),
`src/player/loadPlayerCharacter.ts` (new), `src/player/PlayerController.ts`,
`src/assets/assetAnchorData.ts`, `src/assets/assetIndex.ts`,
`public/models/_main_character/models/Superhero_Male_FullBody.gltf` (broken
texture URI fix), plus new binary assets under
`public/models/_main_character/optimized/` and
`public/models/_main_character/animations/`. `docs/assets/MODELS.md` /
`docs/assets/CREDITS.md` updated per this repo's asset-doc workflow.

Technical verification: `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run
build`, `pnpm run test` (1172 tests) all green. Browser verification:
user-tested movement/animation (walk/run/jump — correct); outfit skin bind
was broken and is now fixed per above, not yet re-confirmed visually by the
user; weapon grip orientation still unconfirmed. Dev server left running at
`http://localhost:5577` for the user's re-check.
