# Seedvale — Current State

**Purpose:** a short, current snapshot of the implemented architecture — enough to start a plan without reading every prior plan first. This document describes what exists now, not the desired future state, and not *how* any given plan implemented it.

**Last verified:** 2026-08-28

## Read this first

For a new implementation session:

1. Read `CLAUDE.md` for agent rules and development workflow.
2. Read this file for the current implementation state.
3. Read `docs/VISION.md` before proposing a new gameplay system.
4. Read `docs/plans/README.md` to understand active/planned work.
5. For the selected plan, read its implementation notes and any linked review before changing code.

This file is a snapshot, not the authoritative status tracker for plans (that's `docs/plans/README.md`) and not the detailed reference for any one domain — each section below is deliberately short and points to a domain document for depth. Don't reconstruct a domain's full history from this file; open the linked document, or the plan, instead.

## Runtime architecture

Seedvale is a browser 3D sandbox built with **Three.js + WebGL2 + Vite + TypeScript**. The game/simulation layer remains vanilla Three.js; the overlay UI is a hybrid of vanilla DOM modules and Vue 3 + Tailwind v4.

`src/app/createApp.ts` is the composition root. The world systems that are rebuilt together live in `src/app/worldBundle.ts` as `WorldBundle`. It currently has 18 fields covering terrain/ocean, settlements/fauna, renewable resources/items, player-placed fires/tents/traps/containers/wells/gardens, terrain preparations, caves, drying racks and beehives. The full field list and rebuild/lifetime invariants are canonical in [ARCHITECTURE.md](./architecture/ARCHITECTURE.md), not restated here. Fresh boot can return with a few background systems still represented by inert stubs; they are replaced in place when background initialization completes. File-level map: [CODE_INDEX.md](./CODE_INDEX.md).

## Major systems

Each subsection below is a short current-state summary. Domain documents hold the detail; plans and their implementation notes hold the history of *how* a feature was built.

### World / terrain

Procedurally chunked, streamed terrain with instanced vegetation/rocks, tree lifecycle, weather/seasons as deterministic functions of `(seed, elapsedDays)`, mountains, and rivers with their own hydrology/geometry. Ocean, lakes, day/night, fog and post-processing are implemented.

- Generation/streaming/vegetation/mountains/weather: [state/terrain-and-world-generation.md](./state/terrain-and-world-generation.md)
- Ocean, lakes and rivers: [WATER.md](./state/water.md)
- Visual/shader contracts (why something renders the way it does): [GRAPHICS.md](./architecture/GRAPHICS.md)
- Still not implemented: full river/lake shader parity, hydrology worker offload, clouds and distant background mountains, cube-sphere/spherical world.

### Settlements / NPCs

Plan-first villages (`VillagePlan` → `SettlementDef`), streamed settlements, NPC needs/FSM/schedule/personality, household + settlement bulk economy, dialogue v2, home-trader screen. NPCs can now fight: an `NpcAgent` combat phase, role-based default weapons, and an animal-attack/NPC-defense decision layer exist, reusing the same melee/ranged mechanics as the player. `NpcAgent.choose()`'s need-pressure arbitration (`Needs.ts`, plan ai-001) is now personality/role-aware (`ai/decisionModifiers.ts`, plan ai-002): Big Five conscientiousness biases already-active duty pressures (`wood`/`waterDuty`), a `woodcutter` role adds a small extra bump on `wood`, a `hunter` role adds one on `food` (plan 178), and neuroticism biases the existing animal-threat defend/flee scoring — a preference layer, never a second candidate generator. `hunter` (plan 178) is the 7th `Role`, rolled the same way as any other; a hungry hunter with no household food on hand tries a real hunting expedition (bounded/deterministic fauna target selection with single-animal population protection, existing NPC ranged `CombatIntent`, then knife-harvest) before falling back to the abstract garden gather — meat/hide land in a new generic `Household.items` (an `Inventory`, distinct from `Household.stock`'s scalar food/wood), and the household's own `wood` stock funds arrow crafting during the hunter's `work` block. A settlement's own campfire is now a Social Place (plan 151): the `sociable` overlay's `social` schedule block routes an idle NPC there through the existing `goTo`/`execute` path, where it periodically tries (throttled, `extraversion`-scaled retry frequency) to pair with another available NPC at the same campfire for a shared, atomically-reserved `conversation` action (one generated 2-5 game-minute duration for both sides); the outcome applies one symmetric delta to a new NPC↔NPC relation store (`settlement/npcRelationships.ts`, separate from `QuestManager`'s player-facing relations). An existing NPC can also be assigned as a helper (plan 167, Mieszkańcy screen): `NpcAgent.setHelperAssignment()` records a `targetContainerId` (a player-placed `Container`, plan 164); the NPC stays a normal household member, but `food`'s `ai-003` candidate list gains a `playerStorageDelivery` strategy that fires when the assignment is active, the NPC isn't genuinely hungry, and the household has real surplus (`Household.surplus`) — the surplus converts to a concrete `bread` item, carried in the NPC's own `Inventory`, and deposited into the `Container` via the existing `goTo`/`execute`/`deposit` chain. The assignment is carried across an in-session `WorldBundle` rebuild the same way `NpcAuthoritativeState` already is, but — like the rest of NPC runtime state — is not yet part of `SaveData`. `blacksmith` (plan settlements-npcs-002) is the 8th `Role`, with a real anvil + grind workbench workplace (`landmarks.blacksmith`, parked assets promoted to active use) built unconditionally per settlement; all seven non-woodcutter/hunter/miner roles now do real profession work during their `work` schedule block — Farmer harvests real crops near the settlement garden (and plants when the household already holds a seed item), Fisher casts at a settlement's real dock using the same deterministic catch rule as the player, Guard patrols a fixed 3-point route (home/well/market) instead of standing still, Trader moves its own household's real food/wood surplus into `SettlementEconomy` when there's a matching shortage, and Blacksmith looks for a household-stored weapon instance needing `sharpenWeapon()`. Farmer's planting and Blacksmith's sharpening are both wired but currently dormant in a normal playthrough (no gameplay path deposits seeds/whetstones into a household yet, see `docs/plans/LOOSE-ENDS.md`). A player-built garden plot (`PlayerGardenRecord`, plan settlements-npcs-001) now also carries independent `hydration`/`droughtStressDays` state alongside `care`: natural drying (-20/world-day) and rain (via `world/weather.ts`'s deterministic `computeWeather`, walked over a bounded lookback window rather than replayed unboundedly) both resolve lazily through `resolveGardenHydration()`; the player waters with any carried water-filled liquid container (waterskin or bucket, 1 litre per action, `[R]` at the plot) and NPCs can water the same way an NPC already tidies a plot's `care` (`NpcAgent.maybeWaterNearbyGarden`, itemless, mirroring `maybeMaintainNearbyGarden`); 0% hydration kills a harvest outright, sustained sub-30% accumulates a capped drought-stress yield penalty combined with the existing `care` multiplier at harvest, and hydration also scales the existing `care`-decay ("weed pressure") rate. This mechanic is scoped to player-built plots only — settlement `Pole`/`Ogród` gardens (the Farmer profession's `landmarks.garden`) remain outside it, still using the plain `cropLifecycle.ts` stage function with no hydration state.

- Generation, streaming, economy, households, NPC daily life, standing decisions: [SETTLEMENTS.md](./state/settlements.md)
- Combat (NPC combat phase, animal attack & defense, role loadouts): [state/combat.md](./state/combat.md)
- Still not implemented: inter-settlement trade, full NPC simulation persistence, Social Places beyond a settlement's own campfire, conversation partner ranking by personality/traits/role/relationship.

### Fauna

Predator/prey roles with chase/flee behaviour, player-awareness (probabilistic detection, sneak-aware), shared `HealthState`, and animal needs (hunger/thirst/stamina) that retarget to a real source rather than being relieved by wander arrival. Habitat spawners (cave/thicket/wolfDen) have a persisted lifecycle (`active`/`depleted`/`disabled`/`recovering` per spawn point, based on death counts and a recovery timer) — a player can destroy a spawn point, which scorches the terrain and eventually lets it recover; a habitat `type` can have more than one physical instance (e.g. the wolf cave and the bear cave are two separate `PreySpawner`s), each with its own stable id/position/`kind`/occupancy cap. Hungry predators choose chase vs. flee via a scoring function (hunger vs. proximity/fire/crowd); an unharvested corpse decays `fresh` → `rotting` (tint + small distance-gated particle/fog FX + a bounded stamina-drain proximity effect on nearby live fauna) → natural bones (reuses `harvestedRemains.ts`'s cached templates) → removed, all within the existing 60s corpse-linger window and driven by simulation time, not render frames; it can still be buried (skips decay) or knife-harvested (existing separate 90s harvested-remains path) at any point. `bear` is a data-only `AnimalKind` (large/tough predator, spawns from a cave) — no separate agent/AI/combat class. GLB models exist for wild wolf/fox/deer/stag and village livestock, with procedural fallbacks; bear model/growl assets are registered as `needed` (capsule fallback / silent growl until sourced, see [assets/MODELS.md](./assets/MODELS.md)/[assets/SOUNDS.md](./assets/SOUNDS.md)).

- Animal attack & NPC defense integration: [state/combat.md](./state/combat.md)
- Exact spawner tuning (respawn intervals, depletion thresholds, recovery days) lives in `src/fauna/AnimalSpawner.ts` — verify in code, not here.
- **Riding (plan fauna-003)** — any `AnimalKind` whose `AnimalDef.mount` is set is `mountable`; horse and donkey both have one, nothing else does. `[E]` on a live mountable animal (no weapon held) mounts it through `app/actions/mountActions.ts`'s `createMountActions()` — the sole authoritative mounted state, referencing the mount by `animalId`. While mounted, `AnimalAgent.update()`'s normal AI decision branch is skipped in favor of `driveMounted()` (player-input-driven movement reusing the same stepping/needs/animation bookkeeping, minus the home-wander-radius clamp); the player's own `mesh` is never reparented — its world-space transform is copied from the mount's seat point every frame instead, so camera/gaze/streaming all keep working unmodified. Two gaits (walk/sprint), a per-tick riding-stability roll (mount stamina/gait/terrain slope/HP condition + a new 6th player skill, `riding`) that can dismount and apply fall damage through the existing player damage pipeline, a dedicated always-visible (desktop + mobile) Dismount button plus a `T` desktop keyboard shortcut (edge-triggered in `input/Keyboard.ts`, drained by `mountActions.update()` every frame so a stray press while unmounted can't linger and fire on the next mount; no effect outside mounted state), and an optional persisted `SavePlayer.mountedAnimalId` (livestock only — deterministic id) are all implemented. No riding animation clip exists on the player rig; the accepted fallback is keeping Idle while correctly positioned/moving with the mount. Not implemented: an unmounted mount following the player (no such follow-the-player AI exists anywhere in fauna yet — see `docs/plans/LOOSE-ENDS.md`), taming/ownership, and mounted combat (both explicitly out of scope). Follow-up: the Kupiec wagon's horse (`settlement/props.ts`) is a live `AnimalAgent('horse')` spawned by the same `spawnLivestock()` factory as any house-owned livestock (`landmarks.merchantHorseSpawn` records its wagon-side spawn point/facing; `settlementPropColliders.ts` no longer reserves a static collider there), not a decorative mesh — it's mountable/wanders/needs like any other horse.

### Items / player

`Inventory` / `ItemKind` / a single right-hand `HeldTool` slot own item ownership and equip state — `Inventory` itself is generic (player *and* NPC). `ITEM_CATALOG[kind].capabilities` (`ItemCapability`) is the single source of truth for every tool-requirement gate (chopping, mining, digging, meat harvesting, fire-starting, fishing) — there is no hand-written per-tool check left. The player has the same shared `HealthState` as NPCs/fauna, plus its own survival pools (stamina/vigor/hunger/thirst) and a six-skill progression system (sneak/survival/traps/defense/archery/riding, XP-only, no levels). Portable light (lit branch or held torch) persists across saves. Cooking (raw/species meat → `roasted_meat`) batches to a station capacity — 1 for a bare fire, 2 with a carried `pan`, 4 once a fire has a built grate (grate wins outright, never adds to the pan) — read directly off the `VillageFire` instance, not a `firepit`-only check. `ITEM_CATALOG[kind].container` (plan items-player-001) is the shared liquid-container model for three waterskin sizes (2/5/10 l, water only) and two buckets (10 l, water or milk) — each physical container is a `LiquidContainerItemInstance` (`items/itemInstances.ts`, same instance mechanism as weapon durability/traps), with `items/liquidContainer.ts` holding the fill/drink/empty domain operations and held-liquid mass added to `Inventory.totalWeight()`. Waterskins are wired to the existing well/lake fill and inventory drink; buckets carry the same domain model with no interaction wired yet (milking/bucket drink is future work). Plan 106's binary `waterskin_empty`/`waterskin_full` are legacy-only, converted to a `waterskin_medium` instance on load. `copper_ore` mines through the same `terrain/resourceDeposits.ts` pipeline as iron/coal/gold; `copper` (refined) and `copper_bucket` are defined but deliberately unobtainable (no Kupiec stock, no smelting/smithing yet). `saddlebags` is an inert carried item pending a future animal-equip/transport-capacity system.

- Item flags, per-item stats, weapon numbers, gameplay roadmap: [items/CATALOG.md](./items/CATALOG.md), [items/WEAPONS.md](./items/WEAPONS.md)
- Combat mechanics (melee/ranged/critical hits/NPC combat): [state/combat.md](./state/combat.md)
- Player survival needs, skills, busy channels, camp rest, settlement lodging, wells, traps, planting, fishing/preservation, cooking capacity/grate: [state/player-systems.md](./state/player-systems.md)
- Still not implemented: player-vs-NPC melee damage, weapon repair/broken lifecycle, general tool durability (shovel/pickaxe), bow durability, arrow recovery, 3D projectile visuals, full Vue-side crafting, iron_rod smelting/production.

### Quests / progression

`QuestManager` with definitions, objectives, stages and multi-stage world interactions. Relation levels (`stranger`/`acquainted`/`friendly`/`trusted`) gate quest availability; `QuestDef.effects` overrides the flat relation/EXP reward. World-problem quests exist end-to-end (bound to a specific `AnimalAgent`/livestock/wolf-den instance via an injected resolver — `QuestManager` never imports fauna to scan it itself; it does import `AnimalKind` as a type-only reference for the resolver contract). Terminal states include `failed` (a stage's bound world entity can no longer be completed) and `invalidated` (set only on save/load restore, when a quest's bound animal identity can't be safely re-derived — see [ARCHITECTURE.md](./architecture/ARCHITECTURE.md#save-schema-version-history)). Procedural landmarks carry a stable, save-free derived id and back a `interact_landmark` objective. Bandit objectives remain unimplemented. Quest progress, EXP and NPC relations persist; LLM quest generation is not implemented.

### Persistence

IndexedDB-backed (`src/persistence/`), named save slots (up to 8). Canonical save schema is **v1** — a hard cut (plan 201) with no migration/compatibility story for older saves. Current persistence includes player gardens, resource-depletion state, player terrain modifications and fauna spawn-point lifecycle state in addition to the older player/world/quest/settlement data. The exact field list is in [ARCHITECTURE.md](./architecture/ARCHITECTURE.md#save-schema), not here. NPC runtime state is **not** a full simulation snapshot (needs/AI/vigor are not persisted; tree lifecycle uses sparse overrides + lazy growth from `elapsedDays`) — `Continue` is not equivalent to serializing the complete living world. `localStorage` is split by device-preference domain (graphics/player/world/audio), independent of the chosen save slot's world state.

### UI / input

Keyboard/mouse plus mobile touch (joystick + look-drag, vanilla). Vue 3 + Tailwind v4 + `lucide-vue-next` mounts under `#vue-ui` after world boot; migration is incremental — start screen, pause, quest log, inventory, quick actions, time-skip, busy overlay, world config, notes, HUD, minimap, world map, toast, merchant, skills and touch chrome are Vue, with `src/ui/create*.ts` as thin facades for the rest. Minimap is heading-up with permanent discovery (radius 48); `M` opens the north-up world map. Home-trader `MerchantScreen` is two columns (stock | player bag) with category/price/sort filters. The shared contextual dialog (`FlavorDialog.vue`/`ui.flavorDialog`) can carry an optional `actions` list (`InteractionPanelAction`) beyond its plain name+description text — Vue renders whatever the gameplay layer resolved (label/enabled/reason/`run()`), never a switch over `Interactable.kind`; wired today for the generic `resolveInteraction()` flavor path and player-well construction (`[R]` — requirements/availability, execution still through `workOnWell`). lil-gui is hidden by default (Ustawienia → Panel debug, or `?debug=1`/`?gui=1`). `?time=`/`?hour=` force and freeze the clock for session debugging only (no save-schema field).

## Important shared concepts

Prefer extending existing shared mechanisms instead of creating parallel systems.

- `WorldBundle` — lifetime/rebuild boundary for the world systems ([ARCHITECTURE.md](./architecture/ARCHITECTURE.md)).
- `HealthState` — shared health/damage/death (`src/shared/HealthState.ts`) used by fauna, NPCs and the player.
- `StaminaState` — shared physical-effort capacity (`src/shared/StaminaState.ts`) used by fauna and NPCs.
- `VigorState` — NPC daily physiological budget (`src/shared/VigorState.ts`); collapse gates sleep through the existing NPC FSM. Not used by fauna.
- `PlayerNeeds` — player stamina/vigor/hunger/thirst pools (`src/player/PlayerNeeds.ts`), reusing `StaminaState`/`VigorState`.
- `WaterSource` — shared well/lake drink/fill abstraction (`src/world/WaterSource.ts`); future river/polluted/treated sources should reuse it.
- Shared simulation contracts — `PlannedAction`, `ActionLifecycle`, `DecisionContext`, `pickHighestScore` in `src/simulation/`. NPC + fauna adapters; predator scoring in `src/fauna/predatorHumanDecision.ts`.
- `SettlementEconomy` — settlement-owned bulk stock (`src/economy/`). Not player `Inventory`. Persisted since save v12 (`SaveData.settlementEconomies`); carried across an in-session `WorldBundle` rebuild too.
- `Household` — one family's own food/wood/water stock (`src/settlement/household.ts`), sitting between NPC carrying and `SettlementEconomy`. Not in save data (unlike `SettlementEconomy`, a deliberate, still-open gap) — but, since plan 197, is carried across an in-session `WorldBundle` rebuild the same way `SettlementEconomy` already was (`carriedHouseholds`, mirroring `carriedEconomies`).
- `NpcAgent` / `AnimalAgent` — central behaviour integration points. `NpcAgent` also carries a small generic `Inventory` as a brief hold between extracting a world resource and delivering it.
- `Inventory` / `ItemKind` / `HeldTool` — item ownership + single held-tool slot; `Inventory` itself is generic (player + NPC). `src/items/primaryWeapons.ts` remembers the last-equipped melee/ranged weapon (session-local, not in `SaveData`) behind the HUD's primary-weapon shortcut buttons, resolving through the same `HeldTool.equip()`.
- `TreeLifecycle` / `harvestWorldTree*` — tree growth + multi-stage chop (`src/world/treeLifecycle.ts`, `treeHarvest.ts`).
- `QuestManager` — quest progress, EXP and relations.
- `ChunkManager` — terrain sampling, streaming and environment-facing world queries.
- `MapData` / `MapDiscovery` — map projection + Fog of War (`src/world/map/`).
- `Place` / schedule-related NPC work — foundation for daily routines.
- **Asset anchors** — `src/assets/assetAnchors.ts`; convention in [docs/assets/ANCHORS.md](./assets/ANCHORS.md).

Before adding a new abstraction, check whether one of these already owns the responsibility.

## Developer tooling

- **Asset alignment browser** — `/asset-browser.html` (`src/tools/assetBrowser/`), included in production `vite build`. Wired registries plus parked files from `/asset-browser-models.json`.
- **Construction Catalog** — `src/assets/constructionCatalog.ts`. Layers construction semantics over the asset index for the parked MegaKit GLB set.
- **House Builder** (`src/settlement/houseBuilder.ts`) assembles MegaKit cottages/farmsteads from that catalog; wired into `buildSettlementProps()`. Browser and `?perf=1` verification are still open (known bug from a 2026-08-18 playtest — see `docs/plans/README.md`'s "Verification needed").
- **Performance** — `src/perf/` sampler/benchmark; lil-gui Performance + `?perf=1`/`?benchmark=<id>`. Graphics quality presets Low/Medium/High/Custom. The full performance model, confirmed bottlenecks, techniques in use/not-yet, and optimization order live in [docs/performance/README.md](./performance/README.md) — do not restate them here.

## Important code entry points

Broader "where does this system live" lookup: [CODE_INDEX.md](./CODE_INDEX.md). Domain-specific entry-point lists live in each domain document linked above.

```text
src/app/createApp.ts
src/app/gameLoop.ts
src/app/worldBundle.ts
src/app/renderStack.ts
src/app/graphicsSettings.ts
src/app/saveState.ts
src/app/appRenderLoop.ts
src/app/inventoryWiring.ts
src/app/actions/
src/config/worldConfig.ts
src/terrain/chunkManager.ts
src/terrain/chunkEnvironment.ts
src/terrain/vegetationRegionBatcher.ts
src/settlement/SettlementsManager.ts
src/settlement/createSettlement.ts
src/settlement/houseBuilder.ts
src/settlement/props.ts
src/assets/constructionCatalog.ts
src/economy/
src/ai/NpcAgent.ts
src/ai/npcCombat.ts
src/ai/Needs.ts
src/fauna/AnimalAgent.ts
src/fauna/AnimalLife.ts
src/fauna/faunaCombat.ts
src/simulation/
src/shared/HealthState.ts
src/shared/StaminaState.ts
src/shared/VigorState.ts
src/items/Inventory.ts
src/items/HeldTool.ts
src/items/itemCatalog.ts
src/player/PlayerNeeds.ts
src/player/PlayerSkills.ts
src/combat/
src/quests/QuestManager.ts
src/world/dayNight.ts
src/world/weather.ts
src/world/treeLifecycle.ts
src/persistence/saveData.ts
src/audio/createWorldAudio.ts
src/ui/
src/ui-vue/
```

## Current architectural seams / active refactors

- **World visual overhaul** — plants done in part; sky/clouds and distant mountains remain.
- **UI** — Vue Fazy 0–4 implemented, browser verification pending across most of it. A new Character screen (HP/hunger/thirst/vigor) exists. Do not assume every future UI belongs in Vue; extend the existing facade + store pattern when migrating.
- **NPC daily routine** — Place + executable schedule + vigor are implemented; household resource layer is implemented (see [SETTLEMENTS.md](./state/settlements.md)). Vigor collapse and a critical need interrupt a schedule-driven action already in flight; ordinary schedule/time-of-day changes still do not. The settlement campfire is now a Social Place (plan 151); other Social Place kinds remain an intentional gap. NPC runtime continuity across an ordinary settlement unload/reload remains incomplete; do not treat in-session rebuild continuity as full persistence.

## Verification state

Technical checks: `npx tsc --noEmit` · `pnpm run lint:fix` · `pnpm run build` · `pnpm run test`.

Do not treat a passing build as proof that a visual Three.js feature is correct. For browser-only verification, provide concrete manual steps for the user. Most recently-landed plans in `docs/plans/README.md`'s "Verification needed" section have passed technical checks but not browser/gameplay verification — check the plan's own `Status:` header, not this document, for the current per-plan state.

## Not implemented / intentionally deferred

- Full NPC simulation persistence across saves.
- Social Places beyond a settlement's own campfire; conversation partner selection/ranking by personality/traits/role/relationship; group conversations; social interaction memory entries.
- LLM/AI-generated quests.
- Inter-settlement trade and player crafting.
- Full combat system for the player — see [state/combat.md](./state/combat.md) for exactly what exists vs. what's missing.
- Weapon repair/broken lifecycle, general tool durability (shovel/pickaxe), bow durability/sharpness, arrow recovery, 3D projectile visuals.
- Cube-sphere / fully spherical world architecture.
- Clouds and distant background mountains.
- Full Vue migration of all existing UI.

Plan status belongs in [plans/README.md](./plans/README.md), not here.

## Source of truth rule

When this document (or any domain document it links to) conflicts with the code, **the code wins**. When it conflicts with a plan, the plan describes intended work but does not override implemented behaviour. Update this file — and the relevant domain document — when a structural change makes the snapshot materially stale. See [CLAUDE.md](../CLAUDE.md)'s "Truth hierarchy" for the full ordering.
