# Plan: Garden and Field Maintenance — Implementation Notes

**Created:** 2026-08-21
**Status:** `verification needed` 🔍 — implemented 2026-08-24, see the plan's own §14 "Implementation summary"
**Priority:** medium · **Effort:** M
**Depends on:** ~~174~~ ~~126~~

## Review verdict

Plan 176 is architecturally sound, but it must be implemented against the **actual crop/garden boundaries**, not the terminology in the plan.

The important current-state facts are:

- Plan `172` is already implemented in the codebase, although its plan remains `verification needed` in the planning map. It introduced `src/world/cropLifecycle.ts`, `src/terrain/chunkCrops.ts`, crop visuals and player harvest integration.
- `CropLifecycle` currently models **naturally generated wild crops** (`carrot`, `potato`, `cabbage`) as a deterministic repeating `young → mature → spoiled` cycle. It is lazy and world-time based. `src/app/actions/gatheringActions.ts` and `ChunkManager.harvestCrop()` already use the same lifecycle resolver/harvest contract.
- Plan `174` is still **planned** and is therefore the real prerequisite for the persistent player-built garden/field object that 176 wants to maintain. Its implementation must establish the world-object/persistence/placement contract that 176 consumes; 176 should not invent a parallel garden registry.
- Plan `126` is still planned. Its implementation notes explicitly call for a reusable `CropLifecycle` for planted crops rather than a second growth implementation.
- The current garden geometry in settlement code is primarily decorative/settlement presentation. Do not treat decorative crop meshes or `createGarden()` output as authoritative crop state.

Therefore the implementation target should be:

```text
174 player-built cultivation object
        ↓
shared maintenance state
        ↓
126 planted crop / 172 crop lifecycle
        ↓
productivity / yield
```

and the same maintenance action should be callable by player and NPC through their existing action systems.

## 1. Hard dependency boundary: plan 174

Do not start by adding maintenance state to settlement garden visuals.

Plan 174 must provide the persistent world object that represents a player-built garden/field/grządka. The implementation of 176 should extend that object with maintenance state or use an explicit domain record owned by the same world-object system.

Do not create:

- `GardenManager`;
- `FarmManager`;
- a second player-garden registry;
- a global collection of every field solely for maintenance.

The current architecture already uses persistent records for player-built world objects such as fires, traps, containers, wells, drying racks and hives. The same ownership pattern is appropriate here: the persistent record owns the world mutation; the Three.js object is reconstructed from it.

If plan 174's final implementation chooses a different name/type than `garden`, use the actual implemented type. Do not preserve plan terminology at the cost of creating an adapter system.

## 2. Do not attach maintenance to natural crops from plan 172

`src/world/cropLifecycle.ts` is currently a lifecycle for naturally generated wild crops. It deliberately does not represent garden maintenance.

A wild crop:

```text
procedural placement
→ crop lifecycle
→ harvest/removal
```

A player garden/field:

```text
persistent world object
→ maintenance state
→ planted crop(s)
```

These are related but not the same state.

Do not add `care` to `CropPlacement` or `CropDefinition` merely because crops are affected by care. `care` belongs to the **cultivation site** (garden/field/grządka), not to the inventory item and not to every wild crop.

Likewise, do not make `CropLifecycle` responsible for deleting the garden object.

## 3. Define one small cultivation-maintenance domain model

Prefer a data-only state owned by the persistent garden/field record, for example:

```ts
export type CultivationMaintenance = {
  lastMaintainedAtDays: number
  care: number
}
```

However, do not persist both values if one is derivable. The preferred representation is:

```ts
lastMaintainedAtDays
```

plus central tuning constants/definition data.

Then resolve lazily:

```ts
resolveCultivationCare(lastMaintainedAtDays, worldDays)
```

with a bounded `0..100` result.

If `care` is required as an explicit saved override for a gameplay mutation, keep the representation minimal and make one function authoritative for resolving it. Avoid having `lastMaintainedAt` and a separately persisted `care` drift apart.

## 4. Lazy degradation is mandatory

Do not tick every garden/field every frame.

The correct shape is:

```text
lastMaintainedAtDays
        +
worldDays
        ↓
resolved care
```

Resolve only when needed:

- interaction prompt/state;
- maintenance start/finish;
- crop productivity/yield calculation;
- NPC decision evaluation for a field it is already visiting;
- world-object load/rebuild;
- persistence snapshot;
- tests.

For loaded visuals, an explicit refresh can update the visual state when a meaningful care threshold is crossed. There is no reason to run a global maintenance tick.

The same rule naturally handles:

- save/load;
- time skip;
- chunk unload/load;
- world rebuild.

## 5. Choose degradation semantics that remain deterministic

The plan leaves the exact rate open. Keep the first version simple and data-driven.

A suitable contract is:

```text
care = clamp(100 - elapsedDays * degradationPerDay, 0, 100)
```

where `elapsedDays = max(0, worldDays - lastMaintainedAtDays)`.

The exact tuning value should be a named constant/definition, not a magic number spread across player/NPC code.

Recommended state interpretation:

```text
100..50   maintained
<50..25   neglected
<25       heavily neglected
<= removal threshold → remove cultivation object
```

The exact thresholds can be tuned, but the resolver should expose named semantic predicates/status values so callers do not duplicate numeric comparisons.

Important: the removal threshold must be unambiguous. Do not allow one caller to consider `care <= 0` removable while another uses `< 25`.

## 6. Removal is a world-object mutation, not an abandoned state

The plan explicitly says there is no persistent `abandoned` state.

When the resolved maintenance state reaches the terminal threshold:

```text
cultivation object
    ↓
remove world object
    ↓
persistent record removed
    ↓
visual/runtime object disposed
```

Do not leave a dead garden record that every NPC query must filter out.

Use the same atomic world-object removal/persistence pattern established by plan 174's implementation. If crop records live independently, decide explicitly whether removing the cultivation site also removes its planted crops. This should be a **domain rule of the cultivation object**, not accidental cleanup in the renderer.

For v1, the cleanest rule is likely: removing the field removes/invalidates the crops owned by that field, because the field is their placement/ownership context. Do not leave orphan crop records behind.

## 7. The crop lifecycle must remain one system

Plan 172 already provides:

- `CropGrowthStage`;
- `CropDefinition`;
- `resolveCropStage()`;
- `resolveCropHarvest()`;
- deterministic lifecycle timing.

Plan 126's implementation notes explicitly require planted crops to reuse this lifecycle instead of creating `NaturalCropLifecycle` and `PlantedCropLifecycle` separately.

Plan 176 should therefore only provide a **condition/modifier** to crop productivity.

Conceptually:

```text
crop lifecycle
    ↓
resolved growth stage
    +
resolved cultivation care
    ↓
harvest/productivity result
```

Do not duplicate crop growth timing inside maintenance code.

Do not modify `resolveCropStage()` to know about garden care if the same resolver must remain valid for wild crops. Prefer a separate pure productivity/yield modifier consumed by the garden/planted-crop harvest path.

## 8. Important current discrepancy: plan 172 is not yet the planted-crop system

The current `CropLifecycle` implementation is designed around natural crops. `chunkCrops.ts` generates deterministic wild crop placements, and `ChunkManager.harvestCrop()` removes them using a sparse `harvestedCropIds` persistence set.

That mechanism should **not** be reused as the persistence model for a player garden.

A planted garden crop is a world mutation and needs its own persistent identity/placement record as established by plan 126. The garden maintenance state should point to/own those crop records through the implementation chosen by 126/174.

Do not add garden IDs to `harvestedCropIds`; that set has a specific semantic meaning for deterministic natural crop placements.

## 9. Suggested shared maintenance API

Keep the core API small and pure, e.g.:

```ts
resolveCare(lastMaintainedAtDays, worldDays): number
getMaintenanceStatus(care): 'maintained' | 'neglected' | 'heavily-neglected' | 'removed'
maintenanceDurationHours(tool): number
applyMaintenance(lastMaintainedAtDays, worldDays): number
```

The exact names should follow repository conventions.

Prefer `applyMaintenance()` to return the new maintenance anchor rather than mutating a renderer/runtime object.

For example:

```text
current care = 35
maintenance at day D
→ new anchor = D
→ resolved care = 100
```

If the desired behavior is “restore about 50 points” rather than always reset to 100, represent that explicitly. The plan says approximately +50 with a cap of 100, so the likely rule is:

```text
newCare = min(100, currentCare + MAINTENANCE_CARE_GAIN)
```

The persisted representation must then be able to express that result. If using only `lastMaintainedAtDays`, a +50 operation is not equivalent to resetting the clock unless the degradation function is intentionally designed around that. Resolve this during implementation instead of accidentally implementing “always fully maintained”.

A simple robust representation is to persist an explicit maintenance anchor/value pair if partial restoration is required:

```ts
{ care: 85, lastMaintainedAtDays: currentWorldDays }
```

Then subsequent degradation derives from that care value. If so, both fields are meaningful rather than redundant.

## 10. Player maintenance should reuse the existing action/busy mechanism

`src/app/actions/gatheringActions.ts` already demonstrates the project's existing timed-action pattern through the shared `busy.start(...)` mechanism. Other world interactions also use existing action contexts rather than creating feature-specific timing loops.

Maintenance should be another action in the existing player action family, not a new timer/manager.

Conceptually:

```text
[E] Zrób porządek
        ↓
validate target + current care
        ↓
calculate duration
        ↓
busy.start(duration, ...)
        ↓
revalidate target/state
        ↓
apply maintenance
```

The completion callback must revalidate the world object. The player may have moved/rebuilt/reloaded state while the timed action was in progress.

Do not mutate `care` when the action starts. Apply the mutation only on successful completion.

## 11. Maintenance duration and tools

The plan says approximately 1–2 world hours and tools shorten the action without increasing care gain.

Use the existing tool abstraction (`HeldTool` / `ToolKind`) rather than adding a maintenance-specific equipment system. The current tool union already contains `shovel` and `pitchfork`, while there is no generic `rake` tool in `HeldTool.ts`.

Do not add a `rake` merely because the plan mentions it as a future example.

For v1, select only tools that actually exist in the current item catalogue and have a defensible maintenance relationship. If no current tool is appropriate beyond the shovel, implement shovel support rather than inventing tool types.

The duration calculation should be a pure helper:

```text
base duration
× existing tool speed modifier
→ final duration
```

Do not change the amount of care restored based on tool quality.

If tool durability/instances are relevant, reuse the existing item-instance/maintenance system rather than adding another durability model. Do not consume a tool simply because it was used unless an existing tool-use contract already does so.

## 12. Interaction must be based on the real world object

The player interaction candidate should originate from the actual persistent garden/field object supplied by plan 174.

Do not derive interaction targets from:

- decorative crop meshes;
- settlement garden visual cones;
- chunk-wide searches of all crops;
- arbitrary coordinates stored in UI state.

The interaction prompt can expose:

```text
[E] Zrób porządek
```

while the final action validates the current care/status again.

The interaction should remain available while the site is maintained, as required by the plan. It can be a valid action that simply restores care if enough time has passed or reports that no maintenance is currently needed, depending on the final UX decision.

## 13. Productivity: keep the modifier at the harvest/productivity boundary

The plan intentionally does not introduce a second crop lifecycle. Therefore care should affect a crop at the point where productivity/yield is resolved.

Prefer a pure function such as:

```ts
resolveCropYield(baseYield, care, cropStage)
```

or an equivalent existing crop-result API.

Example conceptual policy:

```text
maintained       → 100% productivity
neglected        → reduced productivity
heavily neglected→ further reduced productivity
```

Do not modify growth duration unless the design explicitly chooses that later. The plan says “produktywność”, so yield is the safer first integration point.

The modifier must be applied only to crops actually belonging to the cultivation site. Natural wild crops from plan 172 must not suddenly receive garden-care penalties.

## 14. Avoid yield bugs from integer rounding

Current crop harvest uses integer `yieldCount`. If care produces fractional productivity, decide where rounding happens and keep it deterministic.

For example:

```text
base yield = 3
productivity = 0.6
raw = 1.8
→ floor/round according to one documented rule
```

Avoid allowing a “reduced productivity” modifier to produce zero harvest for common crops unless that is intentionally desired.

If the first implementation uses only coarse status multipliers, test the boundary values explicitly.

## 15. NPC maintenance: reuse the existing action/decision lifecycle

The plan's NPC architecture is correct and should be followed strictly:

```text
world state
→ problem/pressure
→ existing decision
→ existing strategy/action
```

The current NPC architecture already uses `PlannedAction` / `ActionLifecycle`, with `goTo → execute` action chains and existing interruption semantics. Recent NPC implementation notes explicitly warn against creating feature-specific AI/action managers.

Do not create:

- `GardenAI`;
- `FarmAI`;
- `MaintenanceAI`;
- `GardenManager`;
- a second scheduler.

Maintenance should be another planned action or extension of an existing generic work action type.

## 16. NPC condition: “already at the field” must be real

The plan specifically says the NPC should not search the world for neglected fields.

This is important for performance and architecture.

The decision should only consider maintenance when the NPC has already arrived at / is interacting with a cultivation object as part of its existing schedule/work/need flow.

Conceptually:

```text
NPC arrives at cultivation site
        ↓
resolve care
        ↓
care < 50?
        ↓
needs/health OK?
        ↓
existing decision chance
        ↓
maintenance action
```

Do not implement:

```text
for every NPC:
  scan all fields
  find neglected field
  travel there
```

This is explicitly out of scope and would violate the bounded/local simulation architecture.

## 17. NPC needs/health must use existing state

The plan says critical needs must block maintenance and sufficient strength/health is required.

Use the existing NPC needs/health/decision gates. Do not add maintenance-specific thresholds for hunger/thirst/health unless the existing action system genuinely lacks a reusable feasibility check.

The desired ordering is:

```text
critical need interruption / decision gate
        ↓
maintenance feasibility
        ↓
maintenance action
```

A maintenance action already in progress should be interrupted through the existing critical-need mechanism, not a maintenance-specific interrupt path.

The action must also preserve world-state conservation if interrupted before completion: no care increase until the maintenance action actually completes.

## 18. NPC tools

Do not assume an NPC can use the player's `HeldTool` slot. `HeldTool` is explicitly player-facing, while NPC inventory/tool handling has its own current contracts.

If NPC tool availability already exists in `NpcAgent`/NPC inventory, use that contract. If it does not, the safest v1 is:

```text
NPC can perform maintenance manually
→ baseline duration
```

and only add tool speed bonuses once an existing NPC tool-selection/equipment mechanism can supply the tool without inventing a parallel system.

Do not create `NpcMaintenanceTool`, `NpcHeldTool` or a garden-specific equipment system.

## 19. Persistence: use the current SaveData version, not historical notes

The repository's `SaveData` has continued beyond the versions mentioned in older implementation notes. The current `saveData.ts` already contains `harvestedCropIds` (v21), containers (v22) and subsequent world-object persistence.

Therefore do **not** copy an old version number from plan 126 or historical notes.

When 176 is implemented, inspect the actual current `SaveData` tail and migration chain and add the maintenance fields to the next version using the repository's existing migration pattern.

A likely record shape is:

```ts
export type SaveGarden = {
  id: string
  ...plan174 placement fields...
  care: number
  lastMaintainedAtDays: number
}
```

or the minimal equivalent chosen by the actual 174 implementation.

The important invariant is that the saved state is sufficient to reconstruct the same resolved care after reload/time skip.

Do not add a separate maintenance save file/store.

## 20. Chunk lifecycle

Maintenance state must remain valid when the garden/field chunk unloads.

The expected lifecycle is:

```text
persistent garden record
        ↓
chunk loaded
        ↓
runtime world object / interactable
        ↓
care resolved from persistent state + world time
        ↓
chunk unloaded
        ↓
runtime object removed
        ↓
persistent record remains
```

No global per-frame maintenance pass is required.

If a garden reaches its removal threshold while unloaded, it is acceptable to remove it lazily when its persistent state is next resolved/loaded, provided the persistence layer is updated and the object cannot be incorrectly used before that resolution.

## 21. Rebuild/save/load invariants

Test at least these sequences:

```text
maintained garden
→ time skip
→ load chunk
→ expected care
```

```text
neglected garden
→ maintenance action
→ rebuildWorldBundle()
→ care preserved
```

```text
neglected garden
→ save
→ reload
→ same care/status
```

```text
heavily neglected garden
→ unload chunk
→ time skip past removal threshold
→ reload
→ garden absent
```

Also test that a removed garden does not reappear merely because its procedural/decorative settlement geometry is regenerated.

## 22. Visual representation of neglect

Visual weeds are explicitly out of scope. Do not add a new vegetation/weed system to make care visible.

For v1, the implementation can expose status through the existing interaction/inspection UI or make only a minimal existing crop visual adjustment if that is already easy.

If a visual state is added later, derive it from `getMaintenanceStatus(care)` rather than storing a second `visualState` field.

## 23. Architecture around 174/126/172

Keep ownership boundaries explicit:

```text
174
  owns player-built cultivation object
  owns placement + persistence + physical world-object lifecycle

126
  owns planting interaction / seed consumption
  creates planted crop records

172
  owns shared crop growth/harvest lifecycle primitives

176
  owns cultivation maintenance state + maintenance action
  modifies cultivation productivity/yield through a shared modifier
```

If implementation of 126/174 has already changed these boundaries by the time 176 starts, follow the code instead of this diagram. The key rule is still one owner per concept and one crop lifecycle.

## 24. Likely implementation files to inspect first

Before coding, inspect the actual current versions of:

- `src/world/cropLifecycle.ts`
- `src/terrain/chunkCrops.ts`
- `src/terrain/chunkManager.ts`
- `src/app/actions/gatheringActions.ts`
- `src/app/actions/actionContext.ts`
- `src/app/interactables.ts`
- `src/items/HeldTool.ts`
- `src/items/items.ts`
- `src/persistence/saveData.ts`
- `src/app/saveState.ts`
- the final world-object/placement implementation from plan `174`
- the planted-crop implementation from plan `126`, if already landed
- the current `NpcAgent` action/decision implementation and related `PlannedAction`/`ActionLifecycle` modules.

Do not assume the files or method names from this document are unchanged when implementation starts.

## 25. Tests worth adding

Keep tests focused on pure/domain behavior first:

- care degradation over world days;
- care clamping;
- maintenance gain and cap at 100;
- maintenance duration with/without a supported existing tool;
- maintenance status thresholds;
- removal threshold;
- crop productivity modifier by care status;
- no modifier for wild crops;
- save/load round-trip of maintenance state;
- time-skip resolution;
- chunk unload/load persistence;
- removal persistence;
- maintenance completion after a timed action revalidates the target;
- interrupted maintenance does not restore care;
- NPC does not select a field by global search;
- NPC maintenance is skipped when existing critical-need gates block ordinary work.

Avoid tests that require the full Three.js renderer when a pure resolver can prove the behavior.

## 26. Main implementation pitfalls

1. **Implementing 176 before 174 exists.** There is currently no verified player-built garden/field object to attach the state to.
2. **Treating decorative settlement gardens as gameplay state.** They are not the persistence boundary.
3. **Putting `care` on `CropPlacement`.** Natural crops from 172 are not garden fields.
4. **Creating a second crop lifecycle.** Reuse `CropLifecycle` from 172 for planted crops as intended by 126.
5. **Persisting only `lastMaintainedAtDays` while implementing a +50 care action.** Those semantics are not automatically equivalent; choose a representation that can express partial restoration.
6. **Adding a global garden manager or per-frame scan.** Maintenance must be lazy and local.
7. **Creating a special NPC maintenance AI/scheduler.** Use existing NPC decision/action infrastructure.
8. **Using the player's `HeldTool` directly for NPCs.** Player equipment and NPC tool ownership are separate contracts.
9. **Inventing a rake tool.** Current `HeldTool` has shovel/pitchfork but no generic rake.
10. **Applying care penalties to wild crops.** Only crops owned by the cultivation site should use garden care.
11. **Deleting the visual object without deleting the persistent record.** Removal must be one world-object mutation.
12. **Applying maintenance at action start.** Apply only after the timed action completes and revalidates the target.
13. **Ignoring interruption/conservation.** A cancelled/interrupted action must not partially restore care.
14. **Copying historical SaveData versions.** Always inspect the current `saveData.ts` and migration chain.

## 27. Recommended implementation order

```text
1. Verify final 174 cultivation-object contract.
2. Verify final 126 planted-crop representation and its use of CropLifecycle.
3. Add small pure maintenance/care resolver.
4. Add maintenance state to the existing 174 persistent world-object record.
5. Add lazy status/removal resolution.
6. Add crop productivity/yield modifier at the planted-crop harvest boundary.
7. Add player maintenance interaction using the existing timed-action/busy flow.
8. Add existing-tool duration modifier only for tools that already exist.
9. Add NPC maintenance as an ordinary PlannedAction/ActionLifecycle path when an NPC is already at the cultivation site.
10. Add current SaveData migration/persistence integration.
11. Add focused unit tests and technical checks.
12. Browser-test save/load, time skip, maintenance, crop productivity, removal and NPC behavior.

Do not pull future watering, weeds, fertilizer, crop diseases, farm assignment or global field discovery into this plan.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
