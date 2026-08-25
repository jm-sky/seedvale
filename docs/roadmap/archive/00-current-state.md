# Seedvale Roadmap — Current State

**Session:** 0 — Context & Current State
**Date:** 2026-08-12
**Status:** `accepted for discussion`

## Purpose

This document records the repository-grounded starting point for the roadmap process. It describes what Seedvale has today, what is missing, and which questions must be resolved before designing the long-term roadmap.

It is **not** the roadmap and does not establish implementation order.

## Sources reviewed

- `CLAUDE.md`
- `docs/VISION.md`
- `docs/STATE.md` (last verified 2026-08-12)
- `docs/ROADMAP.md`
- `docs/plans/README.md`
- current implementation of `NpcAgent`, `Needs`, `schedule`, `AnimalAgent`, `SettlementsManager`, and family generation
- representative strategic plans including 020, 032, 036, 040, 047, 060, 069 and 071
- the current `docs/plans/` index and plan set

## 1. Current understanding of Seedvale

Seedvale is already a functioning browser-based 3D sandbox with a substantial simulation foundation. The central product idea is clear: the player enters a procedural world that should continue living independently of them. The long-term value is expected to come from interactions between systems and emergent stories rather than from a large collection of scripted features.

The current architecture strongly supports that direction: Three.js/WebGL2/Vite/TypeScript, chunk streaming, worker-based terrain generation, streamed settlements, NPC agents, fauna agents, shared health/stamina concepts, world resources, persistence, quests and a growing action/simulation layer.

However, many systems are currently at the **first useful simulation layer** rather than at a mature world-simulation level. In particular, NPC needs currently represent direct local needs, settlement resources are not yet a true household/storage economy, and NPC runtime state is not generally persisted as a complete simulation state.

## 2. Major systems that exist today

### World and terrain

- Procedural chunked terrain with worker generation.
- Chunk streaming and persistence.
- Ocean/coast/mountain regions, biomes/moisture and forest-density suitability.
- Terrain modifications, roads/corridors, vegetation and environmental props.
- Day/night cycle, sky, lighting, fog, water and post-processing.
- Living tree lifecycle with age, size classes and multi-stage harvesting.
- Natural resource deposits and resource-aware settlement generation.
- Procedural landmark pipeline is present and still being extended/verified.

### Settlements

- Multiple streamed settlements.
- Deterministic `VillagePlan`-based generation introduced by plan 047.
- Settlement identity, size, families, houses, zones/plots, landmarks, local paths and entrances.
- Environment-aware site selection and resource-aware settlement context.
- Roads between settlements and local settlement paths.
- Livestock anchored to settlement homes.
- Significant visual work has already improved houses, gardens, paths, props and settlement readability.

Important boundary: settlement generation is considerably more advanced than settlement simulation. A village can be spatially planned, but its population, resources and production do not yet form a complete self-sustaining economy.

### NPCs

- `NpcAgent` is the central NPC simulation/behaviour integration point.
- Needs currently include hunger, thirst and wood duty.
- FSM/action lifecycle exists with shared `PlannedAction` contracts.
- Role, personality, traits, health and stamina exist.
- Daily schedules and workplaces exist, but only `sleep` and `work` currently have full scheduled behaviour; `eat`, `home` and `wake` remain incomplete.
- Traits influence some execution/reaction parameters, while full schedule overlays are planned in 060.
- Families and family-member context exist.
- Dialogue and quest relations exist.
- NPCs can perform concrete resource actions such as drinking, eating and harvesting wood.

Current `Needs` are intentionally simple: they increase over time and cause an NPC to visit a source when thresholds are reached. This is an important architectural seam for the future household/storage model.

### Fauna

- Predator/prey roles and chase/flee behaviour.
- Shared health/damage/death model.
- Hunger, thirst and stamina through `AnimalLifeState`.
- Player awareness and predator-human decisions.
- Wild and domestic/livestock distinctions.
- Multiple animal kinds including predators, prey and livestock.
- Corpses, exhaustion and some settlement/environment interaction.

Not yet present as a mature ecosystem: reproduction, population lifecycle, migration, persistent population state, richer food-web/resource dependencies and long-term animal continuity outside loaded runtime simulation.

### Resources and economy

- Natural resources are represented deterministically and already influence settlement placement/context.
- Food-source classification and resource-driven family roles exist.
- Inventory, dropped items, tools and player harvesting exist.
- NPC wood harvesting exists.

The major missing layer is the transition from **resource as world/interaction data** to **resource as a persistent flow through households, storage, production, consumption and settlement development**. Plans 069 and 071 explicitly target this gap.

### Player

- Third-person exploration and interaction.
- Inventory and item ownership.
- Tools including axe and shovel.
- Gathering/harvesting, terrain interaction, fire/torch and rest/time skip.
- Quests, EXP and NPC relations.
- Vue/Tailwind UI migration is well underway.

The player is currently a participant/observer with basic survival-like interactions, but does not yet have the long-term resident role described by the vision: home/land, production, deeper economic participation and lasting integration into settlement life.

### Persistence

- IndexedDB save/continue flow.
- Player state, world configuration, quests, EXP, relations, inventory, held tool, dropped items, fires and sparse tree lifecycle overrides are persisted.
- Settlement generation is deterministic from world seed/cell rather than persisting full generated layouts.
- NPC runtime simulation is **not** generally persisted as a complete state snapshot.

This is important for the long-term promise that the world changes while the player is away.

## 3. Current architectural strengths

1. **Existing shared simulation seams are healthy.** `NpcAgent`, `AnimalAgent`, `HealthState`, `StaminaState`, `PlannedAction`, `WorldBundle` and settlement planning already provide reusable ownership boundaries.
2. **The project avoids parallel AI architectures.** NPC and fauna behaviour already use shared action/simulation concepts.
3. **Settlement generation has a clear planning boundary.** `VillagePlan` is now a useful foundation for future settlement simulation and growth.
4. **World resources already influence settlement generation.** This provides a natural starting point for a future resource/economy loop.
5. **Streaming and workers are established.** The project can grow simulation scale without assuming everything must run at full detail every frame.
6. **The vision is internally coherent.** The product direction consistently prioritizes a living world over player-centric content.

## 4. Largest current gaps

### A. NPC life is not yet a complete life simulation

The ingredients exist, but the causal chain is still short:

`need → visit source → satisfy need`

The desired direction is closer to:

`need → household state → schedule/role → action → resource flow → consumption → consequences`

### B. Households and settlement storage do not yet form the resource backbone

Plan 069 identifies the next major missing layer: households with physical stocks and a shared settlement store. This is likely a major architectural bridge between today's needs/work system and a future economy.

### C. Production and economy are mostly future concepts

Plan 071 is still a draft direction. There is no mature shared model for goods, production, storage, consumption, surplus/shortage and inter-settlement exchange.

### D. Settlement growth is mostly generation, not simulation

Settlements can be generated with meaningful structure, but population/resource pressure does not yet naturally cause houses, production buildings, infrastructure or other settlement changes over time.

### E. Families exist structurally but not yet as a long-term lifecycle

Family relationships and children exist in generated data, but the long-term lifecycle implied by the vision — relationships developing, births, aging, death, household changes and generational continuity — is not yet a complete simulation.

### F. Fauna is an emerging ecosystem, not yet a population system

The local agent behaviour is increasingly good, but reproduction, lifecycle, population pressure, migration and persistent ecological continuity remain largely future work.

### G. World-state persistence is incomplete for simulation continuity

A deterministic world plus partial persistence is enough for the current stage, but not for a mature simulation where NPCs and settlements should continue changing meaningfully while unloaded or while the player is elsewhere.

### H. Some existing plans are ahead of the deeper architecture

The current plan set already contains plans for schedules, household resources, economy, world observability and seasons/weather. The roadmap process must determine which of these are true foundations, which should be sequenced differently, and which should be redesigned rather than implemented as written.

## 5. Important current plan signals

- **060 — NPC schedule/actions + trait overlays:** a natural next step for making current NPC schedules executable and personality-aware.
- **069 — NPC household resources:** proposes the first real household/storage resource loop.
- **071 — Local economy & settlement development:** explicitly depends on a deeper shared resource/storage/production model and is not implementation-ready yet.
- **040 — Seasons & Weather:** proposes a world-state layer that can eventually affect visuals, NPCs, fauna, resources and economy. Its true position in the long-term dependency graph should be decided during roadmap sessions, rather than assumed from its current status.
- **047 — Village Generation Overhaul:** largely implemented and provides an important structural foundation for future settlement simulation.
- **036 — Difficult Terrain Siting:** remains partially implemented; the unresolved parts overlap with the broader settlement-generation quality problem and should not automatically become an independent roadmap branch.

## 6. Documentation discrepancies / freshness concerns

1. The repository's current factual state is dated 2026-08-12, while `docs/ROADMAP.md` was updated 2026-08-10. The older roadmap should therefore be treated as directional context, not as the current roadmap truth.
2. `CLAUDE.md` refers to `docs/VISION.md`, `docs/STATE.md` and `docs/ROADMAP.md` as the established strategic documents. The new roadmap process introduces `docs/roadmap/` as a more structured working area; this is intentionally not being retrofitted into the old roadmap yet.
3. `docs/plans/README.md` is the current status index and contains several plans in `verification needed`, including substantial work around settlements and world systems. Those statuses should not be interpreted as equivalent to roadmap stages.
4. Some plan descriptions are explicitly drafts or sketches. They are useful design input, not commitments.

## 7. Questions to resolve before Session 1

These questions are intentionally open. No roadmap decision is implied by the observations above.

### World simulation depth

1. **How much of the world should be simulated when the player is far away?**
   - A) Only important aggregate state for distant areas.
   - B) Coarse simulation for all settlements/ecosystems, with full agents only when loaded.
   - C) More continuous simulation across most of the world, accepting higher complexity/cost.

2. **How important is long-term continuity of NPC identity/state?** Should a mature Seedvale remember individual NPC life histories across unloads and sessions, or is deterministic regeneration plus selected persistent state sufficient?

### NPC life

3. **What is the desired level of NPC lifecycle simulation?**
   - A) Needs/work/family/social state, but no full birth/death simulation.
   - B) Full lifecycle including children, aging and death.
   - C) Full lifecycle plus generational consequences as a core pillar.

4. **Should households become the primary unit of everyday resource simulation?** Plan 069 assumes yes. This should be explicitly accepted or rejected before it becomes a roadmap foundation.

### Economy

5. **How deep should the economy become?**
   - A) Local survival economy: resources → storage → consumption.
   - B) Production chains and local specialization.
   - C) Multi-settlement economy with trade, shortages, migration and specialization.

6. **Should crafting be a shared world production system?** The current vision and plan 071 suggest yes, so player crafting and NPC production would consume the same resources/goods model. Confirm this direction.

### Settlements

7. **Should autonomous settlement growth be a core long-term feature?** For example, population/resources cause new homes, farms, workshops and infrastructure to appear without player commands.

8. **How much settlement specialization should emerge from geography/resources?** Cosmetic identity, profession mix, production focus, or a full economic specialization loop?

### Fauna

9. **Is animal reproduction/lifecycle/population dynamics a core pillar or supporting detail?** This materially affects the simulation architecture and persistence requirements.

### Player

10. **What should be the player's long-term role?** Observer/participant, resident with a home and profession, independent landowner/producer, or some combination?

11. **How much agency should the player have over settlement development?** Direct construction/control vs. influence through participation/resources/relationships.

### World scale / regional simulation

12. **Is a multi-settlement regional world with movement/trade between communities a core destination, or should Seedvale remain primarily a single-settlement sandbox with optional neighbouring settlements?**

13. **How important is seasonality to the core simulation?** Should seasons/weather eventually be a major driver of resources, NPC behaviour and economy, or primarily environmental flavour with limited systemic impact?

## 8. Gate before Session 1

Session 0 is complete as a repository/context review. The process should **not** proceed to designing the vision until the user has reviewed this understanding and answered or corrected the assumptions/questions that materially affect the long-term direction.

The next step is discussion, not implementation.
