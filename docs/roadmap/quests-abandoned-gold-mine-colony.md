# Abandoned Gold Mine → Mining Colony

## Direction

The abandoned gold mine questline should create a persistent change in the simulated world:

> discovery → sponsorship → site preparation → expedition → mining camp → autonomous colony → gold economy → persistent consequences

The mine, gold deposits, settlements, NPCs, construction, equipment and economy must remain normal world systems rather than quest-owned substitutes.

The quest should primarily coordinate transitions between those systems.

The intended end state is not merely a completed quest. It is a real mining colony which continues to exist, consume resources, mine gold, trade and encounter problems independently of the Player.

## Core principles

- The mine exists as real world content independently of the quest.
- The mine is located in a genuine mountainous region and uses the shared Cave V2 system.
- Gold is represented by ordinary finite resource deposits.
- The Player prepares the colony site using ordinary construction and terrain systems.
- The expedition consists of real NPCs with real inventories.
- Expedition members physically travel to the mine.
- Their equipment is transported in their inventories rather than appearing at the destination.
- The mining camp becomes a real settlement rather than a quest-specific simulation.
- Miners use normal needs, professions, schedules, movement, mining and economy systems.
- Gold production enters the ordinary economy.
- Player profit sharing depends on actual economic activity.
- Depleted deposits do not respawn merely to preserve the quest.
- The world continues operating without the Player or camera.

## Planning rule

This roadmap intentionally does **not** prescribe implementation details that have not been verified against the current code.

Each implementation plan described below must begin with a focused recon of the current `main` branch.

Before creating each plan:

1. read `docs/plans/PLANNING.md`,
2. check relevant current-state documentation,
3. inspect the actual implementation and ownership boundaries,
4. inspect related plans and implementation notes,
5. verify dependencies and existing reusable mechanisms,
6. identify discrepancies between this roadmap and current code,
7. only then create the implementation plan.

Current code and completed implementation work take precedence over this roadmap.

---

# Stage 1 — Mountain gold mine and rich deposits

## Goal

Create the world-side foundation for a valuable abandoned gold mine that exists before any quest begins.

## Direction

The target region should contain a genuine mountain massif suitable for the mine.

If suitable mountains exist but no appropriate Cave V2 exists, world generation should deterministically provide a suitable cave.

If the target region would otherwise contain no appropriate mountains, world generation should ensure a coherent mountain massif at the regional generation level rather than creating a quest-specific hill or placing the mine on unsuitable terrain.

The resulting geography must remain ordinary deterministic world content.

The mine should have a stable identity that other systems can reference.

## Gold deposits

The mine should contain approximately five real gold deposits:

- 1–2 near or immediately outside the entrance,
- 2–3 inside the cave.

The mine is intended to be unusually rich.

Target total reserve:

**approximately 500–1000 gold, with ~750 gold as a representative mine.**

Existing small surface deposits must not become enormous as a side effect.

The resource model should therefore distinguish, if recon confirms this is appropriate:

- resource richness / extraction quality,
- total deposit reserve / capacity.

A rich mine remains finite.

Mining permanently reduces its reserves and depletion persists through save/load.

There is no automatic gold respawn.

## End state

At the end of this stage:

- the mountain exists,
- the cave exists,
- the mine has stable world identity,
- gold deposits exist,
- deposits can be mined through the ordinary mining system,
- depletion is persistent,
- none of this requires the quest to be active.

---

# Stage 2 — Player-built colony infrastructure

## Goal

Allow the Player to prepare a viable future settlement site using normal world construction.

## Terrain preparation

Reuse the existing configurable terrain-preparation mechanism which already supports continuously selectable sizes approximately from `2×2` to `9×9`.

Do not introduce a parallel quest-specific plot system.

The mining-colony requirements should use two prepared plots.

Current design target:

- exactly 2 qualifying prepared plots,
- minimum approximately `6×6` each,
- located within the future colony site,
- sensible placement relative to the mine entrance,
- no obstruction of the cave entrance or primary access route,
- sufficient separation for later structures.

Exact dimensions and placement rules must be confirmed during recon against actual construction footprints and terrain-preparation APIs.

## Farming

Garden beds / fields / similar cultivated areas should be normal Player construction types.

The quest must not create a `QuestGarden`.

The construction/farming systems should expose enough authoritative state for other systems to determine that a usable cultivated area exists at a site.

## Water

The site requires a real Player-built well using the normal well and `WaterSource` mechanisms.

## End state

A world location can be evaluated as having the minimum physical infrastructure required for the expedition without consulting quest-specific booleans:

- two suitable prepared plots,
- usable well,
- usable cultivated area.

---

# Stage 3 — Mining expedition

## Goal

Allow a settlement to form a real NPC expedition and send it to another world location.

## Expedition population

The sponsoring/mother settlement should be generated with enough population depth to provide at least three suitable expedition candidates without destroying its critical workforce.

The intended expedition consists of:

**3 adult male NPCs.**

Preferred candidate profile:

- alive,
- healthy enough to travel and work,
- approximately 18–35 years old,
- eligible to leave the sponsoring settlement,
- existing miners preferred,
- physical traits/abilities suitable for mining considered when choosing among candidates.

The system must tolerate candidates dying before expedition dispatch.

Selection therefore occurs against the current population rather than permanently reserving three specific NPC IDs when the world is generated.

Fallback selection should progressively broaden the candidate pool, for example:

1. eligible miners aged 18–35,
2. eligible men aged 18–35,
3. eligible men approximately 36–45.

World generation should nevertheless provide enough initial population reserve that the normal quest path is not dependent on fallback.

Exact eligibility rules must follow the NPC age, health, household, profession and settlement-membership systems found during recon.

## Equipment

Every expedition member carries real equipment in his own inventory.

Target per-NPC loadout:

- pickaxe,
- knife,
- waterskin,
- shovel,
- tent,
- blanket,
- dried meat,
- fire-starting equipment,
- appropriate basic medical supply if supported by the normal item systems.

Exact item kinds and quantities must be verified against the current item/inventory systems.

Items should not magically appear at the mine.

The NPC leaves the mother settlement carrying them.

## Travel

Expedition members physically travel from the sponsoring settlement to the mine using normal NPC movement/pathfinding and adaptive simulation mechanisms wherever practical.

The expedition mechanism coordinates the journey but must not become a parallel NPC controller.

## End state

Three real NPCs can leave one settlement with real equipment and travel toward a designated world site while retaining normal NPC state and persistence.

---

# Stage 4 — Mining camp and colony bootstrap

## Goal

Turn the arriving expedition into a persistent small settlement.

## Camp

After reaching the prepared site, expedition members establish a provisional mining camp.

Their tents originate from the equipment they carried.

Placing a tent should result in a real persistent world/shelter object rather than a decorative quest prop.

The camp should use:

- prepared terrain,
- Player-built well,
- cultivated area,
- tents/shelter,
- ordinary NPC needs and inventories.

## Settlement bootstrap

The site becomes a real small settlement with stable identity.

The colony should retain a relationship to its sponsoring/mother settlement.

This relationship should use the smallest reusable settlement-level mechanism appropriate after recon; it should not require introducing a full political hierarchy.

Expedition members become inhabitants of the new settlement using normal settlement/household/NPC ownership mechanisms.

Bootstrap must be idempotent and persistent.

Reloading cannot:

- recreate the expedition,
- duplicate NPCs,
- duplicate tents,
- duplicate the colony,
- reset membership.

## Autonomous operation

Once established, the quest no longer controls daily mining.

Normal simulation takes over:

> needs → schedules/work → travel to deposit → mining → carried gold → storage/economy

The colony must continue functioning off-screen through the normal adaptive simulation model.

## End state

A real autonomous mining settlement exists and operates without requiring the Player or active quest logic.

---

# Stage 5 — Gold economy and Player profit share

## Goal

Give mined gold ordinary economic meaning before attaching quest rewards to it.

## Gold value

Do not hard-code the final `gold → coins` exchange rate in this roadmap.

Recon must first establish:

- current item prices,
- settlement trade mechanisms,
- economic stock ownership,
- coin flows,
- existing production/sale mechanisms.

The eventual exchange value should be consistent with the broader economy.

With approximately 500–1000 gold available in the mine, the mine should represent a significant regional economic asset rather than a short-lived loot cache.

## Economic flow

The desired conceptual flow is:

> deposit → mining → gold stock → economic realization / sale → coins/value

Profit sharing should be based on actual realized production/economic activity, not merely the current amount of gold stored in `SettlementEconomy`.

## Profit share

The intended Player option is:

**20% share.**

The entitlement should be tied to this specific mine/colony.

It should accrue from attributable economic activity and remain correct when:

- mining happens off-screen,
- gold is later consumed or transferred,
- the Player is elsewhere,
- the game is saved and loaded.

No periodic scan of inventories or settlement stock should be required.

This stage should prefer a reusable source-aware economic/production mechanism over quest-specific accounting.

## End state

Gold produced by the colony has a normal economic path to value/coins, and a persistent source-aware entitlement can receive 20% of the appropriate realized value.

---

# Stage 6 — Abandoned mine questline integration

## Goal

Connect the completed world systems into the authored questline.

This should be the thinnest stage.

## Initial information

A small/home settlement provides the initial story lead, map or information.

A nearby medium/large settlement acts as the sponsoring/mother settlement.

The information reveals an existing mine; it never creates one.

## Independent discovery

The Player may discover the mine before receiving the normal lead.

Discovery persists as world knowledge.

Relevant NPC dialogue and quest availability should react to this fact so that independent exploration converges into the same questline.

There should not be two independent implementations of the quest.

## Main progression

Intended progression:

1. receive information or independently discover the mine,
2. explore the real cave,
3. confirm the rich gold deposits,
4. report the discovery to the sponsoring settlement,
5. sponsor agrees to reopen the mine,
6. Player prepares required infrastructure,
7. sponsor validates the real world state,
8. Player chooses the reward arrangement,
9. expedition is equipped and dispatched,
10. expedition physically travels to the mine,
11. miners establish their camp,
12. site becomes an operational mining colony,
13. ordinary simulation takes over.

## Reward choice

The Player chooses between:

- a substantial immediate buyout/payment,
- continuing 20% participation in the mine's economic proceeds.

Exact coin values should be determined only after Stage 5 establishes the gold economy.

The immediate payment should trade long-term expected value for certainty and immediate liquidity.

## End state

Completing the quest causes a persistent transformation:

> abandoned mine → inhabited mining colony

The resulting colony, people, resources and economy continue independently of the quest.

---

# Later opportunities

These are intentionally outside the initial questline implementation:

- permanent houses replacing tents,
- expanded gardens/fields,
- dedicated storage,
- roads between the colony and sponsoring settlement,
- additional workers and families,
- trade caravans,
- mine accidents,
- deeper cave exploration,
- additional mineral veins,
- food or water shortages,
- conflicts over ownership,
- banditry,
- regional economic effects,
- population growth,
- eventual resource exhaustion.

Gold exhaustion should remain a real possibility.

When the mine eventually becomes uneconomic, miners may return to the sponsoring settlement, migrate elsewhere or create new pressures/problems.

That lifecycle should be handled by future settlement/NPC systems rather than preventing depletion.

---

# Dependency direction

The intended dependency chain is:

```text
Cave V2 / terrain / resources
        ↓
Mountain gold mine
        ↓
Player-built colony infrastructure
        ↓
Mining expedition
        ↓
Mining camp / settlement bootstrap
        ↓
Gold economy / profit share
        ↓
Authored questline integration
```

Some work may proceed in parallel after contracts are established.

In particular, Player construction and expedition mechanics need not wait for every detail of gold economics.

The final quest integration should wait until the underlying world-system contracts are sufficiently stable.

# Success criterion

The feature is successful when removing or completing the quest does not remove the world it created.

The mine remains a mine.

The deposits remain depleted or available according to actual extraction.

The expedition members remain real inhabitants.

The camp remains a real settlement.

Gold continues moving through the economy.

And the world continues changing without waiting for the Player.
