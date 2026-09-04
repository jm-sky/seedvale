# Cave Design — Problem & Requirements

**Status:** `in progress`
**Started:** 2026-09-04

## Purpose

Define what the redesigned underground cave system must achieve before selecting a technical approach.

This document deliberately avoids committing to a specific generation technique. It synthesizes requirements and conclusions already established in the earlier cave research and `world-terrain-007`, while leaving room for new requirements to be added during the current design discussion.

## Existing Product Direction

The earlier cave research established the intended product scale:

- caves are **rare underground exploration landmarks**, not a cave biome;
- the first playable milestone can be a **single 20–30 m long cave**;
- the first milestone must still use the same conceptual model that can later grow into substantially more complex caves rather than becoming a one-off tunnel implementation;
- the long-term target is **L2**: multiple passages with larger chambers, potentially multiple entrances, and later room for treasure, fauna and quests;
- L3 — caves as a general geographic/biome feature requiring a 3D terrain system — is out of scope.

The cave must remain a real part of the continuous Seedvale world rather than becoming a separate interior scene or portal-based world.

### Future topology target

Longer-term caves may have a topology comparable in complexity to large MMO caves such as those seen in WoW. The system should eventually be capable of representing:

- several entrances to the surface;
- multiple interconnected tunnels;
- loops and circular/round-trip tunnel routes;
- several chambers within one cave system;
- branches and dead ends;
- multiple routes between the same areas;
- meaningful vertical differences between routes;
- ramps and sloped passages;
- platforms, shelves and ledges inside large chambers;
- spatially distinct upper and lower routes that reach the same chamber at different elevations.

For example, one passage may split into a lower route that continues downward toward the floor of a large chamber and an upper route that forms a ramp and reaches a platform on the chamber wall. These are two physical routes through the same continuous cave volume, not separate rooms or scenes.

This future topology is an **architectural capability**, not an L1 implementation requirement. The first 20–30 m cave does not need multiple entrances, loops, multiple chambers or multi-level routes.

## Current Problem

The original cave implementation was fundamentally a heightmap excavation rather than an underground volume: the terrain has one height per `(x,z)`, so the result could not provide a real roof and enclosed interior. The current implementation introduced a separate cave volume and procedural interior, but gameplay recon on 2026-09-04 showed that the result is still below the required quality bar.

Observed gameplay failures:

- the camera can escape the cave and reveal the surface/grass;
- tunnels can read as connected pipes rather than natural passages;
- visible seams/gaps can appear between cave sections;
- cave surfaces are excessively smooth;
- entrances are too narrow and small;
- the overall cave experience does not yet meet the required quality bar.

These observations are evidence about the required result, not evidence for a particular technical solution.

## Existing Conclusions We Should Preserve

The earlier research already established several important constraints and decisions. They should not be rediscovered unless new evidence contradicts them.

### Cave representation

The cave should be represented as an underground **volume** with its own floor, walls and ceiling, while the existing heightmap remains the surface representation.

The earlier research rejected:

- **heightmap-only caves** as incapable of producing a real underground roof;
- **a full voxel/SDF terrain rewrite** because Seedvale does not need cave geography as a world-wide 3D terrain feature;
- **portal/separate-scene interiors** as a poor fit for the continuous-world direction.

The preferred family was an in-world cave mesh/volume integrated with the existing world, with outcrop/CSG as a fallback for difficult flat terrain and hole-punching of the surface deferred unless later requirements justify it.

### Topology and collision

The earlier research identified an important architectural principle:

> The cave layout/topology should be the source of truth for gameplay space; the render mesh should be a presentation derived from that representation.

In particular, movement collision should not depend on raycasting or BVH against the rendered cave mesh as the primary representation. The same underlying layout/volume should be usable for floor queries, containment, collision and future navigation.

The representation must not assume that future cave topology is only a flat graph in X/Z. It should be able to represent genuinely spatial relationships, including different routes through the same cave at different elevations.

### Terrain relationship

The surface above a cave remains ordinary Seedvale surface terrain. The cave does not replace the heightmap.

Cave siting must account for sufficient rock overburden along the **entire cave**, not merely at the entrance or endpoint. The earlier research established gradual descent after the entrance as an important way to build overburden in a heightmap-based world.

The leading section may connect to a carved entrance recess, but the interior must quickly transition to a safely enclosed underground volume.

### World integration

The cave is world state, not player state.

It should reuse existing systems for:

- world lifecycle and rebuild;
- terrain/chunk streaming;
- collision ownership;
- fauna lifecycle;
- item identity/state;
- persistence;
- lighting and player equipment.

No cave-specific parallel versions of these systems should be introduced.

### Determinism

Cave placement and layout must be deterministic from the world seed and stable world/grid coordinates. Regenerating the same world must produce the same cave geometry and topology.

### Streaming and performance

Only relevant cave presentation should be active near the player/world streaming area. The design must support multiple rare caves without generating or keeping all cave meshes active at once.

The earlier research also identified that the likely expensive parts are not simply triangle count: siting, geometry generation, vegetation exclusions, camera handling and streaming/lifecycle integration may dominate. Workers should therefore be considered based on measured CPU cost rather than assumed necessary.

## Target Cave Shape — Existing Baseline

The existing implementation plan defines this baseline shape:

```text
large cliff-side entrance
        ↓
wide transition
        ↓
walk-in tunnel
        ↓
large chamber
        ↓
branch / continuation / dead end
```

For L1, this is intentionally simplified to a single compact cave of approximately **20–30 m total length**. A possible L1 layout is:

```text
entrance
   ↓
wide transition
   ↓
walk-in tunnel
   ↓
small/medium chamber or widened end
   ↓
dead end / short continuation
```

The L1 cave is a **vertical slice**, not a final topology target. Its purpose is to prove that a small cave can feel like a convincing underground space before complexity is increased.

The intended progression is:

- entrance integrated with a steep rock face or cliff;
- wide/high transition suitable for third-person gameplay;
- gradual natural descent rather than stairs or an abrupt drop;
- passages large enough for comfortable traversal;
- chambers clearly larger than corridors where a chamber exists;
- sufficient underground depth to avoid accidental surface exposure.

Future L2+ layouts may add branches, loops, several chambers and multiple entrances without changing the underlying cave concept.

## Target Experience

_To be refined during the current design discussion._

Questions to answer:

- What should a typical Seedvale cave feel like when entering it?
- What should the player see during the first 10–30 metres?
- How large should entrances, passages and chambers feel relative to the player and third-person camera?
- How much variation should exist between caves?
- What makes a cave feel natural rather than procedurally assembled?
- Which cave formations are important for the first version?
- How dark should caves be and how should the transition from outdoor lighting behave?

## Functional Requirements

The following are already established requirements. New requirements should be added below rather than replacing these silently.

### World and generation

- deterministic generation from world seed/location;
- rare, coherent placement in suitable geological terrain;
- cliff-side entrances rather than holes in flat terrain;
- sufficient overburden along the complete underground layout;
- gradual descent after entering;
- stable cave identity suitable for world systems and future persistence;
- no dependency of world simulation on the player/camera.

### Cave space

- real enclosed floor/wall/ceiling volume;
- walk-in passages;
- larger chambers;
- future support for branches, loops, multiple chambers and multiple entrances at L2+;
- future support for routes at different elevations within the same cave volume;
- natural transitions between passages and chambers;
- no visible seams between independently generated sections;
- no accidental openings through the surface;
- floor queries and containment based on cave-space semantics rather than surface height.

### Gameplay

- comfortable player traversal;
- sufficient clearance for both player and third-person camera;
- walls and ceiling must reliably contain the player/camera;
- camera must not expose surface grass or terrain from ordinary cave positions;
- camera obstruction should not unnaturally collapse the normal third-person distance in a sufficiently wide passage;
- cave lighting must read as underground rather than as an outdoor trench;
- surface gameplay outside caves must remain unchanged.

### Future world interactions

The cave architecture should be able to host future:

- fauna;
- loot/items;
- quests and discoveries;
- persistent cave progress/state;

without requiring a separate cave-only ecosystem of managers and data models.

## Visual / Gameplay Quality Requirements

The current baseline already identifies these qualities as important; exact measurable thresholds can be added during discussion:

- no obvious tube/pipe appearance;
- no obvious repeating cross-section;
- controlled irregularity at multiple spatial scales;
- no visible cracks or gaps caused by independently joined tunnel pieces;
- natural transitions between tunnel and chamber;
- chambers clearly larger than connecting passages;
- walls, floor and ceiling should not feel artificially smooth;
- local small-scale bumps should add visual richness without making traversal frustrating;
- larger formations should create meaningful variation in silhouette and space;
- cave scale should remain believable from the normal third-person camera;
- entrance proportions should read as a real walk-in cave, not a small hole.

The previous plan gives useful initial scale targets for surface detail:

- micro bumps around `0.5 × 0.5 × 0.5 m`;
- larger wall/ceiling protrusions around `2 × 2 × 1 m` where the third dimension represents protrusion depth.

These are starting targets, not yet final geometry specifications.

## Technical Constraints

- Three.js + WebGL2.
- Vite + TypeScript.
- Existing Seedvale world/chunk/streaming architecture should be reused where practical.
- Existing collision ownership should be extended rather than replaced by a second collision engine.
- Generation must remain deterministic.
- Runtime presentation must remain separable from persistent/world data.
- Performance must scale beyond a single cave.
- Web Workers should be considered only where measured CPU cost and task independence justify them.
- The cave system must coexist with the existing heightmap surface rather than silently turning Seedvale into a volumetric terrain engine.
- Surface vegetation, water and other surface systems must not incorrectly treat underground cave space as ordinary surface space.
- The player must not become the owner of cave simulation.
- The representation must leave room for future genuinely three-dimensional cave topology, including different routes at different elevations.

## Known Integration Risks

These were already identified by the previous research/implementation work and should remain visible during design:

- cave entrance seams against heightmap terrain;
- vegetation/props generated from surface data above or around the cave;
- water-level interaction;
- chunk boundaries and streaming;
- camera boom/obstruction in enclosed spaces;
- AI currently relying heavily on surface `sampleHeight`;
- fauna cave-mouth logic being a separate, surface-oriented concept from exploration caves;
- persistence currently having little cave-specific state to save;
- overburden failures if cave floor/ceiling geometry is designed without continuous surface clearance checks.

## Non-Goals for This Design Phase

- Implementing the final cave system.
- Adding cave-specific fauna behaviour.
- Adding cave-specific loot or inventory mechanics.
- Adding quests/content authored around caves.
- Designing a new persistence framework.
- Designing a replacement collision engine for the whole world.
- Building a complete dungeon-generation framework.
- Rebuilding Seedvale's entire terrain representation as voxels/SDF merely to support caves.

## Acceptance Questions

Before architecture is selected, we should be able to answer:

1. What does a good Seedvale cave look and feel like?
2. What minimum cave scale is required for the third-person camera?
3. What geometry/topology properties distinguish a natural cave from a set of tubes?
4. What level and types of irregularity are required?
5. How do we guarantee cave enclosure and safe overburden?
6. What must be represented as world data versus generated presentation?
7. What performance budget should a streamed cave fit within?
8. Which requirements are hard constraints and which are desirable qualities?
9. How much topology must the first implementation support so that L1 does not become a dead-end?
10. What degree of visual authoring versus procedural generation is acceptable for rare landmark caves?
11. How should surface/cave transitions behave visually and physically?
12. What future gameplay interactions must the cave representation support from day one?
13. Which future 3D topologies must remain possible even if L1 is only a single 20–30 m cave?

## Discussion Notes

_Add new requirements, decisions, observations and conclusions here during the design conversation._
