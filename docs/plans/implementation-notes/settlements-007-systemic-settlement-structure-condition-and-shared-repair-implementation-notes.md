# Implementation Notes: settlements-007 — Systemic settlement structure condition and shared repair

**Prepared:** 2026-09-12  
**Plan:** `settlements-007-systemic-settlement-structure-condition-and-shared-repair.md`

## 1. Existing condition/repair foundation is intentionally incomplete

`src/world/condition.ts` already owns the shared `0..100` condition math:

```text
ConditionState
checkpointCondition()
resolveCondition()
applyConditionDelta()
```

`src/world/repair.ts` already owns actor-neutral repair work math:

```text
RepairProgress
repairRemainingWork()
isRepairComplete()
applyRepairWork()
```

Do not add actor/material/settlement/NPC/player concerns to these files.

The landed `world-021` well repair flow is the strongest transaction reference:

```text
read-only quote
→ material preflight
→ atomic consume
→ checkpoint condition
→ create RepairProgress
→ work contribution
→ completion writes targetCondition
```

Resume does not re-consume materials.

## 2. `VillagePlan` provides stable structure identity but must stay immutable

`src/settlement/villagePlan.ts` defines:

```ts
VillageBuildingPlan {
  id
  role
  x/z/y
  footprint
  rotation
  plotId
  zoneId
  familyIndex
  familyId
}
```

`SettlementDef.plan` is the authoritative deterministic local layout. Its building ids are suitable persistent source identities.

Do not put mutable condition/repair state into `VillagePlan` or `SettlementDef`.

Important identity pitfall: `SettlementHouseLandmark.houseId` in `src/settlement/props.ts` is a visual variant / `HouseDefinition.id`, not physical building identity.

## 3. Correct ownership boundary is `SettlementsManager`

`src/settlement/SettlementsManager.ts` already owns long-lived mutable registries that survive runtime settlement unload/reload:

```text
EconomyRegistry
HouseholdRegistry
NpcStateRegistry
NpcRelationships
LivestockRegistry
rat infestation state
```

The runtime `Settlement` object is rebuildable presentation/agents over deterministic `SettlementDef` + those registries.

New structure condition state should follow this exact ownership model.

Prefer a dedicated small registry in `src/settlement/`, keyed by stable structure id (and able to validate/resolve settlement association), with manager methods analogous to:

```text
getStructureSnapshot(...)
snapshotStructureStates()
applyStructureDamage(...)
quoteStructureRepair(...)
beginStructureRepair(...)
contributeStructureRepairWork(...)
```

Do not make `Settlement` itself the persistent owner.

## 4. Sparse state is compatible with current architecture

Generated buildings begin pristine and their geometry/identity are re-derived from seed/plan. Therefore an absent mutable record can safely mean pristine condition if validation keeps that contract explicit.

Recommended runtime lookup semantics:

```text
no mutation record
+ known VillageBuildingPlan
→ resolved snapshot condition=100, no repair
```

Persist only mutated condition/anchor/repair state, not plan geometry or labels.

If implementation finds that eager records materially simplify correctness, that is acceptable, but do not persist deterministic plan data redundantly.

## 5. Initial structure adapter should be residential settlement houses

`VillagePlan.buildings` already contains domain roles and family links. The initial V1 repairable adapter should target actual residential settlement houses first because they have:

- stable plan building identity,
- household/family association through `familyId` / `familyIndex`,
- real physical runtime house meshes in `buildSettlementProps`,
- natural player/NPC approach semantics.

Do not treat every `VillageBuildingRole` as repairable until the runtime physical representation and interaction point are verified.

Keep the registry/policy contract role-extensible so production/public/utility structures can opt in later without another repair system.

## 6. Runtime house arrays are index-based projections

`createSettlement.ts` receives `SettlementLandmarks.houses` and `HouseAssembly[]` from `buildSettlementProps` and builds colliders by aligned house index.

Household/home systems also rely on family/home ordering today.

During implementation, add one explicit plan-building ↔ runtime-house mapping at prop-build/create-settlement time instead of reconstructing identity from mesh ordering in player/NPC code.

The mapping must expose stable `VillageBuildingPlan.id`; do not store the authoritative condition on the mesh.

## 7. Residential player-built houses are a construction reference, not the settlement-state owner

`src/world/residentialBuilding.ts` / `createResidentialBuildings.ts` already demonstrate:

- stable record identity,
- actor-neutral `contributeWork(id, amount)`,
- stage-owned work progress,
- materials supplied separately from work,
- runtime mesh rebuilt from authoritative record.

However these records represent player-built houses and are world-owned/save-persisted separately. Do not merge deterministic settlement-plan houses into `ResidentialBuildingRecord` merely to obtain repair.

Reuse the contribution principle, not the ownership type.

## 8. Shared material requirement policy

Construction already uses `MaterialRequirement` from `src/items/constructionMaterials.ts` and residential stage definitions reuse it.

Structure repair should derive one canonical requirement list from condition loss + structure repair policy.

Avoid separate tables such as:

```text
PLAYER_HOUSE_REPAIR_COST
NPC_HOUSE_REPAIR_COST
QUEST_REPAIR_COST
```

A material-source adapter should bridge existing stores to the same begin transaction.

### Player

Use the existing `Inventory` APIs and the same atomic preflight/consume style used by well/camp repair/construction actions.

### NPC / settlement

Prefer the actual owner/resource source:

- household-associated residential structure → owning household item stock where requirements are represented there,
- settlement/public structure → existing settlement/local economy/item stock seam.

Do not silently mint repair materials or delete a different abstract resource unless the current economy contract explicitly maps it.

If a required construction material is not currently available to NPC settlement stores, keep the target as material-blocked and document the missing production/logistics dependency rather than inventing a repair-only conversion.

## 9. NPC pressure must use the existing unified arbitration seam

`src/ai/Needs.ts` defines `NpcPressure` for need pressures. `src/ai/weatherPressure.ts` defines the broader `NpcDecisionTarget` union because world/healing/burial/etc. pressures are not fake Needs.

This is the correct extension point.

Recommended shape:

```text
structure problem snapshot
→ pure maintenance/repair pressure producer
→ { target: 'repairStructure', score/value }
→ same pickActionKind arbitration in NpcAgent.choose()
→ npcDecision outer sequencing
```

Do not add repair to `NeedId`.

Do not introduce a second decision engine or maintenance scheduler.

### Priority expectations

Ordinary structure maintenance should lose to:

- collapse sleep,
- severe weather shelter,
- critical physiological needs,
- urgent healing.

It can compete with ordinary work/schedule/idle depending on severity and ownership.

Do not make normal repair a critical interrupt in V1.

## 10. Avoid per-NPC/per-frame scans

`SettlementsManager` / loaded `Settlement` already know the local settlement and its deterministic plan.

Compute/cache/bound repair candidates at settlement level or on low-frequency NPC choice ticks, then pass a small candidate set into NPC context.

Do not make every NPC iterate every settlement/building each frame.

A useful candidate contract should contain only plain data needed for decision/action:

```text
structureId
settlementId
position / approach
condition
severity
repairActive
owner/family relation
```

## 11. NPC action should fit existing planned-action/work seams

`NpcAgent` is already split around:

```text
npcDecision.ts
npcAction.ts
npcStrategies.ts
npcPlan.ts
npcProfessionWork.ts
npcLogistics.ts
```

Keep target selection/pressure pure and put movement/work execution into the existing planned action shape.

The repair target owns accepted progress. NPC code should call the same manager contribution seam player code calls.

If materials are unavailable, do not spin every frame. Reuse an existing bounded wait/replan convention such as material-blocked construction work.

## 12. Player work should reuse current BusyAction helpers

`src/app/busyAction.ts` is the generic player channel. `src/app/actions/constructionWorkSession.ts` centralizes long physical construction-style work with player needs/stamina/vigor handling.

Prefer extending/reusing that helper for structure repair sessions rather than copying the older ad hoc well loop.

Interaction should resolve by stable structure id and relookup state before every mutation.

Required flow:

```text
interaction/inspection
→ live quote
→ begin repair if needed
→ BusyAction session
→ manager.contributeStructureRepairWork(structureId, work)
```

The player may continue an NPC-started repair and vice versa.

## 13. Condition while repair is active

Follow `PlayerWellRecord.roofRepair` semantics unless implementation proves another domain rule is needed:

- active repair stores a fixed `startedCondition`,
- condition does not continue lazy wear underneath the episode,
- completion writes `targetCondition` and resets the condition anchor.

This prevents hidden decay from invalidating already-quoted requirements/progress mid-episode.

Future destructive events during active repair are a separate policy decision; do not invent concurrent damage semantics in V1.

## 14. Damage API is future integration seam, not a new event system

Implement a domain mutation function around:

```text
checkpointCondition
applyConditionDelta(-damage)
```

It should accept stable structure identity and world day, not Object3D.

Do not add a generic persisted damage-event history or cause enum unless a current consumer needs it.

Weather, attacks, fire and passive wear should later call this state owner or use the same `ConditionState` math; they must not own separate durability values.

## 15. Persistence integration

`src/persistence/saveData.ts` is the schema owner and `src/app/saveState.ts` builds the snapshot from `WorldBundle` systems.

Add one settlement structure snapshot field and restore it when constructing `SettlementsManager`.

Persist only mutable state:

```text
condition
lastConditionUpdateAtDays
repair?
```

No x/z/role/family data.

Older saves without the field restore pristine condition.

If the schema field/semantics require a version change under current persistence policy, bump `CURRENT_SAVE_VERSION` and add a migration/test; do not merely loosen validation around malformed new records.

## 16. WorldBundle rebuild

The manager/registry is the state owner, but `WorldBundle` itself can be rebuilt. Ensure the same snapshot/carry-forward path used by settlement registries is wired through `worldBundle.ts` / `createApp.ts` rebuild setup.

Test separately:

```text
settlement stream-out/in
```

and:

```text
whole WorldBundle rebuild
```

They are different lifecycle boundaries.

## 17. Quest integration stays read-only

`quests-progression-016` implementation notes explicitly identified generic settlement structure repair as a missing domain mechanic.

Its established pattern is:

```text
domain authoritative state
→ narrow read-only lookup
→ opportunity / QuestManager
```

Expose a structure snapshot/problem lookup from settlements. Do not import `SettlementsManager` wholesale into `QuestManager` and do not let quest code call repair mutation methods.

The quest source id should be based on stable structure id, not runtime mesh identity.

## 18. Useful tests

At minimum add focused tests for:

- pristine default lookup,
- stable structure id resolution across regenerated `SettlementDef`,
- invalid/unknown id rejection,
- damage checkpoint + clamp,
- repair quote scaling,
- atomic begin transaction,
- partial progress and accepted-work clamp,
- resume without second material consumption,
- completion condition restoration,
- two actor adapters contributing to one episode,
- NPC repair pressure ordering/threshold,
- persistence round-trip including active partial repair,
- stream/rebuild state continuity,
- quest-facing snapshot disappearance when condition recovers.

## 19. Documentation updates after implementation

Update the owning current-state docs, not historical plan prose:

```text
docs/STATE.md
docs/state/settlements.md
docs/state/npc.md
docs/state/player-systems.md
docs/state/persistence.md
```

If quest integration itself is not implemented here, only document the new read-only seam; do not claim structure-repair opportunities are live.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
