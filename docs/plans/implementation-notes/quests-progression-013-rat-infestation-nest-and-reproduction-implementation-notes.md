# Implementation Notes: Rat infestation nest and reproduction

Review against current `main` on 2026-09-09. These notes intentionally cover only implementation-relevant findings that are easy to miss during recon.

## Current seams to extend

- `src/settlement/storageInfestation.ts` is the authoritative long-lived infestation registry. Today it stores `StorageInfestationCondition = 'active' | 'repaired'`; `SettlementsManager` owns one registry instance and carries it through settlement streaming, `WorldBundle` rebuilds and save/load. Generalize this registry instead of adding nest-owned state elsewhere.
- `src/settlement/SettlementsManager.ts` currently exposes `snapshotStorageInfestation()`, `isStorageInfestationActive()`, `repairStorageInfestation()` and `countAliveRats()`. Update these narrow manager seams to expose the generalized state. `CreateSettlementDeps.infestationActive` is currently passed as a live callback into each loaded settlement; replace/generalize that callback rather than caching infestation state inside `Settlement`.
- The authored new-world trigger lives in `createSettlementsManager()`: `seedHomeStorageInfestation && initialStorageInfestation?.[homeDef.id] === undefined` activates the home infestation. Preserve this exact “seed only when no persisted entry exists” behavior when converting to `{ storageDamaged, nestDestroyed }`.
- `src/app/actions/storageInfestationActions.ts` already owns the physical storage-repair busy action. It commits only in the busy completion callback, charges `2 × beam`, updates inventory/HUD, then calls `questManager.pollSettlementRatInfestationObjectives()`. Add nest destruction beside this action or in the same action module; reuse `isActionBlocked`, `ctx.busy.start(...)`, completion-only mutation and the same quest poll. Do not mutate infestation state at interaction-target construction time.
- `src/quests/settlementRatInfestation.ts` is already the intended narrow pure quest seam: `SettlementRatInfestationSnapshot`, `isSettlementRatInfestationResolved()` and `settlementRatInfestationReminderLine()`. Extend this file to the three world facts; do not make `QuestManager` import settlement/fauna modules.

## Rat population / reproduction

`src/settlement/rats.ts` currently does all settlement-rat reconciliation every `RAT_RECONCILE_INTERVAL_DAYS = 0.5`:

- `ratNormalPopulationTarget()` subtracts `dogCount * RAT_DOG_SUPPRESSION`.
- `ratPopulationTarget()` applies the active-infestation `max(normal + 3, 7)` rule.
- `reconcile()` spawns one rat when `alive < target` and calls `despawnFarthest()` when `alive > target`.
- `spawnNew()` uses a stateful seeded RNG created once from `settlementSeed ^ 0x2a7d`.
- food theft already uses deterministic bucketed hashing through local `hashString()` / `hash01()` and `RAT_EAT_ROLL_SALT`.

Implementation direction:

1. Remove dog subtraction from `ratNormalPopulationTarget()`; `RatPressureInputs.dogCount` can disappear from the pure target contract if no other caller needs it.
2. Keep storage damage as the only source of the `+3 / floor 7` target modifier.
3. Remove ecological use of `despawnFarthest()` entirely. Do not mark such rats removed in `RatRegistry`; living excess rats must remain until their normal physical lifecycle removes them.
4. Split the below-target spawn decision into normal food-driven recovery and infestation-only replenishment. The nest gate and dog multiplier belong only to the latter. Avoid accidentally making `nestDestroyed` suppress normal food-driven recovery.
5. Keep the one-spawn-per-reconciliation bound.

For the deterministic infestation roll, prefer a small pure helper in `rats.ts` using the already-established bucket/hash pattern rather than advancing the mutable `createSeededRandom()` stream. Use a stable bucket derived from the same reconciliation cadence plus settlement identity/seed and a dedicated salt. This prevents save/reload or different presentation/update histories from shifting reproduction outcomes.

Important semantic edge: at zero dogs the infestation replenishment roll must always pass, preserving current effective below-target recovery for an active infestation. At 1–4 dogs compare the deterministic `[0,1)` roll with `1 - dogCount * 0.10`; floor at `0.50` for 5+ dogs.

## Rat persistence discrepancy

`docs/STATE.md` currently says rats are unpersisted/not seed-derivable, but current code is newer and **does persist settlement rats**:

- `src/settlement/ratPersistence.ts` stores `RatSaveRecord = AnimalSaveState + settlementId + animalId`, removed-id tombstones, capture and serialization.
- `SettlementsManager.unload()` captures loaded rats before disposal.
- `src/app/saveState.ts` serializes `rats`, `removedRatIds` and infestation state.
- `createSettlementRats()` hydrates saved rats and excludes tombstoned ids.

Treat code as authoritative. Do not replace this with deterministic population reconstruction. Update canonical state docs during implementation so they no longer claim rats are unpersisted.

## Nest placement and settlement lifecycle

Use the static `SettlementDef.plan` / `VillagePlan` data, not rendered houses. `src/settlement/villagePlan.ts` already gives each `VillageBuildingPlan` stable `id`, semantic `role`, `x/z/y`, `rotation`, `footprint`, `plotId` and family links. Residential candidates are therefore available without inspecting Three.js objects.

Recommended placement contract:

- pure function: `(settlement seed/id, village plan) -> nest placement | null`;
- candidates: `plan.buildings.filter(role === 'residential')` in stable order, then deterministic salted start/selection;
- “behind” should be derived from the building's `rotation` and `footprint`, with a small fixed clearance beyond the footprint;
- fallback order must be deterministic: bounded candidate/offset sequence, never `Math.random()` retries;
- do not persist `x/z/y/yaw`; persist only `nestDestroyed`.

The nest is settlement presentation and should be created/disposed with the loaded settlement. `createSettlement()` already delegates static settlement props to `buildSettlementProps()` in `src/settlement/props.ts`; fit the nest into that settlement-owned composition lifecycle (or a small helper called by it) rather than `SettlementsManager` creating scene objects directly. The authoritative registry must remain manager-lifetime while the mesh/interactable remains load-lifetime.

Do not mutate `VillagePlan` to insert the nest. The plan is deterministic generated layout; the nest is a derived world-problem presentation.

For vertical placement use the existing settlement `sampleHeight` seam. If validation checks water/collision, keep it pure/bounded and use already-available settlement physical queries; do not introduce a global placement manager for one prop.

## Interaction wiring

`src/app/interactables.ts` is the central per-frame target builder and `src/app/gameLoop.ts` dispatches interaction actions. Existing settlement-storage interaction already reads `SettlementsManager.isStorageInfestationActive()` at action time; follow the same pattern for the nest so prompt visibility/action validity is derived from current authoritative state.

Tool requirement must use `ITEM_CATALOG` capability semantics. `soil_digging` already exists and is currently granted by the shovel. Reuse `hasItemCapability(...)` / the held-tool capability path; do not check `kind === 'shovel'` and do not add a rat-specific item capability.

After successful nest destruction:

- set only `nestDestroyed = true`,
- refresh naturally from live authoritative state (do not maintain a separate `visible` flag),
- call `questManager.pollSettlementRatInfestationObjectives()` just as storage repair does.

## Quest snapshot

Change `SettlementRatInfestationSnapshot` from:

```ts
{ infestationActive, aliveRatCount }
```

to the world facts:

```ts
{ storageDamaged, nestDestroyed, aliveRatCount }
```

and keep completion pure:

```ts
!storageDamaged && nestDestroyed && aliveRatCount <= 1
```

The reminder helper should branch only on this snapshot. Do not add quest-side booleans for “storage repaired” or “nest destroyed”. The existing `QuestManager` lookup/poll seam should remain the only coupling.

## Persistence / migration

Current `CURRENT_SAVE_VERSION` is `21`. Because the meaning/shape of persisted `storageInfestation` changes, this is a real schema migration, not an optional-field-only extension.

At implementation time re-check the current version, then:

- bump `CURRENT_SAVE_VERSION`,
- add exactly one forward migration in `SAVE_MIGRATIONS`,
- update `SaveData.storageInfestation` typing/validation,
- update fixtures/tests that construct current-version saves.

Legacy mapping should be explicit:

```text
'active'   -> { storageDamaged: true,  nestDestroyed: false }
'repaired' -> { storageDamaged: false, nestDestroyed: false }
```

`repaired -> nest intact` is intentional: old saves knew only about storage repair and must not silently gain a destroyed nest. An already completed old infestation quest must remain resolved through persisted quest state; do not rewrite historical quest outcomes merely because the newly reconstructed world problem contains an intact nest. Verify this interaction with the existing quest restore logic before changing objective polling on load.

The in-session `WorldBundle` rebuild path must pass the generalized infestation snapshot exactly where `initialStorageInfestation` is passed today; do not serialize/reload through IndexedDB to rebuild runtime state.

## Dog combat

`src/fauna/faunaCombat.ts` currently has:

- `MAX_HP.rat = 6`,
- nested `DAMAGE_TABLE` entries only for wolf/fox/bear,
- `DEFAULT_DAMAGE = 8`, so dog→rat currently falls back to 8 and one-shots a full-health rat.

Add `dog: { rat: 2 }` to the existing `DAMAGE_TABLE`. No timing changes are needed; `damageFor()` already routes animal-vs-animal attacks through this table.

Do not touch `AnimalAgent`/fauna decision ownership for this tuning. Existing dog pest targeting/chase/attack remains the physical removal mechanism.

## Tests worth adding/updating

Focus on pure seams and regressions that the current architecture makes non-obvious:

- `src/settlement/rats.test.ts`: target independent of dog count; damaged-storage bonus/floor; no target-driven removal; deterministic infestation roll + multiplier floor + one-spawn bound.
- `src/settlement/ratPersistence.test.ts` or generalized infestation registry tests: independent storage/nest transitions and serialization.
- placement helper test: same plan/seed gives same residential building and offset; deterministic fallback.
- `src/quests/settlementRatInfestation*.test.ts`: all three completion conditions and reminder branches.
- `src/fauna/faunaCombat.test.ts` (or existing damage tests): `damageFor('dog', 'rat') === 2` and `< MAX_HP.rat`.
- save migration tests: both legacy `'active'` and `'repaired'` map explicitly; current-version validator accepts only the new shape.

## Main pitfalls

- Do not let `nestDestroyed` become a permanent “no rats” flag; it disables only infestation replenishment.
- Do not use population reconciliation as hidden killing/despawning after target reduction.
- Do not store nest transform or mesh state.
- Do not make quest completion the owner of world cleanup.
- Do not use the mutable spawn RNG for the new reproduction probability; a reconstruction-sensitive RNG sequence would violate the plan's deterministic bucket requirement.
- Do not assume `docs/STATE.md`'s rat-persistence sentence is current; code/save schema are authoritative here.
- Keep the implementation local: generalized infestation registry + rats reconciliation + settlement presentation/interaction + narrow quest seam + save migration + existing fauna damage table. No generic reproduction, problem or prop manager is needed.
