# Plan: Treasure map — bear cave

**Created:** 2026-09-07
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~world-terrain-019~~, ~~world-terrain-024~~, ~~world-terrain-025~~, world-terrain-028, ~~fauna-018~~, ~~fauna-019~~, ~~quests-progression-002~~, ~~quests-progression-011~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `treasure` `cave` `bear` `hidden-find` `container` `choice-through-action`
**Roadmap:** -
**Model:** Opus, Sonnet

## Goal

Add a multi-stage treasure quest: an NPC asks the Player to recover an old map hidden in a grave, reads it, then sends the Player to one exact real `adventure` cave containing a portable sealed casket.

The cave is also the real home of one specific persistent bear. The bear is normal fauna, not a quest guard, and treasure existence never depends on bear state.

Outcome is determined by physical action:

- return unopened casket → Player receives **30% of its money**;
- confirm opening it → Player keeps **100% money + ruby ×1**.

No dialogue A/B choice.

## Adventure cave content profile

This plan depends on `world-terrain-028`'s shared cave-content contract.

The target cave must be:

```text
archetype: adventure
profile: QUEST_TREASURE
```

Shared adventure profiles are:

```text
EMPTY            standard; no automatic generic treasure
QUEST_TREASURE   one authored treasure, reserved for this quest
DOUBLE_TREASURE  current side + final generic chests
```

Unreserved adventure caves use `80% EMPTY / 20% DOUBLE_TREASURE`. Authored reservations are resolved first.

For this quest:

- reserve one exact adventure cave before the generic profile roll;
- use only its real `finalTreasure` anchor;
- do not materialize the ordinary `caveSide` chest;
- do not materialize ordinary `caveFinal` loot;
- `sideTreasure` may remain as a deterministic placement anchor but is unused;
- treasure exists from world composition, before quest acceptance.

Current code still materializes both adventure treasure anchors through `caveTreasureContainerSpecs()`. Do not add another quest chest on top of that. `world-terrain-028` must first make materialization profile-aware.

`quests-progression-025` uses a **different `EMPTY` adventure cave**. Do not share this cave with that story.

If the reservation cannot be satisfied for a seed, omit/fail the authored binding explicitly. Do not fall back to `natural`/`dungeon`, steal another story's cave, force topology or invent underground coordinates.

## Bear ownership

Use existing fauna contracts:

```text
reserved cave id
→ AnimalHabitatBinding { source: cave }
→ PersistentOccupantDecl { occupantKey: resident, kind: bear }
→ same concrete bear across save/load
```

`fauna-019` owns cave home/navigation. `fauna-018` owns identity, snapshot, corpse and tombstone.

The quest must not spawn, tether, despawn, recreate or require killing the bear. It may leave because of hunger/thirst/roaming/trips and later return normally.

## Quest flow

### 1. Map request

A specific authored NPC knows that an old treasure map was hidden in a known grave.

### 2. Dig the grave

Reuse ordinary shovel/ground-action + cemetery grave handling.

The map is an authored hidden find keyed by stable grave/world identity; no physical `ItemKind` is required.

Use the same resolved grave spot for:

- one-shot map recovery;
- ordinary `quests-progression-011` grave social-exposure semantics.

Do not add a quest-specific grave, shovel action, cemetery interaction or second reputation path.

### 3. Return with map

A normal explicit quest dialogue action confirms recovery, advances the stage and reveals/targets the already-bound cave through existing world-location/navigation mechanisms.

Dialogue does not create cave, bear or treasure.

### 4. Reach the bear cave

The bear is environmental pressure only. The Player may fight it, avoid it, wait for it to leave, or find the cave after world history has already changed its state.

No `kill bear` objective.

### 5. Single authored treasure

Use exactly one authored treasure source at the reserved cave's `finalTreasure` anchor.

Payload:

```text
coin: one authored tuning amount
ruby: 1
```

Bear death never spawns or unlocks it.

## Portable sealed casket

The concrete casket must have:

- stable id;
- real persisted contents;
- whole-container carry lifecycle;
- put-down/re-pick-up where shared container mechanics support it;
- persisted irreversible opened/committed state;
- exact identity usable by NPC hand-in.

Prefer a reusable `casket` container kind, not quest-owned inventory state.

Current implementation constraint:

- `WorldGeneratedContainers` support deterministic underground explicit-Y placement but are non-portable;
- `PlacedContainers` are portable but currently ground placement from surface height.

Therefore use the smallest shared solution available at implementation time:

1. if portable authored underground placement is generalized, place the casket directly at `finalTreasure`; otherwise
2. use one fixed `WorldGeneratedContainer` at `finalTreasure` as the **single treasure source**, which atomically materializes/transfers the same stable sealed casket into the portable-container lifecycle.

If an outer fixed chest is needed, it contains no unrelated `caveFinal` loot and there is still no side chest. Do not implement generic recursive nested inventories solely for this quest.

## Opening = `treasure_kept`

Carrying the unopened casket does not choose an outcome.

Opening it while unresolved requires explicit confirmation. Cancel is a pure no-op.

On confirm:

1. persist irreversible opened/committed state;
2. resolve `treasure_kept` exactly once through normal quest outcome APIs;
3. allow ordinary access to the casket contents.

Player keeps all money + ruby.

Opening a possible fixed outer source chest does not resolve the outcome; only opening the sealed casket does.

## Returning = `treasure_returned`

NPC hand-in must verify the exact authored casket is present through the portable-container lifecycle and still unopened.

On success:

- consume/transfer the concrete casket;
- pay `floor(authoredCoinAmount * 0.30)` unless current money conventions require another explicit integer rule;
- resolve `treasure_returned` exactly once;
- Player receives no ruby and cannot later access the remaining 70%.

Use one authored coin amount as the single source for both the full treasure and the 30% share.

## State ownership

| State | Owner |
|---|---|
| quest stage / outcome | `QuestManager` |
| grave identity/geometry | cemetery/world |
| hidden-find one-shot | existing hidden-find save state |
| grave exposure consequence | existing social/reputation systems |
| cave/archetype/anchors | cave world, derived |
| content profile/reservation | `world-terrain-028`, derived |
| bear identity/lifecycle | fauna persistent occupant systems |
| bear needs/movement/combat | fauna |
| fixed underground source, if needed | `WorldGeneratedContainers` |
| portable casket contents/carry/open state | shared portable-container system |
| relations/reputation | existing quest/social systems |

Do not duplicate authoritative state into quest progress.

## Persistence

Persist mutable facts only:

- quest stage/outcome;
- resolved grave spot;
- casket contents/id/placed-or-carried state;
- irreversible opened/consumed state;
- exact-once fixed-source → portable transition if required;
- fauna persistent bear state;
- normal location/social state.

Do not serialize cave topology, anchor XYZ, content profile, reservation/claim sets or cave habitat geometry. Reconstruct those deterministically.

## Reuse / integration targets

- `docs/plans/world-terrain-028-archetype-aware-cave-story-and-loot-anchors.md`;
- `src/app/worldBundle.ts::caveTreasureContainerSpecs()`;
- `src/app/worldBundle.caveTreasure.test.ts`;
- `src/world/createCaves.ts` / `archetypeOf()` / `contentAnchorsOf()` / `resolveHabitat()`;
- `src/world/caves/caveContentAnchors.ts`, `caveRng.ts`;
- `src/quests/quests.ts` — contextual binding pattern; `bindExactCaveQuests()` is not a selector;
- `src/quests/QuestManager.ts`;
- `src/app/createApp.ts`;
- `src/world/hiddenFinds.ts`, `src/app/actions/groundActions.ts`;
- `src/world/worldGeneratedContainers.ts`;
- `src/world/createPlacedContainers.ts`;
- `src/app/actions/containerActions.ts`;
- `src/items/container.ts`, `Inventory.ts`, `itemInstances.ts`;
- `src/fauna/animalCaveHabitat.ts`, `persistentOccupants.ts`, `createFauna.ts`.

Current code is source of truth. Add JSDoc for important new shared/public APIs with appropriate `@domain` tags.

## Verification

Automated tests should cover at least:

- target cave is `adventure` + `QUEST_TREASURE`;
- reservation wins over the generic 80/20 profile roll;
- target cave gets no generic side/final loot;
- exactly one authored treasure source uses `finalTreasure`;
- no collision with `quests-progression-025`'s `EMPTY` cave;
- target grave/map resolves once and still runs ordinary grave exposure;
- same persistent bear/tombstone survives restore and never gates treasure;
- casket id/contents survive carry/place/reload without duplication;
- cancel opening changes nothing;
- confirmed opening resolves only `treasure_kept`;
- exact unopened casket resolves only `treasure_returned`;
- Player cannot receive both full treasure and the 30% share.

Manual browser verification remains the User's responsibility.

## Completion criteria

- map uses ordinary grave Hidden Find + social-exposure flow;
- one exact adventure cave is reserved as `QUEST_TREASURE`;
- the cave contains one authored final treasure and no generic side/final cave loot;
- one persistent fauna-owned bear uses it as a real home;
- treasure and bear lifecycles are independent;
- treasure is a real portable sealed casket with money + ruby ×1;
- opening resolves `treasure_kept`;
- returning unopened resolves `treasure_returned` and pays exactly 30% of the authored money;
- the branch comes from physical Player action, not dialogue.

> **Zrób git commit i push do main, rebase jeżeli trzeba**