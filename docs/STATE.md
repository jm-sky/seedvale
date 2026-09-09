# Seedvale — Current State

**Purpose:** a short, current snapshot of the implemented architecture — enough to start a plan without reading every prior plan first. This document describes what exists now, not the desired future state, and not *how* any given plan implemented it.

**Last verified:** 2026-09-09

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

`src/app/createApp.ts` is the composition root. The world systems that are rebuilt together live in `src/app/worldBundle.ts` as `WorldBundle` — terrain/ocean, settlements/fauna, renewable resources/items, player-placed fires/tents/traps/containers/wells/gardens, terrain preparations, caves, drying racks, beehives, work contracts, grass forage, river water quality, and more. The full field list and rebuild/lifetime invariants are canonical in [ARCHITECTURE.md](./architecture/ARCHITECTURE.md) and `src/app/worldBundle.ts`, not restated here. Fresh boot can return with a few background systems still represented by inert stubs; they are replaced in place when background initialization completes. File-level map: [CODE_INDEX.md](./CODE_INDEX.md).

## Major systems

Each subsection below is a short current-state summary. Domain documents hold the detail; plans and their implementation notes hold the history of *how* a feature was built.

### World / terrain

Procedurally chunked, streamed terrain with instanced vegetation/rocks, tree lifecycle, weather/seasons as deterministic functions of `(seed, elapsedDays)`, mountains, and rivers with their own hydrology/geometry. Ocean, lakes, day/night, fog and post-processing are implemented. Short-lived environmental blood traces are created directly from player/NPC/animal damage entry points and rendered via one capacity-fixed instanced mesh, resynced to whatever traces are within the streamed-terrain radius; not persisted, carried across an in-session `WorldBundle` rebuild the same way other player-positioned world objects are. Walk-in caves are Cave V2 (production SDF interiors, `createCaves()` / `src/world/caves/`); gameplay ground/containment uses a derived SDF column index (`caveSdfQuery.ts`); body collision and third-person camera occupancy use the same index's strict occupancy (`caveSdfColliders.ts` / `Caves.occupancyAt`); `Caves.queryInterior` is the hysteretic interior flag for cave ambience and rain mute. Approach/mouth carve intervals are open-sky (no rock `maxY`); SDF occupancy stops at the mouth plane so the approach is portal-only. `topologyToCaveDefinition` / `CaveVolume` remain catalog/streaming leftovers until plan world-terrain-008 Milestone B5.

- Generation/streaming/vegetation/mountains/weather: [state/terrain-and-world-generation.md](./state/terrain-and-world-generation.md)
- Ocean, lakes and rivers: [state/water.md](./state/water.md)
- Visual/shader contracts (why something renders the way it does): [GRAPHICS.md](./architecture/GRAPHICS.md)
- Still not implemented: full river/lake shader parity, hydrology worker offload, distant background mountains, cube-sphere/spherical world.

### World locations / discovery

Coarse world features (lakes, mountain peaks, cemeteries, and similar) are classified from deterministic terrain sampling, not authored data — geometry/identity are always a pure function of `(world seed, location id)` and are never persisted. Player discovery/knowledge state and active navigation targets are a separate, real, save-persisted progression layer on top of that catalog; map projection is a pure rendering transform over both, not a third source of truth.

- Full ownership, runtime flow, and boundaries: [state/world-locations.md](./state/world-locations.md)

### Settlements / NPCs

Plan-first villages (`VillagePlan` → `SettlementDef`), streamed settlements. `SettlementEconomy` (settlement-owned bulk stock) and `Household` (one family's own wood/water/food/items) are the two resource registries settlements host; both persist and carry across an in-session `WorldBundle` rebuild. NPC authoritative state — health/stamina/vigor/needs/`physicalInjury`/`injuryRecoveryUpdatedAtDays`/`temporaryConditions`/`helperAssignment`/`activePlan`/`postDeath`/`personalInventory` — is physically hosted here (`NpcStateRegistry`) and persists as part of `SaveData.npcStates`, but the decision architecture, work dispatch, combat integration, and social/dialogue behaviour that consume it are canonical in `npc.md`, not documented here. Derived injury severity (plan npc-025) is not persisted. Player temporary conditions (`SaveData.playerConditions`) persist separately from base SPEA. Land ownership (`LandOwnershipRegistry`/`SaveData.ownedLandPlots`) is a separate, simpler player-facing mechanic.

- Settlement generation, streaming, households, settlement/household economy, land ownership: [state/settlements.md](./state/settlements.md)
- NPC decisions, needs/pressure arbitration, work and profession dispatch, work-contract evaluation, combat integration, social/dialogue/relationships, movement, death/corpse lifecycle: [state/npc.md](./state/npc.md)
- Combat (NPC combat phase, animal attack & defense, role loadouts): [state/combat.md](./state/combat.md)
- Still not implemented: inter-settlement trade, Social Places beyond a settlement's own campfire, conversation partner ranking by personality/traits/role/relationship.

### Fauna

Predator/prey/livestock ecosystem built on one shared `AnimalAgent` class — wild fauna, livestock, and rats are the same class distinguished only by ownership/registration. Behaviour is a fixed-priority threat/social-override table on top, with hunger/thirst-seeking resolved ad hoc underneath (structurally different from NPC's unified three-producer pressure competition). Persistence is genuinely four-tier: livestock persists per individual (an explicit pre-save capture step), spawner lifecycle persists thin, wild individuals are unpersisted with only the population deterministically reconstructed, and rats are unpersisted and not seed-derivable at all.

- Full architecture (species data, behaviour pipeline, corpse/rabies lifecycle, settlement-adjacent rats/livestock, persistence classes): [state/fauna.md](./state/fauna.md)
- Animal attack & NPC defense integration: [state/combat.md](./state/combat.md)
- Still not implemented: taming/ownership beyond livestock spawning, mounted combat, an unmounted mount following the player, disease beyond rabies.

### Items / player

`Inventory` / `ItemKind` / a single held-tool slot own item ownership and equip state — `Inventory` itself is generic (player *and* NPC). `ITEM_CATALOG[kind].capabilities` is the single source of truth for every tool-requirement gate; there is no hand-written per-tool check left. The player has the same shared `HealthState` as NPCs/fauna, plus its own survival pools (stamina/vigor/hunger/thirst) and an eight-skill progression system (sneak/survival/traps/defense/archery/riding/medicine/repair, XP-only). Targeted skill use reuses existing gaze `Interactable`s; Repair's first world consumer is player camp equipment (tent/bedroll/platform). Medicine has no gameplay consumers yet. Buildable construction progress (player-placed wells, standing torches, palisades, residential houses, terrain preparations) shares one actor-neutral `contributeWork(id, amount)` seam with NPC work-contract execution — see `player-systems.md`'s Work Contracts section, the single canonical home for that mechanism.

- Item flags, per-item stats, weapon numbers, gameplay roadmap: [items/CATALOG.md](./items/CATALOG.md), [items/WEAPONS.md](./items/WEAPONS.md)
- Player survival needs, skills, busy channels, camp rest, settlement lodging, wells, traps, planting, fishing/preservation, cooking, carry capacity, Work Contracts: [state/player-systems.md](./state/player-systems.md)
- Combat mechanics (melee/ranged/critical hits/NPC combat): [state/combat.md](./state/combat.md)
- Still not implemented: player-vs-NPC melee/ranged damage (see "Not implemented" below), weapon repair/broken lifecycle, general tool durability (shovel/pickaxe), bow durability, arrow recovery, 3D projectile visuals, full Vue-side crafting, iron_rod smelting/production.

### Quests / progression

`QuestManager` with definitions, objectives, stages and multi-stage world interactions. Quest availability prerequisites (player↔NPC relation, prior quest resolved outcome, local settlement reputation/renown) gate whether a `not_offered` quest may be offered; once offered/active, later prerequisite drops do not revoke it. Relation levels (`stranger`/`acquainted`/`friendly`/`trusted`) remain the relation prerequisite vocabulary. Each `QuestDef` has authored `outcomes` with explicit item rewards and consequences (player↔NPC relation, settlement reputation/renown); objective completion is not resolution, and there is no implicit giver/talk-target relation bump or global quest EXP. An active `talk_to_npc_choice` stage resolves immediately when the player talks to one of the authored NPCs. The first authored RPG pack is three stories / five definitions (`zaginiona-przesylka`, `sporne-drewno` plus one outcome-dependent follow-up, `dzik-przy-szlaku`). World-problem quests exist end-to-end (bound to a specific `AnimalAgent`/livestock/wolf-den instance via an injected resolver — `QuestManager` never imports fauna to scan it itself). Terminal states include `failed` and `invalidated` (`invalidated` is a technical restore/rebuild state, not an outcome). Procedural landmarks carry a stable, save-free derived id and back a `interact_landmark` objective. Quest progress (including `resolvedOutcomeId` after a complete/failed outcome) and player↔NPC relations persist; this player↔NPC relation store is structurally unrelated to the separate NPC↔NPC relationship store — see `npc.md`'s Relationships, social, and dialogue section. Bandit objectives and LLM quest generation remain unimplemented.

`ReputationManager` (`src/reputation/`) owns local, per-settlement reputation (five `-100..100` dimensions: trust/competence/benevolence/courage/integrity) and renown (`0..100`) — a settlement-scoped social standing independent of `QuestManager`'s per-NPC relations and of `BadgeManager`'s earned-badge/history record. Changes only through an explicit, already-resolved `SocialConsequence` a caller applies (quest completion via `QuestManager`'s seam, and a first-time cemetery grave disturbance whose deterministic social-exposure roll succeeds) — the manager never infers social knowledge from world/quest state itself. Grave disturbance always records `BadgeManager` history independently of that roll. NPC spontaneous-reaction chance reads local renown (not reputation's dimensions); the Character Screen shows the settlement currently relevant to the player's position, or "Brak lokalnej reputacji" outside one. No witness/gossip/decay/cross-settlement propagation yet. See `npc.md`'s Relationships, social, and dialogue section and `persistence.md`'s Reputation/renown row.

### Persistence

IndexedDB-backed (`src/persistence/`), named save slots (up to 8). `SaveData` is a serialization format, not a runtime authority: each domain owns its state and serializes it once per save; restore is construction, not a two-phase hydrate-then-apply pass. A real migration pipeline validates on both write and read, and a write-time integrity guard refuses to overwrite an existing slot whose current record fails to parse. Still not a full simulation snapshot — wild individual fauna and rats, and NPC/animal execution state (phase/pending-action/pathfinding/combat-intent/carried work inventory), are deliberately excluded from every save; NPC personal belongings persist as part of `npcStates`. `Continue` is closer to, but still not equivalent to, serializing the complete living world.

- Ordinary boot always goes through the Start Screen (`src/main.ts` → `src/ui/createStartScreen.ts`), including a confirmed-empty save list: zero rows opens the New Game form (player name, save name, seed) instead of creating a world, and deleting the last save returns to that same state. Only a storage-read failure bypasses the screen. The player name is per-save `WorldConfig.player.name`, passed into `createApp()` as an explicit New Game option — not a global profile.
- Persistence classification (what's persisted/deterministic/runtime-only), the save/rebuild mechanism, migrations, the worldgen cache, and known gaps: [state/persistence.md](./state/persistence.md)
- Exact save-schema field list and version history: [ARCHITECTURE.md#save-schema](./architecture/ARCHITECTURE.md#save-schema)

### UI / input

Keyboard/mouse plus mobile touch (joystick + look-drag, vanilla). Vue 3 + Tailwind v4 + `lucide-vue-next` mounts under `#vue-ui` after world boot; migration is incremental — most screens (HUD, inventory, quick actions, quest log, merchant, minimap/world map, skills, and more) are Vue, with `src/ui/create*.ts` as thin facades for the rest. The shared contextual dialog (`FlavorDialog.vue`) can carry an optional actions list beyond plain text, resolved by the gameplay layer rather than switched on interactable kind. lil-gui is hidden by default (`?debug=1`/`?gui=1`).

## Important shared concepts

Prefer extending existing shared mechanisms instead of creating parallel systems.

- `WorldBundle` — lifetime/rebuild boundary for the world systems ([ARCHITECTURE.md](./architecture/ARCHITECTURE.md)).
- `HealthState` — shared health/damage/death (`src/shared/HealthState.ts`) used by fauna, NPCs and the player.
- `StaminaState` — shared physical-effort capacity (`src/shared/StaminaState.ts`) used by fauna and NPCs.
- `VigorState` — NPC daily physiological budget (`src/shared/VigorState.ts`); collapse gates sleep through the existing NPC FSM. Not used by fauna.
- `PlayerNeeds` — player stamina/vigor/hunger/thirst pools (`src/player/PlayerNeeds.ts`), reusing `StaminaState`/`VigorState`. A shared `PhysicalEffortIntensity` (`light`/`moderate`/`heavy`) seam costs real elapsed busy-action time in stamina/vigor for physical work, decoupled for compressed work (well construction, terrain-prep time-skip).
- `WaterSource` — shared well/lake/river/ocean drink/fill abstraction (`src/world/WaterSource.ts`); future polluted/treated sources should reuse it. `WaterQuality` is `safe` / `unsafe` / `undrinkable`: well is always `safe`, ocean always `undrinkable`, lake always `unsafe` (drinkable with a warning), and river is resolved per pickup point via `WorldBundle.riverWaterQuality` (`riverWaterQualityResolver.ts`) — not a blanket `safe`. A player-built well can additionally require a carried `rope` to draw water, or carry an uncovered-well direct-drink risk — see [player-systems.md](./state/player-systems.md) and [water.md](./state/water.md).
- Shared simulation contracts — `PlannedAction`, `ActionLifecycle`, `DecisionContext`, `pickHighestScore` in `src/simulation/`. NPC + fauna adapters; the richest worked example (three independent pressure producers competing through one arbitration) is documented in [npc.md](./state/npc.md); fauna cross-links rather than repeating it.
- Buildable `contributeWork(id, amount)` — the actor-neutral seam every player-built object (wells, standing torches, palisades, residential houses, terrain preparations) shares with NPC work-contract execution: clamp to remaining work, credit only accepted work, progress lives on the object's own entry and is never duplicated onto the contract. Canonical home: [player-systems.md](./state/player-systems.md)'s Work Contracts section.
- `SettlementEconomy` — settlement-owned bulk stock (`src/economy/`). Not player `Inventory`. Persisted (`SaveData.settlementEconomies`, required) and carried across an in-session `WorldBundle` rebuild. `food` is a concrete `ItemKind` `Inventory` (mirroring `Household.items`), not part of the scalar bulk stock.
- `Household` — one family's own wood/water stock plus concrete food/misc items (`src/settlement/household.ts`), sitting between NPC carrying and `SettlementEconomy`. Persisted (`SaveData.households`, sparse/optional) and carried across an in-session `WorldBundle` rebuild the same way `SettlementEconomy` already was.
- `NpcAgent` / `AnimalAgent` — central behaviour integration points. `NpcAgent` also carries a small generic `Inventory` as a brief hold between extracting a world resource and delivering it (not persisted — see [npc.md](./state/npc.md)).
- `Inventory` / `ItemKind` / `HeldTool` — item ownership + single held-tool slot; `Inventory` itself is generic (player + NPC). `src/items/primaryWeapons.ts` remembers the last-equipped melee/ranged weapon (session-local, not in `SaveData`) behind the HUD's primary-weapon shortcut buttons.
- `TreeLifecycle` / `harvestWorldTree*` — tree growth + multi-stage chop (`src/world/treeLifecycle.ts`, `treeHarvest.ts`), plus deterministic branch gathering with its own regeneration cooldown.
- `QuestManager` — quest progress, outcomes and player↔NPC relations.
- `ReputationManager` (`src/reputation/`) — per-settlement reputation (five `-100..100` dimensions) and renown (`0..100`); independent of `QuestManager`, changed only via an explicit `SocialConsequence` a caller applies. Cemetery grave disturbance uses `socialExposure.ts` for a one-shot day/night + Sneak roll before that consequence.
- `ChunkManager` — terrain sampling, streaming and environment-facing world queries.
- `createCaves` / Cave V2 — streamed walk-in interiors (`src/world/caves/`); presentation is production SDF; gameplay ground is the SDF column index (`queryGround`); wall colliders and camera occupancy are strict occupancy derived from that index (`occupancyAt`, `caveSdfColliders.ts`); `queryInterior` is the hysteretic player-position interior flag (cave ambience / rain mute). Open-sky is portal-only (not SDF surface-clip); camera mouth-exit only from a portal origin; `contains` is strict occupancy. Hillside doorway / terrain-hole presentation is still an open B3 leftover. Descending-path camera Y jump (mouth-throat parking and occupancy-null heightfield clamp) is still an open B3 leftover — player ground stays cave-owned.
- `WorldLocationCatalog` / `LocationKnowledge` / `NavigationTargets` — concrete named world locations, player discovery state and active travel targets. See [state/world-locations.md](./state/world-locations.md).
- `Place` / schedule-related NPC work — foundation for daily routines.
- The persistent worldgen cache (`worldgenCacheDb.ts`, `(seed, namespace, version, fingerprint) → payload`) is a structurally separate, disposable versioning concept from `SaveData.version` — never a correctness dependency. See [persistence.md](./state/persistence.md#worldgen-cache) for the mechanism and its one current namespace.
- **Asset anchors** — `src/assets/assetAnchors.ts`; convention in [docs/assets/ANCHORS.md](./assets/ANCHORS.md).

Before adding a new abstraction, check whether one of these already owns the responsibility.

## Developer tooling

- **Asset alignment browser** — `/asset-browser.html` (`src/tools/assetBrowser/`), included in production `vite build`. Wired registries plus parked files from `/asset-browser-models.json`.
- **Construction Catalog** — `src/assets/constructionCatalog.ts`. Layers construction semantics over the asset index for the parked MegaKit GLB set.
- **House Builder** (`src/settlement/houseBuilder.ts`) assembles MegaKit cottages/farmsteads from that catalog; wired into `buildSettlementProps()`. `?perf=1` verification is still open (known bug from a 2026-08-18 playtest — see `docs/plans/README.md`'s "Verification needed").
- **House Browser** (plan tools-003) — `/house-browser.html` (`src/house-browser/`), a standalone Vue + Tailwind + Three.js app for iterating on house definitions outside the main game loop, built through the real `ConstructionCatalog` → `HouseBuilder` pipeline — no parallel house/collider system.
- **Tools menu** — `src/tools/toolRegistry.ts` is the central `ToolDefinition[]` registry the Main Menu's `Narzędzia ›` submenu renders.
- **Performance** — `src/perf/` sampler/benchmark; lil-gui Performance + `?perf=1`/`?benchmark=<id>`. Graphics quality presets Low/Medium/High/Custom. The full performance model, confirmed bottlenecks, techniques in use/not-yet, and optimization order live in [docs/performance/README.md](./performance/README.md) — do not restate them here.

## Important code entry points

Broader "where does this system live" lookup: [CODE_INDEX.md](./CODE_INDEX.md). Domain-specific entry-point lists live in each domain document linked above.

```text
src/app/createApp.ts
src/app/gameLoop.ts
src/app/worldBundle.ts
src/app/saveState.ts
src/terrain/chunkManager.ts
src/settlement/SettlementsManager.ts
src/ai/NpcAgent.ts
src/fauna/AnimalAgent.ts
src/simulation/
src/shared/HealthState.ts
src/items/Inventory.ts
src/combat/
src/persistence/saveData.ts
```

## Current architectural seams / active refactors

- **World visual overhaul** — plants done in part; clouds (weather-driven variety plus local ground fog) and sky are implemented; distant mountains remain.
- **UI** — Vue migration is incremental, browser verification pending across most of it. Do not assume every future UI belongs in Vue; extend the existing facade + store pattern when migrating.
- **NPC daily routine** — Place + executable schedule + vigor are implemented; the household resource layer is implemented (see [settlements.md](./state/settlements.md)). Vigor collapse and a critical need interrupt a schedule-driven action already in flight; ordinary schedule/time-of-day changes still do not. NPC execution state (phase/pending action/pathfinding/combat intent/carried inventory) resets on every `WorldBundle` reconstruction, including an in-session settlement unload/reload — only authoritative state (health/needs/plan/etc.) carries over; do not treat in-session rebuild continuity as full execution-state persistence. Social Places beyond a settlement's own campfire remain an intentional gap.

## Verification state

Technical checks: `npx tsc --noEmit` · `pnpm run lint:fix` · `pnpm run build` · `pnpm run test`.

Do not treat a passing build as proof that a visual Three.js feature is correct. For browser-only verification, provide concrete manual steps for the user. Most recently-landed plans in `docs/plans/README.md`'s "Verification needed" section have passed technical checks but not browser/gameplay verification — check the plan's own `Status:` header, not this document, for the current per-plan state.

## Not implemented / intentionally deferred

- Player melee/ranged cannot damage an NPC — only animals are hit-test candidates today; an `[E]` on an NPC opens dialogue instead. See [combat.md](./state/combat.md).
- Fauna's own outgoing attacks use a flat per-attacker-kind damage table rather than the shared melee/ranged/critical/defense pipeline — see [combat.md](./state/combat.md) and [fauna.md](./state/fauna.md).
- Player HP is not persisted — every Continue/Load fully heals the player, while NPC and livestock HP both persist. See [persistence.md](./state/persistence.md#known-persistence-limitations).
- Individual wild fauna are never persisted (only the population is deterministically reconstructed); rats are neither persisted nor seed-derivable at all. See [fauna.md](./state/fauna.md#persistence-classes).
- NPC/animal execution state (pending action, pathfinding, combat intent, carried inventory) is never persisted and resets on every reconstruction.
- Social Places beyond a settlement's own campfire; conversation partner selection/ranking by personality/traits/role/relationship; group conversations; social interaction memory entries.
- LLM/AI-generated quests.
- Inter-settlement trade and player crafting.
- Full combat system for the player — see [state/combat.md](./state/combat.md) for exactly what exists vs. what's missing.
- Weapon repair/broken lifecycle, general tool durability (shovel/pickaxe), bow durability/sharpness, arrow recovery, 3D projectile visuals.
- Cube-sphere / fully spherical world architecture.
- Distant background mountains.
- Full Vue migration of all existing UI.

Plan status belongs in [plans/README.md](./plans/README.md), not here.

## Source of truth rule

When this document (or any domain document it links to) conflicts with the code, **the code wins**. When it conflicts with a plan, the plan describes intended work but does not override implemented behaviour. Update this file — and the relevant domain document — when a structural change makes the snapshot materially stale. See [CLAUDE.md](../CLAUDE.md#source-of-truth) for the full ordering.
