# Implementation Notes: Hunter Profession Quests & Wildlife Help

**Plan:** `quests-progression-020-hunter-profession-quests-and-wildlife-help.md`  
**Reviewed against:** `main` 2026-09-12

## 1. Quest/dialogue baseline

`QuestManager` already supports several concurrent quest contexts for one NPC. `onInteract(npcId)` aggregates actionable contributions and exposes additional contexts through the generic topic contract; `labelMarker(npcId)` is a global reduction rather than first-match.

For Hunter I/II/III:

- reuse this existing multi-context path,
- do not add a Hunter-specific primary quest or topic selector,
- do not modify marker arbitration unless a genuinely new lifecycle state is introduced,
- keep state-changing speech behind explicit quest actions.

Relevant files:

- `src/quests/QuestManager.ts`
- `src/ui-vue/store.ts`
- `src/ui-vue/NpcDialogueMenu.vue`
- `src/quests/QuestManager.test.ts`
- `docs/state/quests.md`

## 2. Role-based quest materialization

Use the existing world-driven quest pipeline, not authored display names:

- `src/quests/opportunities/worldQuestMaterialization.ts::opportunityNpcsFromSettlement()` exposes stable NPC id + role from `SettlementDef`;
- `materializeSettlementQuestOpportunity()` is the existing data-only opportunity → `QuestDef` path;
- `src/app/createApp.ts` assembles/materializes world-driven quests before `QuestManager` construction.

Bind one deterministic adult Hunter `NpcId` per eligible settlement/context. Hunter II and III must reconstruct the same giver as Hunter I. Sequential gating remains normal `quest_outcome` prerequisites.

Do not add role lookup inside `QuestManager` and do not hardcode display names.

## 3. Hunter I/II progress: reusable counted harvest objective

`src/fauna/animalHarvest.ts::harvestAnimalIntoInventory()` is shared by player and Hunter NPC paths. It must remain quest-agnostic.

Add player-only reporting **after** successful player harvest at the player caller (`src/app/actions/survivalActions.ts` path), not inside shared harvest core. This prevents NPC Hunter work from progressing player quests.

Recommended shape:

```ts
type PlayerAnimalHarvestContext = {
  animalId: string
  animalKind: AnimalKind
  lootKinds: readonly ItemKind[]
}

questManager.onAnimalHarvested(context)
```

Objective:

```ts
{ type: 'harvest_animals', kind: AnimalKind, count: number }
```

This is a counted predicate objective, not a concrete-animal binding. Do not reuse `kill_target_animal`.

### Persistence

Current quest persistence is per `QuestProgressEntry`. Add one minimal generic stage-local counted progress field rather than a Hunter-specific registry.

Required lifecycle:

- entering counted stage → count `0`,
- matching report → increment capped at target,
- stage advance → clear/reset,
- save/load → exact count restored,
- legacy save → default `0`.

Do not persist harvested animal ids for this objective; corpse harvest is already one-shot.

Hunter I: `harvest_animals deer ×3` → `gather_item hide ×3`.  
Hunter II: `harvest_animals stag ×2` → `gather_item antler ×2`.

## 4. Antler loot: extend fauna harvest, not quests

`harvestAnimalIntoInventory()` currently owns normal knife-harvest mutation and returns its loot result. Extend the result generally (`lootKinds`, `extras` or equivalent), not with a quest-specific boolean.

`antler` belongs in normal item ownership:

- `src/items/items.ts`
- `src/items/itemCatalog.ts`
- `src/items/tradeCatalog.ts`

Generated/item indexes should remain generator-owned.

### 50% trophy roll

Do not use `Math.random()` in harvest. Follow the existing seeded RNG convention (`createSeededRandom()` plus an explicit deterministic key/hash where needed).

Only adult `stag` qualifies. Read the existing life-stage/juvenile state on `AnimalAgent`; do not infer adulthood from model scale.

Ordinary wild identity is not guaranteed across a full rebuild/save restore. Do not add per-individual wild-fauna persistence solely to freeze a future antler roll. The invariant is one deterministic roll for one authoritative corpse lifetime; `harvestMeat()` already makes corpse harvest one-shot.

Tests should prove a second harvest call cannot reroll or duplicate the trophy.

## 5. Hunter III: reuse fauna-023 attraction and actual consumption

`fauna-023` established the correct flow:

```text
world dropped item
→ attraction snapshot
→ AnimalAgent selection/movement
→ exact source revalidation
→ atomic item consumption
→ food relief
```

Relevant contracts:

- `src/fauna/animalDefs.ts` — `AnimalDef.diet`, diet matching,
- fauna attraction logic / `AnimalAgent`,
- `src/items/createDroppedItems.ts` — atomic non-pickup consume,
- `src/app/gameLoop.ts` — shared attraction snapshot pass,
- `src/fauna/AnimalSpawner.ts` / `src/fauna/createFauna.ts` — thicket and `spawnPointId` provenance.

Add `apple`, `carrot`, `berries` to deer/stag diet compatibility through `AnimalDef.diet`; do not add quest-only feeding behaviour.

The missing quest seam is notification of **successful loose-food consumption** after atomic source removal succeeds and relief is applied. Include at least:

```ts
{
  animalId: string
  animalKind: AnimalKind
  spawnPointId?: string
  itemKind: ItemKind
}
```

`QuestManager` matches this against `feed_habitat_animals` by target `spawnerId`, accepted species and allowed food.

### Dedupe boundary

Within one runtime keep a small stage-local `Set<animalId>` so one animal contributes at most once. Persist only the objective count.

Ordinary wild `animalId` is not durable across full restore, so exact lifetime dedupe cannot be reconstructed. Do not serialize runtime animal ids as if they were stable and do not expand fauna persistence for this quest. This means a post-restore animal may contribute again; document/test this as the explicit V1 persistence boundary.

## 6. Tests worth prioritizing

Focus on seams easy to regress:

- NPC Hunter harvest never increments player `harvest_animals`,
- player successful harvest increments exactly once,
- wrong species does not progress,
- counted progress survives save/load and resets on stage advance,
- Hunter I consumes exactly `hide ×3`,
- Hunter II remains gated by Hunter I outcome,
- juvenile stag never yields antler,
- same corpse cannot reroll antler,
- Hunter II consumes exactly `antler ×2`,
- successful feed report fires after actual atomic consumption, not approach/selection,
- wrong `spawnPointId` / species / food does not progress,
- same runtime `animalId` contributes once,
- generic fauna-023 attraction remains unchanged with no active Hunter quest,
- multiple Hunter quest contexts use the existing generic NPC dialogue aggregation.

## 7. Implementation order

1. Re-read current `QuestManager` counted-progress/persistence shape and multiple-context dialogue contract.
2. Add generic counted objective persistence + player-only `harvest_animals` reporting.
3. Add `antler` item + deterministic trophy resolver and Hunter I/II materialization.
4. Add deer/stag diet compatibility + successful-consumption report + Hunter III materialization.
5. Add focused tests for persistence, wrong-source rejection and NPC/player harvest separation.
6. Update `docs/state/quests.md`, fauna/items state docs only where public contracts changed.

Important architectural/public functions and types added for counted objectives, harvest reporting, trophy resolution or consumption reporting should receive concise JSDoc with the appropriate `@domain` tag.

## 8. Model recommendation

**Model:** Opus, Sonnet

The remaining scope is narrower than the original combined Hunter+Guard plan but still crosses quest lifecycle/persistence, fauna harvest/attraction and item ownership. Opus remains the safer primary model; Sonnet is the lower-cost fallback.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
