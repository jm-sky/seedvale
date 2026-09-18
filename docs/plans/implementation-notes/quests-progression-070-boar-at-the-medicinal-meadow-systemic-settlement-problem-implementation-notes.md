# Implementation notes: quests-progression-070 — Boar at the medicinal meadow

## Purpose of these notes

These notes record the current code seams that matter for implementing `quests-progression-070`. They intentionally do not repeat the plan.

Both direct dependencies are still planned and currently have no implementation notes:

- `npc-057-npc-destination-threat-assessment.md`
- `world-terrain-042-medicinal-herb-meadow-patches.md`

Treat the dependency contracts below as the integration target. If those plans land with different symbol names, follow the landed architecture rather than adding adapters that duplicate their ownership.

## Quest architecture: use the world-driven opportunity pipeline

The closest landed architecture is not the static authored `QUESTS` array. It is:

```text
world/settlement state
→ SettlementQuestOpportunity
→ selectSettlementQuestOpportunities()
→ materializeSettlementQuestOpportunity()
→ QuestDef
→ QuestManager
```

Relevant files:

- `src/quests/opportunities/worldQuestOpportunityTypes.ts`
- `src/quests/opportunities/settlementQuestOpportunities.ts`
- `src/quests/opportunities/settlementQuestSelection.ts`
- `src/quests/opportunities/worldQuestMaterialization.ts`
- `src/app/createApp.ts`
- `src/quests/QuestManager.ts`

`SettlementQuestOpportunity` is explicitly data-only: it exposes an authoritative world problem but is neither quest progress nor world state.

Add a boar-meadow opportunity variant there rather than teaching `QuestManager` how to discover meadows/fauna.

A suitable record needs only stable world references needed for materialization, conceptually:

```ts
type MedicinalMeadowBoarOpportunity = {
  id: string
  settlementId: string
  kind: 'medicinal-meadow-boar'
  patchKey: string
  boarAnimalId: string
}
```

Do not put transient `AnimalAgent`, chunk, mesh or runtime planner references in the opportunity.

The opportunity id should remain the existing authored quest id `dzik-przy-szlaku` if save compatibility permits one definition with that stable id. Do not create both the old authored definition and a generated definition with the same id.

## Static authored definition conflict

`src/quests/quests.ts` currently contains the authored `dzik-przy-szlaku` definition:

- giver Marek,
- stage 1 talks to Piotr,
- stage 2 is generic `kill_target_animal boar`,
- copy claims the route is blocked/cleared.

Once the world-driven definition is materialized, remove/replace this static definition from the `QUESTS` path so validation/composition never sees two definitions with the same id.

Do not retain Piotr as a hidden prerequisite or resolver fallback.

## Stable NPC identity and affected-NPC selection

Use the existing lightweight NPC projection from:

`src/quests/opportunities/worldQuestMaterialization.ts::opportunityNpcsFromSettlement()`

It derives stable `NpcId` from `SettlementDef` via:

- `flattenedSettlementMembers()`
- `settlementNpcId()`

Do not inspect loaded `NpcAgent` instances to choose the affected NPC.

Current `OpportunityNpc` already exposes:

```ts
{
  id: NpcId
  name: string
  role: Role
  child: boolean
}
```

For this plan, selection is:

1. first deterministic living/adult Herbalist equivalent available from the composition data;
2. otherwise Anna.

Important gap: `OpportunityNpc` currently has `child`, not live/dead authoritative NPC state. If NPC death persistence can make an authored/procedural resident dead before world-driven quest composition, use the existing authoritative NPC-state registry/composition seam to exclude dead Herbalists. Do not add a second death flag to opportunity data.

Anna is guaranteed in the home settlement through the reserved home families in:

- `src/ai/characters.ts::RESERVED_CHARACTERS`
- `src/settlement/families.ts::reservedHomeFamilies()`

Bind runtime quest NPC refs by `NpcId`; `giverName`/affected display name is presentation only.

Marek remains the giver. Resolve Marek from the same stable home-settlement NPC projection, not by runtime display-name matching.

## Dependency contract: medicinal meadow

`world-terrain-042` owns meadow identity and lookup.

070 should consume the landed equivalent of:

```ts
type MedicinalMeadowRef = {
  patchKey: string
  x: number
  z: number
}
```

Required properties:

- deterministic from world seed + query context,
- no chunk materialization required,
- stable across rebuild/load,
- `patchKey` is world-terrain-owned.

Do not derive a second quest-side patch id from floating-point coordinates.

The composition layer should request one productive nearby patch for the home settlement with quest-level preferences (forest edge / distance / outside settlement core) through the lookup options exposed by 042. Do not hardcode those preferences into the generic terrain resolver.

No suitable meadow means no world problem/opportunity.

## Fauna composition: persistent occupant already solves identity/save-load

Reuse:

- `src/fauna/persistentOccupants.ts::PersistentOccupantDecl`
- `persistentAnimalId()`
- `createPersistentOccupantRegistry()`
- `src/fauna/createFauna.ts`

A persistent slot is identified by:

```text
habitatId + occupantKey
```

and gives a stable:

```text
persistent:<habitatId>:<occupantKey>
```

animal id.

The existing registry already handles:

- fresh spawn,
- snapshot/hydrate,
- live state persistence,
- corpse persistence,
- tombstone after `readyToRemove()`,
- preventing ordinary population fill from stealing the reserved slot.

Do not add boar-specific SaveData.

## Surface habitat: use the existing extraHabitatSpawners path

`createFauna()` already accepts `extraHabitatSpawners`:

```ts
{
  id
  x
  z
  type: PreySpawner['type']
  kind
  respawnIntervalDays
  maxPreyCount
}
```

Persistent declarations that are not cave-backed resolve their `habitatId` through `spawnerById`, then spawn at that habitat and pass its id as `spawnPointId`.

Therefore the boar meadow should be composed as:

```text
stable MedicinalMeadowRef
→ deterministic surface PreySpawner id
→ PersistentOccupantDecl using that id
→ ordinary AnimalAgent with stable persistent animalId
```

Relevant files:

- `src/fauna/AnimalSpawner.ts`
- `src/fauna/createFauna.ts`
- `src/app/worldBundle.ts`

Current `SpawnerType` is:

```ts
'rockDen' | 'thicket' | 'grove' | 'wolfDen'
```

Do not automatically add a new type. First inspect the semantic/presentation side effects of the existing neutral-looking types.

A type is not only a tag: spawner types can affect labels, props, lifecycle defaults and other behavior. If none is semantically safe for an unrendered/open surface anchor, extend the generic spawner contract deliberately rather than reusing a misleading den/grove presentation.

The meadow boar needs a one-individual persistent slot. Keep ordinary capacity at zero after reservation (e.g. `maxPreyCount: 1` with one persistent slot) so the habitat does not also produce generic boars.

Avoid a finite ordinary respawn path for the quest problem. The persistent slot/tombstone is the one-shot lifecycle authority.

## Important locality correction: spawnPointId is not movement authority

Do not assume `spawnPointId` itself keeps the boar near the meadow.

Current fauna architecture explicitly distinguishes:

- `spawnPointId`: habitat identity/context and death accounting;
- `AnimalAgent.home` / `currentRoamHome()`: movement home.

`fauna-034` reinforced that `currentRoamHome()` is the return/rest anchor; the spawner coordinate must not become a second movement authority.

Therefore implementation must verify how `spawnAgent()` initializes the ordinary surface animal's `home` from its spawn position. The meadow persistent occupant should naturally receive the meadow spawn as its home through that existing path.

Only if the existing species roaming radius lets a boar drift too far should the implementation add a generic habitat/agent roam-bound parameter. Do not add quest code that teleports or steers the boar back.

## Boar danger semantics

The persistent meadow resident remains `kind: 'boar'` with normal variant/default stats.

Do not call the existing quest dangerous-trait seam (`DangerousTraitApplier` / `markDangerous()`) for this quest.

`npc-057` is expected to own the reusable human-danger resolver. If normal boar currently contributes insufficient destination danger, correct that generic fauna danger semantics there rather than applying a 070-only modifier.

## Exact quest target: do not use AnimalTargetResolver(kind)

`QuestManager` currently owns temporary target bindings for generic authored `kill_target_animal` objectives, resolved through:

```ts
type AnimalTargetResolver = (kind: AnimalKind) => string | undefined
```

That resolver is intentionally species-based and can choose an unrelated boar.

070 already knows the stable `persistentAnimalId(habitatId, 'resident')` at composition time.

Prefer an objective/materialization shape that binds this exact id directly, following existing exact-id objective patterns such as:

- `recover_lost_livestock { animalId }`
- `treat_animal { animalId }`
- `kill_bound_animal { animalId }`

If the existing `kill_bound_animal` semantics are suitable for player-attributed death and stage transition, reuse them rather than inventing another exact-kill objective.

Do not weaken generic `kill_target_animal` to accept arbitrary ids or special-case `dzik-przy-szlaku` inside `AnimalTargetResolver`.

## External resolution: reuse WorldQuestSourceLookup

The generic external-resolution machinery already exists.

`WorldQuestSourceStatus` is:

```ts
'untracked' | 'present' | 'resolved' | 'absent'
```

`QuestManager.meetsAvailability()` already suppresses world-driven offers when status is not `present`.

For active world-driven quests, `QuestManager` already checks source status and when it becomes `resolved` applies:

```ts
externalResolutionOutcome(def)
```

Existing materialized wolf-den quests use `RESOLVED_WITHOUT_PLAYER_OUTCOME` as a failed/terminal outcome with no positive rewards.

Use this mechanism for the meadow boar.

The source lookup for 070 should classify the authoritative persistent occupant state, not quest progress:

- alive problem resident -> `present`,
- externally dead/resolved problem -> `resolved`,
- declaration/patch cannot exist in this world -> `absent`,
- unrelated quest id -> `untracked`.

Be careful with corpse semantics. The plan says a dead boar means the danger problem is resolved, even while its corpse remains in the persistent occupant registry. Source status must therefore distinguish "live problem" from "persistent slot still has a corpse". Do not wait for tombstone/removal to resolve the quest.

## Player kill attribution versus external death

The existing `animal_died` event is cause-independent at the fauna level; `AnimalAgent.collapse()` fires the shared death callback regardless of cause.

070 must not infer player credit merely from "exact boar is dead".

Use the existing quest event path that specifically represents a player-caused exact kill if one is already available for `kill_bound_animal`. If current plumbing only supplies cause-independent `animal_died`, extend the narrow death report/context at the world→quest seam rather than reading player proximity or comparing timestamps.

Required ordering:

```text
player exact-kill event reaches QuestManager
→ player completion wins

otherwise source status later observes dead boar
→ RESOLVED_WITHOUT_PLAYER_OUTCOME
```

There is already a regression test in `QuestManager.test.ts` for a player action winning before external-resolution polling. Preserve that ordering.

## Opportunity collection/materialization

Extend the existing opportunity files rather than create a second mini-pipeline:

- add the discriminated opportunity type to `worldQuestOpportunityTypes.ts`,
- collect/construct the stable home problem from the composition context,
- materialize it in `worldQuestMaterialization.ts`,
- expose source status through the same `WorldQuestSourceLookup` injected into `QuestManager`.

The current `collectSettlementQuestOpportunities()` inputs only know spawners/livestock/persisted quest ids. The meadow problem also needs the resolved meadow + boar declaration/context. Do not force this through a fake `PreySpawner` search if the composition root already has a direct problem descriptor. Extend the collector input with a narrow data-only problem record.

Persisted generated-quest reconstruction exists for generated world quests because their ids vary. Since this plan preserves the fixed `dzik-przy-szlaku` id, inspect current save behavior before adding any reconstruction branch. Do not introduce a second id format unless needed.

## Quest dialogue/materialization

The materialized `QuestDef` should carry:

- giver `QuestNpcRef` = Marek stable id,
- stage talk target = affected NPC stable id,
- exact boar objective id,
- settlement id,
- normal `renown >= 10` prerequisite,
- player-kill complete outcome,
- `RESOLVED_WITHOUT_PLAYER_OUTCOME` terminal external outcome.

Use the affected NPC name only in generated presentation strings.

Remove every route-specific claim from the old copy.

The affected NPC conversation may describe the meadow qualitatively; do not require a map landmark or a separate location persistence model.

## Dependency contract: npc-057 / Herbalist

Current herbal gathering is in:

- `src/world/herbalGathering.ts`
- `src/ai/npcProfessionWork.ts::planHerbalistWork()`

Current hooks are:

```ts
type SettlementHerbalGatherHooks = {
  queryNearest(x, z, range)
  harvest(target)
}
```

and `planHerbalistWork()`:

1. deposits carried medicinal resources;
2. produces dressing when inputs exist;
3. queries nearest herb within `HERBAL_GATHER_RADIUS = 60`;
4. travels;
5. revalidates through `harvest(target)`;
6. deposits the real collected item.

`npc-057` is expected to change selection from one nearest target to a bounded candidate set plus one bounded fauna threat snapshot. 070 must consume that landed path; do not add a second meadow-specific safety test.

Important: the quest does not need to force the Herbalist specifically to the chosen meadow. The systemic proof is that the meadow's real herbs become eligible through ordinary work when they are competitive candidates and safe. Do not hard-wire `patchKey` into `planHerbalistWork()`.

## Anna fallback: likely code seam and guardrail

No current generic non-Herbalist medicinal-gather opportunity exists.

Do not mutate Anna's `Role` and do not call `planProfessionWork()` with a forged `role: 'herbalist'`.

The closest architectural precedent is household-help work: a helper-specific opportunity can reuse a narrow shared execution planner without pretending to own the profession.

If Stage 3 stays in this plan:

1. extract/reuse the smallest actor-neutral herb gather action builder from `npcProfessionWork.ts`;
2. keep target discovery/harvest in `SettlementHerbalGatherHooks`;
3. let Anna's opportunity call the shared action with her real `NpcWorkContext`/inventory/household;
4. insert it at an existing low-priority opportunity seam in `NpcAgent`, after hard needs/commitments and before generic idle fallback;
5. store only a transient cooldown if one is needed; do not add `herbNeed` persistence.

Before adding a new cooldown, search existing per-NPC transient opportunity cooldown patterns and reuse their time source/cadence.

If doing this cleanly requires a new general activity framework, stop Stage 3 and split it into a follow-up, as the plan permits. Do not contaminate Stages 1–2.

## Household deposit semantics for Anna

Herbalist currently gathers into `ctx.carried`, then `depositCarriedItems(..., household, HERBAL_YIELD_KINDS, ctx.simTime())`.

Reuse this exact authoritative flow for Anna if she performs the fallback activity:

```text
real world item
→ ChunkManager.collectItem()
→ NPC carried Inventory
→ Household deposit
```

Do not directly increment household stock when Anna arrives at the meadow.

## Composition root / ordering

The critical boot ordering is:

1. resolve home settlement definition and stable NPC projections;
2. resolve `MedicinalMeadowRef` from world-terrain;
3. derive stable surface habitat id from `settlementId + patchKey`;
4. include extra habitat spawner + persistent occupant declaration in `worldBundle.ts::buildFauna()`;
5. construct/reconstruct the fauna instance;
6. construct the data-only boar-meadow problem descriptor/opportunity from the same deterministic refs;
7. build materialized world-driven quest definitions before `new QuestManager`;
8. inject a source-status lookup that can read whether the exact persistent boar is still alive.

Avoid ordering where quest materialization asks a partially booted `Fauna` to scan for "a boar". Identity is derivable before live-agent lookup.

## Save/rebuild details

Persistent occupant state is already carried by:

- `SaveData.persistentHabitatOccupants`
- `SaveData.removedPersistentOccupantSlots`

The declaration itself must be rebuilt deterministically every load/rebuild from the same meadow `patchKey`.

Do not persist:

- meadow coordinates,
- patch key,
- habitat definition,
- affected NPC choice,

unless landed dependency behavior proves one of those cannot be deterministically reconstructed.

The active quest's normal `QuestManager` save state keeps quest lifecycle/outcome. The world source remains independently reconstructible.

## Spawner lifecycle caveat

`PreySpawner` has generic depletion/destruction/recovery state. The meadow problem is not meant to become a player-destroyable den/grove scenario.

When reusing `extraHabitatSpawners`, verify that the chosen type does not accidentally expose:

- a visible den/grove prop,
- `[E] Zniszcz`,
- depletion/recovery semantics that can resurrect/replace the one-shot problem.

The authoritative one-shot lifecycle is the persistent occupant slot/tombstone.

If necessary, extend the generic surface habitat representation so an invisible/non-destructible anchor can participate in `spawnerById` without inheriting unrelated presentation/destruction mechanics.

## Existing tests worth copying/extending

Use existing test patterns from:

- `src/quests/opportunities/settlementQuestOpportunities.test.ts` — opportunity collection + stable ids;
- `src/quests/opportunities/rpgQuestMatrices.test.ts` — materialization/selection;
- `src/quests/QuestManager.test.ts` — world-driven source status and player-completion-before-external-resolution;
- `src/fauna/persistentOccupants.test.ts` — stable id, hydrate/mismatch/tombstone;
- fauna/createFauna tests around persistent occupant declarations and reserved capacity;
- `src/world/herbalGathering*.test.ts` / profession-work tests for revalidation and real item collection.

High-value 070-specific assertions:

- old static quest definition is not present alongside the generated one;
- same meadow patch produces same habitat id and persistent boar id;
- source status becomes resolved immediately on boar death, not only after corpse removal;
- unrelated boar death cannot complete the quest;
- exact player kill beats external-resolution polling;
- resolved/tombstoned boar never creates an offer on reload;
- Herbalist selection is stable and Anna fallback does not mutate role.

## Implementation sequence

### Stage 1: world problem + quest

1. Land/consume `MedicinalMeadowRef`.
2. Build deterministic meadow surface habitat id.
3. Feed surface spawner + `PersistentOccupantDecl` into `worldBundle.ts::buildFauna()`.
4. Add data-only opportunity/source-status contracts.
5. Replace the static authored `dzik-przy-szlaku` definition with materialized world-driven definition.
6. Bind exact persistent boar id.
7. Reuse `WorldQuestSourceLookup` + `RESOLVED_WITHOUT_PLAYER_OUTCOME`.
8. Cover save/load and external death.

### Stage 2: Herbalist systemic consequence

1. Land/consume npc-057 candidate safety integration.
2. Select Herbalist first, Anna only if no eligible Herbalist.
3. Verify ordinary Herbalist work can avoid/resume the meadow based solely on real destination risk.

### Stage 3: Anna fallback

1. Extract/reuse actor-neutral herb gather action if clean.
2. Add low-priority Anna-only household herb opportunity.
3. Reuse npc-057 and real harvest/deposit.
4. Split to follow-up rather than introduce a broad new activity framework.

## Model choice

This implementation crosses quest materialization, fauna composition/persistence, NPC work and two unfinished dependency contracts. It benefits from a model that can maintain ownership boundaries across several existing systems.

Recommended implementation models, in order:

1. Sonnet
2. Composer
