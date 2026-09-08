# Implementation Notes: quests-progression-006 — Settlement Rat Infestation

**Reviewed:** 2026-09-07  
**Plan:** `quests-progression-006-settlement-rat-infestation.md`  
**Status:** `implemented` ✅

## Review result

Current `main` already contains almost every runtime primitive needed. The implementation should join four existing seams — settlement rat reconciliation, settlement storage interaction, quest world bindings, and `AnimalAgent` persistence snapshots — rather than introducing a generic problem/repair framework.

The only genuinely new authoritative state is the settlement-owned storage infestation condition plus persisted rat individuals.

The V1 tuning/repair decisions are closed:

```text
active infestation target = max(normalTarget + 3, 7)
repair cost = 2 × ItemKind 'beam'
quest completion world condition = repaired && aliveRats <= 1
```

`quests-progression-002` is a hard implementation dependency. Re-run focused preflight after 002 lands and adapt symbol-level integration to its actual current code.

## 1. Rat population owner

`src/settlement/rats.ts`

Relevant symbols:

- `RatPressureInputs`
- `ratPopulationTarget()`
- `createSettlementRats()`
- `SettlementRatsDeps`
- `SettlementRats.getAgents()`
- `RAT_POPULATION_CAP = 5`
- `RAT_RECONCILE_INTERVAL_DAYS = 0.5`

Current formula:

```text
(householdFoodCount + settlementFoodCount) / RAT_FOOD_PER_PRESSURE
- dogCount * RAT_DOG_SUPPRESSION
→ floor
→ clamp 0..5
```

`createSettlementRats()` owns live rat instances only for the currently loaded settlement. It spawns one rat per reconciliation step when below target and despawns one farthest live rat when above target. Keep this gradual reconciliation.

Do not add another spawn loop for infestation rats. Extend the target inputs/result so the existing path owns both normal and infestation populations.

### Infestation target contract

Normal settlement:

- preserve current behavior and normal cap 5.

Damaged settlement storage:

```text
active infestation target = max(normalTarget + 3, 7)
```

Where `normalTarget` is the existing target after current food/dog logic and normal cap semantics. The implementation may structure the helper differently, but must preserve the externally observable contract:

- active infestation adds fixed pressure equivalent to `+3` target rats;
- final active target is never below 7;
- infestation can exceed the normal cap 5;
- dogs remain part of the existing normal formula and keep normal pest chasing;
- repair removes both `+3` and floor 7;
- repair must not call `dispose()` on current rats or directly shrink the live array.

This is not implementation-time tuning.

## 2. Rat lifecycle integration

`src/settlement/createSettlement.ts`

This is the current per-settlement composition point:

- builds `householdSites`,
- constructs `createSettlementRats(...)`,
- passes settlement economy / seed / `onAnimalDeath`,
- updates rats with live dog count,
- owns settlement disposal.

Thread the authoritative infestation condition into `createSettlementRats()` from here. Do not make `rats.ts` search `SettlementsManager` or quest state.

The existing `onAnimalDeath?: (animalId: string) => void` forwarding is already sufficient for generic death notification. The new quest should not count those deaths; its completion condition is current alive population, so no persisted quest kill counter is needed.

## 3. Persistence pattern to reuse

`src/fauna/AnimalAgent.ts`

`AnimalAgent` already exposes generic `AnimalSaveState` via `snapshot()` and `hydrate()`. Reuse that representation for rats rather than defining a second animal-state serialization.

`src/settlement/livestock.ts`

Use the registry/lifecycle pattern, not livestock ownership semantics:

- `LivestockSaveRecord = AnimalSaveState + settlementId + animalId + kind + ownerHouseId?`
- `LivestockPersistence`
- `LivestockRegistry`
- `createLivestockRegistry()`
- `capture(settlementId, animals)`
- `serialize()`
- `getSaved(settlementId)`
- removed/tombstone handling

Important distinction: rats remain wild settlement pests, never household-owned livestock. Do not add them to `LIVESTOCK_KINDS` or route them through `spawnLivestock()`.

### Required rat persistence semantics

The new settlement-rat registry should follow the same manager-lifetime shape:

```text
SettlementsManager lifetime registry
→ capture currently loaded settlement rats before unload/save
→ restore saved rat records when settlement reconstructs
→ serialize plain records into SaveData
```

Persist enough identity/state to preserve the same individuals through save/load and stream-out/in.

Dead/removed rats must not resurrect. Choose the smallest representation consistent with the live lifecycle; the livestock tombstone pattern is the proven reference.

Do not persist Three.js meshes, runtime decision phases or references to live `AnimalAgent` objects beyond what `AnimalSaveState` already defines.

## 4. SettlementsManager ownership

`src/settlement/SettlementsManager.ts`

This manager already owns long-lived settlement registries such as economy, households, NPC state and livestock persistence. The infestation condition and rat persistence belong at this lifetime boundary because a `Settlement` instance is disposable during streaming.

Follow the existing registry carry/restore model so state survives:

- settlement unload/reload,
- `WorldBundle` rebuild,
- save/load.

Do not store the condition only on the object returned by `createSettlement()`.

The authoritative condition should be keyed by stable `settlementId` and refer specifically to that settlement's shared `settlementStorage` problem.

## 5. SaveData integration

Primary files:

- `src/persistence/saveData.ts`
- `src/app/saveState.ts`
- settlement/world construction path that feeds initial persisted registries into `SettlementsManager`

Add persisted data for:

1. infestation/storage condition per relevant settlement,
2. rat individual records / removed identity needed by the rat registry.

Follow the real migration pipeline:

- bump `CURRENT_SAVE_VERSION` only with the actual schema/semantic change,
- add a migration from the previous version,
- validate new data,
- old saves default to no active infestation and no persisted rat individuals,
- save assembly captures currently loaded rats before serializing the registry, analogous to livestock.

Do not reuse `SaveData.quests` to persist world problem state.

## 6. Settlement storage inspection

Existing interaction path:

```text
src/app/interactables.ts
→ src/interaction/Interactable.ts
→ src/interaction/resolveInteraction.ts
→ existing InteractionOutcome / FlavorDialog
```

`settlements-npcs-012` established the rule that storage interactables read live authoritative state at interaction time. Keep that rule.

Existing relevant interactables include:

- `householdStorage` → live `Household`
- `settlementStorage` → live `SettlementEconomy`
- physical wood-storage inspection as a separate read-only destination

The infestation belongs to the shared **settlement storage**, not household storage and not the physical wood pile.

Prefer extending the settlement-storage interaction with enough live/read-only infestation information to show the damaged-state discovery. Do not add a second invisible interactable at the same coordinates unless current post-dependency code forces it.

## 7. Repair interaction

Reuse the current interaction/action stack rather than resolving repair through quest dialogue.

Verified item contract:

- `src/items/items.ts` defines existing `ItemKind 'beam'`;
- `branch` / `beam` are concrete item kinds, not `EconomicKind` bulk wood.

V1 repair cost is exactly:

```text
2 × ItemKind 'beam'
```

Do not substitute settlement `wood`, `branch`, or a newly-created repair material.

Likely relevant existing patterns:

- `src/app/actions/placementActions.ts` for timed work/busy action handling,
- existing action requirement/commit conventions for inventory-gated actions,
- actor-neutral `contributeWork()` seams in `createPlayerWells.ts`, `createTerrainPreparations.ts`, `createPalisades.ts`, `createStandingTorches.ts` only if partial work is actually useful,
- `FlavorDialog` actions for exposing a context action through the existing interaction surface.

V1 does not need a reusable `RepairManager` or construction-site progress.

Required transaction boundary:

```text
check 2 × beam available
→ begin timed/busy repair action
→ successful action commit consumes exactly 2 × beam
→ authoritative settlement infestation condition becomes repaired/inactive
→ next rat reconciliation sees no infestation bonus/floor
```

Do not clear the condition before the successful item/action commit. A failed/cancelled action must not consume material or mutate infestation state according to the existing action semantics used by the chosen seam.

Do not let the quest directly clear the condition.

## 8. Quest system integration

Current pre-002 files:

- `src/quests/quests.ts` — `QuestDef`, `QuestStage`, `QuestObjective`, quest content
- `src/quests/QuestManager.ts` — progress/objective evaluation and injected world bindings

Current world-binding rule is important: `QuestManager` does not import fauna/settlement managers to scan them. Existing animal objectives are connected by injected resolver/hooks. Preserve that inversion after 002.

This plan should introduce a narrow read-only resolver that can answer the bound settlement condition needed by the objective, conceptually:

```text
storage infestation active/repaired
alive settlement rat count
```

Do not expose the whole `Settlement` or `SettlementsManager` to `QuestManager`.

### Completion semantics

No kill counter and no fixed kill requirement.

Objective satisfaction is live:

```text
!infestationActive && aliveRatCount <= 1
```

Intermediate NPC reminder text must distinguish:

- active + rats > 1,
- active + rats <= 1,
- repaired + rats > 1,
- repaired + rats <= 1.

The last case advances to normal report/completion.

`quests-progression-002` is a hard dependency. Implement against its final unified outcome/reporting contract; do not add compatibility code for current pre-002 terminal semantics. If 002 renames/restructures `QuestDef`, progress or resolution helpers, follow current code while preserving this plan's world-condition semantics.

## 9. Quest binding and settlement identity

The quest must bind to one concrete settlement id, preferably the same resolved settlement context already attached to settlement-scoped quest definitions by the app layer after 002 integration.

Do not key infestation state or rat queries by NPC display name.

Do not make the quest target “nearest settlement” dynamically after acceptance. The world problem has stable settlement identity and must survive save/load.

## 10. Dog mechanics — reuse unchanged

`src/fauna/dogGuard.ts`

Relevant symbol:

- `resolveDogPestTarget()`

Dogs already chase nearest live rat within the dog's own home-bounded radius after higher-priority guard/needs/lure behavior yields.

`src/settlement/rats.ts` also subtracts `RAT_DOG_SUPPRESSION` from pressure per alive settlement dog.

Do not add a quest-specific dog bonus. A dog helping reduce the population is an intended systemic solution contribution, even though V1 has no explicit alternate quest branch for it.

## 11. Important current limitation being removed

Current documented persistence class for rats is:

- not persisted,
- not seed-derivable,
- rebuilt from zero after settlement reconstruction and then reconciled from current food/dog pressure.

This plan intentionally changes that contract. Update the canonical fauna/persistence state docs when implementation lands; do not leave `docs/state/fauna.md` claiming rats reset if SaveData now preserves them.

## 12. Test seams

Prefer pure/focused tests around:

### Rat target

- normal formula unchanged,
- normal cap still 5,
- active infestation computes `max(normalTarget + 3, 7)`,
- repair returns to normal formula,
- dog count still contributes to normal target.

### Repair

- action unavailable/fails safely without 2 × `beam`,
- successful repair consumes exactly 2 × `beam`,
- successful repair flips only authoritative infestation condition,
- repair does not directly remove current rats.

### World condition

Pure resolver/evaluator for:

```text
active, 0 rats  -> false
active, 1 rat   -> false
repaired, 2     -> false
repaired, 1     -> true
repaired, 0     -> true
```

### Persistence

- registry capture/serialize/hydrate round-trip,
- stable IDs,
- individual `AnimalSaveState` fields survive,
- removed rat does not respawn,
- infestation condition round-trip,
- migration from previous save defaults cleanly.

Do not build UI testing infrastructure just for storage inspection/repair.

## 13. Focused implementation order

1. Wait for `quests-progression-002` to be implemented; then re-run preflight and verify the files above still own the same contracts.
2. Add settlement-owned infestation condition at `SettlementsManager` lifetime.
3. Add rat persistence registry using `AnimalSaveState` + livestock registry pattern.
4. Wire capture/restore/save migration.
5. Extend `ratPopulationTarget()` / `createSettlementRats()` with `max(normalTarget + 3, 7)` while preserving gradual reconciliation.
6. Extend settlement storage inspection to expose damaged state.
7. Add the narrow timed repair action requiring/consuming exactly 2 × `beam` and mutating the settlement condition.
8. Add the injected quest world-condition resolver/objective and authored quest text against post-002 lifecycle.
9. Add focused tests and update canonical state docs affected by the new persistence class.
10. Run typecheck/tests/build. Browser/manual verification is performed by User.

## 14. Guardrails

- No `RatManager` / `QuestRatManager`.
- No quest-owned infestation boolean.
- No `kill N rats` objective.
- No immediate rat cleanup on repair.
- No generic settlement-problem framework.
- No generic building-maintenance framework.
- No second storage owner.
- No duplicate animal snapshot schema.
- No quest-specific dog behavior.
- No direct `QuestManager` import of settlement/fauna systems.
- No persistence of Three.js objects.
- No tuning freedom for V1 infestation formula: use `max(normalTarget + 3, 7)`.
- No repair-cost substitution: use exactly 2 × `ItemKind 'beam'`.
- Do not implement before `quests-progression-002`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
