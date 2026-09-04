# Cave Design

**Status:** `in progress`
**Started:** 2026-09-04
**Related implementation plan:** `docs/plans/world-terrain-008-underground-caves-v2.md`
**Domain:** `world-terrain`

## Purpose

This directory contains the design and decision work for rebuilding the underground cave system in Seedvale.

The V1 cave implementation is technically functional but fails the intended gameplay and visual quality: caves can expose the surface, tunnels read as connected pipes, seams/gaps are visible, surfaces are too smooth, and entrances are too narrow/small.

Cave V2 therefore separates topology, spatial representation and presentation, compares viable geometry representations before committing to production architecture, and requires player browser verification at the architecture gate.

## Cave V2 implementation checklist

This checklist is the operational source of truth for the current Cave V2 workflow. Keep it updated as work progresses.

### A. Design and planning

- [x] Capture V1 gameplay problems and Cave V2 requirements — `01-problem-and-requirements.md`.
- [x] Research cave generation/representation techniques — `02-generation-techniques-research.md`.
- [x] Compare Advanced Sweep vs Graph + SDF/Volume and define the shared spike — `03-advanced-sweep-vs-sdf-spike-research.md`.
- [x] Create the Cave V2 implementation plan — `docs/plans/world-terrain-008-underground-caves-v2.md`.
- [x] Architecture/recon agent: perform focused current-code recon and create `docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-implementation-notes.md`.

### B. Milestone A — representation decision

- [x] Implementation agent: introduce the shared `CaveTopology` required by the comparison spike.
- [x] Implementation agent: implement the Generalized Sweep spike.
- [x] Implementation agent: implement the local SDF/Volume spike.
- [x] Implementation agent: provide one shared comparison/debug harness using the same topology, seed, lighting, material and camera.
- [x] Implementation agent: add targeted tests and comparable performance/geometry metrics.
- [x] Implementation agent: complete technical verification and stop before the architecture decision gate.
- [ ] Player: manually compare Sweep and SDF/Volume in the browser, including geometry quality, movement and third-person camera behaviour.
- [x] Record technical results (player observations still pending) in `04-sweep-vs-sdf-spike-results.md`.
- [ ] Make and record the architecture decision: Sweep, SDF/Volume, or neither/hybrid.
- [ ] Update `world-terrain-008-underground-caves-v2.md` with the selected representation and remove obsolete conditionality.

> **Gate:** do not start Milestone B until the player has manually compared both representations and the selected representation is recorded in the plan.

### C. Milestone B preparation

- [ ] Architecture/recon agent: review the selected spike against current code and update implementation notes for the production architecture.
- [ ] Define the concrete Milestone B implementation slices and their verification boundaries.
- [ ] Confirm which spike code is reusable, which must be rewritten, and which losing/temporary code must be removed.

Expected implementation slices should remain small and may be adjusted after the architecture decision. Current working split:

```text
B1 — production spatial representation + geometry
B2 — entrance + gameplay/spatial queries
B3 — collision + third-person camera
B4 — streaming + lifecycle + performance
B5 — V1 removal + cleanup
```

### D. Milestone B — production Cave V2

- [ ] Implementation agent: B1 — production spatial representation + geometry.
- [ ] Technical/manual checkpoint after B1 where useful.
- [ ] Implementation agent: B2 — entrance + gameplay/spatial queries.
- [ ] Technical/manual checkpoint after B2 where useful.
- [ ] Implementation agent: B3 — collision + third-person camera.
- [ ] Player: browser verification of movement, collision and camera before continuing.
- [ ] Implementation agent: B4 — streaming + lifecycle + performance.
- [ ] Implementation agent: B5 — remove obsolete V1 geometry and disposable spike code; perform cleanup without unrelated refactors.
- [ ] Run full technical verification required by the plan.
- [ ] Player: complete final Cave V2 browser verification checklist.
- [ ] Fix issues found during final verification without expanding into fauna/loot/quests.
- [ ] Close/update the Cave V2 plan and related design docs to reflect the production result.

### E. After Cave V2

Only after the Cave V2 spatial/gameplay foundation is production-ready:

- [ ] Plan cave fauna/habitats integration.
- [ ] Plan cave loot/resources and persistent consequences.
- [ ] Plan discovery/quests/progression integration where justified by world state.
- [ ] Plan larger multi-route/multi-level cave topology when the L1 representation has proven itself.

## Roles

The workflow is intentionally role-based rather than tied permanently to one model:

- **Architecture/recon agent** — deep code recon, ownership analysis, implementation notes, architecture review after the spike.
- **Implementation agent** — incremental implementation, targeted tests, metrics and technical verification.
- **Player** — manual browser/gameplay verification and visual quality judgment.
- **Architecture review** — combines code evidence, benchmark results and player observations before committing to production architecture.

Current working model assignment is Claude Opus for architecture/recon work and Claude Sonnet for implementation work, but the checklist remains valid if models change.

## Core workflow

```text
requirements + research + plan
        ↓
implementation notes / current-code recon
        ↓
Milestone A: shared topology + Sweep + SDF
        ↓
technical comparison
        ↓
PLAYER BROWSER COMPARISON
        ↓
04-sweep-vs-sdf-spike-results.md
        ↓
architecture decision
        ↓
update plan + implementation notes
        ↓
Milestone B in small implementation slices
        ↓
PLAYER BROWSER VERIFICATION
        ↓
V1 cleanup + Cave V2 completion
```

## Working Documents

| Document | Purpose | Status |
|---|---|---|
| `01-problem-and-requirements.md` | Cave V2 problem, target experience, requirements and future topology constraints. | `done for current planning` |
| `02-generation-techniques-research.md` | Research and comparison of cave geometry/representation techniques. | `done` |
| `03-advanced-sweep-vs-sdf-spike-research.md` | Seedvale-focused Sweep vs SDF comparison and shared spike definition. | `done` |
| `04-sweep-vs-sdf-spike-results.md` | Technical measurements, player observations and architecture decision from Milestone A. | `technical comparison complete, manual comparison required` |
| `docs/plans/world-terrain-008-underground-caves-v2.md` | Production Cave V2 plan and architecture gate. | `Milestone A implemented, awaiting player decision` |
| `docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-implementation-notes.md` | Exact current-code integration map for implementation agents. | `done` |

## Rules

- The current repository is the source of truth.
- Separate cave topology/data from spatial representation and runtime presentation.
- Prefer extending existing Seedvale systems over creating parallel systems.
- Preserve deterministic generation and world independence from the player.
- Treat collision, camera, streaming and performance as design constraints, not post-processing.
- Do not introduce a new system solely to solve a problem already owned elsewhere.
- Do not commit to a production generation technique before the Milestone A comparison and player gate.
- Do not rebuild the full cave feature during the spike.
- Keep fauna, loot, quests and persistence out of the geometry experiments unless required to validate an architectural decision.
- Keep the checklist synchronized with actual progress; do not mark browser verification complete unless the player performed it.

## Exit Criteria

The Cave V2 design/implementation workflow is complete when:

1. Milestone A has compared both viable representations under common conditions.
2. The player has manually evaluated both variants.
3. The architecture decision is recorded in `04-sweep-vs-sdf-spike-results.md` and the implementation plan.
4. Milestone B uses the selected representation rather than preserving parallel production approaches.
5. Production geometry, entrance, spatial queries, collision, camera, streaming and lifecycle satisfy the plan.
6. Obsolete V1 geometry and disposable spike code are removed.
7. Technical verification passes.
8. Final browser verification is completed by the player.

## Existing Material

Earlier cave research also exists under `docs/research/`. Treat it as input rather than automatically current truth.

Relevant implementation/project documentation should be checked during recon, especially `docs/STATE.md`, `docs/plans/PLANNING.md`, `docs/plans/README.md`, the Cave V2 plan, implementation notes, and current cave-related source files.
