# Implementation Notes: quests-progression-008 — Treasure map bear cave

**Reviewed:** 2026-09-13  
**Baseline:** current `main` after dungeon cave work; coordinated with updated `world-terrain-028`

## Main recon finding

Current production behaviour conflicts with the desired quest shape:

- `src/world/caves/caveContentAnchors.ts::resolveCaveContentAnchors()` creates required `sideTreasure` + `finalTreasure` anchors for every accepted `adventure` cave;
- those anchors are good reusable placement slots and should remain;
- `src/app/worldBundle.ts::caveTreasureContainerSpecs()` currently converts **every** side/final anchor into a generic `WorldGeneratedContainer`;
- `src/app/worldBundle.caveTreasure.test.ts` explicitly asserts exactly two treasure chests for an adventure cave.

Therefore quests-progression-008 must **not** add a third chest or replace a chest after world creation. Implement/consume `world-terrain-028`'s profile-aware materialization first.

The agreed shared profiles are:

```text
EMPTY            80% of unreserved adventure caves
QUEST_TREASURE   authored reservation for this quest
DOUBLE_TREASURE  20% of unreserved adventure caves
```

`quests-progression-025` now requires a separate `EMPTY` adventure cave. The bear quest owns one `QUEST_TREASURE` cave and its `finalTreasure` slot.

## Current codebase facts

### Cave placement / RNG

- `Caves.archetypeOf(caveId)` is the archetype authority.
- `Caves.contentAnchorsOf(caveId)` exposes adventure semantic anchors with real underground `x/y/z/yaw`.
- `sideTreasure` and `finalTreasure` are placement semantics, not mutable loot state.
- `createCaveRandom()` + `CAVE_RNG_SALT` already provide independent per-cave RNG streams.
- `adventureContent` is already used for anchor placement. The A/C profile roll needs its **own** salt so loot decisions cannot shift anchor placement.
- `world-terrain-028` generalizes content anchors for natural/dungeon stories and owns the adventure profile/reservation contract.

### Composition order

`WorldBundle` owns caves and world-generated containers. `QuestManager` is materialized later in `createApp.ts`.

Consequently the bear cave cannot be selected inside active quest progress after generic cave chests have already been created.

Resolve deterministic authored cave reservations during world/composition setup, before profile-aware cave treasure materialization, then expose the resulting stable binding to quest materialization.

Do not make world creation depend on whether the quest is accepted or which stage it is in.

### Bear

- `fauna-019` is implemented: use `AnimalHabitatBinding` backed by `Caves.resolveHabitat()` plus cave-scoped ground/containment.
- `fauna-018` is implemented in `src/fauna/persistentOccupants.ts`.
- use one `PersistentOccupantDecl { habitatId, occupantKey: 'resident', kind: 'bear' }`;
- persistent animal identity/snapshot/corpse/tombstone remain fauna-owned.

### Containers

- `WorldGeneratedContainers` can use explicit underground Y and cave `WorldSpatialContext`, but are intentionally fixed/non-portable.
- `PlacedContainers` own whole-container carry/put-down and persisted contents, but current `PlacedContainerRecord` stores x/z/yaw only and `createPlacedContainers()` places meshes using the supplied surface `sampleHeight`.
- current `Inventory` / `ItemInstance` serialization does not provide a generic nested inventory/container item.

So do not assume a portable casket can simply be spawned underground through today's `PlacedContainers.place()`.

## Recommended implementation order

### 1. Finish/consume `world-terrain-028` profile-aware materialization

Refactor the existing unconditional cave treasure seam, not the anchor generator.

Required results:

```text
EMPTY
→ no generic cave treasure specs

QUEST_TREASURE
→ no generic side/final loot specs
→ finalTreasure reserved for authored quest content

DOUBLE_TREASURE
→ same side + final generic specs as current code
```

Preserve current anchor ids and the existing `caveSide` / `caveFinal` loot profiles for `DOUBLE_TREASURE`.

Reservation arbitration happens before the generic 80/20 roll. Use deterministic reservation keys and expose the resolved stable cave/profile/anchor binding; do not persist it.

### 2. Bind the bear quest to the reservation result

Do not make `bindExactCaveQuests()` the selector. It only decorates already-selected contextual cave data.

The bear quest binding must require:

```text
archetype === adventure
profile === QUEST_TREASURE
finalTreasure anchor exists
```

Keep cave id + anchor id/role, not copied coordinates or runtime objects.

Use that same cave id for:

- quest location/navigation;
- `AnimalHabitatBinding`;
- persistent bear declaration;
- authored treasure placement.

### 3. Grave/map through existing one-shot dig seam

`src/app/actions/groundActions.ts` already performs ordinary shovel completion → buried-find resolution → resolved spot bookkeeping → cemetery disturbance handling.

Generalize the explicit hidden-find seam only enough to represent the authored map keyed by stable grave identity.

Ordering invariant:

```text
resolve same grave spot exactly once
→ persist resolved spot
→ report quest progress
→ ordinary grave exposure remains one-shot
```

Do not add `mapRecovered` save state if normal quest stage + resolved hidden-find spot already express it.

### 4. Use only `finalTreasure`

The `QUEST_TREASURE` cave has one treasure encounter.

Do not materialize/use the generic `sideTreasure` chest and do not seed generic `caveFinal` loot.

Authored payload is exactly:

```text
coin: N
ruby: 1
```

One tuning source owns `N`.

### 5. Portable casket lifecycle

Preferred shape if a shared underground portable-container seam exists by implementation time:

```text
finalTreasure anchor
→ authored sealed casket
→ portable lifecycle
```

Otherwise use the narrow two-step compatibility shape:

```text
finalTreasure anchor
→ one fixed WorldGeneratedContainer source
→ stable sealed casket
→ atomic materialization into portable-container lifecycle
```

Important: this fixed source is the **single treasure source** for profile B, not an extra generic cave chest. Its only authored treasure is the casket.

Do not implement recursive inventories. A narrow reusable “fixed source contains/materializes one portable container identity” seam is sufficient.

Exact-once invariant:

```text
before extraction: casket represented only by fixed source state
after extraction:  casket represented only by portable lifecycle
consumed:          neither source nor portable copy can recreate it
```

Persist the minimum mutable transition fact needed to enforce that invariant.

### 6. Opening policy

Add the smallest policy hook around physical casket open:

- unresolved + unopened authored casket → confirmation;
- cancel → no mutation;
- confirm → persist irreversible opened/committed state first;
- resolve `treasure_kept` exactly once;
- then allow ordinary container transfer UI.

Do not infer commitment from contents becoming empty. Opening itself is the decision.

Opening any fixed outer source used for compatibility is not the decision.

### 7. Return hand-in

Need read access to the exact carried portable-container id, not only its kind.

Hand-in requires:

```text
carried casket id === authored casket id
AND unopened
AND quest unresolved
```

Then:

- inspect the concrete casket/authored amount;
- pay `floor(N * 0.30)` unless existing money rules dictate another explicit integer convention;
- consume the concrete casket through shared container ownership;
- resolve `treasure_returned` once.

Do not put the ruby/remaining money into a fake quest inventory. Removing the handed-in casket from Player ownership is enough for V1 unless an existing NPC inventory transfer is directly reusable.

## Quest definition guidance

Likely authored sequence:

1. recover exact grave hidden find;
2. explicit `talk_to_npc` to interpret map;
3. acquire/materialize exact sealed casket;
4. terminal outcome from either physical casket open or unopened hand-in.

No kill-bear stage.

If a new objective/event type is required, describe a reusable world fact (`recover_hidden_find`, `acquire_portable_container`) rather than a quest-named action.

## Persistence traps

- `QuestProgressEntry` should own only stage/outcome.
- resolved grave spot owns one-shot digging/exposure.
- fauna owns bear persistence/tombstone.
- cave profile, reservation and anchor XYZ are derived and must not enter save data.
- fixed-source → portable casket transition must never restore both copies.
- opened state must survive even if contents remain inside the casket.
- consumed/returned state must prevent rebuild from rematerializing the casket.

## Files / symbols with highest implementation value

- `docs/plans/world-terrain-028-archetype-aware-cave-story-and-loot-anchors.md`;
- `src/app/worldBundle.ts::caveTreasureContainerSpecs()`;
- `src/app/worldBundle.caveTreasure.test.ts`;
- `src/world/caves/caveContentAnchors.ts`;
- `src/world/caves/caveRng.ts`;
- `src/world/createCaves.ts`;
- `src/quests/quests.ts::bindExactCaveQuests()` — pattern only;
- `src/quests/QuestManager.ts`;
- `src/app/createApp.ts`;
- `src/world/hiddenFinds.ts`;
- `src/app/actions/groundActions.ts`;
- `src/world/worldGeneratedContainers.ts`;
- `src/world/createPlacedContainers.ts`;
- `src/app/actions/containerActions.ts`;
- `src/items/container.ts`, `Inventory.ts`, `itemInstances.ts`;
- `src/fauna/animalCaveHabitat.ts`, `persistentOccupants.ts`, `createFauna.ts`.

## Verification emphasis

Highest-value automated invariants:

- reservation beats generic profile roll;
- bear cave is `QUEST_TREASURE`, not `DOUBLE_TREASURE`;
- zero generic side/final loot appears in that cave;
- exactly one authored source uses `finalTreasure`;
- `quests-progression-025` cannot claim the same cave/anchor;
- same bear id/tombstone survives restore;
- grave/map and social exposure resolve once;
- casket cannot exist simultaneously in fixed source and portable state;
- same casket id/contents survive carry → place → carry → reload;
- cancel opening is a no-op;
- opening resolves only `treasure_kept`;
- unopened exact casket resolves only `treasure_returned`;
- payment derives from the same authored `N`;
- neither save/load nor WorldBundle rebuild duplicates treasure/rewards.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**