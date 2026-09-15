# Plan: Streaming visual horizon and distant occlusion

**Created:** 2026-09-15
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** world-terrain-026
**Domain:** `world-terrain`
**Type:** `fix`
**Subdomains:** `terrain` `chunks` `rendering` `landmarks`
**Tags:** `streaming` `fog` `lod` `settlements` `caves` `horizon`
**Roadmap:** -

## 1. Problem

The streamed world currently has independent visual lifecycles whose distance contracts do not guarantee that supporting terrain is visible whenever terrain-dependent presentation is visible.

Observed symptoms:

1. A distant mountain cave can expose bright sky/background through the real terrain aperture before the expected cave presentation reads correctly.
2. Settlement buildings can remain visible against the sky after the mountain/slope that supports them has already disappeared from the streamed terrain region, making houses appear to float.

The second symptom is a direct lifecycle mismatch:

- terrain defaults to `chunkSize = 64`, `loadRadius = 3`, `unloadRadius = 4` in `src/config/worldConfig.ts`;
- terrain chunks outside the desired load ring are not guaranteed to exist even though already-loaded chunks may survive into the unload hysteresis ring;
- settlements use independent world-unit streaming thresholds `SETTLEMENT_LOAD_RADIUS = 300` and `SETTLEMENT_UNLOAD_RADIUS = 420` in `src/app/worldBundle.ts`;
- home settlement presentation is long-lived while only the existing home chunk block is pinned;
- outdoor scene fog is driven by day/night + weather and can currently remain visibly transparent beyond the guaranteed terrain load horizon.

Therefore the engine can legally enter this presentation state:

```text
terrain-dependent object visible
+ supporting terrain chunk absent
+ outdoor fog not yet opaque
= object silhouetted against clear sky / visible streaming edge
```

This is a presentation-horizon problem. It must not be solved by tying simulation existence to the camera.

## 2. Existing mechanisms to reuse

Current ownership already provides the required seams:

- `src/config/worldConfig.ts`
  - owns `terrain.chunkSize`, `terrain.loadRadius`, `terrain.unloadRadius`;
- `src/terrain/chunkManager.ts`
  - owns terrain load/unload lifecycle around the player;
  - `loadRadius` is the guaranteed desired ring; `unloadRadius` is hysteresis and must not be treated as guaranteed forward coverage;
- `src/world/dayNight.ts`
  - produces base outdoor `fogNear` / `fogFar`;
- `src/world/weatherVisuals.ts`
  - `applyWeatherOverlay(...)` modifies outdoor fog for weather;
  - `resolveSceneFog(...)` is the final cave-vs-outdoor fog selection seam;
- `src/app/gameLoop.ts`
  - applies the resolved fog to `scene.fog`;
- `src/settlement/SettlementsManager.ts`
  - intentionally owns settlement simulation/presentation streaming independently of terrain chunk thresholds;
- `src/app/worldBundle.ts`
  - owns the fixed settlement streaming radii and constructs the world systems from the same `WorldConfig`;
- `src/world/caves/caveHeightfieldPresentation.ts`
  - `createCaveMouthProxy(...)` already provides cheap presentation-only backing using the authoritative cave mouth contour;
- `src/world/createCaves.ts`
  - already owns cave full-presentation/proxy lifecycle.

Do not introduce another world-streaming manager, cave representation or settlement state owner.

## 3. Architectural decision

Introduce one explicit **terrain visual horizon contract** derived from terrain streaming configuration and use it to cap distant outdoor visibility.

The contract answers:

> Up to what distance can presentation safely assume that normal streamed terrain exists strongly enough to support visible world objects?

It must be derived from `chunkSize` + `loadRadius`, not from `unloadRadius`.

`unloadRadius` is retention hysteresis, so using it as the visual guarantee allows camera-direction dependent holes: chunks behind/recently visited may exist while equally distant forward chunks do not.

The terrain visual horizon is presentation-only. It must not affect:

- simulation distance;
- settlement load/unload decisions;
- NPC/fauna off-screen simulation;
- collision or height queries;
- world generation;
- persistence.

Preferred relationship:

```text
terrain desired streaming coverage
        ↓
terrain visual horizon
        ↓
outdoor horizon fog/fade
        ↓
terrain-dependent meshes become unreadable
before missing terrain can expose sky
```

## 4. Terrain visual horizon contract

Add a small pure helper in a terrain/rendering-owned module, preferably a narrow new file such as:

`src/terrain/terrainVisualHorizon.ts`

Suggested public shape:

```ts
export type TerrainVisualHorizon = {
  fadeStart: number
  opaqueAt: number
}

export function terrainVisualHorizon(input: {
  chunkSize: number
  loadRadius: number
}): TerrainVisualHorizon
```

Exact constants should be chosen during implementation from the current chunk geometry/streaming semantics, but the invariant is mandatory:

- `opaqueAt` must remain inside the distance where terrain coverage can be relied upon for arbitrary camera direction;
- `fadeStart < opaqueAt` with enough transition width that the streaming boundary is not visible as a hard wall;
- values must scale with `chunkSize` and `loadRadius` rather than encode today's `64 × 3` configuration;
- do not use `unloadRadius` as the guarantee;
- keep the helper pure and unit-tested.

For the current default configuration, expect the resulting opaque horizon to be around the outer part of the guaranteed ~192 m load-radius region, with a safety margin rather than exactly at the mathematical edge.

Add JSDoc and `@domain world-terrain` because this becomes an architectural rendering contract used outside the terrain module.

## 5. Integrate horizon with outdoor fog

Extend the existing fog pipeline rather than adding a second fog object/system.

Preferred integration point: `src/world/weatherVisuals.ts` around `resolveSceneFog(...)`, with the terrain visual horizon passed from world/app ownership.

Required behavior:

```text
base day/night fog
  -> weather overlay may make fog stronger/nearer
  -> terrain visual horizon may only make outdoor fog stronger/nearer
  -> cave interior override remains authoritative when inside a cave
```

The visual-horizon cap must never weaken weather fog.

Conceptually:

```ts
outdoorFogFar = Math.min(weatherFogFar, horizon.opaqueAt)
outdoorFogNear = Math.min(weatherFogNear, horizon.fadeStart)
```

The implementation does not need to use this exact formula if preserving a good transition requires a slightly different pure helper, but preserve these invariants:

- clear weather/daylight cannot see through the terrain streaming edge;
- rain/fog/storm remain at least as foggy as today;
- cave interior fog remains unchanged;
- fog color continues to come from day/night/weather rather than introducing a separate arbitrary horizon color;
- no per-object material replacement is required for standard fog-aware terrain/settlement meshes.

Thread the already-existing terrain config/horizon through the narrowest app/world boundary. Do not make `weatherVisuals.ts` read global config directly.

## 6. Settlement presentation contract

Do **not** reduce `SETTLEMENT_LOAD_RADIUS` / `SETTLEMENT_UNLOAD_RADIUS` to terrain distance.

Settlement existence and simulation must remain independent from the player's camera/render horizon.

The new visual contract is:

> A settlement may remain loaded/simulated beyond terrain visual range, but ordinary terrain-dependent settlement presentation must be effectively hidden by the shared outdoor horizon before its supporting terrain can disappear.

Initially prefer the shared scene-fog solution because settlement house/prop materials already participate in the normal scene rendering pipeline. Do not add per-house distance checks unless recon during implementation identifies specific settlement materials with `fog = false` or custom shaders that bypass scene fog.

If such bypasses exist, fix those materials to honor the shared horizon/fog where semantically correct instead of creating a settlement-specific distance manager.

Preserve existing settlement streaming and eager-neighbor behavior.

## 7. Cave regression handling

`world-terrain-026` already implemented the correct architecture for distant cave mouths:

- persistent real `TerrainCutout`;
- cheap `createCaveMouthProxy(...)` derived from the same `mouthOpeningAt` contour;
- full cave presentation remains streamed at its existing near thresholds.

Do not replace this with horizon fog and do not create another cave LOD.

During implementation, reproduce/check the reported distant bright opening against current `main` and verify two layers:

1. **Local correctness:** while the full cave presentation is inactive but the aperture is within readable range, the existing proxy fully blocks external sightlines to bright sky/background.
2. **World-horizon correctness:** once the cave itself approaches the terrain streaming horizon, shared outdoor fog hides the entire terrain/cave transition before the streamed world ends.

If the first condition fails, fix `world-terrain-026`'s existing proxy geometry/lifecycle in:

- `src/world/caves/caveHeightfieldPresentation.ts`;
- `src/world/createCaves.ts`;
- focused cave tests.

Allowed fixes include contour coverage, backing depth/orientation, bounding/frustum behavior or lifecycle ordering. Do not duplicate cave topology or raise full cave interior streaming distance as the primary fix.

## 8. Fog bypass audit

Perform a focused audit only for presentation classes that can visibly cross the terrain horizon:

- terrain chunk material;
- settlement building/prop materials;
- cave mouth proxy / relevant exterior cave presentation;
- major landmark materials that can silhouette against sky;
- existing custom shaders with explicit `fog` handling.

The goal is not a repository-wide material refactor. Only fix confirmed horizon-visible bypasses.

Preserve deliberate exemptions such as the sky dome and cave-interior-specific presentation where the current architecture requires them.

## 9. Tests

Add focused pure/unit tests rather than browser automation.

### Terrain horizon

At minimum verify:

1. horizon scales deterministically with `chunkSize` / `loadRadius`;
2. `fadeStart < opaqueAt`;
3. `opaqueAt` never derives from or expands to `unloadRadius` hysteresis;
4. default config produces a horizon inside the guaranteed terrain region;
5. very small supported load radii still produce a valid positive transition.

### Fog composition

Extend `src/world/weatherVisuals.test.ts` (or a narrow new pure test) so:

1. clear/day outdoor fog is capped by the terrain horizon;
2. stronger weather fog is not pushed farther away by the horizon logic;
3. cave interior fog remains exactly `CAVE_INTERIOR_FOG_*` regardless of terrain horizon;
4. lightning changes color/intensity as today and cannot accidentally bypass horizon distances.

### Cave regression

Extend existing cave tests when needed so:

1. inactive full presentation has a non-empty proxy for production cave mouths;
2. proxy covers the aperture from external sightlines relevant to the reported failure;
3. full-presentation activation/deactivation preserves proxy ordering with no naked-hole state;
4. proxy remains presentation-only and does not alter cave spatial queries.

Do not add browser/E2E verification for this plan; manual visual verification belongs to the User.

## 10. Performance constraints

This fix should reduce rendering ambiguity without materially increasing world cost.

Guardrails:

- no increase to terrain `loadRadius` as the primary solution;
- no extra terrain chunks solely for distant visual support;
- no per-frame world-wide object scans;
- no per-object distance calculation for all settlement props unless a confirmed fog-bypass requires a bounded exception;
- no new render pass;
- no extra full cave presentation distance;
- pure horizon/fog computation should be O(1) and reuse existing day/night/weather update cadence;
- no coupling between camera presentation and authoritative simulation state.

## 11. Non-goals

This plan does not:

- implement macro-terrain / clipmap / far-mountain geometry;
- increase camera `far` distance;
- increase terrain streaming radius;
- shrink settlement simulation or streaming radius;
- unload NPCs/buildings because the player cannot see them;
- redesign settlement LOD;
- replace cave terrain cutouts with fake entrances;
- add volumetric fog;
- redesign weather or ground-fog systems;
- solve reflection-only visibility/culling unless the main-camera fix exposes a directly related regression.

A future far-terrain/macro-LOD plan may extend the visual horizon outward. This plan deliberately establishes the contract first so such a system has one integration seam instead of another independent distance mechanism.

## 12. Implementation order

1. Add and test the pure terrain visual horizon helper from `chunkSize` + `loadRadius`.
2. Thread the horizon through the existing world/app rendering boundary.
3. Cap outdoor fog through the existing day/night → weather → `resolveSceneFog` pipeline.
4. Run a focused fog-bypass audit for terrain-dependent exterior presentation and fix only confirmed bypasses.
5. Reproduce the cave symptom; if proxy coverage/lifecycle still leaks bright background, repair the existing `world-terrain-026` implementation rather than adding another mechanism.
6. Add/extend focused tests for horizon composition, weather/cave fog precedence and cave proxy regression.
7. Update relevant state/rendering documentation if the new visual-horizon contract becomes part of current architecture.

## 13. Verification

Technical verification:

```text
npx tsc --noEmit
pnpm run test -- <focused terrain-horizon/weather/cave tests>
```

Run broader lint/build only if touched code or repository conventions require it.

Manual browser verification belongs to the User. Verify at minimum:

- mountain slopes fade naturally before the streamed terrain boundary becomes visible;
- settlement houses never remain sharply visible floating against sky after their supporting slope disappears;
- approaching/retreating from the horizon does not create obvious hard fog popping;
- clear noon remains readable in the mid-ground rather than becoming an unnecessarily short fog wall;
- rain/storm/natural fog still look at least as dense as before;
- distant cave mouths never show bright sky/background through their cutout;
- approaching a cave transitions proxy → full presentation without a visible naked-hole frame;
- cave interiors keep their dark local fog;
- settlement/NPC simulation behavior and streaming distances are unchanged.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
