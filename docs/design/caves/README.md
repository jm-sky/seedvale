# Cave Design

**Status:** `in progress`
**Started:** 2026-09-04
**Related implementation plan:** `docs/plans/world-terrain-007-underground-caves.md`
**Domain:** `world-terrain`

## Purpose

This directory contains the design work required before rebuilding the underground cave system in Seedvale.

The current cave implementation is technically functional but fails the intended gameplay and visual quality: caves can expose the surface, tunnels read as connected pipes, seams/gaps are visible, surfaces are too smooth, and entrances are too narrow/small.

The purpose of this work is **not** to tune the current generator by trial and error. First determine the appropriate representation, geometry-generation approach, gameplay integration and performance model for Seedvale. Only then update `world-terrain-007-underground-caves.md` for implementation.

## Design Process

```text
Problem & requirements
        ↓
Seedvale code/repository recon
        ↓
External technical research
        ↓
Architecture alternatives
        ↓
Technical spike
        ↓
Gameplay spike
        ↓
Decision
        ↓
Rebuild implementation plan
        ↓
Implementation
        ↓
Browser verification
```

Each stage should produce evidence that is useful for the next stage. Do not move to implementation merely because a proposed approach sounds plausible.

## Working Documents

| Document | Purpose | Status |
|---|---|---|
| `01-problem-and-requirements.md` | Define the problem, target experience and measurable requirements before choosing technology. | `in progress` |
| `02-recon.md` | Record the relevant current Seedvale architecture, code paths and constraints. | `planned` |
| `03-research.md` | Compare procedural cave-generation techniques and relevant Three.js/WebGL2 approaches. | `planned` |
| `04-architecture.md` | Compare Seedvale-specific architecture alternatives and their trade-offs. | `planned` |
| `05-technical-spike.md` | Define and record small implementation experiments and measurements. | `planned` |
| `06-gameplay-spike.md` | Validate movement, collision, camera and visual/gameplay quality in representative caves. | `planned` |
| `07-decision.md` | Record the selected approach, rejected alternatives and resulting constraints. | `planned` |

## Rules

- The current repository is the source of truth.
- Separate cave topology/data from rendering and runtime presentation.
- Prefer extending existing Seedvale systems over creating parallel systems.
- Preserve deterministic generation and world independence from the player.
- Treat collision, camera, streaming and performance as design constraints, not post-processing.
- Do not introduce a new system solely to solve a problem already owned elsewhere.
- Do not commit to a generation technique before comparing viable alternatives.
- Do not rebuild the full cave feature during a spike.
- Keep fauna, loot, quests and persistence out of the geometry experiments unless they are required to validate an architectural decision.

## Exit Criteria

This design phase is complete when:

1. The target cave experience and requirements are explicit.
2. The current Seedvale implementation and integration constraints are understood.
3. Relevant generation techniques have been researched and compared.
4. At least two viable architecture approaches have been evaluated against Seedvale requirements.
5. A representative technical spike has produced evidence about geometry quality and cost.
6. A gameplay spike has validated the chosen approach with player movement and third-person camera.
7. A documented decision has been made.
8. `world-terrain-007-underground-caves.md` has been rewritten/updated to implement that decision rather than independently redesigning the system.

## Existing Material

There is already earlier cave research under `docs/research/`, including research specifically covering underground caves. It should be treated as input to this process, not assumed to be sufficient or current.

Relevant implementation and project documentation should also be checked during recon, especially `docs/STATE.md`, `docs/plans/PLANNING.md`, `docs/plans/README.md`, and the current cave-related source files.
