# Cave Design — Problem & Requirements

**Status:** `in progress`
**Started:** 2026-09-04

## Purpose

Define what the redesigned underground cave system must achieve before selecting a technical approach.

This document deliberately avoids committing to a specific generation technique. It should describe the desired result, constraints and failure modes that candidate solutions must satisfy.

## Current Problem

The current cave implementation has been observed in gameplay to have several fundamental quality problems:

- the camera can escape the cave and reveal the surface/grass;
- tunnels can read as connected pipes rather than natural passages;
- visible seams/gaps can appear between cave sections;
- cave surfaces are excessively smooth;
- entrances are too narrow and small;
- the overall cave experience does not yet meet the intended quality bar.

These observations are the starting point for the redesign. They are not, by themselves, evidence for a particular technical solution.

## Target Experience

_To be defined during the design discussion._

Questions to answer:

- What should a typical Seedvale cave feel like when entering it?
- What should the player see during the first 10–30 metres?
- How large should entrances, passages and chambers feel relative to the player and third-person camera?
- How much variation should exist between caves?
- What makes a cave feel natural rather than procedurally assembled?
- Which cave formations are important for the first version?
- How dark should caves be and how should the transition from outdoor lighting behave?

## Functional Requirements

_To be refined during the design discussion._

Candidate requirements:

- deterministic generation from world seed/location;
- caves positioned coherently with terrain and suitable geological locations;
- walk-in cliff-side entrances;
- sufficiently wide/high entrances and transitions;
- gradual descent after entering rather than abrupt drops;
- walkable passages and larger chambers;
- branches and/or dead ends where appropriate;
- continuous cave surfaces without visible seams between generated sections;
- cave floor, walls and ceiling forming a coherent enclosed volume;
- sufficient overburden so the cave does not accidentally open onto the surface;
- collision derived from the cave representation rather than the render mesh alone;
- correct third-person player and camera behaviour inside caves;
- no accidental exposure of surface terrain from normal cave positions;
- compatibility with existing world streaming/lifecycle mechanisms;
- future compatibility with fauna, items, quests and persistence without creating parallel systems.

## Visual / Gameplay Quality Requirements

_To be refined and made measurable._

Candidate requirements:

- no obvious tube/pipe appearance;
- controlled irregularity at multiple scales;
- no obvious repeating cross-section;
- no visible cracks caused by independently joined tunnel pieces;
- natural transitions between tunnel and chamber;
- chambers clearly larger than connecting passages;
- enough clearance for player movement and third-person camera;
- walls/ceiling should not feel artificially smooth;
- local bumps and formations should exist without making traversal frustrating;
- cave scale should remain readable and believable from the normal gameplay camera.

## Technical Constraints

- Three.js + WebGL2.
- Vite + TypeScript.
- Existing Seedvale world/chunk/streaming architecture should be reused where practical.
- Existing collision ownership should be extended rather than replaced by a second collision engine.
- Generation must remain deterministic.
- Runtime and presentation should remain separable from persistent/world data.
- Performance must scale beyond a single hand-authored cave.
- Web Workers should be considered only where measured CPU cost and task independence justify them.
- The player must not become the owner of cave simulation; caves are world state.

## Non-Goals for This Design Phase

- Implementing the final cave system.
- Adding cave-specific fauna behaviour.
- Adding cave-specific loot or inventory mechanics.
- Adding quests/content authored around caves.
- Designing a new persistence framework.
- Designing a replacement collision engine for the whole world.
- Building a complete dungeon-generation framework.

## Acceptance Questions

Before architecture is selected, we should be able to answer:

1. What does a good Seedvale cave look and feel like?
2. What minimum cave scale is required for the third-person camera?
3. What geometry/topology properties distinguish a natural cave from a set of tubes?
4. What level of irregularity is required?
5. How do we guarantee cave enclosure and safe overburden?
6. What must be represented as world data versus generated presentation?
7. What performance budget should a streamed cave fit within?
8. Which requirements are hard constraints and which are desirable qualities?

## Discussion Notes

_Add decisions, observations and conclusions here during the design conversation._
