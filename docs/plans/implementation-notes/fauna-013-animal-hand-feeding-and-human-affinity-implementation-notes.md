# fauna-013 — Animal hand-feeding and human affinity — Implementation Notes

> Review against current `main`. The plan's feeding foundation is already partly implemented by fauna-011; extend it instead of creating a second interaction path.

## Current codebase facts

- Generic player → animal feeding already exists:
  - `src/app/interactables.ts` computes `feedItemKindFor(animal)` and shows `Nakarm` through the existing `Interactable.kind === 'animal'` path.
  - `src/app/gameLoop.ts` dispatches the existing animal interaction to `feedAnimal(target.animal, inventory)`.
  - `src/app/actions/survivalActions.ts` owns `feedAnimal()`: it uses `selectDietFeedKind()`, calls the animal once, and removes exactly one item only after success.
  - `src/app/actions/survivalActions.test.ts` already covers compatible item selection, one-item consumption and no consumption when feeding is rejected.
- `AnimalAgent.feedByPlayer(itemKind)` currently only checks `def.diet.items[itemKind]` and calls shared `consumeFood(this.life, relief)`. It does **not** reject a satiated animal and cannot attribute the interaction to a human actor.
- `AnimalLife.ts` remains the authoritative hunger mutation boundary. Keep using `consumeFood()` and diet relief values from `AnimalDef`; do not add hand-feed-specific nutrition numbers.
- Domestic animals already have stable `animalId`, `ownerHouseId` and persistence via `src/settlement/livestock.ts`. `LivestockSaveRecord` extends `AnimalSaveState`, so affinity for dogs belongs in this existing snapshot/hydrate path, not in a new dog save structure.
- `src/persistence/saveData.ts` explicitly validates `LivestockSaveRecord`; any new affinity field must be optional/backward-compatible and added to that validator.
- Dog social/stranger behaviour already lives in the pure `src/fauna/dogGuard.ts` resolver. `resolveDogBarkStimulus()` currently filters owning-household NPCs by `homeId` and otherwise treats nearby settlement NPCs as strangers. There is no affinity/familiarity concept yet.
- `PlayerController` has no persistent actor id abstraction. Do not introduce a project-wide actor identity refactor for this plan.

## Recommended implementation shape

### 1. Upgrade the existing feeding transaction

Keep the current player adapter in `survivalActions.ts` and the existing interaction/raycast pipeline. The domain method on `AnimalAgent` should become actor-neutral enough to support future NPC feeding, e.g. accept `itemKind` plus a stable human identity, while the player adapter supplies the player identity.

Do not let `survivalActions.ts` decide hunger acceptance, diet relief or affinity gain. Its responsibility should stay:

```text
select carried compatible item
→ ask animal domain operation to accept it
→ remove exactly one item only after success
```

The current ordering already protects inventory on rejection. Preserve it.

### 2. Hunger acceptance belongs beside `AnimalLifeState`

Add one small shared acceptance rule based on current hunger, preferably a pure helper in/next to `AnimalLife.ts` (for example `canAcceptFood(life)`). `AnimalAgent` should re-check it at the moment the feed is committed.

The existing `NEED_ELEVATED_THRESHOLD` is the first value to inspect/reuse; avoid adding an independent cooldown/diminishing-return system unless browser verification proves it necessary.

Important regression: `interactables.ts` currently shows `Nakarm` whenever compatible inventory exists. Make its prompt gating reuse the same acceptance predicate so a satiated animal normally shows the next valid interaction instead of offering an action that will immediately fail. The domain operation must still revalidate acceptance because the per-frame prompt is not authoritative.

### 3. Sparse affinity belongs to persistent animal state

Keep affinity on the individual `AnimalAgent`, not in a global relationship manager. A sparse map/list keyed by stable human id is sufficient; create an entry only when a real interaction changes affinity.

Only affinity-enabled species should retain this state in V1. The cleanest existing configuration seam is `AnimalDef`; add a small optional affinity config/capability to `dog` rather than checking `kind === 'dog'` throughout feeding code. Non-enabled animals should not allocate or persist empty relationship collections.

Snapshot as an optional sparse serializable collection on `AnimalSaveState`; hydrate to the runtime sparse representation. Because `LivestockSaveRecord` already embeds `AnimalSaveState`, this automatically follows settlement stream-out/save/load once `snapshot()`, `hydrate()` and `saveData.ts` validation are updated.

Wild fauna remains non-persistent; do not extend wild-fauna persistence for this feature.

### 4. Human identity: keep it deliberately small

There is no shared persistent player/NPC actor-id abstraction today. For V1 use a stable namespaced value rather than an object reference or array index, e.g. a tiny fauna-facing `HumanId` convention with one player id and future `npc:<NpcId>` ids.

Do not persist owning-household members as affinity entries: ownership familiarity still resolves from `ownerHouseId -> Household.members` / `homeId` context.

### 5. Integrate familiarity into `dogGuard.ts`, not a parallel dog social system

Generalize the existing stranger candidate seam instead of adding another bark/relationship evaluator. `resolveDogBarkStimulus()` is already the authoritative pure place deciding whether a nearby non-household human is a stranger.

Recommended change:

- evolve `StrangerNpcCandidate` into a narrow human candidate carrying stable human id, position and optional `homeId`,
- keep `homeId === ownerHouseId` as contextual familiarity from ownership,
- additionally suppress/reduce the `stranger` stimulus when that candidate's affinity reaches the dog familiarity threshold,
- keep guard-target priority completely unchanged.

The player is not currently represented in `nearbySettlementNpcs`; use the player data already available to `AnimalAgent.update()`/perception rather than introducing a new world scan. This is necessary for the plan's required observable behaviour: a dog must be able to treat the **player** as less of a stranger after repeated feeding.

Do not let affinity affect `resolveDogGuardTarget()`, ownership, protected household membership or combat loyalty in this plan.

## Persistence and compatibility

- Add affinity as an **optional** field so older saves remain valid.
- Update `AnimalAgent.snapshot()` / `hydrate()` and `isLivestockSaveRecord()` in `src/persistence/saveData.ts` together.
- Validate affinity entries defensively: stable id string, finite bounded numeric value; discard/deny malformed entries rather than trusting save input.
- Keep transient feeding action, bark cooldowns and current bark stimulus out of persistence.

## Tests worth adding

Extend existing focused tests instead of creating a large integration harness:

- `survivalActions.test.ts`: satiated/rejected feed leaves inventory unchanged; successful feed still removes exactly one item.
- `AnimalLife.test.ts` or a small fauna-domain test: acceptance threshold and nutrition relief use shared life/diet state.
- affinity domain tests: successful meaningful dog feed creates/increments only the feeding human entry; non-affinity species do not create state; different human ids remain independent.
- `dogGuard.test.ts`: owning-household member remains familiar by ownership; unfamiliar outsider can trigger stranger bark; affinity-trusted outsider does not (or has reduced relevance); guard target resolution is unchanged.
- livestock/save tests: sparse affinity survives `snapshot -> save validation -> hydrate`; old records without affinity still load.

## Pitfalls

- Do not implement a second `handFeedAnimal()` interaction pipeline: fauna-011 already shipped it.
- `feedByPlayer()` currently accepts food regardless of hunger; this is the main gameplay correctness gap to fix before awarding affinity.
- Do not remove inventory before the animal domain operation succeeds; the existing transaction ordering is already correct.
- Do not put affinity rules in `interactables.ts`, `gameLoop.ts` or UI prompt code.
- Do not use `QuestManager` player relations or `npcRelationships.ts`; those stores model different relationships and ownership boundaries.
- Do not create affinity records for every livestock animal/human pair.
- Do not broaden this into following, commands, ownership transfer, negative memory/fear, NPC caretaker jobs or a general relationship framework.
