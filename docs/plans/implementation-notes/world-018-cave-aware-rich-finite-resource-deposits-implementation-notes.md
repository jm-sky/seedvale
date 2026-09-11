# Implementation notes — world-018 — Cave-aware rich finite resource deposits

## Current-main findings that matter

- `world-terrain-019` is the remaining production cave spatial dependency (`world-terrain-008` is `done`); `world-terrain-017` and `npc-027` are still `planned`. Full mine content is therefore blocked on the final production cave spatial API and the abandoned-mine landmark contract. Generic reserve/deposit refactoring can be prepared earlier, but do not implement against transitional spike/V1 details.
- `src/terrain/naturalResources.ts` is still a **surface environmental descriptor**: `NaturalResource` has `id/type/x/z/radius/richness`, is generated from the surface resource grid, and is also consumed by settlement-site/resource-significance logic. Do not turn it into a general cave/world-object state bag.
- `src/terrain/resourceDeposits.ts` is currently surface-only in several separate places, not just in `queryNearest()`:
  - runtime instances retain a `NaturalResource`;
  - `recheck()` discovers candidates only through `resourcesNear()`;
  - pile scatter calls `env.sampleHeight(px, pz)` / `placeOnGround(...)`;
  - label Y calls `env.sampleHeight(resource.x, resource.z)`;
  - `DepositTarget` exposes only `x/z`;
  - distance/query filtering is XZ-only.
  Cave support must remove these assumptions at the canonical mineable-deposit boundary rather than patching only NPC/player consumers.
- `src/terrain/depositMining.ts` already has the correct authoritative depletion model: one caller-owned `ResourceDepletionState = Map<string, number>`, `0` is distinct from absence, and player/NPC both mutate through `ResourceDeposits.mine()`. Preserve this ownership.
- Cross-session persistence now exists: `SaveData.resourceDeposits` is a required sparse `Record<string, number>` and `createApp.ts` restores it into the shared depletion map. No new save field/store is needed for reserve capacity.
- `src/ai/npcProfessionWork.ts` currently reconstructs miner destination Y using `ctx.sampleHeight(target.x, target.z)`. This must disappear for cave-capable targets; the mining target must carry authoritative position/spatial context. Do not let NPC code independently infer cave floor.
- Current `src/world/createCaves.ts` exposes global `contains(x,y,z)`, `sampleFloor(x,z)` and `sampleCeiling(x,z)` plus `definitions()`. These queries do **not** identify which `caveId` owns a point and do not expose connectivity. `world-018` should consume the final cave-specific production contract from `world-terrain-019`, not build resource-specific cave identity/connectivity on top of these transitional queries.

## Recommended deposit model

Introduce the smallest canonical **mineable deposit definition** between resource generation/content sources and `ResourceDeposits` runtime instances. It should contain the data mining actually needs, conceptually:

```text
id
ore type
position { x, y, z }
spatial context (surface | cave identity)
richness
initial reserve override?   // optional
render/scatter radius
```

Exact naming is implementation-defined, but this boundary should be distinct from `NaturalResource` unless post-dependency code has already moved those responsibilities together.

Use adapters/sources:

```text
surface NaturalResource
→ surface mineable-deposit definition

abandoned-mine landmark + Cave V2 spatial queries
→ deterministic landmark-owned mineable-deposit definitions

both
→ one ResourceDeposits lifecycle / query / mine path
```

This avoids adding cave-only branches throughout `ResourceDeposits` and keeps settlement resource-significance semantics on `NaturalResource` unchanged.

## Reserve semantics

Extend `resolveRemaining(...)` (or its immediate definition seam) to accept an optional explicit initial reserve:

```text
persisted state has id  → persisted value wins, including 0
explicit reserve exists → use explicit reserve
otherwise               → hitsForRichness(richness)
```

Keep `recordMined()` and the shared map unchanged. Do not persist initial capacity; it is deterministic reconstructed data. This preserves existing saves and ordinary 3–7-hit procedural surface deposits without migration/rescaling.

Mine reserve distribution should be implemented as a pure deterministic helper, separately testable from rendering/streaming. Derive RNG streams from stable inputs such as `worldSeed + mineId + semantic salt`; do not consume a shared mutable RNG. Allocate integer reserves with an explicit remainder rule so the per-slot sum is exactly `totalReserve`.

## Cave placement and identity

Wait for `world-terrain-017`'s production landmark output. Consume its stable `mineId`, `caveId` and entrance/location directly; do not call terrain/cave candidate selection from the resource layer.

Define stable semantic slots first (e.g. exterior-primary, exterior-secondary, interior-shallow/mid/deep) and derive deposit IDs from `mineId + slot`. Candidate scoring may change later without changing depletion keys.

Interior placement must use Cave V2's semantic/topological/spatial data without requiring an active cave mesh. Prefer chamber/widening nodes or other production semantic candidates with cave-specific floor/clearance/connectivity validation. Never use render triangles, raycasts, object UUIDs or activation state as authoritative placement.

If Cave V2 does not ultimately expose cave-specific containment/floor/connectivity queries, that is a dependency gap to fix in `world-terrain-019`; do not duplicate them in `terrain/resourceDeposits.ts`.

## ResourceDeposits refactor details

Refactor around definitions, then keep the current runtime `instances` map and `mine()` mutation path.

Important details:

- Candidate discovery must merge ordinary surface definitions with deterministic landmark-owned definitions before normal spawn/despawn handling. Do not create a second mine registry/runtime manager.
- A runtime instance should retain the canonical deposit definition, not assume `NaturalResource`.
- `DepositTarget` should expose authoritative XYZ plus spatial context. Player and NPC consumers should use that directly.
- XZ distance may remain useful for streaming broad-phase, but mining validity must include spatial-context filtering; otherwise a surface actor can select a deposit directly below it.
- Rendering scatter must be ground-resolved by domain. Surface deposits can continue using `sampleHeight`; cave deposits need Cave V2 floor/walkability resolution for each rendered pile (or deterministic already-resolved pile positions). Label Y must come from the definition/domain, not surface terrain.
- Depleted definitions remain excluded before presentation spawn exactly as today. `dispose()` must continue to destroy presentation only and never mutate depletion state.
- Do not make resource queries responsible for routing through entrances. They may reject wrong/disconnected spatial domains; `npc-027` owns actual traversal.

## NPC integration

Preserve `SettlementMiningHooks` / shared `mine()` ownership. The current miner code's main required change is replacing:

```text
sampleHeight(target.x, target.z)
```

with the target's authoritative movement position/context produced by the mining query.

Do not partially implement cave traversal inside `npcProfessionWork.ts`. Interior NPC mining should only be enabled once `npc-027` provides the movement-target/spatial-context contract needed to reach that target and return. Until then, generic cave deposits can exist and be player-mineable without pretending NPC cave movement works.

Also recheck the current "query only loaded ResourceDeposits instances" behaviour when integrating NPC cave work. Target discovery must not accidentally depend on Player/camera cave activation. If `npc-027` or later remote-work logic requires discovering a non-presented deposit, separate **definition/query availability** from presentation streaming rather than pinning cave meshes or adding player-dependent activation.

## Tests worth adding

Prefer pure tests around contracts rather than DOM/GLTF-heavy `ResourceDeposits` integration:

- explicit reserve fallback vs `hitsForRichness`;
- persisted partial/zero override beats explicit capacity;
- stable mine deposit IDs from semantic slots;
- deterministic total reserve in 500–1000 range and exact per-slot sum;
- four-slot fallback preserves the same selected total;
- same seed/mine produces identical positions/reserves independent of unrelated RNG calls;
- surface/cave context filter rejects vertically overlapping wrong-domain candidates;
- cave deposit authoritative Y survives reconstruction without any `sampleHeight` dependency.

After dependencies land, add focused contract tests against the final Cave V2 semantic API and `world-terrain-017` landmark lookup rather than snapshotting render geometry.

## Suggested implementation order

1. Reconfirm final `world-terrain-019` and `world-terrain-017` production contracts; stop if cave-specific spatial semantics or stable mine lookup are still missing.
2. Introduce/refactor the canonical mineable-deposit definition and adapt existing surface resources with no gameplay change.
3. Add optional explicit initial reserve while keeping the existing depletion map/save format unchanged.
4. Make `ResourceDeposits` XYZ/spatial-context aware, including render grounding and shared query output.
5. Add deterministic abandoned-mine deposit-definition generation from the landmark + Cave V2 semantics.
6. Update Player interaction to consume the same target contract; then integrate NPC mining only after `npc-027`'s movement contract exists.
7. Update current-state/docs only after code behaviour is verified.

## Main pitfalls

- Treating current global `Caves.sampleFloor(x,z)` as sufficient for cave identity or stacked/multiple cave spaces.
- Adding `y/caveId/reserve` directly to `NaturalResource` and coupling settlement-generation descriptors to runtime mining concerns.
- Fixing `DepositTarget` while leaving pile scatter/labels grounded with surface `sampleHeight`.
- Deriving mine deposit IDs from candidate array order.
- Reinitializing remaining reserve from the new explicit capacity when a persisted map entry already exists.
- Making cave deposits discoverable only when their render mesh/player-proximity activation exists.
- Sneaking cave routing/pathfinding into resource queries or miner profession code.
