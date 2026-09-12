# Implementation Notes: quests-progression-008 — Treasure map bear cave

## Current codebase facts

- `fauna-019` is already implemented. Real-cave fauna uses `AnimalHabitatBinding` → `Caves.resolveHabitat(caveId, entityHeight)` plus cave-scoped `queryGroundIn` / `resolveHorizontalIn`. Do not reimplement cave navigation.
- `fauna-018` is already implemented in `src/fauna/persistentOccupants.ts`. Use one `PersistentOccupantDecl { habitatId, occupantKey, kind: 'bear' }`; stable animal identity is derived by `persistentAnimalId(habitatId, occupantKey)`, and live/corpse/tombstone persistence stays fauna-owned.
- `src/app/worldBundle.ts` currently passes `undefined` for both persistent occupant declarations and cave habitat bindings; comments explicitly reserve those seams for this treasure-map bear. Wire the quest cave declaration there instead of spawning a bear from quest code.
- Production caves already expose stable `caveId`, `archetypeOf()`, `contentAnchorsOf()` and `resolveHabitat()`. Adventure cave content anchors include explicit underground `x/y/z/yaw`; use a cave-owned anchor for the treasure chest instead of inventing interior coordinates.
- `WorldGeneratedContainers` already support explicit underground `y`, deterministic ids and persisted contents, and are intentionally non-portable. Use one as the fixed cave treasure chest.
- `PlacedContainers` already own whole-container carry/put-down semantics: `pickUp()`, `carriedNode()`, `putDownCarried()`, persisted contents and carried weight. This should remain the authoritative lifecycle once the casket is removed from the fixed chest.
- Current `Inventory` can hold stack items and `ItemInstance`s, but `ItemInstance` / `SaveItemInstance` cannot own or serialize a nested `Inventory`. Do not introduce generic nested inventories for this quest.

## Recommended implementation shape

### 1. Bind one exact cave once at composition time

Reuse the existing contextual authored-quest pattern in `src/quests/quests.ts` (`bindExactCaveQuests`, `bindDarkForestTreasureQuest`) and composition in `src/app/createApp.ts` / `worldBundle.ts`.

Resolve one stable production cave id deterministically from current generated cave data. Prefer an adventure cave with a suitable `finalTreasure`/`sideTreasure` content anchor if available; do not persist coordinates or runtime cave objects in quest progress.

Create one stable fauna habitat id derived from that cave id (for example a namespaced id such as `quest-bear-cave:<caveId>`), then provide both:

- `AnimalHabitatBinding { habitatId, source: { kind: 'cave', caveId } }`,
- `PersistentOccupantDecl { habitatId, occupantKey: 'resident', kind: 'bear' }`.

Quest code should only know stable ids needed for authored binding/dialogue; bear HP/alive/corpse/tombstone stays entirely outside `QuestManager`.

### 2. Grave/map: extend the existing explicit buried-find seam, not generic random loot

`src/app/actions/groundActions.ts` already has the correct one-shot grave flow:

`ordinary shovel completion` → explicit/generic buried match → `resolvedHiddenFindSpotIds.add(...)` → cemetery disturbance exposure.

`findExplicitBuriedSpot()` in `src/world/hiddenFinds.ts` is currently specialized to systemic treasure keys (`keyInstanceId`). Generalize this narrow seam enough to represent an authored buried quest find keyed by stable `spotId + landmarkId + graveIndex`; do not add another dig handler.

Important ordering: resolve/add the same grave spot id before notifying quest progress, so save/load and repeated digs cannot duplicate the map or reroll social exposure.

The plan does not require a physical map item. Prefer a lightweight quest objective/event for `recover_hidden_find` (or equivalent stable spot-id objective) reported from `groundActions` into `QuestManager`, with completion persisted naturally by `QuestProgressEntry.stageIndex`. Do not add an extra `mapRecovered` save field.

Current `quests-progression-011` implementation does **not** keep a separate historical grave-robbing badge/progress counter. Its actual one-shot semantics are the resolved grave spot plus deterministic social-exposure roll and reputation/renown write only when exposed; preserve that implementation.

### 3. Return-to-NPC and cave reveal

Use a normal `talk_to_npc` stage after the buried-find stage. On that explicit dialogue action, advance to the cave stage and reveal/target the stable cave through the existing `LocationKnowledge` / navigation seam if the cave has a location identity available to the quest composition layer.

Do not use dialogue opening itself as completion. `QuestManager.onInteract(npcId)` already enforces explicit quest dialogue actions.

### 4. Fixed cave chest containing a portable sealed casket

Use a two-level physical flow:

`WorldGenerated chest (fixed in cave)` → `sealed casket` → `{ coin: N, ruby: 1 }`.

The outer chest should be a normal non-portable `WorldGeneratedContainers` entry placed at a stable cave-owned content anchor. Opening this chest is ordinary container interaction and **must not** resolve either quest outcome.

The casket is the portable authored object. Do not make the outer chest portable and do not place loose quest coins/ruby directly in it.

Current `Inventory` cannot represent a container instance whose own nested `Inventory` survives serialization. Avoid adding generic `Inventory<Inventory>` / recursive container storage. Instead add a narrow shared seam for a contained portable container:

- the fixed chest exposes one casket entry with a stable authored casket id;
- taking that entry atomically removes it from the outer chest and materializes/transfers the same stable casket identity into the portable-container lifecycle;
- `PlacedContainers` (or a small generalized portable-container layer built from it) owns the casket's actual contents `{ coin: N, ruby: 1 }`, carry state, put-down state and persistence from that point onward;
- never copy the casket contents through player `Inventory` during extraction.

Prefer extending `ContainerKind` with a small `casket` definition/presentation rather than quest-specific container logic. The extraction seam should be generic enough for future authored portable containers stored in fixed containers, but do not implement arbitrary recursive nesting.

The casket must have one stable id across fixed-chest membership → carried → placed → carried transitions. The extraction operation must be atomic/exact-once so save/load cannot leave both the chest entry and a materialized casket.

Persist only the minimum lifecycle fact needed to distinguish `still inside outer chest`, `materialized portable`, and `consumed/handed in`; do not duplicate the casket's coin/ruby payload in quest progress.

### 5. Opening the casket = outcome commitment

`containerActions.openContainer(id)` is the physical open seam once the casket is materialized as a portable container. Add a policy hook keyed by the authored casket id before opening its transfer UI:

1. if still unopened and quest unresolved, show the existing confirmation UI mechanism;
2. cancel → no mutation;
3. confirm → persist casket opened/committed state first, then resolve `treasure_kept` exactly once through `QuestManager`, then allow normal container transfer UI.

Opening the **outer cave chest** never commits an outcome. Only opening the sealed casket does.

Do not infer "opened" from contents being empty; opening is the irreversible decision even if the player leaves loot inside.

The quest outcome API already owns exact-once terminal resolution (`resolvedOutcomeId`). Add the smallest event/action seam needed for a world action to resolve a named authored outcome; do not build a parallel branching system.

### 6. Hand-in = concrete carried casket check

The NPC hand-in path must verify the **same stable casket id** is currently carried and still unopened. Extend the portable-container API with a read-only carried id accessor if needed; do not match only by `ContainerKind`.

On successful hand-in:

- snapshot/inspect the concrete casket contents,
- compute player payment as 30% of its authored coin amount (single tuning source; define rounding explicitly, preferably integer floor),
- grant only that coin payment through the existing item grant seam,
- consume/remove the carried casket through a shared container operation,
- resolve `treasure_returned` exactly once and apply normal authored consequences.

The ruby and remaining coins never need to enter an NPC inventory in V1 unless an existing transfer seam makes that free; consuming the concrete casket is sufficient world-state ownership for the agreed NPC share.

## Quest definition / objective guidance

Prefer an authored/contextual `QuestDef` in `src/quests/quests.ts` materialized through the normal pipeline. The likely stage sequence is:

1. buried-find objective bound to exact grave spot id,
2. `talk_to_npc` to interpret the map,
3. cave/treasure acquisition stage driven by extracting the physical casket from the fixed chest,
4. terminal outcome resolved either by opening the casket (`treasure_kept`) or handing in the unopened carried id (`treasure_returned`).

Do not create a "kill bear" objective. The bear is environmental pressure only.

If a new objective type is required, keep it event/state based and generic enough to describe the real world fact (`recover_hidden_find`, `acquire_portable_container`, etc.), but do not add types merely to mirror every quest stage when a dialogue action or direct outcome event is sufficient.

## Persistence and rebuild traps

- `QuestProgressEntry` already persists `state`, `stageIndex`, `resolvedOutcomeId`; use it for quest progression only.
- `resolvedHiddenFindSpotIds` already persists the grave one-shot and is the correct guard against repeated digging/exposure.
- fauna persistent occupant snapshot/tombstone already survives save/load and world-bundle rebuild; no bear fields belong in quest save data.
- cave topology/habitat/content anchors are deterministic derived data; never serialize them.
- outer chest contents and the casket materialization state must have one authoritative ownership transition. Never allow both `casket still in chest` and `portable casket exists` after restore/rebuild.
- placed/carried casket contents must survive save/load/rebuild. Any opened/consumed lifecycle flag must survive the same paths and be copied through `rebuildWorldBundle()`.
- beware initialization order: fauna/world containers are created inside `WorldBundle`, while `QuestManager` is composed in `createApp.ts`. World-authored cave/bear/chest/casket bindings therefore need to be derived from deterministic world/cave context before quest progress exists; never make world creation depend on current quest stage.

## Files/symbols to inspect while implementing

- `src/quests/quests.ts` — `QuestDef`, contextual binders, outcome definitions.
- `src/quests/QuestManager.ts` — stage events, dialogue actions, exact-once outcome resolution.
- `src/app/createApp.ts` — quest materialization and cross-system callback wiring.
- `src/world/hiddenFinds.ts` — `findExplicitBuriedSpot`, stable grave ids.
- `src/app/actions/groundActions.ts` — `checkBuriedTreasureKeyDig`, `checkHiddenFindDig`, `applyGraveDisturbanceIfExposed`.
- `src/world/createCaves.ts` / `src/world/caves/*` — cave id, `contentAnchorsOf`, `resolveHabitat`.
- `src/fauna/animalCaveHabitat.ts`, `src/fauna/persistentOccupants.ts`, `src/fauna/createFauna.ts`.
- `src/app/worldBundle.ts` — persistent occupant / cave habitat declaration seams; fixed cave container specs; rebuild state carry.
- `src/world/worldGeneratedContainers.ts` — fixed outer chest and persisted contents.
- `src/items/container.ts` — `ContainerKind` / `CONTAINER_DEFS`; add/reuse casket as a shared container kind.
- `src/items/itemInstances.ts`, `src/items/Inventory.ts` — current item-instance boundary; do not add recursive inventory serialization solely for this quest.
- `src/world/createPlacedContainers.ts` — authoritative portable-container lifecycle after casket extraction.
- `src/app/actions/containerActions.ts` — physical open/pick-up/transfer entry points and casket extraction/open hooks.
- `src/persistence/saveData.ts`, `src/app/saveState.ts` — only for the minimum shared casket ownership/opened/consumed lifecycle state required by the new seam.

## Verification emphasis

Automated tests should focus on cross-owner invariants rather than presentation:

- target grave resolves exactly once and still uses the existing grave-exposure path;
- same persistent bear id survives restore, and tombstone prevents recreation;
- fixed outer chest exists regardless of bear state;
- opening outer chest does not resolve the quest outcome;
- casket extraction atomically changes ownership: never both in outer chest and portable;
- casket keeps the same stable id and contents through extraction → carried → placed → carried and save/load;
- opening confirmation cancel is a pure no-op;
- confirmed casket open resolves only `treasure_kept`, even before loot is removed;
- carried unopened exact casket id can resolve `treasure_returned`; wrong/open casket cannot;
- 30% payment derives from the single authored coin amount and cannot combine with full-loot outcome;
- rebuild/new-load does not respawn an extracted or consumed casket inside the outer chest.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
