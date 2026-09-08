# Implementation Notes: Settlement Cemeteries & Abandoned Graveyards

**Reviewed:** 2026-09-08  
**Plan:** `world-terrain-016-settlement-cemeteries-and-abandoned-graveyards.md`

## Review conclusion

Current `main` still has the old model: one probabilistic cemetery candidate per chunk, accepted only on a settlement fringe. `WorldLocationCatalog` then maps a settlement to the first nearby cemetery it can find. The implementation must replace that ownership model rather than layer assignment metadata on top of nearest-landmark lookup.

The correct boundary is a small deterministic **settlement-topology / cemetery-assignment resolver** shared by terrain generation and consumers. Do not make `WorldLocationCatalog` the authority: streamed cemetery generation runs through the terrain worker path and must use the same assignment relation without depending on discovery/map code.

## Current code that matters

### `src/terrain/chunkEnvironment.ts`

- `resolveCemeteryPlacement()` currently owns the complete cemetery RNG/gating path:
  - independent stream `seed ^ hashChunk(..., 7) ^ 0x6a18d`,
  - weighted `rollCemeterySize()`,
  - one random point inside the chunk,
  - local height/road/slope checks,
  - `cemeteryFitsVillageFringe()`,
  - `cemeteryFootprintClearsRoads()`,
  - final `CEMETERY_CHANCE = 0.28`,
  - `deriveLandmarkId(seed, cx, cz, 'cemetery', 0)`.
- `CEMETERY_MARGIN_BY_SIZE` keeps the complete grave grid inside one chunk. Preserve this invariant unless there is a deliberate replacement; cross-chunk grave geometry would broaden the change considerably.
- `cemeteryFitsVillageFringe()` mixes two concerns: fringe intent and clearing rejection. Extract/reuse the clearing/physical part rather than forcing shared cemeteries through the single-village fringe rule.
- `cemeteryFootprintClearsRoads()` and `cemeteryGraveLayout()` are already the correct footprint source; do not approximate MD/LG cemeteries as a point.

### `src/terrain/chunkManager.ts`

- `findLandmarkNear()` returns loaded landmarks from `rec.tile.environment`; unloaded cemetery lookup uses `resolveUnloadedLandmark()`.
- `resolveUnloadedLandmark('cemetery')` already uses the lightweight `createLocalTerrainSampler()` + `resolveCemeteryPlacement()` path introduced by `world-014`. Preserve this optimization; do not reintroduce full `computeChunkTile()` scans.
- `paramsFor()` is the existing main-thread boundary that already gathers settlement clearings/regional disks and road segments before data goes to terrain generation. If the worker needs small serializable cemetery-assignment inputs, extend this existing data path rather than teaching the worker or `WorldLocationCatalog` how to generate settlements independently.
- The documented river caveat from `world-014` still exists for unloaded lookup (`paramsFor(coord, [])`). Do not accidentally claim stricter loaded/unloaded parity than the code currently provides.

### `src/settlement/settlementGenerator.ts`

- `SettlementDef.id` is stable from grid coordinates; use it for assignment tie-breaks and assignment identity.
- `SETTLEMENT_GRID_STEP = 280`; `cellsWithinRadius()` and `cellFromId()` already provide bounded local topology traversal.
- `SettlementDef.size` and `families.length` are both deterministic. Prefer `size` as the primary cemetery-size signal; it is the already-authoritative scale classification and avoids cemetery sizing changing because family-generation details are later retuned. `families.length` can be a secondary tie/variation input if needed.
- `cellSeed()` exists for stable per-settlement seeded variation. Reuse it or the existing seeded/hash utilities; no `Math.random()`.

### `src/settlement/SettlementsManager.ts`

- `peekDef(cell)` is the runtime settlement-definition lookup without loading meshes. Do not require settlements to be streamed/instantiated for cemetery assignment.
- Assignment must therefore be based on generated definitions/topology, not `getLoaded()` or settlement runtime lifetime.

### `src/world/locations/worldLocationCatalog.ts`

- `cemeteryForSettlement()` currently caches `findLandmarkNear(... settlement position ...)`; this is nearest-search semantics and must become canonical assignment lookup.
- `cemeteryCandidates()` currently assumes every cemetery belongs to a settlement and discovers cemeteries only by enumerating nearby settlements. This will miss abandoned wilderness cemeteries unless an explicit bounded abandoned-cemetery candidate path is added.
- `cemeteryCache` already has the right rebuild lifetime. Reuse/invalidate it, but cache assignment results rather than heuristic nearest results.
- `getById(cemetery:...)` currently parses chunk coordinates from the landmark id and resolves radius `0`. Any cemetery-id change must update this resolver and save/discovery compatibility handling together.
- Existing dedupe is by `WorldLocation.id`; shared cemeteries therefore need one physical/stable id returned for both settlement assignments.

## Recommended ownership and data shape

Create one pure, worker-safe assignment module near the terrain/settlement boundary (exact filename can follow the implementation), with plain-data results conceptually equivalent to:

```ts
type CemeteryAssignment = {
  assignmentId: string
  servedSettlementIds: readonly string[] // 1 or 2; [] only for abandoned placement metadata
  anchor: { x: number; z: number }
  intent: 'dedicated' | 'shared'
  size: CemeterySize
}
```

The important part is not this exact type; it is that **pairing/assignment is computed once by one pure mechanism** and terrain placement plus World Locations consume it. Do not store mutable assignment state in `EnvironmentPlacement` or SaveData just to make reverse lookup easy.

For `SM` pairing, inspect only a fixed small grid neighborhood and canonicalize the pair (`min(id), max(id)`). A settlement must make the same pairing decision even when queried from the other member or from a neighboring chunk. Avoid a greedy algorithm whose output depends on iteration/query order.

A practical deterministic rule is mutual-best local pairing: each eligible `SM` ranks eligible nearby `SM`s by distance then stable id; share only when A chooses B and B chooses A. This is local, order-independent, naturally caps sharing at two, and needs no global claimed-set. If a different rule is chosen, tests must prove query-order independence.

## Placement: important chunk-ownership trap

The old generator is chunk-owned: one cemetery candidate belongs to one chunk and its entire footprint must remain inside that chunk. Assignment-driven placement is settlement-owned. Do not simply let every nearby chunk independently search around the same settlement assignment; that can create duplicate physical cemeteries with different chunk-derived ids.

Before terrain validation, define a deterministic **placement-owner/candidate sequence** for each assignment. Every caller must derive the same ordered candidate list from the assignment id/anchor. Candidate evaluation may widen, but only the first valid candidate is the cemetery. A chunk emits it only if that winning candidate belongs to that chunk.

This also keeps unloaded lookup and normal streamed generation capable of agreeing without scanning the world. Keep the search bounded and cache the resolved result by assignment id for the session.

For dedicated cemeteries, reuse the settlement fringe as a preference/search band. For shared cemeteries, use midpoint/corridor anchors but the same lower physical validation. Shared placement failure must fall back to two independent dedicated assignments without changing pairing decisions of unrelated settlements.

## Physical validation

Keep one shared validation layer for both active and abandoned cemeteries:

- water/dry-ground gate,
- slope threshold,
- road tint / road-footprint clearance,
- real `cemeteryGraveLayout()` footprint,
- chunk-boundary margin,
- settlement clearings where relevant.

Do not duplicate these checks in `WorldLocationCatalog` or an assignment module. Assignment answers **who**; terrain resolver answers **where**.

The existing lightweight terrain sampler from `world-014` should remain the basis for bounded off-screen candidate evaluation. Avoid full tile/vegetation/environment materialization for each attempted candidate.

## Active vs abandoned generation

Remove `CEMETERY_CHANCE` from the active-settlement existence decision. Active cemeteries are assignment-driven.

Keep abandoned generation as a separate deterministic wilderness path. Do not reuse `0.28`: that value was viable only because `cemeteryFitsVillageFringe()` was already an extremely strong rarity gate.

Abandoned placement needs a bounded settlement-separation test based on settlement grid/definitions, not loaded settlements. It should still use the normal physical validation and normal cemetery renderer/Hidden Finds path.

`WorldLocationCatalog.cemeteryCandidates()` must gain a way to enumerate abandoned cemeteries in the requested map range; otherwise they will exist physically but never become discoverable World Locations. Keep this bounded/coarse — do not restore a global chunk scan.

## Stable identity and save compatibility

This plan cannot safely assume the current id scheme remains sufficient.

Today cemetery id is `cemetery:<cx>:<cz>:0:<seed36>`. With assignment-driven active cemeteries plus abandoned cemeteries, more than one logical cemetery may compete for the same chunk, and a shared cemetery needs identity tied to one canonical assignment rather than whichever settlement queried it first.

Prefer an id derivable from the canonical cemetery assignment identity (for example the canonical served-settlement id tuple) and a separate deterministic abandoned identity. If the existing chunk-based id can be preserved without collision/ambiguity, do so; otherwise change it deliberately and update `WorldLocationCatalog.getById()` in the same change.

Compatibility consequence: existing saves may contain old cemetery ids in `LocationKnowledge`, navigation targets and `resolvedHiddenFindSpotIds`. There is no reliable semantic migration from old random fringe cemeteries to new assignment cemeteries if placement changes. It is acceptable for stale location targets/discovery ids to fail validation and for old resolved Hidden Find spot ids to become inert, but document this explicitly; do not silently invent nearest-cemetery remapping.

## Existing grave-robbing consumer must be addressed

`src/app/actions/groundActions.ts::checkHiddenFindDig()` is already implemented beyond what the plan text assumes:

- it uses `villageNearest({x,z})` for cemetery loot profile,
- it also uses that nearest settlement id for the grave-disturbance `SocialConsequence`.

Once abandoned/shared cemeteries exist, this is no longer a valid ownership heuristic. At minimum, expose the canonical reverse lookup (`cemeteryId -> servedSettlementIds`) so this code does not reconstruct ownership geometrically.

Do **not** invent the final reputation policy for a two-settlement shared cemetery in this plan if it is still intentionally out of scope. However, do not leave nearest-settlement targeting masquerading as canonical ownership. Either make the smallest explicit policy decision required by current gameplay, or isolate the policy behind a follow-up seam while ensuring abandoned cemeteries return no served settlement.

The loot profile has the same hidden assumption. For active cemeteries, derive the size input from the served settlement(s)/cemetery assignment rather than nearest geometry. For abandoned cemeteries, use an explicit deterministic fallback profile (current `resolveHiddenFindLoot()` already falls back to `SM` when size is undefined), not a nearby unrelated settlement.

## Downstream plans / dependencies

`npc-026` implementation notes already treat this plan as the owner of settlement↔cemetery assignment, and expect `npc-011` burial to persist the chosen cemetery/grave position. Keep the public seam simple enough for those future consumers:

```text
settlementId -> assigned active cemetery
cemeteryId -> servedSettlementIds
```

Future burial/visits must not call nearest-cemetery search.

No new SaveData segment is needed for assignment in V1. Runtime caches should invalidate with world rebuild exactly as the current World Location cemetery cache does.

## Tests with highest value

Focus on pure deterministic tests rather than large integration fixtures:

- pairing is identical regardless of settlement/query iteration order;
- each settlement resolves exactly one active cemetery; shared `SM`s resolve the same id;
- `MD/LG/XL` never adopt a closer cemetery belonging to someone else;
- shared placement failure produces two dedicated cemeteries and does not perturb unrelated pairs;
- active and abandoned paths cannot produce duplicate ids/placements in one chunk;
- abandoned separation rejects cemeteries near live settlements;
- dedicated/shared paths reuse the same physical road/water/slope/footprint gates;
- loaded generation and lightweight unloaded lookup resolve the same assignment/placement under the same terrain inputs;
- `WorldLocationCatalog` dedupes shared cemetery and can discover abandoned cemeteries;
- `getById()` round-trips every supported cemetery-id form;
- reverse lookup returns 1/2 ids for active and `[]` for abandoned;
- grave-robbing does not assign abandoned cemetery consequences/loot scale from an unrelated nearest settlement.

Keep existing `chunkEnvironment`, `chunkManager`, and `worldLocationCatalog` regression suites; extend them instead of creating a broad end-to-end harness.

## Suggested implementation order

1. Add pure assignment/pairing resolver + tests; no rendering changes yet.
2. Define stable assignment id and deterministic placement-owner/candidate sequence.
3. Refactor current cemetery physical gates so dedicated/shared/abandoned can share them without changing old behavior accidentally.
4. Implement active dedicated/shared bounded placement with lightweight terrain sampling and cache by assignment id.
5. Add abandoned generation/separation with its own low probability.
6. Wire streamed environment + unloaded lookup to the same resolver; remove active `0.28` existence roll.
7. Replace `WorldLocationCatalog.cemeteryForSettlement()` nearest semantics and add reverse lookup + abandoned discovery.
8. Fix the existing grave-robbing nearest-settlement assumptions at the new assignment seam.
9. Run focused unit/build checks; browser/world visual verification remains for the user.

For new exported assignment/placement resolvers, add concise JSDoc describing deterministic ownership and use `@domain world-terrain` where appropriate.