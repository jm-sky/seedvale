# Implementation Notes: Weather-Driven Cloud Variety and Ground Fog

**Plan:** `world-terrain-014-weather-driven-cloud-variety-and-ground-fog.md`
**Reviewed:** 2026-09-05
**Status:** `verification needed` 🔍 — implemented per §19 below, technical checks pass; browser/manual verification pending.

## Recon verdict

Plan is aligned with the current architecture. `src/world/clouds.ts` already provides the correct bounded/recycled ownership model and should be extended in place. Local ground fog does **not** exist yet; `src/world/weatherVisuals.ts` only modifies scene `THREE.Fog` distance/color and lighting.

Keep this as rendering-only state fed from the already-live `ClimateState`. Do not add weather state, persistence, chunk ownership or a new atmosphere manager.

## Current-code findings

- `src/world/clouds.ts` currently owns a fixed pool of `28` `THREE.Sprite`s. Sprites are created once after texture loading, move on local X, wrap at `AREA_HALF_WIDTH`, and are randomized only on creation/recycle.
- Current cloud variety is a flat `CLOUD_TEXTURE_URLS` list. `randomize()` picks one shared `SpriteMaterial`, derives aspect ratio from `material.map.image`, then chooses scale/height/depth. This is the natural seam for category-aware assignment.
- `cloudAppearanceFor(weather, elev)` already cleanly separates coverage/tint from sprite placement and blends weather profile by `weather.intensity`. Preserve it or split only the pure profile-selection part needed for tests.
- Day/night is already correctly independent from cloud identity: `cloudLightFromElev()` multiplies the weather tint. Do not make time-of-day participate in category selection.
- `src/world/weather.ts` is authoritative for `WeatherState`, `WeatherType`, `Season` and `ClimateState`. `tickClimate()` updates the stable runtime object; weather is deterministic and not persisted.
- `src/app/gameLoop.ts` already has the current `climate.weather`, player XYZ and sky elevation in the same frame. It calls `clouds.update(...)` immediately after weather particles. Reuse this integration point for both cloud category selection and ground fog.
- `src/app/createApp.ts` creates long-lived rendering systems (`weatherParticles`, `clouds`) outside `WorldBundle`. Ground fog belongs beside them, not in `WorldBundle`: it is camera/player-local presentation state and must not be rebuilt with terrain/world-state systems.
- `src/assets/loadTexture.ts` caches and shares `Texture` instances by URL. Systems may dispose their own materials, but must **not dispose shared textures** returned by `loadTexture()`.
- `public/images/clouds/` currently contains both `cloud1..cloud4.png` and `FX_CloudAlpha01..10.png`; classify only the PNGs actually chosen for the first tuning pass. The mechanism should accept arbitrary non-empty arrays without tying logic to filenames.
- `public/images/fog/fog-01.png` exists and is the only current local-fog asset.
- `WorldBundle.chunkManager.sampleHeight(x, z)` is the correct runtime terrain-height seam when exact local ground height is needed because it includes runtime terrain modifications. Do not use analytic `sampleHeightAt()` for fog placement.

## Cloud implementation decisions

### 1. Keep one CloudSystem and one bounded sprite pool

Do not create separate `light`/`dense` groups. Introduce a small typed config near `clouds.ts`, e.g. category config containing:

- `textures: readonly string[]`,
- height range,
- width/scale range,
- optional drift-speed range.

Load all configured textures once and build shared materials once. Each sprite should retain the selected category/texture only as presentation metadata needed for recycling/debugging.

The total pool remains `CLOUD_COUNT`; adding texture files must not increase sprite count.

### 2. Separate profile calculation from recycle-time assignment

Keep coverage and category weights independent:

- coverage continues to control `sprite.visible` through the fixed `visibilityThreshold`,
- category weights determine the family chosen inside `randomize()` when a sprite is first assigned or wraps.

A small pure helper such as `cloudCategoryWeightsFor(weather, season?)` is useful. Normalize defensively if configuration weights do not sum to `1`.

`WeatherState.intensity` should interpolate category bias from a neutral/clear baseline toward the weather profile, rather than only affecting coverage/tint. This avoids low-intensity rain immediately having the same family distribution as strong rain.

### 3. Avoid global reassignment on weather change

Do not loop over the pool and replace materials when `weather.type` changes. Existing sprites keep their family until recycle; newly recycled sprites use the current weights.

If testing shows convergence is too slow because `AREA_HALF_WIDTH = 480` and `WIND_SPEED = 1.4`, add only a bounded gradual correction, e.g. rerandomize at most one eligible sprite after a coarse interval. Do not add per-frame churn or allocations.

### 4. Shared-material tint remains valid

Current code sets the tint on every shared cloud material after updating sprites. This remains appropriate even with multiple categories: weather/day-night tint should affect all families, while category differences come from texture/scale/height.

Do not introduce per-sprite material clones for opacity/rotation.

### 5. Season is optional — skip unless it stays cheap

`CloudSystem.update()` currently receives `WeatherState`, not the whole `ClimateState`. Adding season requires one additional argument from `gameLoop.ts`. This is acceptable but not required by the plan.

Prefer shipping weather + intensity first. Add season only as a tiny pure weight bias; do not pass `ClimateState` wholesale into the renderer.

## Ground-fog implementation decisions

### 1. New small renderer system beside clouds

Create a focused module such as `src/world/groundFog.ts` with the same lifecycle shape:

```ts
addTo(scene)
update(...)
dispose()
```

Instantiate it in `createApp.ts`, update it in `gameLoop.ts` near `weatherParticles`/`clouds`, and dispose it with those app-level systems.

Do not attach fog elements to chunks and do not add it to `WorldBundle`.

### 2. Prefer a tiny fixed pool of flattened billboards/cards

A normal upright `Sprite` can read as a vertical wall; a large horizontal plane can visibly intersect sloped terrain. With the current alpha asset, start with a few **wide, shallow billboards/cards** and verify visually before adding complexity.

Keep the primitive deliberately cheap:

- 4–6 elements maximum,
- transparent unlit material,
- `depthWrite: false`,
- shared texture/material resources,
- no shadows,
- no custom shader unless the basic representation clearly fails manual verification.

Avoid `depthTest: false`; fog should still respect nearer opaque geometry rather than rendering through everything.

### 3. Terrain height should be sampled only on spawn/recycle

If individual patches need to hug uneven ground, inject a callback backed by the current `bundle.chunkManager.sampleHeight(x, z)` and sample Y only when a fog element is initialized/recycled.

Do **not** terrain-sample every element every frame. X/Z drift can remain local; when an element leaves the configured radius, recycle and recompute its ground Y.

Because `WorldBundle` can rebuild while `groundFog` remains long-lived, any callback must read `bundle.chunkManager` dynamically rather than capture the original manager instance.

### 4. Weather controls visibility, not object lifetime

Create all fog elements once after texture load. For non-`fog` weather set the group/elements invisible. For `weather.type === 'fog'`, derive:

- visible pool fraction from intensity and fixed thresholds,
- shared opacity from intensity,
- optionally small drift-speed scaling.

Use fixed per-element visibility thresholds like the cloud system so density changes require no add/remove operations.

Do not fade local fog in other weather types in this plan.

### 5. Follow player locality without resetting local motion

Use the same general pattern as clouds: keep element offsets local to a group centered around player X/Z. Do not respawn every patch when the player moves.

If terrain Y is stored per patch in world terms, be careful not to combine it incorrectly with a moving group Y. Easiest invariant: group follows player X/Z only, each patch owns its local/world-derived Y offset; or keep the group at world origin and move/recycle patches around current player X/Z. Pick one coordinate model and keep it consistent.

## Texture-loading and lifecycle pitfalls

- `loadTexture()` returns a cached shared `Texture`; dispose only `SpriteMaterial`/`MeshBasicMaterial` instances created by these systems.
- Texture load is asynchronous. Until it resolves, update must remain a cheap no-op exactly like current clouds.
- If one configured texture fails, current `Promise.all()` causes the entire cloud system to stay absent. For the expanded asset lists, consider whether `Promise.allSettled()` is worthwhile so one optional candidate PNG does not disable all clouds/fog. Keep this local; do not redesign the asset loader.
- Validate category texture arrays in code/config so an empty category cannot produce `Math.floor(Math.random() * 0)` / undefined material access.

## Testing targets

Pure tests are worthwhile only for selection/profile logic:

- clear → strongly light,
- cloudy → mixed/dense-biased,
- rain → increasingly dense with intensity,
- snow → dense-biased but still uses existing tint path,
- fog → low cloud coverage profile remains intact,
- weights normalize and work with one texture per category,
- ground-fog strength/count mapping is monotonic with intensity.

Do not unit-test Three.js sprite/card rendering details.

## Main pitfalls

- Creating separate cloud managers for each family.
- Reassigning all cloud textures on every weather transition.
- Increasing cloud sprite count because more PNGs exist.
- Cloning materials per sprite just to vary opacity/rotation.
- Treating local fog as simulation/persistent state.
- Putting ground fog in `WorldBundle` or terrain chunk records.
- Sampling procedural terrain independently instead of using `chunkManager.sampleHeight()` when ground placement needs runtime-correct height.
- Sampling ground height every frame for every fog element.
- Disposing cached textures from `loadTexture()`.
- Capturing a stale `ChunkManager` across world rebuilds.
- Letting the new local fog replace or bypass `weatherVisuals.ts`; it supplements the existing global fog.

## Suggested implementation order

1. Refactor cloud texture config into `light`/`dense` categories without changing pool/lifecycle behaviour.
2. Add pure weather/intensity category-weight selection and use it only during cloud assignment/recycle.
3. Verify coverage and existing day/night/weather tint behaviour stay unchanged.
4. Add `groundFog.ts` with a 4–6 element fixed pool and `/images/fog/fog-01.png`.
5. Wire it beside clouds in `createApp.ts`/`gameLoop.ts`; inject dynamic runtime terrain sampling only if the chosen card placement needs it.
6. Add focused pure tests, then typecheck/lint/tests/build. Browser visual verification remains user-owned.

## §19 Implementation summary

Implemented as designed above, following the suggested order.

**Clouds (`src/world/clouds.ts`)** — extended in place, same `CLOUD_COUNT = 28` bounded/recycled sprite pool:

- `CloudCategory = 'light' | 'dense'`, each with its own `textures`/`heightRange`/`scaleRange`/`driftSpeedRange` (`CLOUD_CATEGORIES`). First tuning pass: `light` = `cloud1.png`/`cloud2.png`, `dense` = `cloud3.png`/`cloud4.png` — the `FX_CloudAlpha*` candidates stay unclassified.
- `cloudCategoryWeightsFor(weather, season?)` — pure, exported, tested — blends a neutral clear-sky mix toward each weather type's target mix by `weather.intensity`, then applies a small optional seasonal bias, and defensively re-normalizes.
- `randomize()` now picks a category via `pickCategory()` (weighted, but falls back to whichever category actually has loaded materials) only at sprite creation/recycle — no global reassignment on weather change, matching plan §3.
- Per-sprite `speed` (from the category's `driftSpeedRange`) replaces the old single `WIND_SPEED` constant so `light`/`dense` drift at different rates.
- Textures load per-category via `Promise.allSettled` so one missing candidate PNG can't disable the whole system.
- `CloudSystem.update()` gained an optional trailing `season?: Season` argument; `gameLoop.ts` passes `climate.season`.
- Did **not** add the "bounded periodic correction" mentioned in §3 as a fallback — natural recycle-based convergence is what's shipped; add it only if manual verification shows population convergence is too slow after a weather change.

**Ground fog (`src/world/groundFog.ts`)** — new module, same `addTo`/`update`/`dispose` shape as `clouds.ts`:

- Fixed pool of 5 (`FOG_COUNT`) flattened, mostly-horizontal `PlaneGeometry` cards (`rotation.x = -Math.PI / 2`) rather than upright sprites, sharing one geometry and one `MeshBasicMaterial` per loaded texture (`/images/fog/fog-01.png` only, so far).
- Created once after texture load; for `weather.type !== 'fog'` the whole group is hidden (`group.visible`) — object lifetime never changes.
- For `weather.type === 'fog'`, `weather.intensity` linearly drives both the shared material opacity and the visible-pool fraction (same fixed per-patch `visibilityThreshold` trick as clouds), so density changes need no add/remove.
- Patches drift locally within a `±45` unit square centered on the player (`AREA_HALF_EXTENT`) and recycle (new offset + new texture/scale/rotation) when they leave it; terrain height is sampled via the `sampleHeight: HeightSampler` argument passed into `update()` only at spawn/recycle, never per frame — `gameLoop.ts` passes `bundle.chunkManager.sampleHeight` fresh every call, so a `WorldBundle` rebuild can never leave a stale `ChunkManager` captured.
- Instantiated/disposed in `createApp.ts` beside `clouds`, updated in `gameLoop.ts` right after `clouds.update(...)`. Not added to `WorldBundle` or terrain chunks.

**Tests** — added `describe('cloudCategoryWeightsFor', ...)` to `clouds.test.ts` covering the profile-per-weather-type table, intensity scaling, normalization, and the seasonal bias, per this doc's "Testing targets". No new tests for `groundFog.ts`'s three.js object wiring, consistent with "Do not unit-test Three.js sprite/card rendering details."

**Verified:** `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run test` (full suite), `pnpm run build` all pass. Browser/manual verification (the checklist in the plan's "Verification" section) is user-owned and still pending.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
