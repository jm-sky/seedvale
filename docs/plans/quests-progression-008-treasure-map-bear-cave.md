# Plan: Treasure map — bear cave

**Created:** 2026-09-07
**Status:** `draft` 📝
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** world-terrain-008, quests-progression-002
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `treasure` `cave` `bear` `hidden-find` `container` `choice-through-action`
**Roadmap:** -

## Goal

Add a multi-stage treasure quest in which an NPC asks the Player to recover an old map hidden in a grave, reads the recovered map, and sends the Player to a specific real cave containing a portable treasure container.

The cave is also the home/habitat of a specific real bear. The bear must remain normal fauna rather than a quest-spawned guard: it can leave its cave to satisfy normal ecosystem needs and return home. The treasure exists independently of whether the bear is present or alive.

The final outcome is determined by what the Player actually does with the treasure container:

- deliver the unopened treasure to the NPC and receive the agreed share plus social consequences, or
- deliberately open it, take the treasure, and resolve the quest through the alternative kept-treasure outcome.

Do not present this as an artificial A/B dialogue choice.

## Dependencies

### `world-terrain-008` — Underground Caves V2

Treat the production-ready cave architecture required by this quest as a hard dependency.

The repository currently contains two unrelated concepts named cave:

- real walk-in caves owned by `src/world/cave*.ts` / `src/world/createCaves.ts`, being evolved by `world-terrain-008`,
- fauna habitat `cave` spawn points in `src/fauna/createFauna.ts`, which are decorative cave-mouth props plus `PreySpawner` state.

Do not implement a third quest-specific cave representation and do not use the decorative fauna cave as a substitute for a real interior.

The implementation must integrate with the resulting `world-terrain-008` production architecture as it exists when this plan is implemented. Current code remains the source of truth if that dependency changes its internal representation.

### `quests-progression-002` — quest outcomes, rewards and consequences

Use its outcome-resolution contract rather than introducing a treasure-specific branching system.

The quest needs at least two terminal outcomes:

- treasure returned,
- treasure kept/opened.

Objective completion and quest resolution must remain distinct where required by that dependency.

### Observed illegal actions / witnesses

Grave digging is socially forbidden, but the witness/crime mechanism is intentionally owned by a separate plan.

Required eventual semantics are:

```text
illegal action
+ potential witnesses
+ current observation context
→ observed / not observed
→ social consequence only when observed
```

Night and Player stealth should reduce detection risk. No witness means no reputation penalty.

This quest must expose/reuse the generic grave-digging action as an illegal-action source once that mechanism exists. Do not add cemetery-specific reputation mutation here.

The core treasure quest may be implemented independently if the witness plan is not yet complete, provided grave digging remains wired through the existing generic ground action and no temporary automatic penalty is introduced.

## Quest flow

### 1. NPC requests the old map

A specific NPC offers the quest and explains that an old treasure map was hidden in a known grave in a cemetery.

The NPC knows the location. Do not implement procedural investigation or map-location inference in V1.

### 2. Player digs the grave

Reuse the existing shovel/ground-action path and cemetery grave geometry.

The map is an **authored quest find** associated with the intended grave. It does not need to become a normal `ItemKind` in V1.

Prefer extending the existing `hiddenFinds`/dig resolution seam so authored quest finds can resolve from a stable grave/world identity. Do not add a parallel `QuestGrave`, special quest shovel action, or cemetery-only digging interaction.

The recovered-map state must persist through the quest's authoritative state/outcome mechanism so save/load cannot make the map recoverable repeatedly.

### 3. Player returns to the NPC

The NPC recognises that the authored map has been recovered and interprets it.

This advances the quest to the expedition stage and reveals/targets one specific production cave.

Use the existing world-location/navigation mechanisms available after `world-terrain-008`; do not create a quest-only cave marker representation when a real cave/world-location identity can be referenced.

### 4. Specific cave and specific bear

The destination is one concrete cave.

That cave is the home/habitat of one **specific bear**, not merely a location where any bear may happen to spawn.

The bear must be fauna-owned and use normal `AnimalAgent` behaviour. The quest must not:

- spawn a bear when the Player enters,
- tether it to the treasure,
- force combat,
- treat its death as the treasure objective,
- despawn it when the quest ends.

The intended world relationship is conceptually:

```text
stable cave identity
→ fauna habitat/home
→ stable bear identity
```

The exact integration must follow the post-`world-terrain-008` cave architecture and current fauna ownership at implementation time.

### 5. Bear ecosystem behaviour

Reuse existing fauna need and movement systems for hunger, thirst, roaming and water trips.

The bear should be able to leave the cave/home area for ordinary biological reasons and later return. The Player can therefore solve the encounter by, for example:

- killing the bear through normal combat,
- entering while it is away,
- avoiding it when circumstances permit.

These are emergent approaches, not quest strategies encoded as branches.

Do not add scripted `bearLeavesCaveForQuest` behaviour.

### 6. Treasure exists independently

Place one portable treasure container in the cave independently of the bear lifecycle.

The container must remain available whether the bear is alive, dead, nearby or away from home. Bear death must not spawn the treasure.

### 7. Player takes the whole treasure container

The treasure should be a small physical portable container, such as a **casket** or **pouch**, rather than requiring the Player to empty a full-size storage chest in the cave.

Extend/reuse the existing physical container and inventory mechanisms rather than introducing a quest-only `TreasurePayload` store.

Required semantics:

- the container has stable identity,
- it contains the actual treasure contents/value,
- the Player can pick up/carry the whole container,
- its carried/placed state and contents survive save/load,
- the NPC can receive that concrete container,
- opening it is distinguishable from merely carrying it.

The exact visual/container kind (`casket`, `pouch`, or another small container) may be chosen during implementation based on the existing item/container architecture and available assets. Prefer the smallest extension of the shared physical-container mechanism.

Do not duplicate the existing large chest system merely to change presentation.

### 8. Opening requires explicit confirmation

The unopened treasure container represents the NPC's expected delivery.

If the Player chooses to open it, use an explicit confirmation prompt before the irreversible quest consequence, conceptually:

```text
Open the treasure container?

Opening it means keeping the treasure instead of returning the sealed container.
```

This prompt confirms a **world action**; it is not the quest's narrative A/B choice.

After confirmation:

- open/resolve the container through the shared container/inventory mechanism,
- transfer or expose its real contents according to that mechanism,
- resolve the kept-treasure outcome exactly once,
- prevent later delivery of the same container from producing the returned-treasure outcome.

Cancelling the prompt changes nothing.

### 9. Returning the unopened treasure

If the Player brings the intact/unopened treasure container to the quest NPC, interaction can consume/transfer that concrete container and resolve the returned-treasure outcome.

The agreed reward should be a defined share of the treasure's value rather than a second unrelated reward bundle where practical.

Apply Player↔NPC relation and/or Player↔settlement social consequences through the existing quest outcome/social-consequence seams. Do not introduce another reputation store.

### 10. Keeping the treasure

Opening the container is the deliberate action that commits the Player to keeping the treasure in V1.

This should resolve the alternative outcome immediately enough that save/load, moving away, or later talking to the NPC cannot restore the return path.

The Player receives the real contents and does not also receive the NPC's agreed return reward.

Dialogue after resolution may reflect that the Player never returned the sealed treasure, but the outcome must be driven by the container action rather than a dialogue selection.

## Specific bear persistence

Current wild fauna individual state is not generally persisted as authoritative save data; fauna is largely regenerated from deterministic world/spawner state.

For this quest, prefer preserving a **specific stable bear identity and lifecycle** rather than treating the cave as a generic bear respawner.

This is a fauna/persistence concern, not quest-owned animal state.

During implementation, first inspect the current post-dependency fauna architecture and existing `AnimalAgent` snapshot/state seams. Extend the smallest reusable fauna persistence mechanism that can represent a notable habitat occupant if necessary.

Desired reusable contract:

```text
stable habitat/home identity
+ stable animal identity
+ alive/dead/lifecycle-relevant state
→ same notable animal across save/load
```

Do not persist a `questBearAlive` boolean in quest state.

Do not generalise all wild-fauna persistence solely for this quest if a bounded notable/persistent-animal mechanism is sufficient and coherent with existing fauna ownership. Conversely, if the current fauna architecture has gained general individual persistence by implementation time, reuse it directly.

A dead specific bear must not silently respawn merely because the generic decorative cave spawner previously had a respawn interval.

## Authored quest bindings

This quest deliberately contains authored bindings in V1:

- quest giver,
- target cemetery/grave,
- target production cave,
- treasure container,
- specific bear habitat/occupant.

Keep those bindings explicit and stable rather than hiding them behind procedural selection that the current quest system does not need.

Where possible, bind through stable world/entity identities instead of cached runtime object references.

## State ownership

Keep authoritative state in its existing domain:

| State | Owner |
|---|---|
| quest stage / resolved outcome | quest system |
| grave/world geometry | world/settlement cemetery systems |
| authored hidden-find resolution | hidden-find / quest integration seam |
| cave identity/topology | production cave system |
| bear needs, movement, health, lifecycle | fauna |
| notable bear persistence | fauna/persistence |
| treasure contents and carried/placed state | shared container/inventory system |
| Player↔NPC relation | existing quest relationship state |
| settlement reputation/renown | `ReputationManager` |
| witnessed crime result | future generic witness/illegal-action system |

Do not duplicate these values into quest state merely to make objective checks easier.

## Persistence

Save/load must preserve enough authoritative state that the quest cannot regress or duplicate rewards/finds.

At minimum verify persistence of:

- map-recovered progression,
- current quest stage,
- resolved outcome,
- treasure container identity,
- treasure unopened/opened or equivalent authoritative container state,
- treasure contents,
- placed/carried state of the portable container,
- specific bear identity and relevant lifecycle state once that mechanism is introduced,
- any cave discovery/navigation state already owned by the world map system,
- social consequences through their existing stores.

Derived cave geometry and deterministic world data should remain derived if that is still the cave system contract; do not serialize them solely for the quest.

## Reuse / extension targets

Implementation should begin by reconfirming these current seams after dependencies land:

- `src/world/hiddenFinds.ts` — authored find extension point,
- `src/app/actions/groundActions.ts` — normal shovel/dig and grave disturbance path,
- cemetery grave placement/identity used by hidden finds,
- `src/quests/QuestManager.ts` / quest definitions — quest progression and outcome integration,
- `src/reputation/ReputationManager.ts` — social consequences,
- `src/world/createCaves.ts` and the resulting `world-terrain-008` cave modules — real cave identity/location,
- `src/fauna/createFauna.ts`, `AnimalAgent` and post-dependency habitat/home APIs — bear ownership,
- existing fauna hunger/thirst/roaming/water-trip mechanisms,
- `src/app/actions/containerActions.ts` and placed-container ownership — portable treasure container,
- shared `Inventory` / item catalog — actual treasure contents,
- save schema and world rebuild carry/restore paths for every new authoritative field.

If current code has moved these responsibilities, follow the current ownership rather than preserving obsolete file names from this draft.

## Architecture constraints

- The Player participates through ordinary world actions: dig, travel, avoid/fight fauna, pick up container, open container, deliver container.
- No `questSpawn` bear.
- No quest-only cave.
- No quest-only inventory.
- No quest-owned copy of bear health/alive state.
- No cemetery-specific reputation penalty.
- No dialogue A/B choice for the final treasure decision.
- Treasure and bear lifecycles are independent.
- Prefer stable ids over runtime references for authored bindings.
- Keep deterministic simulation where existing systems already provide it.
- Add JSDoc for important new shared/public architectural APIs; use `@domain quests-progression` and the owning domain tag where useful for preflight discovery.

## Non-goals

Do not implement in this plan:

- the generic witness/observed-illegal-action system,
- a general crime/legal system,
- procedural treasure-map generation,
- procedural quest-giver selection,
- procedural grave selection,
- a new cave generator,
- scripted bear encounter phases,
- dialogue-driven final choice,
- generic locked-container/lockpicking mechanics unless independently required by the current container architecture,
- broad wild-fauna persistence redesign beyond what is required for a coherent reusable specific/notable-animal mechanism,
- multiplayer synchronization.

## Performance

This quest should add negligible continuous runtime cost.

- Use stable authored ids and event/action-driven objective resolution rather than per-frame quest scans.
- Reuse cave streaming rather than keeping the quest cave permanently active.
- Do not keep the specific bear at full simulation fidelity solely because a quest references it; use the fauna system's normal adaptive/off-screen lifecycle and only persist authoritative state needed for continuity.
- Witness detection belongs to its own plan and must use bounded nearby candidates rather than a world-wide NPC scan.
- Do not add a worker for quest bookkeeping.

## Verification

Automated verification should cover, where practical:

- only the authored target grave resolves the map find,
- the map cannot be recovered/rewarded twice across save/load,
- returning with the map advances to the cave stage,
- the quest targets the intended real cave identity,
- treasure availability does not depend on bear alive/present state,
- the specific bear is not spawned/despawned by quest stage transitions,
- the portable treasure container preserves identity, contents and carried/placed state,
- cancelling the open confirmation leaves quest/container state unchanged,
- confirming open resolves only the kept outcome,
- an opened treasure cannot later resolve the returned outcome,
- delivering the unopened concrete container resolves only the returned outcome,
- each terminal outcome rewards/applies consequences exactly once,
- save/load at every major stage preserves the same available actions and outcome,
- specific bear persistence does not resurrect a dead notable bear,
- existing hidden-find, digging, container, quest, fauna, cave, reputation and persistence tests remain green.

## Manual verification

Manual browser verification is performed by the User.

Verify the full quest through both main approaches:

1. recover the map, wait for the bear to leave naturally, take the treasure without fighting, return it unopened;
2. recover the map, reach the cave with the bear present, resolve the encounter through normal fauna/combat behaviour, take the treasure and open it after confirmation.

Also verify save/reload while:

- the map is still buried,
- after recovering the map,
- after learning the cave location,
- while carrying the unopened treasure,
- after putting the treasure container down elsewhere,
- after opening it,
- after the specific bear has died,
- after either quest outcome resolves.

When the separate witness plan exists, additionally verify grave digging observed/unobserved by day/night and with/without Sneak.

## Completion criteria

- The quest uses a real production cave from the shared cave system.
- One specific fauna-owned bear has that cave as its real habitat/home and can leave/return through ordinary ecosystem behaviour.
- The bear is not a quest guard and the treasure is not tied to its death/presence.
- The old map is recovered by ordinary grave digging through an authored quest-find integration.
- The treasure is a real portable physical container with real contents and persistent identity/state.
- The Player can carry the unopened container to the NPC.
- Opening requires explicit confirmation and commits to the kept-treasure outcome.
- Delivering the unopened container commits to the returned-treasure outcome.
- Both outcomes use the shared quest outcome/reward/social consequence mechanisms.
- Save/load cannot duplicate the map, treasure, rewards or resurrect the specific bear incorrectly.
- Grave crime consequences are not hard-coded into this quest and can use the separate generic witness mechanism when available.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
