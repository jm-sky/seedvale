# Seedvale Roadmap

**Updated:** 2026-08-10

This document describes **product direction and major milestones**. It is intentionally not a second implementation-status database. For exact plan status, see [docs/plans/README.md](./plans/README.md). For the factual current codebase state, see [docs/STATE.md](./STATE.md).

## Product direction

**Seedvale — Plant the seed. Watch the world grow.**

Seedvale is a browser-based 3D sandbox where the player observes and participates in a procedural world containing settlements, NPCs and wildlife. The world should feel alive without requiring the player to drive every important event.

Seedvale is:

- a sandbox/demo and learning/portfolio project,
- third-person exploration and observation with participation,
- procedural terrain and settlements,
- simulation-driven NPC and animal behaviour,
- emergent stories created by interacting systems.

Seedvale is not intended to become:

- an MMO or multiplayer game,
- a full survival/crafting RPG,
- a player-centric scripted campaign,
- an LLM-generated simulation replacing deterministic game systems.

## Current foundation

The following major foundations are implemented in the codebase; individual features may still require browser verification:

- procedural chunked terrain and worker-based terrain generation,
- streamed world regions including large ocean/coast/mountain features,
- day/night, sky, lighting, water, fog and post-processing,
- settlements with families, houses, roads and environment-aware generation,
- NPC needs, behaviour, personality/character data and dialogue,
- predator/prey fauna with health, damage, death and respawn,
- player inventory/items, dropped items, fire/torch interactions and rest/time skip,
- quests with stages, world interactions, EXP and NPC relations,
- IndexedDB save/continue flow,
- mobile touch controls,
- game UI screens plus an incremental Vue/Tailwind UI migration,
- natural resources, environmental elements and the beginning of procedural landmark generation.

See [docs/STATE.md](./STATE.md) for the implementation-level details and known boundaries.

## Roadmap themes

### 1. Strengthen the simulation foundation

The next architectural goal is to make existing systems more coherent rather than continuously adding isolated features.

Focus areas:

- shared health/stamina/threat concepts across agents,
- deeper NPC schedules and places,
- animal needs/life simulation,
- stronger persistence of world/NPC state,
- clean lifecycle boundaries for streamed/rebuilt world systems.

Relevant work currently includes plans [045](./plans/archive/2026-08-08--045--health-stamina-threat.md), [020](./plans/archive/2026-08-07--020--npc-2-daily-routine-and-place.md), [021](./plans/archive/2026-08-07--021--npc-3-animal-life.md) and [054](./plans/archive/2026-08-10--054--world-bundle-reference-safety-and-small-refactors.md).

### 2. Make settlements feel like real places

The settlement generator should increasingly produce places with identity, useful geography and visible reasons for existing.

Direction:

- coherent village identity and layout,
- resource-aware settlement placement,
- roads and landmarks as parts of the same world-generation pipeline,
- families and roles tied to what a settlement actually has access to,
- eventually multiple settlements connected through movement, resources and quests.

Relevant plans include [047](./plans/archive/2026-08-09--047--village-generation-overhaul.md), [032](./plans/archive/2026-08-08--032--natural-resources-economy.md) and [049](./plans/2026-08-09--049--procedural-world-landmarks.md).

### 3. Deepen NPC life

NPCs should increasingly behave like inhabitants rather than quest dispensers.

Direction:

- role-driven schedules,
- workplaces and meaningful places,
- needs driving activity,
- personality modifying decisions and dialogue,
- relationships and family context,
- fatigue/stamina and threat influencing behaviour,
- persistence so the world can continue from a believable state.

The design principle is to extend the existing `Needs → behaviour/FSM → personality → dialogue → quests` chain rather than creating independent AI systems.

### 4. Build a living ecosystem

Wildlife should remain an ecosystem rather than a collection of animated models.

Direction:

- hunger/thirst/energy,
- habitat and territory bias,
- population dynamics and respawn rules,
- interaction with settlements and eventually NPCs,
- behaviour influenced by time of day and environment.

### 5. Give the player a place in the world

Player-facing systems should expand the player's role from observer/participant toward resident without turning Seedvale into a conventional survival game.

Future direction:

- richer inventory/equipment,
- resource gathering and production,
- crafting,
- player home/plot/farm,
- barter and trade,
- stronger interaction with settlement economies.

These systems should consume the same `ItemKind`, resource, place, NPC and settlement concepts already used by the simulation instead of introducing parallel economies.

### 6. Improve the presentation

Visual and audio polish should strengthen readability and the feeling of place without becoming a separate technology project.

Direction:

- procedural landmarks and environmental storytelling,
- clouds and distant mountains,
- richer biome-specific vegetation,
- ambient audio sampled from world regions,
- continued UI migration where it provides a real UX benefit.

### 7. Large world direction

The current world uses a **flat chunk grid with streaming**. A fully spherical/cube-sphere world remains an architectural question, not an implemented feature.

Do not start a cube-sphere rewrite merely because the roadmap mentions it. First establish whether the current streaming model actually becomes a product limitation.

## Deliberately deferred

The following remain intentionally outside the immediate scope:

- multiplayer/netcode,
- WebGPU-first rendering,
- full RPG combat and survival systems,
- LLM-generated quests as a replacement for deterministic quest logic,
- a full infinite-world rewrite before the current streaming architecture proves insufficient.

## Planning rule

The roadmap is directional. When choosing the next implementation:

1. Check [docs/plans/README.md](./plans/README.md) for actual status and priorities.
2. Check [docs/STATE.md](./STATE.md) to understand what the code already provides.
3. Prefer work that strengthens an existing system coupling or removes an architectural bottleneck.
4. Avoid adding a new subsystem when an existing system can be extended.
