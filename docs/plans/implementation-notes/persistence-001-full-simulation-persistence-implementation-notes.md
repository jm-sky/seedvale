# Implementation Notes: Full Simulation Persistence

## Current-code findings

- Save assembly/contract are already split correctly. src/app/saveState.ts owns buildSaveData() and write timing; src/persistence/saveData.ts owns the v1 shape and validation/defaulting; src/persistence/saveDb.ts remains IndexedDB storage. Extend these seams rather than adding a persistence service.
- SaveData currently contains settlement economy and fauna spawn-point state, but does not contain households, NPC state, NPC↔NPC relations or individual livestock state.
- SettlementsManager already owns the long-lived EconomyRegistry, HouseholdRegistry, NpcStateRegistry and NpcRelationships. HouseholdRegistry and NpcStateRegistry already support initial snapshots specifically for WorldBundle rebuilds. Reuse that exact hydration path for initial save/load.
- NpcAuthoritativeState in src/settlement/npcState.ts is already the correct persistence boundary: health, stamina, vigor, needs, helperAssignment and activePlan. Runtime phase, pending action, navigation and combat state are intentionally outside it.
- HouseholdSnapshot in src/settlement/household.ts already captures stock, water and the generic Inventory (counts + instances). Its current rebuild-only documentation is stale relative to the new plan; the shape itself is already suitable for SaveData.
- NpcRelationships in src/settlement/npcRelationships.ts currently exposes only get/adjust over a private unordered-pair Map. Add snapshot/import at this boundary; do not expose or persist the map itself.
- Important current gap: createWorldBundle() receives initialSave for economy, spawn points and player-built records, but does not pass initialHouseholds or initialNpcStates into buildWorldSystems(). createSettlementsManager() already supports both. Wire SaveData into these existing initial parameters instead of inventing a second load path.
- SettlementsManager currently creates NpcRelationships with createNpcRelationships() and has no initial snapshot argument. Add an optional initial snapshot and thread it through worldBundle.ts; preserve manager-owned lifetime.
- saveState.ts currently snapshots bundle.settlementsManager.snapshotEconomies() only. Add sibling snapshot calls for households, NPC state and relationships.

## Livestock: adapt the existing spawn path

- src/settlement/livestock.ts is the only house-livestock spawn path. It deterministically derives animalId from settlement/house/index and currently always creates a fresh AnimalAgent. Extend this path to accept saved livestock state and hydrate matching deterministic individuals; do not create a second livestock loader.
- LIVESTOCK_KINDS is the authoritative distinction for reload-stable house livestock. Merchant horses use the same factory but have no ownerHouseId; keep them outside the persisted collection as required by the plan.
- Current AnimalAgent authoritative state relevant to livestock is split between health, life (hunger/thirst/stamina), private productionReadyAtDays, private eggPending for chickens, death/corpse lifecycle, mesh position x/z and rotation.y, stable animalId and ownerHouseId.
- productionReadyAtDays is intentionally an absolute elapsedDays anchor. Preserve it directly; do not reconstruct it from a remaining duration and do not replay missed production.
- AnimalAgent currently initializes life with Math.random(), and production with a lazy Math.random() stagger. Hydrated livestock must overwrite authoritative fields before normal simulation starts, otherwise the first tick can introduce default/random state before SaveData wins.
- The current constructor calls snapY() and pickWanderTarget(). For hydration, restore x/z/yaw after construction (or add a narrow hydration/initial-state hook) and let terrain sampling derive y. Do not persist y.
- The current constructor has no yaw parameter and defaults rotation to zero. Persisted yaw therefore needs an explicit hydration seam; do not rely on deterministic spawn yaw.
- Add the smallest explicit snapshot/hydration API needed for AnimalAgent rather than exposing all private runtime fields. Keep navigation, targets, animation and unrelated timers out of the snapshot.
- The lifecycle requirement needs more than a simple saved-livestock array: Settlement.update() removes animals whose readyToRemove() becomes true from the runtime livestock array. If a dead animal has already completed removal before Save, absence from a save cannot distinguish removed individual from never generated. Use an explicit persisted lifecycle/tombstone representation (or equivalent removed-id set) so deterministic spawning cannot recreate a removed livestock individual.
- An animal that is merely dead but still within its corpse lifetime must remain represented in SaveData so load can reconstruct the dead individual and continue its corpse/removal lifecycle. Do not serialize corpse meshes/FX; derive presentation from lifecycle + world time.
- Keep ownership derived from the deterministic house index/ownerHouseId; saved ownership must be validated against generated livestock identity rather than allowing arbitrary attachment.

## Load/rebuild ordering

Use the existing WorldBundle construction order:

1. createApp() creates dayNight from initialSave.elapsedDays.
2. Build settlement registries with saved household/NPC/relationship snapshots.
3. createSettlement() creates households and NPCs; registry getOrCreate() hydrates them before agents start normal updates.
4. Hydrate house-owned livestock through spawnLivestock().
5. Build remaining derived/presentation systems.

The first normal simulation tick must see hydrated authoritative state. Do not create default agents, tick them, and then patch SaveData into them.

For same-session rebuildWorldBundle(), preserve the existing registry carry mechanism (snapshotHouseholds()/snapshotNpcStates() and initial* arguments). New SaveData support must not alter that rebuild contract.

## NPC / household details

- NpcStateRegistry.serialize() already returns plain data and is the correct SaveData source. Preserve helperAssignment and activePlan; do not serialize NpcAgent runtime fields.
- HouseholdRegistry.serialize() calls Household.snapshot(). Preserve items.instances using the existing Inventory instance serialization/deserialization; do not invent another item serializer.
- NpcStateSnapshot.needs is already plain data and should be copied, not normalized/reseeded on load.
- activePlan is intended to survive interruption; only the currently executing action remains transient. Do not restore an action lifecycle.
- NPC identity is deterministic (${settlementId}:npc:${i}) in createSettlement.ts, so saved records hydrate by id and missing records fall back to normal deterministic creation.
- Do not suppress deterministic NPC generation just because a new save collection is absent. Older v1 saves legitimately have no new records.

## Relationships

- NpcRelationships is a world-lifetime store created by SettlementsManager, not a per-settlement object. Snapshot all stored pairs; a sparse non-zero representation is preferable if no semantic zero entries are needed.
- Keep pair ordering/canonicalization internal. SaveData should contain plain records/entries, not the runtime Map.
- Hydrate relationships before NPC decisions/conversation pairing can read them.
- Do not mix this with QuestManager player-facing relations; they are separate systems.

## SaveData v1 compatibility

- SaveData.version stays 1. Existing save slots predate these collections, so validation/defaulting must treat missing new fields as empty/default state where semantics allow.
- Do not add a migration framework. Follow the existing saveData.ts compatibility/defaulting conventions.
- Validators and defaults must be updated together; a new required field without an old-save default would make existing saves unloadable.
- New saves must always write the complete new collections.

## Verification focus

Prefer focused tests around snapshot/hydration and SaveData compatibility, plus one integration-level Save→Load path per domain.

High-value cases:
- NPC needs/HP/vigor/stamina + helper assignment + active plan.
- Household wood/water + food/item counts + item instances.
- Relationship pair symmetry and restored values.
- Livestock identity/owner/x/z/yaw, hunger/thirst/stamina, HP/dead state and production anchor.
- Dead livestock before corpse removal, and livestock already fully removed (tombstone prevents deterministic respawn).
- Save→advance elapsedDays→load: production readiness and corpse lifecycle resolve from saved state.
- Existing fauna spawn-point recovery/depletion persistence remains unchanged.
- Old v1 saves with none of the new collections still load and deterministically create normal NPC/household/livestock state.

Avoid browser-verification claims from unit/build checks; gameplay continuity still needs the normal manual browser verification.

## Files / symbols to inspect first

- src/app/saveState.ts — SaveData assembly.
- src/persistence/saveData.ts — schema + validation/defaulting.
- src/app/createApp.ts — initial SaveData → WorldBundle wiring and elapsedDays.
- src/app/worldBundle.ts — WorldSystemsSeed, buildSettlementsManager(), initial-state threading.
- src/settlement/SettlementsManager.ts — registry ownership/lifetime.
- src/settlement/npcState.ts — NPC authoritative state/snapshot.
- src/settlement/household.ts — household ownership/snapshot.
- src/settlement/npcRelationships.ts — relationship ownership/pair storage.
- src/settlement/createSettlement.ts — NPC/livestock construction and first-tick ordering.
- src/settlement/livestock.ts — deterministic livestock identity/spawn path.
- src/fauna/AnimalAgent.ts — authoritative livestock state and hydration seam.
- src/fauna/livestockProduction.ts — absolute production-anchor math.

## Recommended implementation order

1. Define SaveData plain-data contracts and compatibility/defaulting.
2. Add NPC/household/relationship snapshots to existing registry boundaries and wire them through initial world construction.
3. Add livestock snapshot/hydration plus explicit removed/tombstone reconciliation in the existing livestock factory.
4. Extend saveState.ts.
5. Add focused tests, then type/build/test verification.
6. Update plan/README status only if implementation actually changes those documents.

Do not refactor unrelated settlement/fauna code while closing this persistence gap.