# State Documentation Audit — Player / Items / World Objects / Survival

**Date:** 2026-09-06
**Baseline:** `5071a9948631f272a1a8c7340fc8f3efa683c0fc`
**Agent:** Claude Code — Sonnet 5
**Scope:** `src/items/*` (53 files), `src/player/*` (23 files), player-built/placed world objects in `src/world/` (`playerWell*`, `standingTorch*`, `palisade*`, `sleepingUtilities*`, `createTerrainPreparations.ts`/`terrain/terrainPreparation.ts`, `workContract*`, `animalTraps*`, `createPlacedTraps.ts`, `beehives.ts`, `dryingRacks.ts`, `createPlayerGardens.ts`/`playerGarden.ts`, `cropLifecycle.ts`, `foodSources.ts`, `fishing.ts`, `createPlacedContainers.ts`, `containerProp.ts`, `createDroppedItems.ts`, `WaterSource.ts`), `src/app/actions/*` (`survivalActions`, `containerActions`, `placementActions`, `workContractActions`, `gatheringActions`, `restActions`, `groundActions`, `terrainPreparationActions`, `mountActions`), `src/items/HeldTool.ts`, targeted sections of `src/persistence/saveData.ts` (inventory/instances/food-batches/every player-built-object save shape) for ownership only. Read in full: `docs/reviews/2026-09-06-state-documentation-audit.md`, `docs/reviews/state-audit/01-inventory.md`; consulted `04-npc.md`/`05-fauna.md` only to confirm two specific seams (work-contract NPC execution, riding/mount save field) — did not repeat their recon. Did not deep-dive combat numbers (`07` will own that), settlement/household economy internals (`03`), or NPC decision internals (`04`) beyond the shared seams below.

This is a recon pass per the audit brief. No current-state documentation or gameplay code was changed.

---

## Confirmed current state

### Inventory is one generic class, not a player-only system

`items/Inventory.ts`'s `Inventory` class is the single item-ownership mechanism for player, NPC (`NpcAgent.carried`, small cap), settlement `Household.items`/`SettlementEconomy.items`, and every world-placed `PlacedContainerEntry.contents` (`world/createPlacedContainers.ts`) — a container's contents literally *are* an `Inventory`, not a second `StoredItem` model. It owns four kinds of state per instance: plain stackable `counts`, `ItemInstance`-backed items (`instances`, keyed by id), perishable-food `foodBatches` (stack-level freshness, oldest-first consumption), and two independent capacity axes (`maxWeight`, derived + backpack-bonus; `maxSize`, gabarite units, `Infinity` unless a caller opts in — only the player's own inventory does, via `DEFAULT_MAX_SIZE = 60`).

### Item identity: three tiers

1. **Plain stackable `ItemKind`** — most items; just a `counts` map entry.
2. **`ItemInstance`-backed kinds** (`items/itemInstances.ts`'s `INSTANCE_BACKED_KINDS`) — traps (`durability`), the 13 `WEAPON_MAINTENANCE_KINDS` (`durability`+`sharpness`), and the 5 `LiquidContainerKind`s (waterskins/buckets: `liquid`+`amountLitres`). Each instance has a stable `id` (`createItemInstanceId()`) that survives inventory ↔ world-drop ↔ container transfers (`toSaveItemInstance`/`instancesFromJSON`, `DroppedItem.instance`, `PlacedContainerRecord.instances`).
3. **`HeldTool`** (`items/HeldTool.ts`) — a single "in hand" slot layered on top of #1/#2, tracking which `ToolKind` (derived from `ITEM_CATALOG[kind].holdable`) and, for weapon-maintenance kinds, which concrete instance id is equipped. `Inventory` still owns the count/instance; `HeldTool` only remembers which one is in hand and re-syncs (`syncWithInventory`) if that item leaves inventory.

`ITEM_CATALOG[kind].capabilities` (`ItemCapability`) is the single source of truth for every tool-requirement gate across the whole domain (digging, mining, chopping, meat-harvesting, fire-starting, fishing) — `Inventory.hasCapability`/`findWithCapability` query it; no hand-written `kind === 'shovel'` checks remain in the audited call sites.

### Survival pools and their consequences

`PlayerNeeds` (`player/PlayerNeeds.ts`) is four pools — stamina, vigor, hunger, thirst — reusing the shared `StaminaState`/`VigorState`/`HungerState`/`ThirstState` primitives, ticked every frame (`tickPlayerNeeds`) against the live `dayLengthSec` so tuning is expressed in game-days, not raw seconds. Hunger/thirst crossing a critical threshold (20%) starts a `starvationDuration`/`dehydrationDuration` counter (simulation-time, resets the instant the pool recovers); before a "severe" duration gate it only ramps a Vigor/Stamina capability penalty, after it `playerDamage.ts`'s `tickPlayerStarvationDamage` starts real, slow HP loss through the *existing* player defense/downed pipeline — confirmed not a second death system. A `PhysicalEffortIntensity` (`light`/`moderate`/`heavy`) seam, also owned by `PlayerNeeds.ts`, is what every dig/chop/mine/well-work/terrain-prep/palisade/torch action declares instead of hand-rolling its own Stamina/Vigor cost; `applyRepresentedPhysicalEffortVigor` is the compressed-work variant used by `workOnWell`/terrain preparation/buildable-contract work bouts, where the represented work-hours credited (not real elapsed seconds) drive the Vigor cost.

`player/PlayerSkills.ts` has **six** skills (`SkillId = 'sneak' | 'survival' | 'traps' | 'defense' | 'archery' | 'riding'`), XP-only (`SkillState{value, xp, active}`, `value` derived through one shared curve, no levels/perks/points). `riding` (plan fauna-003/008) feeds `ridingSpeedMultiplier`/`ridingStaminaDrainMultiplier`, read by `app/actions/mountActions.ts`.

### Player-built world objects share one construction shape

Every player-built placeable (well, standing torch, palisade segment, bedroll, platform, garden plot, terrain preparation) goes through the same shared contract:

- **Placement** — one `GroundPlacementDefinition` (`aim` + `evaluate`, `app/actions/placementActions.ts`) feeds both a read-only preview (`previewGroundPlacement`) and the real placement action (`evaluatePlacementSite`), so preview and confirm can never validate a site differently; `evaluateGroundPlacement`/`evaluateTentPlacement` (`items/tentPlacement.ts`) is the shared suitability check (water/slope/peer-separation) every object's own footprint/separation plugs into.
- **Materials** — `items/constructionMaterials.ts`'s `hasMaterial`/`consumeMaterial` is the one atomic acquisition seam: inventory first, then dropped items within a fixed 3 m radius, closest-stack-first, all-or-nothing. `computeMaterialRecovery`/`canReceiveRecovery`/`applyRecovery` is the matching generic removal/recovery seam (currently wired only for palisade segments, `50%` beam recovery, capacity-preflighted before anything is removed).
- **Multi-stage active work** — a well's `pit`/`well`/`roof` stages, and (since plan items-player-017) a standing torch's/palisade segment's single `completedWork` counter, only advance from *active* player (or NPC) work bouts, never from elapsed world time. Each object exposes an actor-neutral `contributeWork(id, amount)` seam (`PlayerWells.addWork`, `StandingTorches.contributeWork`, `Palisades.contributeWork`, `TerrainPreparations.contributeWork`) that both the player's own `[E]` busy-channel and NPC Work Contract execution (`ai/NpcAgent.ts`'s `pursueAcceptedContract`/`runBuildableContractWorkBout`) call identically — "clamp to remaining, credit only accepted work," never a duplicated per-actor progress field.
- **Cancellation credits exactly the measured fraction** — every one of these work-bout actions (`workOnWell`, `workOnStandingTorch`, `workOnPalisade`) captures `performance.now()` at bout start and, on `busy.start(...).onCancel`, credits `sessionHours × (elapsedMs / sessionMs)` rather than rolling back or granting the full session — confirmed identical pattern in all three call sites in `placementActions.ts`.

### Work Contracts: player-issued, NPC-executed, target-owned progress

`world/workContract.ts`'s `WorkContractRecord` is the sole authority for the *commitment* (employer, `ContractTarget`, reward, lifecycle state, `requestedWorkShare`/`remainingWorkAtCreation`/`committedWork`/`npcWorkCompleted`) — it never owns the target's actual progress. `ContractTarget` is a tagged union over four `WorkType`s (`construction` → a `PlayerWellRecord`, `terrain_preparation`, `palisade`, `standing_torch`), each pointing at a real, independently-progressing world object; `remainingWorkAtCreation`/`committedWork` are frozen at contract creation from that target's own remaining-work function (`wellRemainingWork`, `terrainPreparationRemainingWork`, etc.) and never recalculated. A contract is created (`bundle.workContracts.create()`, `app/actions/workContractActions.ts`) with a work-share preset (25/50/75/100%) and a reward preset, but is **never auto-advertised** — posting is a separate, physical action requiring the player to reach a settlement's notice board (`world/workContract.ts`'s `noticeBoardId`/`postWorkContract`). Confirmed the player is always `employer: 'player'` today (a `string`, not a literal — the type already anticipates an NPC-employer phase).

### Player survival interactions reuse shared world/item mechanisms, never duplicate them

- **Water** — `world/WaterSource.ts` is one abstraction for well/lake/river/ocean drink/fill, with `WaterQuality` (`safe`/`unsafe`/`undrinkable`) and an optional `consumptionRisk` (currently only an uncovered player-built well, rolled at the moment of direct drink, never at fill time). `app/actions/survivalActions.ts`'s `drinkFromWaterSource`/`fillWaterskin` are the only two mutation points; a deep well's `requiresRope` gate is shared by both.
- **Liquid containers** — `items/liquidContainer.ts` (pure domain ops: `fillLiquidContainer`/`drinkFromLiquidContainer`/`addLiquidToContainer`/`emptyLiquidContainer`) operates on `LiquidContainerItemInstance`s; callers always go through `Inventory.updateInstance()`. The same containers are also used for garden watering (`waterGardenPlot`, consumes exactly `WATERING_LITRES`, not the whole container) and animal milking (`startMilkAnimal`, pours up to the species' configured yield, capped by remaining container capacity) — confirmed one liquid-container model, three call sites, no per-feature duplicate.
- **Cooking** — `items/campfireCooking.ts`'s `resolveCookingCapacity`/`findCookingBatch` reads capacity directly off the `VillageFire` instance (bare fire 1, carried `pan` 2, a fire with a built grate 4 — grate wins outright, never adds to pan); one busy channel produces the whole batch at once.
- **Food freshness** — `items/foodFreshness.ts`'s `getFreshnessStage` is a pure function of a batch's `acquiredAtDays` + current world day; spoiled food is refused by `consumeItem`, checked against the *specific* batch that would actually be consumed (oldest-first, same order `Inventory.remove()` uses) — not a whole-kind flag.
- **Traps** — `world/animalTraps.ts`+`createPlacedTraps.ts` are player-placed `WorldBundle` records, not a separate manager; species compatibility is trap-kind-aware (`TRAP_SPECIES_COMPAT`), bait is a player choice via a `FlavorDialog` panel (`gatheringActions.ts`'s `openTrapArmDialog`), and a caught animal dies through the ordinary `AnimalAgent` damage/death path (an un-harvested corpse, still knife-harvested normally).
- **Fishing/drying/hives** — `world/fishing.ts` (deterministic per-`(spot, attempt)` catch roll, no fish population), `world/dryingRacks.ts` and `world/beehives.ts` (both a generic `items/timedProcess.ts` `TimedProcess`, resolved lazily so they survive reload/time-skip with no per-frame ticker) are all settlement-landmark objects, not placeable items.
- **Gardens** — `world/playerGarden.ts`/`createPlayerGardens.ts` own only placement + `care`/`hydration`/`droughtStressDays` state; actual crop planting/growth is `world/cropLifecycle.ts`'s job, shared verbatim with settlement gardens (a player plot only widens `plantedCrops.ts`'s `isNearAnyGarden` radius check). `world/foodSources.ts`'s `nearestFoodSource`/`createFoodSourceHooks` is the generic hunger-source resolver consumed by NPC hunger-seeking (`SettlementFoodSourceHooks`, threaded into every `NpcAgent`) — it treats a wild crop, a settlement-garden crop and a player-plot crop identically, and is confirmed **not** consumed by the player's own equivalent action (`app/actions/gatheringActions.ts`'s `harvestCrop` calls `ChunkManager.harvestCrop`/`findNearestGarden` directly, duplicating only the yield-scaling math, not the target-search).
- **Riding/mounts** — `app/actions/mountActions.ts` resolves a mountable `AnimalAgent` by id across loaded settlements' livestock + wild fauna (a wild animal is not currently `mountable` in practice — only livestock kinds carry a deterministic id `SaveData.player.mountedAnimalId` can reference across a reload). Player-side riding cost/benefit lives in `PlayerNeeds.tickRidingStamina` + `PlayerSkills.ridingSpeedMultiplier`/`ridingStaminaDrainMultiplier` — confirms and closes `05-fauna.md`'s open question about the player-side half of the riding seam. (One correction to `05-fauna.md`'s §"Open questions"/riding note: the persisted field is `SaveData.player.mountedAnimalId`, not `player.riding` as that document states — `riding` is the `SkillId`, a different field entirely.)
- **Corpse butchery/burial** — `startHarvestMeat`/`startBuryCorpse` (`survivalActions.ts`) share the exact `harvestAnimalIntoInventory`/`meatKindForAnimal` path a Hunter NPC's post-kill harvest uses (confirmed by `05-fauna.md`'s own finding) — no separate player-only harvest pipeline.

### Generic player storage (chests) is a second, independent `Inventory` owner

`items/container.ts`+`world/createPlacedContainers.ts` model a placed `chest` as its own `Inventory` (`maxWeight: Infinity`, `maxSize: capacityUnits`) — contents never pass through the player's own `Inventory` on pickup; a carried container travels as its own `PlacedContainers.carriedKind()`/`CarriedContainer` record, entirely separate from `Inventory.addInstance`. `containerTotalWeight()` (container base weight + `contents.totalWeight()`) is the one calc both the transfer-screen UI and `player/playerEncumbrance.ts` (via `bundle.placedContainers.carriedWeightKg()`) read for a carried chest's contribution to player overload.

### Encumbrance is a pure function, computed once per frame

`player/playerEncumbrance.ts`'s `computeEncumbrance(loadKg, capacityKg)` is stateless — `app/gameLoop.ts` is the only caller, feeding `inventory.totalWeight() + placedContainers.carriedWeightKg()` against `inventory.maxWeight` once per frame. Below 10% overload: full speed. Above 30%: movement blocked. Between: a smoothstepped speed multiplier down to 0.55×.

---

## State ownership

| State | Authoritative owner | Persisted? | Runtime-only / derived |
|---|---|---|---|
| Item stack counts, instances, food batches | `Inventory` (per owner: player, NPC, `Household`, `SettlementEconomy`, each `PlacedContainerEntry`) | Player's own: `SaveData.inventory`/`inventoryInstances`/`foodBatches`. Container contents: `SavePlacedContainer.counts`/`instances`. NPC carry: not persisted (transient hold). | `maxWeight` (derived getter, backpack bonus summed live), `totalWeight()`/`totalSize()` (always recomputed) |
| Held tool slot | `HeldTool` (one per `Inventory` owner that has hands — player only in the audited code) | `SaveData.heldTool` (kind) + resolved instance on load (`syncWithInventory`) | — |
| Player survival pools | `PlayerNeeds` on `PlayerController` | `SaveData.playerNeeds` (hunger/thirst/vigor/starvation-dehydration durations); stamina is transient, always full on load | `starvationDuration`/`dehydrationDuration` reset live from `isStarving`/`isDehydrated`, not stored as a flag |
| Player skills | `PlayerSkills` (`SkillState.xp`) | `SaveData.skills` | `value` always re-derived from `xp` via `xpToSkillValue()` |
| Encumbrance | `computeEncumbrance()` output on `PlayerController` | Not persisted | Fully derived every frame from `Inventory` + carried-container weight |
| Player-built well | `PlayerWellRecord` (`world/playerWell.ts`), owned by `bundle.playerWells` | `SaveData.playerWells` | The drawn `WaterSource` itself is never saved — reconstructed from the record |
| Standing torch / palisade segment / bedroll / platform / garden plot / terrain preparation | Their own `world/*`-owned record + `WorldBundle` collection | `SaveData.standingTorches`/`palisades`/`bedrolls`/`platforms`/`playerGardens`/`terrainPreparations` | Visual mesh/collider is a projection, never authoritative |
| Placed container (chest) | `PlacedContainerRecord`/`PlacedContainerEntry.contents` (`Inventory`) | `SaveData.placedContainers` (world) / `SaveData.carriedContainer` (carried) | — |
| Work contract | `WorkContractRecord` (`world/workContract.ts`) | `SaveData.workContracts` | `npcWorkCompleted` only changes via `recordNpcWorkContribution`; the *target*'s own progress is a separate authoritative record referenced by id, never duplicated onto the contract |
| Dropped world items | `DroppedItems` (`items/createDroppedItems.ts`) | `SaveData.droppedItems` (full record — positions aren't seed-derivable) vs. `SaveData.collectedItemIds` (world-generated items, sparse id set) | In-flight `falling` physics state is not persisted |
| Fishing bait / drying rack process / hive honey | Per-object record in its own `WorldBundle` collection | `SaveData.fishingBait`/`dryingRacks`/`hives` | `TimedProcess` completion is resolved lazily from a stored start time, not ticked |
| Riding/mount | `AnimalAgent` (fauna-owned) is the authoritative mount; player only stores which one | `SaveData.player.mountedAnimalId` (livestock only — deterministic id required) | Player's seat transform/stamina drain is computed live each frame in `mountActions.ts` |

No duplicated-state problems were found in this domain: every player-built object's construction/material state lives exactly once (on its own record), work-contract commitment state is explicitly kept separate from target progress (by design, per `workContract.ts`'s own doc comment), and container contents are never mirrored into player `Inventory`.

---

## Runtime flows

**Item pickup / consumption:**
```text
world item (chunk-generated, dropped, or crop harvest)
→ Inventory.add() / addInstance() (capacity-gated by canAdd/canAddInstance)
→ hud.setInventoryWeight() + ctx.onInventoryChanged() (UI sync, every mutation site)
→ consumeItem() / drinkFromWaterSource() / cooking / trap-bait / etc.
→ PlayerNeeds mutation (eatFood/drinkWater/healHealth) or HealthState mutation
```

**Player-built object construction (well/torch/palisade/terrain-prep, shared shape):**
```text
placement input (aim + evaluateGroundPlacement)
→ material check (hasMaterial: inventory then nearby DroppedItems)
→ busy.start(...) → consumeMaterial() (atomic) → WorldBundle.place() (new record, WorldBundle-owned)
→ repeated [E] work bouts → object's own contributeWork()/addWork() (actor-neutral)
→ construction complete (object's own isXCompleted()) → usable (WaterSource available / torch lightable / collider registered)
```

**Work Contract (player-issued, NPC-fulfilled):**
```text
player creates target (e.g. bundle.playerWells.place()) + WorkContractRecord (share/reward frozen)
→ player physically posts at a settlement notice board (postWorkContract)
→ NpcAgent discovers via notice-board query, acceptWorkContract → travelling → working
→ NpcAgent.runBuildableContractWorkBout() → target's own contributeWork() (same seam player uses)
→ isNpcCommitmentFulfilled() OR target's own completion → payment_due (payment itself out of this phase's scope)
```

**Survival need → consequence:**
```text
tickPlayerNeeds() (per frame, dayLengthSec-scaled)
→ hunger/thirst critical → starvationDuration/dehydrationDuration accrues
→ deprivationSeverity → Vigor/Stamina capability penalty
→ (past severe gate) tickPlayerStarvationDamage() → existing player defense/downed HealthState pipeline
```

---

## Shared mechanisms (cross-domain)

| Mechanism | Owner | Player use | Also consumed by |
|---|---|---|---|
| `Inventory` | `items/Inventory.ts` | Player bag | NPC carry, `Household.items`, `SettlementEconomy.items`, every `PlacedContainerEntry.contents` |
| `ITEM_CATALOG` capability/consumable/container/book flags | `items/itemCatalog.ts` | Tool gating, consumables, liquid containers, books | NPC tool checks (`hasItemCapability`), NPC consumable healing (`findConsumableForNeed`) |
| `HealthState`/`StaminaState` | `shared/*State.ts` | Player HP + Stamina pool | NPC and fauna, identically |
| `WaterSource` | `world/WaterSource.ts` | Player drink/fill | NPC water-fetch (well/lake targeting reuses the same abstraction, per `player-systems.md`'s note that NPCs may target a player well) |
| `foodSources.ts` hooks | `world/foodSources.ts` | Not directly — the player's own `harvestCrop` action duplicates the yield-scaling math only | NPC hunger-seeking (`SettlementFoodSourceHooks`, every `NpcAgent`) |
| `constructionMaterials.ts` | `items/constructionMaterials.ts` | Every player-built object's material cost | NPC construction work bouts read the same nearby-dropped-item radius (per `04-npc.md`) |
| Buildable `contributeWork` seam | Each object's own `world/*.ts` | Player `[E]` work bouts | NPC Work Contract execution (`ai/NpcAgent.ts`) |
| `harvestAnimalIntoInventory` | `fauna/animalHarvest.ts` | Player knife-harvest | Hunter NPC post-kill harvest (confirmed, `05-fauna.md`) |
| Weapon combat numbers (`ITEM_CATALOG[kind].melee`/`defense`) | `items/itemCatalog.ts` | Player melee/ranged | NPC combat phase, animal-attack/defense (per `docs/state/combat.md`) |
| `criticalHit.ts` | `combat/criticalHit.ts` | Player attacks | NPC attacks on fauna (confirmed, `05-fauna.md`) |
| `terrain/slopeConstraint.ts` | `terrain/slopeConstraint.ts` | `PlayerController.update()` | `NpcAgent.steerTo()`, `AnimalAgent.steerToward()` (confirmed, `05-fauna.md`) |

---

## Documentation discrepancies

Compared against `docs/state/player-systems.md`, `docs/items/CATALOG.md`, `docs/items/WEAPONS.md`, and `docs/STATE.md`'s "Items / player" section.

1. **`player-systems.md`'s skill count is outdated.** Its "Player skills" section states "five skills: sneak, survival, traps, defense, archery." Code (`player/PlayerSkills.ts`) and `docs/STATE.md` (§Items/player: "a six-skill progression system... sneak/survival/traps/defense/archery/riding") both confirm **six**, including `riding` (plan fauna-003/008). This is a straightforward missed update, not a design disagreement — `player-systems.md` should be corrected to six and mention `riding`'s player-side consumers (`ridingSpeedMultiplier`/`ridingStaminaDrainMultiplier`, `mountActions.ts`).
2. **`player-systems.md` and `items/CATALOG.md`/`WEAPONS.md` are otherwise accurate and current** (last verified 2026-09-04/2026-09-04/2026-08-19 respectively) — every mechanism this audit traced (busy channels, camp rest, wells, standing torches/palisade construction-progress model, animal traps + bait, garden plots, carry capacity, liquid containers, freshness/bait) matched the current source exactly, including field/function names. This is one of the best-aligned domain docs found across the whole audit so far (compare `01-inventory.md`'s findings for `settlements.md`/`water.md`).
3. **`STATE.md`'s "Items / player" section is implementation-history leakage**, consistent with `01-inventory.md`'s top finding. It is a single ~600-word paragraph naming specific plan IDs (`items-player-001/009/010/012/015/016/017`, `settlements-npcs-001`) and narrating each plan's own changes in sequence, rather than describing current mechanisms. Nearly everything in it is *also* already correctly and more clearly documented in `player-systems.md`/`CATALOG.md` — e.g. the entire palisade/standing-torch construction-progress paragraph duplicates `player-systems.md`'s own "Player-built standing torches" section almost line for line. This section should be cut to a short pointer-style snapshot (owning mechanisms + shared concepts + a "see player-systems.md/CATALOG.md" pointer), matching the brief's "concise snapshot, not a changelog" rule.
4. **Work Contracts / buildable construction-progress model is split across two `STATE.md` sections** ("Settlements / NPCs" and "Items / player") with real duplication — the shared `contributeWork` actor-neutral seam is described independently in both places (once from the NPC-execution angle, once from the player-construction angle) rather than once, cross-linked. `player-systems.md` doesn't mention Work Contracts at all despite the player being the contract's employer and, via `workOnWell`/`workOnStandingTorch`/`workOnPalisade`, sharing the exact same progress-mutation seam an NPC uses. This is a genuine gap: a reader of `player-systems.md` alone would not learn that hired NPC labor can advance their own well/torch/palisade.
5. **No current-state document owns Work Contracts from a single canonical place.** `STATE.md`'s two paragraphs (Work Contracts foundation, NPC Work & Construction, Shared Work) are the only description of the domain; `01-inventory.md` already flagged this gap generically ("`world/workContract.ts` + per-object `contributeWork` seams... described only in `STATE.md` prose, split across §Settlements/NPCs and §Items/player"). This audit confirms the finding is accurate and that it is genuinely a *player-owned* mechanism (player is `employer`, player places the target, player posts to the board) that the NPC side merely fulfills — Stage 4 should decide whether Work Contracts becomes its own short section/doc or a `player-systems.md` addition cross-linked from the NPC side, not the other way around.
6. **`items/CATALOG.md`'s "Consumable" quick-rule doesn't mention the liquid-container-specific `consumeItem` branch.** Code (`survivalActions.ts`'s `consumeItem`) has a distinct code path for `isLiquidContainerKind` (drinks one portion off a specific instance rather than removing a whole stack unit) that the catalog's one-line "driven from inventory screen... world drink/cook actions" description doesn't distinguish from plain consumables. Minor — the liquid-container quick-rule elsewhere in the same file (`| Liquid containers (plan items-player-001) |`) does cover the mechanism itself, just not that `consumeItem` branches on it. Low priority.
7. **`05-fauna.md`'s riding save-field reference is slightly wrong**, not `player-systems.md`'s fault: `05-fauna.md` (§"Open questions") writes `SaveData.player.riding`; the actual field is `SaveData.player.mountedAnimalId` (`riding` is the unrelated `SkillId`). Noting here for Stage 3 to reconcile since `05-fauna.md` is already written; no action needed in this domain's own docs.
8. **No documentation gap found for the generic-container (chest) system** — `CATALOG.md`'s item row (`chest`) and its own domain (`items/container.ts`'s header doc) are consistent with code; it just isn't mentioned in `player-systems.md` even though it's a player-owned world-object mechanism of the same shape as wells/torches. Minor — low priority, since `container.ts`'s own doc comment is already a clear, current description and the mechanism is simple (one concrete kind, `chest`).

---

## Integration seams discovered

| Producer / owner | Consumer | Mechanism | Documentation |
|---|---|---|---|
| `items/Inventory.ts` | Player, NPC, `Household`, `SettlementEconomy`, `PlacedContainerEntry` | Generic item ownership class reused verbatim across five owners | Accurate — `STATE.md`'s "Important shared concepts" already states this correctly |
| `items/constructionMaterials.ts` | Every player-built object; NPC construction work bouts | Atomic inventory-then-nearby-dropped-items material acquisition | `STATE.md`/`CATALOG.md` describe it from the player side; not cross-linked from `04-npc.md`'s NPC-construction description |
| Buildable `contributeWork(id, amount)` seams (`playerWell.ts`, `standingTorch.ts`, `palisade.ts`, `terrainPreparation.ts`) | Player `[E]` work bouts (`placementActions.ts`) and NPC Work Contract execution (`ai/NpcAgent.ts`) | Actor-neutral "clamp to remaining, credit only accepted work" | Split across two `STATE.md` sections (see discrepancy #4); no single doc owns it |
| `world/workContract.ts` | Player (issuer), `ai/npcWorkContract.ts`/`NpcAgent` (fulfiller) | Commitment record separate from target progress | `STATE.md` prose only, confirmed by `01-inventory.md`; no domain doc |
| `world/foodSources.ts` | NPC hunger-seeking (`SettlementFoodSourceHooks`) | Generic food/crop-source query + harvest, indistinguishable player-plot vs. settlement-garden vs. wild | `player-systems.md` documents the player-plot half; NPC consumption side lives only in `STATE.md`/`04-npc.md` |
| `fauna/animalHarvest.ts::harvestAnimalIntoInventory` | Player `startHarvestMeat`; Hunter NPC `onHuntKill()` | One shared knife-harvest yield function | Confirmed by both `05-fauna.md` and this audit; not cross-linked from `player-systems.md` |
| `AnimalAgent` (fauna-owned) + `SaveData.player.mountedAnimalId` | `app/actions/mountActions.ts` | Player rides a fauna-owned entity; only livestock have a stable id to persist against | `05-fauna.md` flagged this as an open question from the fauna side; this audit confirms the player-side mechanics and the correct field name |
| `combat/criticalHit.ts`, `ITEM_CATALOG[kind].melee`/`.ranged`/`.defense` | Player attacks, NPC combat, fauna | One damage/critical-hit pipeline, one numbers table | Owned by `docs/state/combat.md` — confirmed correctly scoped there, not duplicated in `player-systems.md`/`CATALOG.md` beyond the numbers themselves (which `WEAPONS.md` explicitly defers to for combat context) |
| `PlacedContainers.carriedWeightKg()` | `player/playerEncumbrance.ts` (via `app/gameLoop.ts`) | A carried chest's weight feeds player overload alongside `Inventory.totalWeight()` | Undocumented — neither `player-systems.md` nor `CATALOG.md` mentions that carrying a chest affects movement speed the same way an overloaded backpack does |

---

## Recommended documentation changes

1. **Fix `player-systems.md`'s skill count** (five → six, add `riding`) — a one-line, unambiguous correction.
2. **Trim `STATE.md`'s "Items / player" section** to a short current-state snapshot (a few sentences: `Inventory`/`ItemKind`/`HeldTool` ownership, the capability-flag system, the shared buildable construction-progress model, liquid containers, freshness) plus pointers to `CATALOG.md`/`WEAPONS.md`/`player-systems.md` — moving the plan-by-plan narrative (palisade/torch/wood-pile/knowledge-category/sleeping-utilities history) out, consistent with `01-inventory.md`'s top recommendation.
3. **Give Work Contracts one canonical home.** Recommend a short new subsection in `player-systems.md` (since the player is the employer and shares the construction-progress seam directly) covering: contract lifecycle, the frozen commitment-vs.-target-progress split, and the `contributeWork` seam — with `STATE.md`'s "Settlements / NPCs" section trimmed to a one-line pointer plus what's specific to NPC discovery/execution (notice-board query, `ai/npcWorkContract.ts` scoring). This resolves the duplication flagged in discrepancy #4/#5.
4. **Add one sentence to `player-systems.md`'s "Carry capacity" section** noting that a carried chest's weight (`PlacedContainers.carriedWeightKg()`) also counts toward encumbrance, since this is currently undocumented anywhere.
5. **Cross-link, don't duplicate, the shared mechanisms already correctly identified**: `player-systems.md` should gain short one-line pointers (not new prose) to `fauna/animalHarvest.ts` (corpse harvest, shared with Hunter NPCs) and `world/foodSources.ts`'s NPC-consumption side, so a reader of the player doc knows these aren't player-exclusive without needing `STATE.md`'s prose.
6. **No new domain document is needed.** Unlike NPC/fauna, this domain already has three well-scoped, current, non-history-leaking documents (`player-systems.md`, `CATALOG.md`, `WEAPONS.md`) — the fix here is trimming `STATE.md` and closing small cross-linking gaps, not creating structure.

---

## Open questions

- Should Work Contracts live in `player-systems.md` (this audit's recommendation, since the player is the employer/material-payer and directly shares the `contributeWork` seam) or get a small standalone `docs/state/work-contracts.md` (since it's genuinely a three-way seam: player issues, NPC fulfills, a buildable object owns progress)? Recommend deciding this in Stage 4 once `04-npc.md`'s own recommendation (if any) is known — the two audits should not independently pick different homes for the same mechanism.
- `items/container.ts`'s generic chest system only has one concrete `ContainerKind` today (`chest`) — worth confirming with Stage 4 whether it's substantial enough to warrant its own `player-systems.md` subsection now, or stays a `CATALOG.md`-only item until a second container variant exists.
