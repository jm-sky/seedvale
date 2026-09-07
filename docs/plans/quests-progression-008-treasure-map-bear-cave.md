# Plan: Treasure map — bear cave

**Created:** 2026-09-07
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** world-terrain-008, fauna-018, fauna-019, quests-progression-002, quests-progression-011
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `treasure` `cave` `bear` `hidden-find` `container` `choice-through-action`
**Roadmap:** -

## Goal

Add a multi-stage treasure quest in which an NPC asks the Player to recover an old map hidden in a grave, reads the recovered map, and sends the Player to a specific real cave containing a portable treasure casket.

The cave is also the real home/habitat of one specific persistent bear. The bear remains normal fauna rather than a quest-spawned guard: it can leave the cave because of normal hunger, thirst, roaming and trip behaviour and later return home. The treasure exists independently of whether the bear is present or alive.

The final outcome is determined by what the Player actually does with the treasure:

- deliver the unopened casket to the NPC and receive the agreed **30% share of the money inside**, or
- deliberately open the casket after confirmation and keep the full contents: **money + ruby**.

Do not present this as an artificial A/B dialogue choice.

## Dependencies

### `world-terrain-008` — Underground Caves V2

The quest uses a production real walk-in cave from the shared cave system.

Do not implement a quest-specific cave representation, duplicate cave coordinates, or treat the old decorative fauna den as the destination.

Current cave code remains the source of truth at implementation time. Consume the production cave identity/location/spatial contracts delivered by `world-terrain-008`.

### `fauna-019` — real cave habitats and animal home navigation

This plan owns the integration:

```text
real cave identity
→ fauna habitat binding
→ interior home anchor
→ cave-aware movement
→ surface trips
→ return to cave home
```

The quest only selects/binds its authored destination cave and resident. It does not implement cave navigation or special bear behaviour.

The treasure-map bear must use the normal mechanisms supplied by `fauna-019` for leaving the cave and returning through the entrance to its actual interior home.

### `fauna-018` — persistent habitat occupants

This plan owns stable identity and lifecycle persistence of the specific bear.

The quest must consume its persistent habitat-occupant contract rather than storing `bearAlive`, HP, corpse state or respawn state in quest data.

Conceptually:

```text
real cave habitat
+ occupantKey: resident
+ species: bear
→ stable concrete bear
```

If the bear survives, save/load restores the same individual. If it dies, its normal corpse lifecycle is preserved; after final removal its persistent occupant slot remains tombstoned and generic habitat spawning cannot recreate it.

### `quests-progression-002` — quest outcomes, rewards and consequences

Use its outcome-resolution contract rather than introducing a treasure-specific branching system.

The quest requires two terminal outcomes:

- `treasure_returned`,
- `treasure_kept`.

Objective completion and quest resolution remain distinct where required by that system.

### `quests-progression-011` — grave-robbing reputation risk and stealth

Grave disturbance uses the generic social-exposure model implemented by this dependency.

The quest does not implement witnesses or its own reputation logic.

Required semantics come from `quests-progression-011`:

```text
grave disturbed
→ historical grave-robbing progress always recorded
→ one deterministic social-exposure roll
→ day/night + Sneak modify exposure risk
→ reputation/renown consequence only when exposed
```

The target grave must use the same ordinary cemetery Hidden Find / grave-disturbance flow so the quest naturally participates in this mechanism.

Do not bypass `quests-progression-011` by resolving the authored map through a quest-only interaction.

## Quest flow

### 1. NPC requests the old map

A specific authored NPC offers the quest and explains that an old treasure map was hidden in a known grave in a cemetery.

The NPC knows the location. Do not implement procedural investigation or map-location inference in V1.

### 2. Player digs the grave

Reuse the existing shovel/ground-action path and cemetery grave geometry.

The map is an **authored quest find** associated with the intended grave. It does not need to become a normal `ItemKind` in V1.

Extend/reuse the existing `hiddenFinds` / dig-resolution seam so an authored quest find can resolve from a stable grave/world identity.

Do not add:

- `QuestGrave`,
- a special quest shovel action,
- a cemetery-only quest interaction,
- a second grave-disturbance path.

Resolving the target grave must still trigger the normal grave-disturbance semantics consumed by `quests-progression-011`.

The recovered-map state must persist through the quest's authoritative progression state so save/load cannot make the map recoverable repeatedly.

### 3. Player returns to the NPC

The NPC recognises that the map has been recovered and interprets it.

This advances the quest to the expedition stage and reveals/targets one specific production cave.

Use the existing world-location/navigation mechanisms available from the real cave system. Prefer stable cave/world-location identity over cached coordinates or runtime object references.

### 4. Specific cave and specific bear

The destination is one concrete real cave.

That cave is the home of one **specific persistent bear** configured through `fauna-018` + `fauna-019`.

The bear remains fauna-owned and uses normal `AnimalAgent` behaviour. The quest must not:

- spawn it when the Player approaches or enters,
- tether it to the treasure,
- force combat,
- treat its death as an objective,
- force it to remain inside the cave,
- despawn it when the quest ends,
- recreate it after death.

The authored relationship is conceptually:

```text
stable real cave identity
→ fauna-019 real-cave habitat/home
→ fauna-018 persistent occupant: resident / bear
```

### 5. Bear ecosystem behaviour

The bear uses the normal fauna systems for:

- hunger,
- thirst,
- roaming/home,
- water trips,
- combat/threat response,
- death/corpse lifecycle.

Because the cave is a real home rather than a quest encounter room, the bear can leave for ordinary biological reasons and later return.

The Player may therefore obtain the treasure by, for example:

- killing the bear through ordinary combat,
- waiting until the bear leaves the cave,
- entering/avoiding it when world circumstances permit.

These are emergent approaches. Do not encode them as quest strategies or objectives.

### 6. Treasure exists independently

Place one authored portable treasure casket inside the target cave independently of the bear lifecycle.

The casket must exist whether the bear is:

- alive,
- dead,
- inside the cave,
- away from home.

Bear death must never spawn or unlock the treasure.

### 7. Treasure casket

V1 uses a **small physical casket** rather than a pouch or full-size storage chest.

Reuse/extend the shared placed-container and inventory mechanisms. Do not introduce a quest-owned `TreasurePayload` state.

The casket contains exactly two authored reward components:

```text
money
ruby × 1
```

The exact money amount is a tuning constant in the quest/reward definition and does not need to be fixed by this plan.

Required casket semantics:

- stable identity,
- real persisted contents,
- portable as a whole,
- can be carried by the Player without opening,
- can be put down again through the shared container mechanism where supported,
- placed/carried state survives save/load,
- opening state is authoritative and persisted,
- the quest NPC can receive the concrete unopened casket.

Prefer adding a small casket presentation/item kind on top of the existing container ownership/lifecycle rather than duplicating the large chest implementation.

### 8. Opening the casket is the keep-treasure decision

The Player may carry the unopened casket without committing to either outcome.

Attempting to open the quest casket must show an explicit confirmation prompt before the irreversible consequence, conceptually:

```text
Open the casket?

Opening it means keeping the treasure instead of returning it unopened.
```

This is confirmation of a physical world action, not a narrative choice menu.

If cancelled:

- do not open the casket,
- do not transfer loot,
- do not change quest outcome.

If confirmed:

1. open the casket through the shared container/inventory mechanism,
2. make its actual contents available/transfer them according to that mechanism,
3. resolve `treasure_kept` exactly once,
4. permanently invalidate the `treasure_returned` path.

The Player keeps:

- **100% of the money**,
- **the ruby**.

Opening remains the V1 commitment point even if the Player later still possesses the empty/open casket.

### 9. Returning the unopened casket

If the Player brings the intact, unopened casket to the quest NPC, the NPC interaction receives/consumes that concrete container and resolves `treasure_returned`.

The agreed split is:

```text
Player: 30% of the money
NPC:    70% of the money + ruby
```

Calculate the Player payment from the authored money amount in the actual treasure definition rather than maintaining a second independent reward value where practical.

The NPC keeps the casket/remaining treasure as part of resolution; it must no longer remain available to the Player afterward.

Apply any Player↔NPC relationship and/or settlement social consequences through the existing quest outcome/social-consequence seams. Do not introduce another reputation store.

### 10. Kept-treasure outcome

Opening the casket resolves the alternative outcome immediately enough that save/load, moving away or later speaking with the NPC cannot restore the return path.

The Player does not also receive the 30% return payment.

Post-outcome dialogue may reflect that the Player failed to bring back the unopened treasure, but dialogue does not decide the outcome.

## Authored quest bindings

V1 deliberately uses authored bindings for:

- quest giver,
- target cemetery/grave,
- target production cave,
- treasure casket,
- persistent bear occupant.

Keep bindings explicit and stable rather than introducing procedural selection solely for this quest.

Where possible, reference stable world/entity identities instead of runtime object references or duplicated coordinates.

## State ownership

Keep authoritative state in its owning systems:

| State | Owner |
|---|---|
| quest stage / resolved outcome | quest system |
| target-grave geometry/identity | existing cemetery/world systems |
| hidden-find resolution | hidden-find / quest integration seam |
| grave social exposure | `quests-progression-011` integration |
| cave identity/topology/spatial representation | world / cave system |
| cave-backed fauna home/navigation | `fauna-019` / fauna |
| bear identity, snapshot, death/tombstone | `fauna-018` / fauna |
| bear needs, movement, health, lifecycle | `AnimalAgent` / fauna |
| casket contents and placed/carried/open state | shared container/inventory system |
| Player↔NPC relation | existing quest relationship state |
| settlement reputation/renown | `ReputationManager` |

Do not duplicate these values into quest state merely to make objective checks easier.

## Persistence

Save/load must preserve enough authoritative state that the quest cannot regress, resurrect entities or duplicate rewards.

Verify persistence of:

- map-recovered progression,
- current quest stage,
- resolved outcome,
- target grave already resolved,
- social exposure not rerolled for the same grave,
- treasure casket stable identity,
- casket unopened/opened state,
- casket contents,
- placed/carried state,
- `fauna-018` persistent bear identity/snapshot/tombstone,
- any cave discovery/navigation state already owned by the map/world-location system,
- social consequences through their existing stores.

Derived cave geometry, cave habitat anchor and other deterministic world data remain derived according to `world-terrain-008` / `fauna-019`; do not serialize duplicate quest coordinates or cave topology.

## Reuse / integration targets

Implementation should reconfirm current symbols after dependencies land, especially:

- `src/world/hiddenFinds.ts` — authored hidden-find integration,
- `src/app/actions/groundActions.ts` — ordinary shovel/dig + grave disturbance,
- cemetery grave placement/stable identity,
- the `quests-progression-011` social-exposure integration point,
- `src/quests/QuestManager.ts` / current quest-definition APIs,
- quest outcome APIs from `quests-progression-002`,
- production cave/world-location APIs after `world-terrain-008`,
- fauna real-cave habitat APIs from `fauna-019`,
- persistent occupant APIs/state from `fauna-018`,
- `src/app/actions/containerActions.ts` and current placed-container ownership,
- item catalog / inventory money and ruby representation,
- save schema and world rebuild/carry restore paths.

Current code is the source of truth. If dependencies move responsibilities or symbols, follow the resulting architecture rather than preserving obsolete file names from this plan.

## Architecture constraints

- The Player participates through ordinary world actions: dig, travel, avoid/fight fauna, pick up casket, open casket, deliver casket.
- No quest-spawned bear.
- No quest-only cave.
- No quest-owned bear persistence.
- No duplicate cave/home coordinates owned by the quest.
- No quest-only inventory or treasure payload.
- No custom grave-risk calculation in this quest; use `quests-progression-011`.
- No dialogue A/B choice for the final treasure decision.
- Treasure and bear lifecycles are independent.
- Prefer stable ids over runtime references for authored bindings.
- Preserve deterministic simulation and save/load continuity.
- Add JSDoc for important new shared/public architectural APIs where useful for preflight discovery; use `@domain quests-progression` or the actual owning domain.

## Non-goals

Do not implement in this plan:

- witness/NPC detection simulation,
- a generic crime/legal system,
- persistent-wild-animal infrastructure already owned by `fauna-018`,
- cave-backed fauna navigation already owned by `fauna-019`,
- a new cave generator,
- procedural treasure-map generation,
- procedural quest-giver, grave or cave selection,
- scripted bear encounter phases,
- quest-specific bear movement,
- dialogue-driven final choice,
- generic lock/lockpicking mechanics,
- broad container-system redesign,
- multiplayer synchronization.

## Performance

The quest itself should add negligible continuous runtime cost.

- Use event/action-driven objective progression rather than per-frame quest scans.
- Reuse normal cave streaming; quest references must not keep cave presentation permanently active.
- Persistent bear simulation follows fauna policies; quest importance alone must not force permanent high-fidelity ticking.
- Grave exposure is event-driven through `quests-progression-011`.
- Do not add a worker for quest bookkeeping.

## Automated verification

Cover, where practical:

### Grave/map

- only the authored target grave resolves the map,
- resolution still triggers the ordinary grave-disturbance path,
- social exposure from `quests-progression-011` is executed at most once,
- the map cannot be recovered twice across save/load,
- returning with the recovered map advances to the cave stage.

### Cave/bear

- the quest targets the intended stable real cave identity,
- the configured bear uses the cave-backed habitat from `fauna-019`,
- the bear is not created/despawned by quest stage transitions,
- bear presence/alive state does not gate treasure existence,
- `fauna-018` persistence prevents a dead/tombstoned resident from respawning.

### Casket/outcomes

- the casket contains the authored money amount and one ruby,
- the casket preserves identity, contents and carried/placed/open state across save/load,
- carrying the unopened casket does not resolve an outcome,
- cancelling the open confirmation changes nothing,
- confirming opening resolves only `treasure_kept`,
- kept outcome gives access to 100% money + ruby,
- an opened casket cannot later resolve `treasure_returned`,
- delivering the unopened casket resolves only `treasure_returned`,
- returned outcome pays exactly 30% of the authored money amount,
- returned outcome does not give the ruby to the Player,
- returned outcome removes/transfers the concrete casket so it cannot be reused,
- each outcome and reward resolves exactly once,
- Player cannot receive both full treasure and the 30% return share.

### Persistence/regression

- save/load at every major stage preserves the same legal next actions,
- existing hidden-find, digging, grave exposure, container, quest, fauna, cave, reputation and persistence tests remain green.

## Manual verification

Manual browser verification is performed by the User.

Verify at least these complete routes:

1. Dig the grave, recover the map, return to NPC, wait for the bear to leave naturally, take the unopened casket, return it to NPC and receive exactly 30% of its money value.
2. Dig the grave, recover the map, reach the cave while the bear is present, interact with the world through normal fauna/combat behaviour, take the casket, confirm opening it, keep all money and the ruby, and verify the return outcome is no longer available.

Also verify save/reload while:

- the map is still buried,
- after recovering the map,
- after learning the cave location,
- the bear is alive,
- the bear corpse exists,
- the persistent bear has been tombstoned,
- carrying the unopened casket,
- after putting down the unopened casket,
- after opening the casket,
- after either quest outcome resolves.

For grave exposure, verify representative day/night + Sneak combinations according to `quests-progression-011`; do not expect visible NPC witnesses because that dependency deliberately models abstract social exposure instead.

## Completion criteria

- The map is recovered through the ordinary target-grave Hidden Find / grave-disturbance flow.
- Grave social risk is provided by `quests-progression-011`, not quest-specific logic.
- The quest uses one real production cave from the shared cave system.
- One specific persistent fauna-owned bear has that cave as its actual interior home through `fauna-018` + `fauna-019`.
- The bear can leave and return through normal ecosystem behaviour and is not a quest guard.
- Treasure existence is independent of bear state.
- Treasure is one real portable physical **casket** containing **money + one ruby**.
- The Player can carry the unopened casket to the NPC.
- Opening requires explicit confirmation and resolves `treasure_kept`; the Player keeps all money + ruby.
- Returning the unopened casket resolves `treasure_returned`; the Player receives exactly **30% of the money**, while the NPC receives the remaining **70% + ruby**.
- The final branch is determined by physical Player action, not dialogue choice.
- Both outcomes use shared quest outcome/reward/social consequence mechanisms.
- Save/load cannot duplicate the map, casket, treasure, return payment or resurrect the specific bear incorrectly.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
