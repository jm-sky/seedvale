# Implementation Plan — Asset Alignment Browser

**Plan:** [2026-08-12--088--asset-alignment-browser.md](./2026-08-12--088--asset-alignment-browser.md)
**Review:** [2026-08-12--088--asset-alignment-browser-review.md](./2026-08-12--088--asset-alignment-browser-review.md)

**Status:** `planned` 📋
**Priority:** 🟡 `medium`
**Effort:** `XL` (PRD says `L`; the anchor seam + runtime consumers + 5 MVP phases are larger than one session)
**Dependencies:** — (touches `074` / `085` code paths but does not depend on unfinished work)

---

## 0. How to read this document

The PRD defines *what* the tool must do. The review defines *which product decisions were missing*. This
document resolves those decisions, fixes the technical mechanism, and names the exact files to change.

Two rules that shape everything below:

1. **The anchor definition belongs to the asset domain, not the browser.** Anchor types, discovery,
   resolution and validation live in `src/assets/`, are importable by game code, and the browser is only
   their first UI consumer (review §4, §6).
2. **No second asset-loading / transform / attachment mechanism.** The viewer loads assets through
   `src/assets/loadGltf.ts` with the *same normalization the game applies*, and the anchor seam is wired
   into the two attachment mechanisms that already exist (`heldToolVisual.ts` hand socket,
   `props.ts` house lamp mount) rather than next to them.

---

## 1. Verified current state (what the plan builds on)

Confirmed by reading the code, not the docs:

| Concern | Where | Reality |
|---|---|---|
| GLB loading | `src/assets/loadGltf.ts` | One module-level `GLTFLoader` + meshopt, `Map<url, Promise<CachedGltf>>` cache, `SkeletonUtils.clone` per instance, shared GPU resources flagged `userData.sharedGpu`. No cache invalidation API. |
| Post-load material patching | `loadCached` → `patchFoliageWindOnObject` | Runs **once per URL on the cached root**: `hardenFoliageAlpha` (BLEND → `alphaTest` cutout) + vertex wind. Every clone inherits it. |
| Normalization | `prepareProp(obj, targetHeight)` / `preparePropFitMax(obj, targetMax)` | Uniform scale from bbox, center XZ, `min.y → 0`. Mutates the object's own TRS. Different callers use different target values for the *same* URL (e.g. `axe.glb`: `0.55` held vs `0.85` on the ground). |
| Hand socket | `src/items/heldToolVisual.ts` | `RIGHT_HAND_BONE_NAMES` alias list + `traverse` (no `getObjectByName` anywhere in the repo). `HELD_ATTACH: Record<ToolKind, HeldAttach>` = hand-tuned position/rotation/scale + optional `gripLocalOffset`, mounted by `mountHeldToolOnSocket` which **divides by the socket's world scale** (Quaternius armature ≈ 100) so the numbers read as meters. |
| Torch light | `src/player/PlayerTorch.ts` | `BRANCH_ATTACH` / `WOODEN_FIRE_ATTACH` duplicate `HELD_ATTACH.wooden_torch` values; `LIGHT_BRANCH` / `LIGHT_WOODEN` (`color`, `intensity`, `distance`, decay `2`) and `pointLight.position.set(0, 0, 0.36)` are module-private. |
| Building mount | `src/settlement/props.ts` | `resolveHouseLampMount` = catalog `lampMount` → `floorCenter` → `findWallMount` raycast → `provisionalWallMount` bbox, all in the hut's **post-`prepareProp` local frame**, before `placeOnGround`. `hut.userData.lampMount` + `lampMountSource` carry it. `createHouseLight` derives the fixture yaw from `atan2(mountX, mountZ)` — position only, **no authored orientation**. |
| Lamp calibration loop today | `props.ts` + `gameLoop.ts` under `isDebugMode()` | `[house:lamp]` / `[house:gaze]` print a ready-to-paste `lampMount: { x, y, z }` line for `HOUSE_CATALOG`. Plan 074's proven workflow. |
| Doors / building parts | — | Not attached at runtime. Doors are baked into `hut_*.glb`; `doorHeightFraction` only scales the whole model. |
| Interaction points | `src/simulation/interactionQueue.ts` | World-space offsets from a landmark vector (`anchor`, `lineDir`, `servingOffset`), not mesh-relative. |
| Character pose at spawn | `PlayerController` / `NpcAgent` | `AnimationMixer` + `idleAction.play()` immediately — the game never shows the bind pose. |
| Renderer / lighting / post | `src/render/createRenderer.ts`, `src/world/createLights.ts`, `createSky.ts`, `dayNight.ts`, `src/render/createPostProcessing.ts` | All reusable factories. `skyParamsFromTime(timeOfDay)` is pure and returns sun/ambient/hemi intensities + fog. `applyDayNight` is private to `gameLoop.ts`. |
| Dev entry points | `vite.config.ts`, `index.html` | Single page, no `build.rollupOptions.input`, no routes. Debug switches are URL flags (`?debug`, `?gui=0`) + lil-gui. |
| Tests | `vite.config.ts` `test.include` | Vitest, **default node environment**, 43 pure-logic `*.test.ts` files. No jsdom, no WebGL tests. |

Two consequences worth stating up front:

- **`docs/GRAPHICS.md` drift:** it lists `src/render/filmGradeShader.ts`, which no longer exists — the grade
  lives in `createGradedOutputPass()` (`src/render/gradedOutputPass.ts`). Fix that line while touching the
  render docs (§13).
- **`createFauna.ts` calls `prepareProp(asset.root, …)` on the shared cache root.** The viewer must only
  normalize its **own clone** (`loadGltf(url)` returns a clone; `loadGltfAsset().root` is shared). Documented
  as an implementation constraint in §5.2.

---

## 2. Product decisions (resolves review §10 and PRD §18)

### D1. Anchor is a transform frame, orientation required by type (C1, I2, I3)

An anchor is a named frame: position + optional orientation + optional semantic type.

```ts
export type AnchorType = 'origin' | 'attachment' | 'grip' | 'mount' | 'interaction'
```

Orientation is **required** for `grip`, `mount` and `attachment` (they drive how something is rotated onto
something else) and **optional** for `origin` and `interaction` (a standing spot needs a position; a facing
direction is a bonus). A required-but-missing orientation is a reported validation issue, not a silent
identity rotation.

**Axis convention (Seedvale anchor frame):** local **+Z = primary/forward axis**, **+Y = up/secondary axis**.

| Type | +Z means | +Y means |
|---|---|---|
| `grip` (on a tool) | toward the working end (blade, head, flame tip) | back of the hand / "up" when held |
| `attachment` (hand socket on a character) | out of the palm, away from the body | toward the fingertips |
| `mount` (on a building) | outward surface normal | world up |
| `interaction` | facing direction of the agent using it | world up |
| `origin` | asset forward, when the asset has one | world up |

The convention is documented once, in a new `docs/assets/ANCHORS.md` (§13), and referenced from the anchor
module. Bone-derived anchors (Quaternius `WristR`) do **not** natively match this convention — that is exactly
what an anchor's optional `rotation` correction is for (D3).

### D2. Anchors live in GLB nodes *and* in metadata; GLB preferred, metadata authoritative (PRD Q3/Q4)

- **GLB nodes (preferred):** an empty/node named `SV_<anchor-name>` (e.g. `SV_grip`, `SV_lamp_mount`,
  `SV_hand.right`). Discovered by traversal — the same `traverse` + name-match technique already used for
  `RIGHT_HAND_BONE_NAMES`.
- **Metadata (`src/assets/assetAnchorData.ts`):** a per-asset table for assets we cannot re-export (third-party
  GLBs), for bone-based anchors, and for orientation corrections. Metadata **overrides** a GLB anchor of the
  same name and the override is reported (`override-shadowed`), so a re-export never silently changes runtime
  behaviour.

Why GLB is preferred: `prepareProp` / `preparePropFitMax` rescale and re-center the root, so a GLB node's
resolved position stays correct *automatically* (we read live matrices), while a hand-written `assetLocal`
number is only valid for the specific normalization value it was authored against. That failure mode gets an
explicit validation issue (`prepare-mismatch`, D4).

### D3. Two anchor spaces, and they answer "root vs resolved" (C3, PRD Q5)

```ts
export type AnchorSpace = 'assetLocal' | 'node'
```

- `assetLocal` — meters in the asset root's local frame **after** the game's normalization. This is exactly the
  space `houseCatalog.lampMount` already uses, so existing values port over unchanged.
- `node` — attached to a named node/bone; the offset is expressed in **meters along that node's axes** and the
  resolver divides by the node's world scale. This is exactly what `mountHeldToolOnSocket` already does for the
  ~100× Quaternius armature, so existing `HELD_ATTACH` numbers port over unchanged.

Resolution always produces **both**:

| Field | Meaning |
|---|---|
| `localMatrix` | anchor frame relative to the **asset root** — comparable across instances, independent of where the asset sits |
| `worldMatrix` | anchor frame in **world space** — after nested GLTF nodes, bones, pose and the instance's own root transform |

The report prints the asset **root transform** and the **resolved** anchor transform as separate blocks, which
is the distinction C3 asked for.

### D4. Missing/invalid anchor states are first-class output (C4, I4, I5)

Anchor names must match `/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/`, be unique per asset, and never derive from a
runtime id. Reported issue kinds:

| Kind | Trigger |
|---|---|
| `invalid-name` | fails the pattern |
| `duplicate-name` | two defs (or two `SV_` nodes) resolve to the same name |
| `missing-node` | `node` set, no matching node in the loaded asset |
| `ambiguous-node` | more than one node matches (after Blender `.001` suffix normalization) |
| `missing-orientation` | type requires orientation, none authored and the node frame is identity |
| `non-uniform-node-scale` | node world scale is non-uniform → meter-offset compensation is approximate |
| `prepare-mismatch` | an `assetLocal` anchor was authored for a different `prepare` value than the one in use |
| `override-shadowed` | metadata anchor hides a GLB anchor of the same name (informational) |
| `selection-invalid` | a previously selected anchor no longer exists (typically after reload) |

`selection-invalid` is what I5 requires: after a reload the tool shows the invalid selection and a
`status: ANCHOR_MISSING_AFTER_RELOAD` in the report instead of silently reselecting something else.

### D5. Skinned assets: rest pose is the default, Idle@t=0 is available (C2)

- Default preview pose is the **bind/rest pose** (no `AnimationMixer`) — deterministic, reproducible between
  sessions and machines.
- Optional pose `clip:<name>@t=0` (default clip `Idle`, matching what the game actually shows the moment a
  character spawns). Implemented with an `AnimationMixer` + `mixer.setTime(0)`; no timeline scrubbing, no
  blending, no animation editing (review §5 "Defer").
- Bone-attached anchors resolve from live bone world matrices, so switching pose updates every resolved anchor
  and every delta.
- The active pose is printed in the report (`pose:`), because a bone anchor's resolved transform is meaningless
  without it.

### D6. Automatic Align: defined result, two modes (C5)

`Align Target.anchor → Reference.anchor` sets the **target root transform** so that:

- **position mode** — the two anchor world positions coincide; the target's current rotation and scale are
  untouched;
- **frame mode** (only offered when both anchors have orientation) — the two anchor world *frames* coincide
  (positions and axes); the target's scale is untouched.

Scale is never modified by Align. The solve is a pure function (§6.3), so it is unit-tested rather than
eyeballed.

### D7. Diagnostic vs Game-like rendering are two modes, not two presets (review §8, M2)

- **Diagnostic** — plain `WebGLRenderer` output (no composer), neutral/high-contrast background, grid, world
  axes, bounding boxes, anchor gizmos with local axes, labels. Controlled lighting.
- **Game-like** — the game's own `createRenderer` settings (ACES, exposure 0.88, PCFSoft shadows), the game's
  `createLights` + `createSky` + `skyParamsFromTime(timeOfDay)`, the game's materials as `loadGltf` already
  prepared them, and optionally the game's `createPostProcessing` composer.

**Lighting presets** (`Alignment`, `Daylight`, `Night`, `Torch`) select *lights*; **environment controls**
(background, ground, wireframe, alpha inspection) are separate — that is M2's separation. `Transparent` from
the PRD becomes an *environment/inspection* control usable under any lighting preset, not a lighting preset.

**Documented constraint (replaces PRD "where practical", M3):** the post-processing composer renders a single
full-canvas image, so **Game-like with post-processing is available in single-view only**. The 4-up layout runs
Game-like lights/sky/materials with the composer off. The active combination is printed in the report.

### D8. Torch preview uses the game's actual attached-light behaviour (review §8)

The torch preset does not invent a point light. It attaches a `PointLight` with the **same constants the game
uses**, at the **same local offset**, on the reference asset's `hand.right` anchor. To avoid a copied
magic-number table, those constants move into a tiny shared module (`src/player/torchLightPresets.ts`) that
`PlayerTorch.ts` imports — one source of truth, no behaviour change (§7.3).

### D9. Runtime reuse in MVP is real but narrow (review §6 "Runtime reuse is a requirement")

MVP wires the shared anchor seam into runtime in two additive, behaviour-preserving places:

1. `findRightHandSocket` (`heldToolVisual.ts`) delegates to the shared node-alias resolution and the character
   `hand.right` anchor def becomes the single declaration of that alias list.
2. `resolveHouseLampMount` (`props.ts`) gains an **anchor-first** branch: a `lamp_mount` anchor (GLB or
   metadata) wins over `catalog` → `floorCenter` → `raycast` → `bboxProvisional`; when the anchor carries
   orientation, `createHouseLight` uses the anchor's +Z as the outward normal instead of deriving yaw from
   `atan2(mountX, mountZ)`.

Because no shipped asset has anchors on day one, both are no-ops until anchors are authored — which is the
point: the migration path exists and is provably wired, without a risky mass rewrite of hand-tuned numbers.

**Deferred to Phase 6:** replacing `HELD_ATTACH`'s per-tool numbers with tool `grip` anchors, authoring
`lamp_mount` anchors per house model, `interaction` anchors for `InteractionQueue`, NPC held items. The MVP tool
must **export paste-ready snippets** for `HELD_ATTACH` and `HOUSE_CATALOG.lampMount` so that migration reuses
plan 074's proven `[house:lamp]` workflow instead of inventing a new one.

### D10. Measurable success (review §9 point 17)

MVP is accepted when, for each of the PRD §14 use cases, a developer can produce — without launching the game —
a copyable report that states the anchor pair, both resolved world transforms, position/rotation deltas with
fixed precision, an `ALIGNED`/`MISALIGNED` status against explicit thresholds (≤ 1 mm, ≤ 0.5°), a ground-contact
verdict, and a snapshot image describing the same scene state.

---

## 3. Where the viewer lives (PRD Q1)

A **dev-server-only second Vite page**:

```text
asset-browser.html                    (repo root, entry: /src/tools/assetBrowser/main.ts)
src/tools/assetBrowser/               (tool source — under src/, so tsc + eslint cover it)
```

- Dev URL: `http://localhost:5577/asset-browser.html` (Vite serves root-level HTML without config changes).
- **Not** added to `build.rollupOptions.input`, so `vite build` keeps producing exactly today's game bundle.
  `vue-tsc --noEmit` and `eslint .` still cover the tool because `tsconfig.json` includes `src`.
- Rejected alternatives, for the record: a route/flag inside `createApp` (drags the whole game boot and
  `WorldBundle` lifecycle into a static viewer) and a separate package/workspace (duplicate dep graph for zero
  benefit).
- UI stack: Vue 3 + Tailwind v4 via `import '../../ui-vue/tailwind.css'` (design tokens reused). The tool gets
  its **own** small reactive state module — it must not import the game's `src/ui-vue/store.ts`, which models
  HUD/pause/quest state.

---

## 4. Shared asset-domain modules (new, in `src/assets/`)

These are the "smallest shared abstraction" the PRD §12 asks for. They are framework-free and, except for
`anchorResolve.ts`, Three.js-free where possible.

### 4.1 `src/assets/assetAnchors.ts` — types + pure validation

```ts
export type AnchorType = 'origin' | 'attachment' | 'grip' | 'mount' | 'interaction'
export type AnchorSpace = 'assetLocal' | 'node'

export type AssetAnchorDef = {
  /** Stable, unique per asset. Never a generated runtime id. */
  name: string
  type?: AnchorType
  /** Node/bone name, or an alias list (e.g. Quaternius + Mixamo wrist names). */
  node?: string | readonly string[]
  /** Defaults to 'node' when `node` is set, else 'assetLocal'. */
  space?: AnchorSpace
  /** Meters in `space`. Default [0, 0, 0]. */
  position?: readonly [number, number, number]
  /** Euler XYZ radians in `space`. Absent = inherit the node frame / identity. */
  rotation?: readonly [number, number, number]
  /** For `assetLocal` defs: the normalization the numbers were authored against. */
  authoredFor?: AssetPrepare
  note?: string
}

export const ANCHOR_ORIENTATION_REQUIRED: readonly AnchorType[] = ['attachment', 'grip', 'mount']

export function isValidAnchorName(name: string): boolean
export function normalizeGlbAnchorName(nodeName: string): string | null   // 'SV_Grip.001' -> 'grip'
export function mergeAnchorDefs(
  discovered: readonly AssetAnchorDef[],
  metadata: readonly AssetAnchorDef[],
): { defs: AssetAnchorDef[], issues: AnchorIssue[] }
export function validateAnchorDefs(
  defs: readonly AssetAnchorDef[],
  prepare: AssetPrepare,
): AnchorIssue[]
```

`normalizeGlbAnchorName` rules (documented in `docs/assets/ANCHORS.md`): require the `SV_` prefix
(case-insensitive), strip a Blender `.NNN` duplicate suffix, lowercase the remainder, reject anything that
fails `isValidAnchorName`. Duplicate-after-normalization is a `duplicate-name` issue, not a silent last-wins.

### 4.2 `src/assets/anchorResolve.ts` — Three.js resolution

```ts
export type ResolvedAnchor = {
  def: AssetAnchorDef
  /** Asset root, or the matched node/bone. */
  parent: Object3D
  /** Anchor frame relative to the asset root (normalization included). */
  localMatrix: Matrix4
  /** Anchor frame in world space (nested nodes, bones, pose, instance TRS). */
  worldMatrix: Matrix4
  hasOrientation: boolean
}

export function findAnchorNode(root: Object3D, names: string | readonly string[]): {
  node: Object3D | null
  matches: number
}
export function discoverGlbAnchors(root: Object3D): { defs: AssetAnchorDef[], issues: AnchorIssue[] }
export function resolveAssetAnchors(
  root: Object3D,
  defs: readonly AssetAnchorDef[],
): { anchors: ResolvedAnchor[], issues: AnchorIssue[] }
export function refreshResolvedAnchors(root: Object3D, anchors: ResolvedAnchor[]): void
```

`findAnchorNode` preserves today's semantics from `findRightHandSocket`: prefer a `Bone` instance, fall back to
any `Object3D`, and now also report the match count so `ambiguous-node` can be raised.

`space: 'node'` resolution reproduces `mountHeldToolOnSocket`'s scale compensation exactly (divide the meter
offset by the node's world scale per axis, guard against zero), so an anchor built from an existing
`HELD_ATTACH` entry lands in the same place as today. Non-uniform node scale raises
`non-uniform-node-scale`.

`refreshResolvedAnchors` is called after any pose or root-transform change (cheap: `updateWorldMatrix` +
recompute matrices; no reallocation) — the viewer runs it on demand, never per frame speculatively.

### 4.3 `src/assets/alignAnchors.ts` — the Align solve (pure)

```ts
export type AnchorAlignMode = 'position' | 'frame'

export function solveAnchorAlignment(input: {
  referenceAnchorWorld: Matrix4
  targetAnchorLocal: Matrix4          // relative to the target root
  targetRoot: { position: Vector3, quaternion: Quaternion, scale: Vector3 }
  mode: AnchorAlignMode
}): { position: Vector3, quaternion: Quaternion }
```

Math (scale-preserving, no matrix decomposition of the root):

- `frame` mode: `q_root = q_ref * q_anchorLocal⁻¹`, then
  `p_root = p_ref − q_root · (S_root ⊙ p_anchorLocal)`.
- `position` mode: keep `q_root`, apply the same `p_root` formula.

### 4.4 `src/assets/alignmentReport.ts` — the AI diagnostic contract (pure)

```ts
export const ALIGNMENT_REPORT_VERSION = 1
export const ALIGNED_POSITION_EPSILON_M = 0.001
export const ALIGNED_ROTATION_EPSILON_DEG = 0.5
export const GROUND_CONTACT_EPSILON_M = 0.005

export type AlignmentReport = { /* plain data, no Three.js types */ }

export function buildAlignmentReport(input: AlignmentReportInput): AlignmentReport
export function formatAlignmentReport(report: AlignmentReport): string
export function alignmentReportToJson(report: AlignmentReport): string
```

Both `build*` and `format*` are pure functions over plain numbers, so the contract is snapshot-testable
(review §7 "deterministic"). Input is extracted from the scene by the viewer; the formatter never touches
Three.js. No timestamp in the body (determinism); the date goes in the snapshot filename.

### 4.5 `src/assets/assetIndex.ts` — aggregate the registries that already exist

The tool must not become a fourth asset registry. `buildAssetIndex()` aggregates the existing ones and — this
is the important part — carries the **normalization the game applies**, so the preview is dimensionally
identical to gameplay:

```ts
export type AssetPrepare =
  | { mode: 'height', value: number }     // prepareProp
  | { mode: 'fitMax', value: number }     // preparePropFitMax
  | { mode: 'none' }

export type AssetIndexEntry = {
  id: string          // 'house:hut_d' | 'held:axe' | 'item:axe' | 'character:player' | 'fauna:wolf' | ...
  url: string
  label: string
  group: 'character' | 'npc' | 'fauna' | 'item' | 'held' | 'house' | 'settlement' | 'nature' | 'fx' | 'other'
  prepare: AssetPrepare
  skinned: boolean
  /** Metadata anchors for this id (from assetAnchorData.ts). */
  anchors: readonly AssetAnchorDef[]
}
```

Sources (import the existing constant — **never copy its value**):

| Source | Module | Note |
|---|---|---|
| `HOUSE_CATALOG` + `resolveHouseHeight` | `settlement/houseCatalog.ts` | already exported |
| `ITEM_GLB_SPECS` | `items/itemModels.ts` | ground pose sizing |
| `HELD_GLB` | `items/heldToolVisual.ts` | **needs export** — same URL, different `maxSize` than ground |
| `PLAYER_MODEL_URL`, `NPC_MODEL_URLS` | `player/PlayerController.ts`, `ai/NpcAgent.ts` | with `PLAYER_HEIGHT` / `NPC_HEIGHT` |
| `FAUNA_URLS` + `ANIMAL_DEFS[kind].modelHeight` | `fauna/createFauna.ts` | verify the exact export names while implementing |
| `TREE_SPECS`, `BUSH_SPECS`, `ROCK_SPECS`, `ROCK_CLUSTER_SPECS`, `FALLEN_LOG_SPECS`, `RESOURCE_*_SPECS`, `DOCK_SPECS` | `settlement/props.ts` | already exported |
| `LANTERN_URL`, `VILLAGE_TORCH_URL`, `FIRE_FX_URL`, `WALL_URL`, `VILLAGE_TORCH_HEIGHT`, `LANTERN_WALL_MAX`, `LANTERN_FLOOR_MAX` | `settlement/props.ts` | **need export** |
| `BRANCH_URL`, `BRANCH_HELD_MAX` | `player/PlayerTorch.ts` | **need export** |

Same URL under two ids with two `prepare` values (`item:axe` vs `held:axe`) is intended: it makes
"the axe is the right size on the ground but wrong in the hand" directly visible.

Plus a **free-form URL field** so any file under `/models/**` can be inspected without being in a registry
(covers the parked MegaKit/mountain sets). A dev-only directory-listing plugin is a Phase 6 nicety, not MVP.

**Implementation risk:** `props.ts` is a large module. If importing it into the tool entry drags an unwanted
graph, move the `*_SPECS` / URL constants into a leaf `src/settlement/propSpecs.ts` imported by both — relocate
or export, never duplicate.

### 4.6 `src/assets/assetAnchorData.ts` — the metadata table

```ts
export const CHARACTER_ANCHORS: readonly AssetAnchorDef[] = [
  {
    name: 'hand.right',
    type: 'attachment',
    node: RIGHT_HAND_BONE_NAMES,
    // Bone frame is not the Seedvale anchor convention (+Y ≈ fingertips,
    // −Z ≈ body centre); rotation brings it into +Z-forward / +Y-up.
    rotation: [/* authored with the browser in Phase 3 */],
  },
]

export const ASSET_ANCHORS: Record<string, readonly AssetAnchorDef[]> = { /* by AssetIndexEntry.id */ }
export function anchorsForAsset(id: string): readonly AssetAnchorDef[]
```

`RIGHT_HAND_BONE_NAMES` stays exported from `heldToolVisual.ts` (it is item-domain knowledge about the
character rig) and is *referenced* here, not duplicated.

---

## 5. Viewer implementation (`src/tools/assetBrowser/`)

### 5.1 Module layout

```text
asset-browser.html
src/tools/assetBrowser/
  main.ts                     mounts the Vue app, creates the viewer, wires state → viewer
  state.ts                    reactive tool state (own store; not src/ui-vue/store.ts)
  viewer/
    createViewer.ts           renderer + scene + layout + render-on-demand orchestration
    createViewerScene.ts      ground plane, grid, world axes, unit markers, background
    createMultiView.ts        4 viewports on one renderer + per-view cameras/controls
    createAssetSlot.ts        load / normalize / anchors / bbox / dispose for one slot
    createAnchorGizmos.ts     anchor markers, local axes, labels, reference↔target line
    createPreviewLighting.ts  lighting presets + Diagnostic/Game-like modes
    createSnapshot.ts         canvas composite (image + diagnostic text panel)
    reportFromScene.ts        scene → AlignmentReportInput (the only Three.js-aware report code)
  ui/
    AssetBrowser.vue          layout shell
    AssetSlotPanel.vue        reference / target picker, prepare display, reload
    AnchorListPanel.vue       anchors + types + sources + issues, selection
    TransformPanel.vue        numeric position/rotation/scale, reset, copy, align
    DiagnosticsPanel.vue      report text, copy, snapshot
    RenderingPanel.vue        mode, lighting preset, environment/transparency controls
    ViewportGrid.vue          canvas host + per-view pointer-capture overlays
```

### 5.2 Asset slots (PRD §2, I1)

`createAssetSlot` owns one asset instance (reference or target):

1. `loadGltf(url)` → a **clone** (never normalize `loadGltfAsset().root`; `createFauna.ts` already mutates the
   shared root and the viewer must not fight it).
2. Apply the entry's `prepare` via the game's `prepareProp` / `preparePropFitMax`.
3. Parent the prepared object under a slot `Group` that owns the *user-editable* root transform, so
   normalization offsets and user edits never get confused (same separation `PlayerController` uses between its
   wrapper `mesh` and `modelRoot`).
4. `discoverGlbAnchors` + `anchorsForAsset(id)` → `mergeAnchorDefs` → `validateAnchorDefs` →
   `resolveAssetAnchors`.
5. Compute `Box3` bounds, size, center, `min.y`, and the origin↔anchor distances (I6).
6. `disposeObject3D` on unload (respects `sharedGpu`).

**Asset-only inspection (I1)** falls out of this: the target slot may be empty; anchor listing, bounds, origin,
ground contact and per-anchor transforms all work on a single slot, and the report switches to `mode: single`.

### 5.3 Multi-view (PRD §6, M1)

One `WebGLRenderer`, four cameras, `setViewport` + `setScissor` per view, drawn from the **same scene** — so
"synchronized views" is structural, not a sync mechanism (M1).

- Front (`-Z`), Side (`+X`), Top (`+Y`) are `OrthographicCamera`; Perspective matches the game's
  `createCamera` FOV (60°) so proportions read like gameplay.
- Layouts: `quad` (2×2) and `single` (one maximized view).
- Controls: `OrbitControls` per view, each bound to a **transparent overlay div** sized to its viewport, so
  pointer events route to the right camera without four GL contexts. Ortho views disable rotation
  (`enableRotate = false`) and keep pan + zoom. `Reset view` restores framing from the current bounds.
- **Render on demand**: a dirty flag set by control changes, state changes and reloads; a continuous rAF loop
  runs only while an animated preset is active (torch flicker) — G2 discipline even in a dev tool.
- CSS2D anchor labels are attached to a `CSS2DRenderer` positioned over the **active** view only (a single
  CSS2D pass cannot serve four cameras). Every anchor name is always visible in the side panel and in the
  report, so no information depends on a label being rendered — stated as a documented constraint (M3).

### 5.4 Anchor gizmos (I2)

Per anchor: a small marker (size derived from bounds so it stays readable at any asset scale), optional local
X/Y/Z axes (`AxesHelper`-style, color-coded), and a CSS2D label with the anchor name and type. Reference vs
target are distinguished by marker color and label prefix (PRD §4). When both anchors are selected, a line
connects the two resolved world positions and the panel shows position delta, rotation delta, and status.
Anchors with issues render in a warning color and the issue text appears in the panel and the report.

### 5.5 Transform workflow (PRD §5)

Numeric position (m, 3 dp), rotation (degrees, 1 dp), uniform + per-axis scale on the **target slot root**;
`Reset` returns to the entry's normalized identity; `Copy` yields both a human-readable block and a
paste-ready snippet. Snippet targets, matching the code that would consume the values:

- `HELD_ATTACH`-shaped entry (`position` / `rotation` / `scale` / `gripLocalOffset`) for `heldToolVisual.ts`;
- `lampMount: { x, y, z }` for `HOUSE_CATALOG` — byte-compatible with plan 074's `[house:lamp]` output;
- an `AssetAnchorDef` literal for `assetAnchorData.ts`.

`Align` runs `solveAnchorAlignment` (D6) in the mode allowed by the selected anchors' orientation, and is
undoable by `Reset`.

### 5.6 Reload (PRD §13, I5)

1. Add `invalidateGltf(url)` to `src/assets/loadGltf.ts`: drop the cache entry and force-free that root's GPU
   resources (a variant of `disposeObject3D` that ignores `sharedGpu`, since the entry is being retired).
   Documented as **dev-tool only** — game code never calls it.
2. Refetch as `${url}?r=${n}` with a per-slot counter to defeat the HTTP cache; the report always prints the
   clean URL.
3. Preserve selected assets, selected anchor names, camera, layout, rendering mode/preset, and the target
   transform (default keep; explicit "reset transform on reload" toggle).
4. Re-run discovery/validation. Anchor names that disappeared become `selection-invalid` with a visible banner
   and `status: ANCHOR_MISSING_AFTER_RELOAD` — never a silent reselect (I5).

Phase 6 nicety: a dev-only Vite plugin watching `public/models/**` that pushes a custom HMR event to
auto-trigger step 1–4.

---

## 6. Rendering and lighting (PRD §7–§9, review §8)

### 6.1 Diagnostic mode

Plain `renderer.render` per viewport, no composer. Neutral background presets (dark / mid / light / checker),
ground plane on/off, grid, world axes, unit markers at 1 m, bounding boxes, anchor gizmos. Lighting is a fixed,
documented "Alignment" rig (hemisphere + soft directional, no shadows) so geometry reads clearly and the same
asset looks the same on every machine.

### 6.2 Game-like mode

Reuses, without copies:

- `createRenderer(container, cap, { preserveDrawingBuffer: true })` — see §7.1;
- `createLights()` and `createSky()` from `src/world/`;
- `skyParamsFromTime(timeOfDay)` (pure) driving sun/ambient/hemi intensity, fog color/near/far, plus a
  `timeOfDay` slider — this is how `Daylight` and `Night` presets are defined, rather than invented values;
- materials exactly as `loadGltf` prepared them (foliage already hardened to `alphaTest` per G3);
- `createPostProcessing(...)` in **single-view only** (D7), with the same `WorldConfig['postProcessing']`
  defaults the game uses.

The report records mode, preset, `timeOfDay`, and whether the composer was active.

### 6.3 Torch preset (D8)

Extract from `PlayerTorch.ts` into `src/player/torchLightPresets.ts`:

```ts
export const TORCH_LIGHT_BRANCH = { color: 0xff8a3c, intensity: 2.35, distance: 8 }
export const TORCH_LIGHT_WOODEN = { color: 0xff9a4a, intensity: 2.8, distance: 11 }
export const TORCH_LIGHT_DECAY = 2
/** Local offset from the torch mount toward the flame tip. */
export const TORCH_LIGHT_LOCAL_OFFSET = [0, 0, 0.36] as const
```

`PlayerTorch.ts` imports them (pure move, no behaviour change). The viewer attaches the light to the reference
asset's `hand.right` anchor with the same offset, exposes a fuel-ratio slider (the game scales intensity by
`fuelRemaining / fuelMax`), and enables shadows so reach is diagnosable. Panel readout: color, intensity,
distance, decay, resolved world position of the light, and the distance from the light to the target anchor.

### 6.4 Transparency / material inspection (PRD §8, M2)

An inspection panel, not a material editor: per material, list `name`, `transparent`, `opacity`, `alphaTest`,
`depthWrite`, `side`, `renderOrder`, and flag combinations that violate the standing graphics contracts
(G3: foliage-like material still `transparent: true`; G4: `transparent` + `depthWrite: true` + raised
`renderOrder`). Background/ground presets provide the contrast the PRD asks for, and the same asset can be
checked under Diagnostic *and* Game-like backgrounds.

Optional, low-risk: have `hardenFoliageAlpha` mark the materials it changes (`mat.userData.foliageHardened =
true`) so the panel can say "hardened at load" rather than leaving the developer to guess why a BLEND asset
renders as a cutout.

### 6.5 Ground contact (I7, I8)

Report `bounds.min.y` against the ground plane at `y = 0` with a 5 mm tolerance:
`contact: ok | floating (+0.043) | sunken (−0.012)`. Since `prepareProp` guarantees `min.y = 0` for a freshly
normalized asset, a non-zero value means a user transform or a prepare mismatch — which is precisely the
diagnostic. The panel and report state explicitly that the ground is a flat plane and that MVP is **not** a
terrain placement simulator (I8); slope/terrain placement stays out of scope.

---

## 7. Changes to existing game modules

Every change below is additive and behaviour-preserving. Nothing in this plan changes how the game looks today.

### 7.1 `src/render/createRenderer.ts`

Add an optional options argument:

```ts
export function createRenderer(
  container: HTMLElement,
  pixelRatioCap = 2,
  options: { preserveDrawingBuffer?: boolean } = {},
): THREE.WebGLRenderer
```

Reason: the viewer needs `preserveDrawingBuffer` for reliable snapshot capture, and it must not fork the
renderer configuration (tone mapping, exposure 0.88, shadow type) to get it. Game call site unchanged.

### 7.2 `src/assets/loadGltf.ts`

Add `invalidateGltf(url: string): void` (§5.6). No change to `loadCached`, `prepareProp`,
`preparePropFitMax`, or `disposeObject3D` semantics.

### 7.3 `src/player/PlayerTorch.ts`

Import the extracted constants from `src/player/torchLightPresets.ts`; delete the local `LIGHT_BRANCH` /
`LIGHT_WOODEN` literals and the inline `0.36`. Pure move.

While here, note in a comment (do not change) that `BRANCH_ATTACH` / `WOODEN_FIRE_ATTACH` duplicate
`HELD_ATTACH.wooden_torch` — Phase 6 migration candidate, flagged by the review.

### 7.4 `src/items/heldToolVisual.ts`

- Export `HELD_GLB` (the asset index needs held-pose `maxSize`).
- Reimplement `findRightHandSocket` as a thin wrapper over `findAnchorNode(root, RIGHT_HAND_BONE_NAMES)`
  (same "prefer `Bone`" semantics; the `console.warn` in `PlayerController` still fires on `null`).
- Keep `HELD_ATTACH` and `mountHeldToolOnSocket` exactly as they are in MVP. Add a
  `mountByAnchorPair(...)`-style helper only in Phase 6, when real `grip` anchors exist.

### 7.5 `src/settlement/props.ts`

- Export the URL/size constants the asset index needs (`LANTERN_URL`, `VILLAGE_TORCH_URL`, `FIRE_FX_URL`,
  `WALL_URL`, `VILLAGE_TORCH_HEIGHT`, `LANTERN_WALL_MAX`, `LANTERN_FLOOR_MAX`), or relocate the `*_SPECS`
  block to `src/settlement/propSpecs.ts` if the import graph demands it (§4.5).
- `resolveHouseLampMount`: add the anchor-first branch (`source: 'anchor'`) ahead of the existing chain, and
  extend `ResolvedHouseLampMount` with an optional `yaw` when the anchor carries orientation.
- `createHouseLight`: accept an optional explicit `yaw`; keep `atan2(mountX, mountZ)` as the fallback.
- Extend the `[house:lamp]` debug payload with `anchor` provenance so the existing calibration loop reports
  whether an anchor was used.

### 7.6 `src/world/foliageWind.ts`

Optional: set `mat.userData.foliageHardened = true` inside `hardenFoliageAlpha` (§6.4). Existing
`foliageWind.test.ts` covers this function — extend it rather than adding a parallel test.

### 7.7 Not touched

- `src/app/createApp.ts`, `gameLoop.ts`, `worldBundle.ts` — the viewer never boots the game; no `WorldBundle`
  lifecycle involvement, no save/persistence.
- `src/ui-vue/store.ts` and every game screen.
- `vite.config.ts` — no change needed for a dev-server-only page (confirm during implementation; add nothing
  speculatively).
- `HELD_ATTACH` / `HOUSE_CATALOG.lampMount` **values**, `ITEM_GLB_SPECS`, terrain, NPC/fauna simulation,
  persistence, save schema.

---

## 8. Implementation order and dependencies

MVP = Phases 0–5. Each phase ends green on `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`.

| Phase | Content | Depends on |
|---|---|---|
| **0 — Anchor seam** | `assetAnchors.ts`, `anchorResolve.ts`, `alignAnchors.ts`, `alignmentReport.ts`, `assetIndex.ts`, `assetAnchorData.ts` + unit tests. Export/relocate the constants in §7.4/§7.5. No UI. | — |
| **1 — Viewer shell** | `asset-browser.html`, Vue shell, `createViewer`/`createViewerScene`/`createMultiView`/`createAssetSlot`, asset picker (registry + free URL), single & pair slots, 4 views, grid/axes/ground/bbox, bounds + origin + ground-contact panel. | 0 (asset index) |
| **2 — Anchor inspection** | Discovery + listing + issues UI, gizmos with local axes and labels, reference/target selection, connection line, live position/rotation deltas. | 0, 1 |
| **3 — Transform workflow** | Numeric transform editing, reset, copy/paste snippets, `Align` (both modes), reload with cache invalidation + invalid-selection reporting, pose toggle (rest / `Idle@t=0`). | 2 |
| **4 — Rendering preview** | Diagnostic vs Game-like modes, `Alignment`/`Daylight`/`Night`/`Torch` presets (reusing `createLights`/`createSky`/`skyParamsFromTime`/torch constants), shadows, environment + transparency inspection, composer in single-view. | 1 (2/3 not required) |
| **5 — AI workflow** | `formatAlignmentReport` / JSON wiring, copy to clipboard, snapshot composite (image + text panel) with download + clipboard, "available anchors" listing in the report. | 2, 4 (report must be able to state the render state) |
| **6 — Post-MVP** | `HELD_ATTACH` → tool `grip` anchor migration (per tool, browser-verified one at a time); `SV_lamp_mount` anchors per house model; `interaction` anchors feeding `InteractionQueue`; NPC held items reusing the same pairing; Vite `public/models` watcher for auto-reload; dev-only asset directory listing. | MVP + browser verification |

Phase 6 is deliberately outside MVP: each migrated number is a visual regression risk and must be verified in
the browser individually.

---

## 9. Tests

Vitest runs in the **node** environment. Three.js core objects (`Object3D`, `Bone`, `Matrix4`, `Quaternion`)
import fine there — no WebGL context is needed to test anchor resolution. Confirm this in Phase 0 before
building out the suite; if it fails, keep `anchorResolve` tests on plain matrix math and cover graph traversal
manually.

New test files:

| File | Covers |
|---|---|
| `src/assets/assetAnchors.test.ts` | name validation; `SV_` normalization incl. case + Blender `.001`; duplicate detection; orientation-required-by-type; metadata-over-GLB merge + `override-shadowed`; `prepare-mismatch`; synthetic `origin` anchor always present |
| `src/assets/anchorResolve.test.ts` | alias-list node lookup with `Bone` preference; `missing-node`; `ambiguous-node`; `space: 'node'` meter-offset compensation under a 100× parent scale (matches `mountHeldToolOnSocket`); `space: 'assetLocal'`; local vs world matrix distinction when the instance is moved/rotated/scaled; orientation inherited from a node's rotation; `non-uniform-node-scale` |
| `src/assets/alignAnchors.test.ts` | `frame` mode makes both frames coincide within epsilon for a rotated + scaled asset; `position` mode preserves rotation; scale never modified |
| `src/assets/alignmentReport.test.ts` | fixed-input snapshot of the formatted text (key order, 3 dp meters, 1 dp degrees, explicit `null`); `ALIGNED`/`MISALIGNED` thresholds; single-asset mode; warnings section; JSON key order |
| `src/assets/assetIndex.test.ts` | ids unique; every entry has a URL and a `prepare`; `held:axe` and `item:axe` differ in `prepare` (the registry-drift guard) |

Regression coverage for the runtime touch points:

- `src/settlement/props.ts` — a test asserting `resolveHouseLampMount`'s fallback order is unchanged when no
  anchor exists (synthetic `Object3D` hut; `catalog` and `floorCenter` branches at minimum). If `props.ts`
  proves untestable in the node env because of its import graph, that is itself a signal to relocate the
  lamp-mount resolution into a leaf module — decide during implementation, do not force it.
- `src/world/foliageWind.test.ts` — extend for the `foliageHardened` marker if §7.6 is implemented.
- All 43 existing test files must stay green; no existing test should need editing except the two above.

Not unit-tested (by design): viewport layout, gizmo rendering, snapshot pixels, Vue panels. Those are the
browser-verification items in §10.

---

## 10. Manual / browser verification

Technical checks do **not** verify this feature (G8, CLAUDE.md). After Phase 5, verify in a browser at
`http://localhost:5577/asset-browser.html` (dev server already running — do not launch headless Chrome).

Tool verification, following PRD §14:

1. **NPC + axe grip** — reference `character:player` (or `npc:Farmer`), target `held:axe`; select
   `hand.right` + the axe's authored `grip` (or its `origin` until Phase 6). Gizmos, local axes, delta and
   status appear; `Align` in `frame` mode puts the axe in the hand; the report matches what the viewport shows.
2. **Held torch + light** — target `held:wooden_torch`, preset `Torch`; light color/intensity/distance/decay
   match `torchLightPresets.ts`; reach and shadows are readable; the fuel slider dims it as in game.
3. **Building + wall lamp** — reference `house:hut_d`, target `settlement:lantern`; the anchor-first mount
   path is exercised by adding a temporary `lamp_mount` metadata anchor; confirm the fixture faces outward via
   the anchor's +Z, and that removing the anchor restores today's `catalog` mount unchanged.
4. **Building + attached part** — same house with a `settlement/wall.glb` or MegaKit door segment via the
   free-form URL field; verify origin/bounds/ground diagnostics expose the offset.
5. **Furniture + interaction point** — an `interaction` anchor on a well/market prop; verify a position-only
   anchor reports `ORIENTATION_UNKNOWN` rather than a fake rotation delta.
6. **Transparent asset** — `fx/fire.glb` or a foliage GLB; confirm the material panel shows the post-load
   hardened alpha state and that light/dark backgrounds expose alpha problems.
7. **Four views** — front/side/top/perspective show the same state; per-view orbit/pan/zoom/reset work;
   switching quad ↔ single changes nothing but framing.
8. **Reload** — edit a GLB on disk, hit reload: the new mesh appears, camera/preset/selection/transform are
   preserved; renaming an anchor produces the invalid-selection banner and `ANCHOR_MISSING_AFTER_RELOAD`.
9. **Snapshot + report** — the PNG shows the current view *and* the diagnostic text; the copied report is
   identical to the panel; two consecutive reports for an unchanged scene are byte-identical.

Game regression verification (the whole point of "no parallel system"):

10. `http://localhost:5577/` — held knife/axe/shovel/torch still sit in the hand exactly as before; lit
    branch and wooden torch light unchanged; house lamps mount where they did (spot-check `?debug=1`
    `[house:lamp]` output for several models, `source` still `catalog`/`raycast`/`floorCenter`); village torch
    posts unchanged.

---

## 11. Performance

Dev tooling, but the constraints from G2 still apply:

- **Render on demand.** No continuous rAF unless an animated preset is active. Quad layout = 4 draws per
  dirty frame, on two assets — trivial, but not free-running.
- **Anchor resolution is event-driven**, not per frame: on load, reload, pose change, transform change or
  selection change.
- **One GL context.** The overlay-div control routing (§5.3) exists specifically to avoid four renderers.
- **Loader cache is reused**, so switching back and forth between two assets does not re-download or
  re-upload GPU buffers; `invalidateGltf` is the only path that frees them, and only on explicit reload.
- The game bundle is untouched: the tool page is not in the production build input.

---

## 12. Out of scope / avoid overreach

Do **not** add in this plan:

- a Blender replacement, general 3D modelling, mesh/UV/material authoring, or an animation editor;
- a general scene composer or asset-management system;
- a second asset registry: the index aggregates existing catalogs, it does not restate them;
- a second loader, transform-normalization or attachment mechanism — reuse `loadGltf`, `prepareProp` /
  `preparePropFitMax`, `findAnchorNode`, and the existing lamp/hand mount paths;
- a large generic metadata framework: five anchor types, two spaces, one validation list (PRD §3);
- migration of `HELD_ATTACH` / `HOUSE_CATALOG.lampMount` values (Phase 6, per asset, browser-verified);
- terrain/slope placement preview, a full material editor, batch asset processing, automatic asset "repair"
  (review §5 "Defer");
- persistence: the tool's session state may use `localStorage` under its own key at most, and must never touch
  `src/persistence/` or the save schema;
- React/R3F or any other rendering abstraction (G1).

---

## 13. Documentation to update

During implementation:

- **New: `docs/assets/ANCHORS.md`** — the anchor convention as a reusable asset-domain document: naming rules,
  the `SV_` GLB convention, the axis convention table (D1), the two spaces (D3), the validation issue list
  (D4), how to author an anchor in Blender and export it, and a per-asset status table of which assets have
  authored anchors. Link it from `docs/assets/README.md`.
- **`docs/GRAPHICS.md`** — add a standing decision that the alignment browser's Game-like mode must reuse
  `createRenderer` / `createLights` / `createSky` / `skyParamsFromTime` rather than a parallel rig, and note
  the single-view-only composer constraint. Fix the stale `filmGradeShader.ts` row (now
  `gradedOutputPass.ts`).
- **`docs/plans/README.md`** — mark the 088 row `in progress` with a `[has implementation plan]` marker
  (auxiliary `-implementation-plan.md` files do not get their own index row, same as
  `-implementation-notes.md`).
- **`docs/STATE.md`** — after MVP: a short "Developer tooling" note (asset alignment browser page, shared
  anchor modules in `src/assets/`) plus the two runtime anchor consumers, and add anchors to "Important shared
  concepts".
- **`docs/items/CATALOG.md`** — note that held-tool alignment data is a Phase 6 anchor-migration candidate.
- **`docs/assets/MODELS.md`** — reviewed; **no new rows required**. The MVP needs no new models or sounds: it
  inspects assets already in `public/models/`, and anchors can be added via metadata without re-exporting a
  GLB. Re-exported GLBs that gain `SV_*` empties are asset *edits*, tracked in the `ANCHORS.md` per-asset
  table rather than in the "required models" backlog. `docs/assets/SOUNDS.md` — unchanged (no audio).

---

## 14. Acceptance criteria

MVP (Phases 0–5):

- The viewer opens at `http://localhost:5577/asset-browser.html` without booting the game, and
  `npm run build` output is unchanged in scope (no tool code in the game bundle).
- Two real Seedvale assets load independently from the aggregated registries, each with the **same
  normalization the game applies**; a single asset can be inspected with no target (I1).
- Front / Side / Top / Perspective render the same scene state; grid, world axes, unit markers, ground plane
  and bounding boxes are available.
- All anchors are listed with name, type, source (`glb` / `metadata`), node, local transform and resolved
  world transform; **root transform and resolved anchor transform are separate readouts** (C3).
- Anchors with orientation render local X/Y/Z axes (I2); anchors without orientation are labelled as such
  rather than shown with a fake frame (C1).
- Missing / duplicate / invalid / shadowed / prepare-mismatched anchors are reported in the UI and in the
  report (C4).
- Skinned assets resolve bone anchors in rest pose by default, with `Idle@t=0` available; the pose is recorded
  in the report (C2).
- A reference/target anchor pair can be selected; position delta, rotation delta (or
  `ORIENTATION_UNKNOWN`), target scale, bounds, origin distance and ground contact are shown (I6, I7).
- `Align` produces the result defined in D6, in both modes, without changing scale (C5).
- Target transform can be edited numerically, reset, and copied as a paste-ready snippet for
  `HELD_ATTACH`, `HOUSE_CATALOG.lampMount`, or `AssetAnchorDef`.
- Reload picks up an edited GLB, preserves viewer state, and reports invalid selections instead of silently
  reselecting (I5).
- Rendering has a Diagnostic mode and a Game-like mode reusing the game's renderer/lights/sky/materials, with
  `Alignment` / `Daylight` / `Night` / `Torch` lighting presets; the Torch preset uses the game's actual torch
  light constants and offset (D8).
- Transparency/opacity/alphaTest/depthWrite state is inspectable against light and dark backgrounds, with
  G3/G4 contract violations flagged.
- The report is copyable, deterministic for an unchanged scene, versioned, and contains every field in review
  §7 including the full available-anchor list, rendering mode, preset and warnings.
- A snapshot PNG captures the current view together with the diagnostic text.
- **Runtime reuse is wired, not just planned:** `findRightHandSocket` resolves through the shared anchor
  lookup and `resolveHouseLampMount` has an anchor-first branch (D9) — with today's game behaviour unchanged.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` pass.
- Manual browser verification per §10, **including the game regression pass (item 10)**. Not marked verified on
  technical checks alone (G8).

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| Composer cannot render four scissored viewports | Documented constraint: Game-like + post-processing in single-view only (D7); the report states which combination was used. |
| Bone frames do not match the anchor axis convention | Anchor `rotation` correction on the `hand.right` def, authored with the tool itself in Phase 3; `missing-orientation` makes the gap visible instead of implicit. |
| `assetLocal` metadata numbers silently drift when a `prepare` value changes | `authoredFor` + `prepare-mismatch` validation issue; GLB-authored anchors preferred precisely because they are normalization-invariant (D2). |
| Importing `props.ts` / `createFauna.ts` into the tool drags a heavy graph | Relocate the constants into leaf modules (`propSpecs.ts`) rather than duplicating values (§4.5). |
| Phase 6 migration regresses hand/lamp alignment | Migrate one asset at a time, keep `HELD_ATTACH` / `lampMount` as fallbacks, browser-verify each; MVP changes no values. |
| Snapshot capture returns a blank canvas | `preserveDrawingBuffer` via the shared renderer factory (§7.1) plus capture in the same tick as the render. |
| Four `OrbitControls` on one canvas fight over pointer events | Per-viewport overlay divs (§5.3); fall back to a single "active view" binding if the overlay approach misbehaves. |
| The tool quietly becomes a second attachment system | D9 makes runtime consumption part of MVP acceptance, and §12 forbids parallel mechanisms. |

---

## 16. Plan self-review against PRD and review

**Review Critical — all resolved:** C1 anchor orientation → D1 (required by type, axis convention table, `missing-orientation` issue). C2 skinned/bone assets → D5 (rest pose default, `Idle@t=0` optional, pose in the report, bone anchors via `node` space). C3 root vs resolved transform → D3 (`localMatrix` + `worldMatrix`, separate report blocks). C4 missing/invalid anchors → D4 (nine issue kinds surfaced in UI and report). C5 automatic Align → D6 (defined result, two modes, scale preserved, pure + unit-tested).

**Review Important — all resolved:** I1 asset-only inspection → §5.2 + `mode: single`. I2 anchor local frames → §5.4. I3 optional semantic types → D1 (five types, orientation requirement is the only behaviour attached). I4 stable unique names → D4 (regex, uniqueness, no runtime ids). I5 hot-reload failure → §5.6 (`selection-invalid` + `ANCHOR_MISSING_AFTER_RELOAD`). I6 expanded transform/origin diagnostics → §5.2 + §4.4 (root scale, bounds, origin, anchor-to-origin). I7 ground diagnostics → §6.5 (`min.y`, contact verdict, tolerance). I8 terrain acknowledgement → §6.5 + §12.

**Review Minor:** M1 synchronized views → §5.3 (one scene, four cameras — structural). M2 presets vs transparency/environment → D7 + §6.4. M3 ambiguous wording → the two real constraints are stated explicitly (composer single-view only, CSS2D labels on the active view only) instead of "where practical".

**Review §4 missing requirements** are all covered: asset-only inspection, root diagnostics, resolved world transforms, local axes, stable names, invalid-anchor diagnostics, skinned behaviour, ground contact, reload behaviour, deterministic AI output, runtime consumption. **§6** — anchors are asset-domain (`src/assets/`), the browser is a consumer, and runtime reuse is an MVP acceptance criterion (D9). **§7** — the report contains every listed field plus the full anchor list, and the snapshot describes the same state. **§8** — Diagnostic and Game-like are separate modes and Torch uses the game's real light constants.

**PRD §18 questions answered:** Q1 §3 · Q2 §1 + §4.5 · Q3 D2 + §4.1 · Q4 D2 (both, GLB preferred, metadata authoritative) · Q5 D3 · Q6 §6.2 · Q7 §6.4 · Q8 §5.6 · Q9 §4.4 + §5.1 (`createSnapshot`, `reportFromScene`) · Q10 §4 shared vs §5 tool-local.

**PRD phases** map to §8: PRD 1→Phase 1, 2→Phase 2, 3→Phase 3, 4→Phase 4, 5→Phase 5, with a new Phase 0 for
the shared seam (the review's precondition for not building a parallel system) and Phase 6 for the runtime
migration the review asked to be acknowledged.

**Deliberate deviations from the PRD:** effort raised `L` → `XL`; `Transparent` and `Game-like` are no longer
lighting presets (D7); automatic Align is MVP rather than "future/optional", because C5 required a defined
result and the solve is small and testable once anchors resolve.

**Known gaps carried forward, on purpose:** `HELD_ATTACH` and `HOUSE_CATALOG.lampMount` values are still
hand-tuned after MVP (Phase 6 migrates them, one browser-verified asset at a time); the composer/CSS2D
single-view constraints are accepted rather than engineered around; there is no automated visual regression
test — §10 item 10 (game regression pass) is the safety net for the runtime touch points.

---

## 17. Related

- [088 — Asset Alignment Browser (PRD)](./2026-08-12--088--asset-alignment-browser.md)
- [088 — review](./2026-08-12--088--asset-alignment-browser-review.md)
- [074 — house catalog, scale, lamps, debug](./2026-08-12--074--house-catalog-scale-lamps-debug.md) — owns the lamp-mount data and the `[house:lamp]` paste workflow this plan generalizes.
- [085 — handheld lights and village torches](./2026-08-12--085--handheld-lights-and-village-torches.md) — owns the held-tool/torch grip data and is the first Phase 6 migration candidate.
- [079 — interaction queue / well drink](./2026-08-12--079--interaction-queue-well-drink.md) — future `interaction` anchor consumer.
- [GRAPHICS.md](../GRAPHICS.md) — G1/G2/G3/G4/G7/G8 constrain the viewer's rendering choices.
- [assets/MODELS.md](../assets/MODELS.md) — reviewed; no new assets required for MVP.
