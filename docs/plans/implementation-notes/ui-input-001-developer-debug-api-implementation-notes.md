# Implementation Notes: Developer Debug API

## Review findings

- The plan matches the current architecture: `window.seedvale.debug` already exists and is installed only when `isDebugMode()` is true. Extend `src/debug/npcDebugApi.ts`; do not introduce another global or a `DebugManager`. fileciteturn5file0L2-L6 fileciteturn16file0L2-L6
- NPC lookup is already implemented correctly in `src/debug/npcInspector.ts`: every lookup walks `bundle.settlementsManager.getLoaded()` and does not cache `NpcAgent` references. Reuse `findNpcById`/`queryNpcs`; do not duplicate the lookup layer. fileciteturn6file0L2-L6
- `WorldBundle` is intentionally a mutable lifetime-stable container whose fields are replaced during rebuild. Debug closures must capture the `bundle`, then read `bundle.*` at call time. Never capture `bundle.chunkManager`, `settlementsManager`, etc. into a closure once. fileciteturn7file0L2-L2

## Recommended architecture

- Keep the public API in `src/debug/npcDebugApi.ts` (or split only if it becomes materially large). The API should be projections + closures over the live `WorldBundle`.
- Add small pure helpers for projections/location selection so deterministic selection can be unit-tested without a browser.
- Public results should contain plain data (`id`, strings, numbers, `{x,y,z}` or equivalent), never `Vector3`, `Object3D`, `Settlement`, `NpcAgent`, `Chunk`, or other runtime objects.
- For handles such as `debug.village(id)`, resolve the village by id on every call/operation. `teleportHere()` must not retain a `Settlement` reference across streaming/rebuild.

## Villages

- `SettlementsManager` currently publicly exposes `getLoaded()` plus `peekDef(cell)`, while its internal `entries` map owns settlement definitions/lifetimes. It also maintains economy/household/NPC state independently of streamed `Settlement` instances. fileciteturn9file0L2-L2
- Therefore do **not** implement `villages()` as a second debug registry or as a permanent map of runtime settlements.
- First decide the intended semantics explicitly: `getLoaded()` is only currently instantiated settlements; the generator can deterministically derive a `SettlementDef` for a grid cell. The debug API needs a bounded, deterministic way to enumerate known/existing settlement defs if `villages()` is meant to include streamed-out settlements. Prefer exposing a lightweight owner-level method on `SettlementsManager` (e.g. a snapshot/projection of known defs), rather than exposing its internal `entries` map.
- `village(id)` should use that owner-level definition lookup where possible. If the chosen contract is "loaded only", document that clearly in the API/help instead of silently implying all villages exist in memory.
- `SettlementDef` already has stable grid-derived identity and position; use it for location/projection data rather than runtime mesh state. fileciteturn24file0L2-L6

## Location queries

- Do not scan rendered chunks or scene objects. The terrain/world samplers are deterministic and already exposed through `WorldContext`: height, continentalness, mountain ridge, moisture, forest factor and forest biome. `WorldContext` deliberately delegates sampler calls through the current `ChunkManager`, making it suitable for rebuild-safe queries. fileciteturn18file0L2-L6
- Mountain: use `sampleMountainRidge` (or the established mountain classification helper) with a deterministic bounded search. Avoid probing the whole world. Prefer a deterministic expanding/ring/grid search around the player, then choose the best candidate by score/distance.
- Deep forest: use the existing forest biome/density source (`sampleForestBiome` / `sampleForestFactor` or the canonical biome helper), not rendered tree density. The exact threshold should come from the current forest implementation; do not invent a second definition of "deep forest".
- River: reuse `riverNetwork`/`riverChannelSegmentsNear` and the same canonical river chains used for rendered water. The river system is tile-based (`RIVER_TILE_SIZE = 256`) and deterministic; do not generate another river path or scan arbitrary chunks. fileciteturn22file0L2-L6
- Ocean: `WorldOcean` is only a follow-the-player render plane; it has no geographic nearest-point query. Do not use its mesh position as an ocean location. Use the same procedural continentalness/coast/water classification that determines ocean vs land, with a bounded deterministic search. fileciteturn23file0L2-L6
- Village: use settlement definitions/manager, not terrain sampling.
- All `Nearest` queries should use the **same deterministic search policy** (fixed directions/rings, fixed maximum radius, stable tie-breaker). This prevents console results changing because of iteration order or streaming.
- Return `null` when no qualifying candidate is found inside the fixed search budget. Do not fall back to an arbitrary point.

## Teleport

- The plan's key requirement is that teleport uses the existing player movement/teleport primitive and the existing world-loading path. Do not set `player.position` and do not manipulate chunks/scene objects from the debug layer.
- Before implementing, locate the current authoritative player-position mutation/teleport path in `PlayerController`/`createApp.ts` and reuse it. The current app composition already owns `PlayerController` and `WorldBundle`, so pass a narrow callback into the debug API rather than giving the debug module broad player access. fileciteturn14file0L2-L6
- Teleport-to-location must call `locations.*` first and then the shared teleport primitive. Avoid duplicate location logic in `teleportTo.*`.
- Teleporting to a streamed village/location should first use the existing mechanism that ensures the destination terrain/settlement is ready, then place the player on valid ground. Do not directly force chunk creation from the debug API.
- Use a small safe offset for destinations such as river/ocean/mountain if the existing teleport primitive expects walkable ground; the offset should be part of the destination projection/teleport policy, not a scene hack.

## Debug API shape / lifecycle

- Extend `SeedvaleDebugApi` instead of replacing it. Preserve `npc`, `npcs`, and `setFrenzyWolf` unchanged except for shared lookup plumbing. Existing code relies on the current live-bundle behavior. fileciteturn5file0L2-L6
- `window.seedvale = { ...window.seedvale, debug: api }` is already the correct installation pattern; preserve it so future debug surfaces can coexist. fileciteturn5file0L2-L6
- Keep debug-only exposure gated by `isDebugMode()`. The module itself should remain harmless when imported in normal builds.
- `help()` should be static/short and describe the actual public methods, not implementation details.

## Tests / pitfalls

- Test that no `window.seedvale.debug` is installed when `?debug` is absent/false.
- Test API shape without constructing a full browser UI.
- Test NPC/village lookup after a settlement unload/reload and after `WorldBundle` rebuild; stale runtime references must not survive either operation.
- Test location selection with fixed seed/player position and verify repeated calls return the same projection.
- Test `null` when the bounded search finds no candidate.
- Test teleport delegation with a spy callback: `teleportTo(location)` must not contain its own nearest-location search.
- Be careful with river/ocean queries: a naive large-area sampling loop can become a noticeable DevTools hitch. Keep the search bounded and cache only deterministic, immutable intermediate data if necessary; do not cache runtime entities.
- Do not make `villages()` force-load every settlement. That would defeat streaming and can turn a console inspection call into a large async/world-build operation.
- Do not expose internal settlement `entries`, `Settlement`, or `Object3D` values merely to make the API easier to implement.

## Verification

Run `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, and `pnpm run test`. Then manually verify with `?debug=1` in DevTools, including the location calls, `teleportTo.villageNearest()`, and a second pass after settlement/world streaming or rebuild. The current project explicitly treats passing technical checks as insufficient proof for browser-only behavior. fileciteturn0file0L2-L2
