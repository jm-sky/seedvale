# Plan: Production PointLight Budget

**Created:** 2026-08-18
**Status:** `verification needed` 🔍 — registry + visibility fix + padded/overflow-cull mechanism implemented and unit-tested (§12); production budget number is still **TBD**, pending the real-GPU Cursor benchmark in §10. Not yet browser/manual verified.
**Priority:** high
**Effort:** M
**Depends on:** none (splits off [149](./2026-08-17--149--shader-program-first-use-hitch.md) Phase 1 B; 149 Phase 1 A is blocked on this plan, see §9)
**domain:** `world-terrain`
**tags:** `settlements-npcs`, `performance`, `rendering`, `streaming`

---

## 1. Problem

[Plan 149](./2026-08-17--149--shader-program-first-use-hitch.md) is investigating a multi-hundred-ms first-use shader/program hitch during chunk streaming. [Review 023](../reviews/2026-08-18--023--plan-149-pointlight-variant-axis.md) and [review 024](../reviews/2026-08-18--024--plan-149-pointlight-budget-curve.md) confirmed the dominant axis: Three.js keys its `WebGLProgram` cache in part on `NUM_POINT_LIGHTS` (the count of currently-visible `PointLight`s collected by `WebGLLights.setup`). As settlements stream in/out, that count changes (values `2..21` observed across sessions), so almost every `MeshStandardMaterial` gets **re-first-used** at each new count — this is the majority of the ~150–250 extra program/cacheKey variants seen in the `stream` benchmark (baseline 205–294 → 62 once the count is pinned).

Both reviews used a **diagnostic-only** pad: `src/perf/pointLightBudget.ts`, gated behind `?pinPointLights=N`, wired into `src/app/createApp.ts` / `src/app/gameLoop.ts` (current dirty working tree). It proved the hypothesis but is explicitly not shippable:

- it patches `Object3D.prototype.add`/`remove` globally to build its light registry,
- review 023's version recounted with a full-scene `scene.traverseVisible()` every frame (cost folded into RENDER/p95),
- it culls real lights past the budget with no protection for lights near the camera,
- 8 and 12 cull real lamps/torches and visibly darken settlements at night; only 16 avoided cull on the one morning `stream` protocol tested, but the same session saw real visible-light counts reach 21 later in the day — so 16 is not proven safe for a full day/night cycle.

This plan defines the **production** replacement: a stable `NUM_POINT_LIGHTS` without prototype-patching, without a per-frame full-scene traversal, and without silently culling real lamps as the normal case.

---

## 2. Confirmed facts (current code, not the plans)

### 2.1 Where real `PointLight`s are created — exactly 4 call sites, all already inside a known owner

| Site | File | Owner / lifecycle |
|---|---|---|
| House lamp | `createHouseLight()` — `src/settlement/houseLighting.ts:116` | Built inside `buildSettlementProps()`, returned in `houseLights[]`, held by `Settlement` (`src/settlement/createSettlement.ts`). `setNightIntensity(t)` toggles `light.intensity` only — **`light.visible` stays `true` at all times**, including full daylight (`intensity = 0`). |
| Village torch | `createVillageTorchLight()` — `src/settlement/houseLighting.ts:172` | Same as above, `villageTorches[]`. `setLit(on)` toggles `light.intensity` between `0` and `3.2` — **`light.visible` never changes**. |
| Settlement/placed campfire | `createCampfireFlame()` — `src/settlement/campfireProps.ts:272`, used by `createLitCampfireVisual()` | Two owners: (a) settlement's own fixed campfire, built inside `buildSettlementProps()` (MD+ villages), part of the settlement's `group`; (b) player-built fires via `src/settlement/PlacedFires.ts`'s `spawn()`/`despawn()` (freeform, not settlement-owned, saved/loaded independently, **not distance-streamed** — persists as long as the fire exists in the save). `light.intensity` is driven by size/ignite ramp. **Correction from an earlier draft:** unlike house lamps/torches below, this light is *not* part of the "always visible" bug — `VillageFire.ts` already toggles the whole `flame.object.visible` true/false on light/extinguish, and that group contains the `PointLight`, so an unlit campfire already costs zero `NUM_POINT_LIGHTS` slots. No fix needed here. |
| Player torch | `new PointLight(...)` — `src/player/PlayerTorch.ts:221` | Built directly by `PlayerTorch.light()`, torn down by `clearMount()`/`dispose()`. Exactly 0 or 1 at a time. |
| **Hidden 5th contributor** | `makeFlameVisual()` — `src/player/PlayerTorch.ts:138` → `createCampfireFlame()` → `muteInternalLights()` (`PlayerTorch.ts:126`) | The player's *hand-flame decorative visual* also builds a `createCampfireFlame()`, whose internal `PointLight` is force-set to `intensity = 0` but **not** `visible = false`. While the player is holding a lit branch, this is a second always-visible, always-zero-intensity `PointLight` riding along with the real torch light — currently invisible in the `houseLights`/`villageTorches`/campfire accounting because it's buried inside a decorative helper. |

`src/tools/assetBrowser/viewer/createViewerScene.ts` also creates a `PointLight`, but that's a standalone dev-tool scene, never part of the game's `scene` — out of scope, do not touch.

### 2.2 Lifecycle / ownership already exists — no new manager needed

- **Settlement scope.** `SettlementsManager` (`src/settlement/SettlementsManager.ts`) already streams `Settlement` instances in/out by distance: home settlement always loaded, `EAGER_NEIGHBOR_COUNT = 2` neighbors loaded immediately at startup, further settlements loaded via `recheck()` when within `loadRadius`, unloaded when beyond `unloadRadius` (hysteresis ring). **Correction from an earlier draft of this plan:** these are their own fixed world-unit constants — `SETTLEMENT_LOAD_RADIUS = 300` / `SETTLEMENT_UNLOAD_RADIUS = 420` in `src/app/worldBundle.ts` — deliberately **independent** of terrain's own `config.terrain.loadRadius`/`unloadRadius` (chunks `3`/`4`, converted to world units by `chunkManager`). Do not conflate the two when reasoning about how many settlements can be loaded at once.
- **`Settlement.dispose()`** (`src/settlement/createSettlement.ts:680`) already calls `disposeSettlementGroup(group)` + `group.removeFromParent()`, which removes the whole settlement subtree — house lamps, village torches, settlement campfire — from the scene graph in one call. There is currently **no explicit per-light teardown**; removal is implicit via the group leaving the scene.
- **`PlacedFires`** owns its own `spawn()`/`despawn()` pair per fire, independent of settlement streaming.
- **`PlayerTorch`** owns its own `light()`/`clearMount()` pair.

This means every real `PointLight`'s creation and destruction already passes through one of exactly three well-defined call sites: `createSettlement.ts` (build/`dispose()`), `PlacedFires.ts` (`spawn()`/`despawn()`), `PlayerTorch.ts` (`light()`/`clearMount()`). **No dynamic, untracked `PointLight` creation exists anywhere else in the game's `scene`.** A registry can hook these three places directly with explicit calls — `Object3D.prototype` patching (review 023/024's approach) is not needed to get a complete, accurate registry.

### 2.3 Why the "up to 21" number is not the real answer

House lamps and village torches are **visible even when off** (§2.1). Review 024's registry counted `Object3D.visible === true`, so its "15–21 real lights" figure includes every daytime-dark lamp in every loaded settlement, not just currently-lit ones. The true "how many `PointLight`s can be simultaneously *lit and rendering meaningfully*" number is very likely materially lower, especially by day, and is not yet measured. This matters directly for picking a budget (§6) and is this plan's first open question (§10).

---

## 3. Proposed architecture

### 3.1 Registry — explicit register/unregister at existing lifecycle boundaries, no monkeypatching

**Implemented as designed**, with two refinements that came out of implementation:

New module `src/world/pointLightBudget.ts` (sibling to `src/world/createLights.ts`, which already owns the sun/ambient/hemi lights). `createPointLightBudget(scene, budget: number | null)` exposes:

```ts
export type PointLightBudget = {
  budget: number | null
  /** One-time bounded walk of `root`'s subtree at creation — not the whole
   *  scene, not per frame. Registers every real (non-pad) PointLight found. */
  registerSubtree: (root: Object3D) => void
  /** Matching one-time walk at teardown. */
  unregisterSubtree: (root: Object3D) => void
  /** Direct register/unregister for single lights created outside a subtree
   *  walk (PlayerTorch's own light). */
  register: (light: PointLight) => void
  unregister: (light: PointLight) => void
  /** Called once per frame from the gameLoop, via `GameLoopDeps.syncPointLightBudget`.
   *  Recounts *visible* registered lights (ancestor-visibility check only, no
   *  scene traversal); pads/culls to `budget` only when `budget !== null`.
   *  `camera` is optional — omitted only in tests, where overflow-cull
   *  protection (§3.4) is then simply disabled rather than defaulted open. */
  sync: (camera?: Camera) => PointLightBudgetSnapshot
  snapshot: () => PointLightBudgetSnapshot
  dispose: () => void
}
```

Refinements versus the original sketch:
- **`budget: number | null`, not always-on.** The registry/census side of `sync()` always runs (cheap, needed for §10's measurement regardless of whether a number has been frozen); the pad/dummy-lights/overflow-cull side only runs when a budget is set. Production ships with the registry active and the pad **off by default** — `?pointLightBudget=N` (renamed from the diagnostic `?pinPointLights=N`) turns padding on for QA/Cursor benchmarking. This avoids shipping an unvalidated budget number as the silent default (see §12).
- **`createNullPointLightBudget()`** — a no-op implementation used as every call site's default parameter value, so adding the parameter to `createSettlement`/`SettlementsManager`/`PlacedFires`/`createPlayerTorch` didn't require touching every existing caller/test.
- `registerSubtree`/`unregisterSubtree` walk only the object passed in (a settlement's `group`, a placed fire's `group`) — bounded to a few dozen nodes, run once per settlement load/unload or fire spawn/despawn, never per frame and never on `scene` itself.
- Call sites (all implemented):
  - `src/settlement/createSettlement.ts`: `pointLightBudget.registerSubtree(group)` right after `scene.add(group)`; `pointLightBudget.unregisterSubtree(group)` at the top of `dispose()`.
  - `src/settlement/PlacedFires.ts`: `registerSubtree(group)` in `spawn()`; `unregisterSubtree(mesh)` in `despawn()` and in `dispose()`'s loop.
  - `src/player/PlayerTorch.ts`: `register(pointLight)` in `light()` right after constructing it; `unregister(pointLight)` in `clearMount()`. The hand-flame's muted internal light does **not** need registration at all — §3.2's visibility fix removes it from the count entirely instead.
- The budget instance is created once in `src/app/createApp.ts` and threaded down through `createWorldBundle`/`rebuildWorldBundle` → `buildSettlementsManager`/`createPlacedFires`, and separately into `createPlayerTorch`, the same way `playAt`/`onAnimalDeath`/`isLandPlotOwned` are already threaded. It lives outside `WorldBundle` (its pad is added directly to `scene`, which survives a rebuild) — only the registrations themselves get rebuilt, since `rebuildWorldBundle` disposes the old `settlementsManager`/`placedFires` (unregistering everything) before creating fresh ones (re-registering everything), with no risk of leaks or double-registration across a rebuild.

### 3.2 Fix the "always visible" lamp/torch bug first — separate from padding

Change `setNightIntensity`/`setLit` (`houseLighting.ts`) to also toggle `light.visible` (`clamped > 0` / `on`), not just `.intensity`. This is a correctness fix, not a hack: Three's own `projectObject` already skips invisible objects when collecting lights, so an off lamp costs **nothing** — no `NUM_POINT_LIGHTS` slot, no shader loop iteration — once this lands. Do the same for the `PlayerTorch` hand-flame's muted internal light in `muteInternalLights()` — set `visible = false` there instead of (or in addition to) `intensity = 0`, removing the "hidden 5th contributor" from §2.1 entirely without needing to register it. As a small defensive extension of the same fix, `campfireProps.ts`'s sibling `muteObjectLights()` (mutes any light embedded in the GLB flame template, if the asset ever has one) gets the same `visible = false` addition — settlement/placed campfires themselves don't need this (see the §2.1 correction above), but a muted embedded light shouldn't cost a slot either if one is ever authored into that asset.

This must land and be measured **before** picking a budget number (§6, §10) — it changes what "real concurrent count" even means. **Implemented** — see §12.

### 3.3 Padding — keep the validated mechanism, drop the traversal

**Implemented.** Kept the intensity-0 dummy-light pad technique from `src/perf/pointLightBudget.ts` (`distance = 1`, parked at `(0, -100_000, 0)`, `matrixAutoUpdate = false`) — review 023/024 confirmed it's visually inert and does stabilize `NUM_POINT_LIGHTS`. The pad's dummy group is constructed once inside `createPointLightBudget(scene, budget)` (only when `budget !== null`), added directly to `scene`.

`sync(camera?)` each frame:
1. Walk the registry (bounded to registered lights only — dozens, not thousands) and check `light.visible` + ancestor visibility (`isWorldVisibleUnderScene`, ported from the deleted experimental file) to get `realCount`.
2. If `budget !== null`: show `max(0, budget - kept)` dummies, hide the rest.
3. If `realCount > budget` (overflow — see §3.4), cull first, then pad with whatever's left.

This keeps the review 024 "cheap counter" property (`syncMs` 0.0–0.2 ms) without the `Object3D.prototype` patch: the registry is populated by explicit calls, so `sync()` never needs to discover membership by walking anything bigger than the registry itself.

### 3.4 Overflow handling — protect near-camera lights, don't blanket-cull by intensity/distance alone

**Implemented.** Review 023/024's cull sort (dimmest first, then furthest) is a reasonable base but has no floor: it will cull a lamp two houses from the player just as readily as one across the map, as long as it happens to be dimmer or slightly further at that instant. Added `POINT_LIGHT_PROTECT_RADIUS = 30` (tunable, order-of-magnitude from `VILLAGE_SIZE_CONFIG`'s `houseSpacing`) that overflow-cull never touches when a camera is supplied; only lights outside that radius are eligible for cull, still sorted dimmest-then-furthest within that eligible set. If overflow can't be resolved without culling inside the protected radius, `sync()` does **not** cull into it — the snapshot's `budgetTooLowForScene` flag is set instead, `NUM_POINT_LIGHTS` is allowed to exceed `budget` for that frame, and a dev-only `console.warn` fires (throttled by nothing yet — see §12 note on a possible follow-up if this turns out to spam). Unit-tested in `pointLightBudget.test.ts` (`protects lights within POINT_LIGHT_PROTECT_RADIUS...` / `does not cull into the protected radius...`).

### 3.5 What NOT to build

- No `Object3D.prototype` patching (confirmed unnecessary, §2.2).
- No per-frame full-scene `traverseVisible()` (confirmed unnecessary, registry is authoritative by construction).
- No new generic "lighting manager" framework — this stays a narrow budget/pad service parallel to `createLights.ts`, not a replacement for how lights are authored.
- No change to `ChunkManager` scheduling, worker protocol, or render-pass order.
- No culling that is the *normal* path at typical loaded-settlement counts — overflow cull should be rare after §3.2's fix and a correctly-sized budget (§6), not the mechanism doing the everyday work.

---

## 4. Files / systems touched

All implemented:

- **New:** `src/world/pointLightBudget.ts` + `pointLightBudget.test.ts` (16 unit tests) — production registry + pad + sync (adapted from the deleted `src/perf/pointLightBudget.ts`, see §12).
- `src/settlement/createSettlement.ts` — `pointLightBudget` param (default `createNullPointLightBudget()`); `registerSubtree(group)` after `scene.add(group)`; `unregisterSubtree(group)` at the top of `dispose()`.
- `src/settlement/SettlementsManager.ts` — `pointLightBudget` param forwarded to both `createSettlement()` call sites (home settlement + `ensureLoaded`'s streamed-in build).
- `src/settlement/houseLighting.ts` — `setNightIntensity`/`setLit` also toggle `light.visible` (§3.2).
- `src/settlement/campfireProps.ts` — `muteObjectLights()` also sets `visible = false` (§3.2 defensive extension).
- `src/settlement/PlacedFires.ts` — `pointLightBudget` param; `registerSubtree`/`unregisterSubtree` in `spawn()`/`despawn()`/`dispose()`.
- `src/player/PlayerTorch.ts` — `pointLightBudget` param on `createPlayerTorch`; `register`/`unregister` for the real torch light; `muteInternalLights()` also sets `visible = false` (§3.2).
- `src/app/worldBundle.ts` — `pointLightBudget` param threaded through `createWorldBundle`/`rebuildWorldBundle`/`buildSettlementsManager` into `createSettlementsManager`/`createPlacedFires`.
- `src/app/createApp.ts` — constructs `createPointLightBudget(scene, pointLightBudgetFromUrl())` once (replacing the `?pinPointLights` diagnostic wiring), passes it into `createWorldBundle`/`rebuildWorldBundle`/`createPlayerTorch`; wires `syncPointLightBudget` unconditionally; disposes it (after `playerTorch.dispose()`) on app teardown.
- `src/app/gameLoop.ts` — `syncPointLightBudget?: () => void` hook doc comment updated to point at this plan/module; behavior unchanged (called once per frame, before `renderer.info.reset()`).
- `src/perf/flags.ts` — `pinPointLights` → `pointLightBudget` URL param (same bare/`true`/`yes`/`0`/`false`/`no`/integer semantics); `DEFAULT_POINT_LIGHT_BUDGET` kept as the bare-flag fallback, explicitly documented as provisional pending §10.
- `src/perf/index.ts` — dropped the re-export of the deleted `src/perf/pointLightBudget.ts`.
- **Deleted:** `src/perf/pointLightBudget.ts` / `.test.ts` — superseded by `src/world/pointLightBudget.ts`; the experiment's findings remain in reviews [023](../reviews/2026-08-18--023--plan-149-pointlight-variant-axis.md)/[024](../reviews/2026-08-18--024--plan-149-pointlight-budget-curve.md) and §12 below, not lost.

---

## 5. Impact on streaming

- No change to `ChunkManager`, worker protocol, or `SettlementsManager.recheck()`'s load/unload thresholds.
- Settlement build already awaits `waitForChunks()` before `buildSettlementProps()` runs (`SettlementsManager.ensureLoaded`) — `registerSubtree` slots in right after that existing await, no new async step.
- Settlement unload already happens synchronously in `dispose()` — `unregisterSubtree` is a synchronous addition to an existing synchronous call, no new latency.
- Overflow cull (§3.4), if it ever fires, must not interact with `ChunkManager`'s own scheduling — it only flips `PointLight.visible`/`intensity`-independent flags on already-loaded objects.

## 6. Impact on rendering

- Expected: `NUM_POINT_LIGHTS` constant at the chosen budget for the overwhelming majority of frames once §3.2's visibility fix is measured and a correctly-sized budget is picked (§10) → collapses unique programs from the 205–294 baseline range toward the ~62 review 023/024 already demonstrated (residual variance is the instancing/mask axis, a separate later cleanup, §9 Phase C).
- Every `MeshStandardMaterial` fragment shader loops `NUM_POINT_LIGHTS` regardless of how many are actually lit nearby (confirmed cost, review 023) — review 024 showed this is **not** a large fixed tax once the registry is cheap (RENDER 26 ms at budget 16 vs 14 ms baseline median, largely within host noise across runs), but it is not zero either. This is a reason to prefer the smallest budget that §3.2 + §10's measurement actually require, not to default to 16 out of habit.
- Frame-0 first-use cost (~52 programs compiling on first paint) is **not** addressed by this plan — that's plan 149 Phase 1 A's loading-time prewarm, gated on this plan first (§9).

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Budget picked too low → real lamps/torches culled routinely, night regression (the exact failure review 024 found at 8/12) | Do not freeze a number before §10's measurement; protect near-camera lights from cull (§3.4); overflow should be the rare case, not the normal one. |
| `registerSubtree` misses a light because a future settlement prop creates a `PointLight` outside the four known factories | Confined blast radius: the walk only needs to find `PointLight` instances under a root that's about to be added to `scene` — same pattern as any GLTF-attach code already walks its own subtree for colliders/anchors. Add a dev-only assertion (in the same spirit as existing `console.warn` fallbacks in this codebase) if a registered subtree's traversal-verified count and Three's own light collection ever diverge, to catch a missed factory early. |
| Threading the budget instance through `createSettlement`/`SettlementsManager`/`PlacedFires`/`PlayerTorch` constructors touches several call sites | Same shape as existing threaded hooks (`onAnimalDeath`, `mining`, `isLandPlotOwned`) — low novelty, mechanical change, covered by existing type-check. |
| §3.2's `light.visible` toggle interacts with something else checking `Object3D.visible` on these lamp/torch groups (e.g. an unrelated culling or LOD system) | Grep for other `.visible` reads on `HouseLight`/`VillageTorch` objects before landing; toggling only the leaf `PointLight`'s own `visible`, not its parent group, limits the blast radius to the light itself. |
| Overflow protection radius (§3.4) is a new tunable with no prior art | Start from `houseSpacing` order-of-magnitude values already in `VILLAGE_SIZE_CONFIG` (`families.ts`) rather than inventing an arbitrary constant; verify visually before/after in the benchmark protocol (§8 of plan 149). |

## 8. Rollback

- Registry + pad + visibility fix is one self-contained module plus small, additive call-site changes (register/unregister pairs) — revert by reverting the commit(s); no schema/save-data change, no persisted state.
- If `sync()`/pad causes any GL errors or visible regression not present on `main`, disable via the same URL-flag pattern already established (`?pointLightBudget=off` or equivalent) without a code revert, then investigate.
- Keep `src/perf/pointLightBudget.ts`'s validated design notes (this plan, §8) even after deleting the file, so the reasoning isn't lost if this needs to be revisited.

## 9. Relationship to plan 149

Plan 149 should not be implemented as one large refactor (its own §1). This plan is **Phase A** of the follow-on work review 024 called for:

- **Phase A (this plan):** production PointLight budget — stabilize `NUM_POINT_LIGHTS` for real.
- **Phase B:** re-run plan 149's program census (`dumpProgramFirstUse()` / `?programCensus`) against this plan's shipped state, confirm the ~62-program plateau holds and characterize what's left.
- **Phase C:** the leftover instancing/mask variant axis review 022/023 already identified (`Green`/`Wood`/`MI_WindowGlass` duplicate cacheKeys unrelated to lights).
- **Phase D:** only once B and C leave a small, stable program-family set, revisit plan 149's loading-time `compileAsync()` prewarm (Phase 1 A) — do not start Phase D before this plan lands and Phase B confirms stability.

Do not revive per-chunk/per-tick/full-scene `compileAsync()` (plan 149 §6.2/6.3, already rejected) as part of any phase here.

---

## 10. Open questions requiring a small Cursor benchmark before freezing a budget number

Do **not** guess between 16/21/24 — measure, on real GPU (Cursor embedded browser, `WEBGL_debug_renderer_info` confirmed, per plan 149 §18), after landing §3.2's visibility fix but **before** enabling the pad:

1. **True concurrent-ON max.** With `light.visible` now tracking `intensity > 0`, dump `numPointLights` (already instrumented via program census, review 022) across: (a) a full day→night transition sitting still in the home settlement + its 2 eager neighbors, (b) a night-time sprint that crosses into a 4th/5th settlement's load radius (the scenario review 024's "21" came from, but that included always-visible off lamps — re-measure with the fix). Small, bounded: a handful of runs, not a new benchmark scenario.
2. **Is 21 still reachable?** If the true max drops well below 16 once off lamps stop counting, a smaller budget is both simpler and cheaper (§6) — don't default to 16 out of the diagnostic experiment's inertia.
3. **Multi-settlement worst case.** Does `unloadRadius` (world units, chunk-derived) ever keep more than 3 settlements loaded at once on a realistic playtest route? If so, that's the scenario to size the budget against, not a single settlement's own lamp/torch count.
4. **Protection radius (§3.4).** What near-camera radius is large enough that overflow-cull never visibly darkens anything the player is actually looking at, without being so large it defeats overflow protection entirely? A couple of manual visual checks at dusk near a lit torch cluster should answer this.

If (1)–(3) show the true concurrent-ON max is small and stable (e.g. consistently under 12–16 across realistic play), freeze that as the budget with a small headroom margin and treat overflow-cull as a rare degrade path, not routine behavior. If it's still highly variable even after the visibility fix, that's a signal to revisit whether some lights (e.g. distant torches) should have their intensity/range reduced or their "on" trigger changed (a settlement-design question, out of this plan's scope) rather than raising the budget indefinitely.

---

## 11. Success criteria

- `NUM_POINT_LIGHTS` (and hence unique program cacheKeys attributable to the light axis) is constant across a full day/night cycle and normal settlement streaming, without `Object3D.prototype` patching and without a per-frame full-scene traversal.
- `sync()` cost stays in the review-024-validated range (≤ ~0.2 ms) at realistic registry sizes.
- No routine visible darkening of lit lamps/torches/campfires near the player during normal play (overflow-cull, if it fires at all, only affects lights outside the protection radius, §3.4).
- Settlement load/unload and `PlacedFires` spawn/despawn behave identically to `main` from the player's perspective — the registry is purely additive bookkeeping on existing lifecycle calls.
- `src/perf/pointLightBudget.ts`'s diagnostic pad and its `Object3D.prototype` patch are gone from any code path that runs by default (either deleted or explicitly superseded by the production module, §4).
- Program census (plan 149 Phase B) re-confirms the ~62-program plateau on the production path, not just the diagnostic pin.
