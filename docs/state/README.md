# docs/state/ — Domain state documents

Current-state documents for domains that are real, substantial and current, but don't fit any of the existing top-level docs (`architecture/ARCHITECTURE.md`, `architecture/GRAPHICS.md`, `items/CATALOG.md`). Created out of [docs/STATE.md](../STATE.md) when that file got too large to read whole before every plan.

Same rules as every other current-state doc: when a file here and the code disagree, **the code wins**; update the file. These are not plans and not implementation-history logs — that detail belongs in `docs/plans/`.

The "Covers" column below states each document's canonical scope and, where it matters, the ownership boundary against its nearest neighbour — use it to find the right home for new content before adding a new file.

<!-- AUTO-GENERATED:START columns: File, Covers -->
| File | Covers |
|---|---|
| `combat.md` | Melee/ranged state machines, critical hits/defense, NPC combat phase, animal attack & NPC defense, role loadouts, combat interruption — shared primitives across player/NPC/fauna. Not: fauna's own outgoing-damage table internals beyond the one documented asymmetry (`fauna.md`), or NPC health-state consumption after the `physicalInjury` handoff (`npc.md`) |
| `fauna.md` | The shared `AnimalAgent` runtime — species data, behaviour arbitration, corpse/rabies lifecycle, ecosystem interactions, and the livestock/spawner/wild-fauna/rats persistence classes. Not: how NPCs consume fauna's exposed surface (`npc.md`), settlement economy internals (`settlements.md`) |
| `npc.md` | NPC authoritative state ownership, the needs/pressure decision pipeline, work & profession dispatch, work-contract evaluation, movement, social/conversation, dialogue, and relationships. Not: settlement/household economy ownership (`settlements.md`), fauna's own behaviour internals (`fauna.md`), combat resolver internals (`combat.md`), the work-contract commitment record itself (`player-systems.md`) |
| `persistence.md` | The persistence classification taxonomy (persisted authoritative / delta / deterministic reconstruction / runtime authoritative / derived-cache), the save/restore/rebuild mechanism, migrations, the worldgen cache, and known cross-domain persistence gaps. Not: the field-by-field `SaveData` schema (`architecture/ARCHITECTURE.md#save-schema`), a per-migration changelog |
| `player-systems.md` | Player survival needs, skills, busy channels, camp rest, settlement lodging, player-built wells, animal traps (mechanic), seed planting, fishing/preservation, carry capacity, and Work Contracts (the player-as-employer commitment record) |
| `quests.md` | Quest definitions/materialization, lifecycle/stages/objectives, dialogue actions, availability, outcomes/rewards/consequences, world-driven opportunities, quest persistence and integration ownership boundaries. Not: NPC behaviour/dialogue internals (`npc.md`), fauna/world authoritative state (`fauna.md`, `world-locations.md`), or planned quest design (`vision/quests.md`, `plans/`) |
| `settlements.md` | Settlement generation/streaming, households, settlement/household economy, land ownership — and where NPC authoritative state is physically hosted. Not: NPC decision/behaviour internals, work, combat, social/dialogue (`npc.md`) |
| `terrain-and-world-generation.md` | Chunk streaming, worker pool, terrain shaping stages, mountains, vegetation/rock instancing + region batching, tree species/lifecycle, weather/seasons, surface wetness/snow, slope movement. Not: ocean/lake/river hydrology (`water.md`), location catalog/discovery (`world-locations.md`) |
| `water.md` | Ocean/lake/river hydrology, `WaterSource`, and river integration with terrain/settlement generation. Not: general terrain shaping (`terrain-and-world-generation.md`) |
| `world-locations.md` | The world-location catalog (deterministic coarse classification from terrain sampling), discovery/knowledge state, navigation targets, and map projection. Not: terrain sampling internals (`terrain-and-world-generation.md`), settlement siting (`settlements.md`) |
<!-- AUTO-GENERATED:END -->

Don't add a new file here just because a system exists. A new doc belongs here only when the content is current (not a change history), doesn't fit an existing document, is big enough to earn its own file, and will plausibly be read again by a future plan. Otherwise the content belongs in an existing document, or stays in a plan's own implementation notes.

## Specialized references outside this directory

- [architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md) — runtime composition, `WorldBundle` lifecycle, and the authoritative save-schema field list.
- [items/CATALOG.md](../items/CATALOG.md), [items/WEAPONS.md](../items/WEAPONS.md) — item/weapon definitions and numbers.
- [world/species-physical-reference.md](../world/species-physical-reference.md) — a **design reference**, not an implemented state doc: the authoritative SPEA/species model for NPCs and fauna. Runtime SPEA exists for humans (`PhysicalAttributes`, NPC rolls, Strength melee damage, Agility melee recovery) — see `npc.md` and `combat.md` for what is implemented today. Fauna still has no SPEA fields; do not treat the full design reference as implemented runtime.

No `runtime-ui-audio.md` exists here by design — no cross-domain seam in this layer currently requires a dedicated current-state doc beyond `STATE.md`'s own UI/input section and `architecture/ARCHITECTURE.md`/`architecture/GRAPHICS.md`.
