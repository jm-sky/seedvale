# Seedvale — Claude Code Guide

Seedvale is a browser-based 3D sandbox/simulation. The player participates in a living world rather than driving it.

This file defines how Claude Code should navigate and modify the repository.

## Source of truth

When sources disagree, prefer:

1. Current source code
2. Tests and build/type configuration
3. Implementation notes and reviews
4. Implementation plans
5. State and architecture documentation
6. Vision and roadmap

Documentation describes intended or observed behaviour. **The current code is authoritative.**

Never assume a planned or documented feature exists. Verify it.

---

## Task routing

Do not read the repository broadly at the start of a task. Narrow the problem progressively.

For non-trivial work:

1. Read the relevant part of `docs/CODE_INDEX.md` to identify the primary file(s).
2. Read the relevant part of `docs/STATE.md` to understand current system boundaries and invariants.
3. Check `docs/plans/README.md` for active/planned work and dependencies.
4. If a relevant plan exists, read the complete plan.
5. Read `--implementation-notes.md` and linked reviews when present.
6. Inspect the actual source code and verify that the plan/documentation still matches it.
7. Read architecture/domain documentation only when the task or code requires it.
8. Read `docs/VISION.md` only when the task involves gameplay or design decisions.

Do not load large unrelated documents or source trees when targeted navigation is sufficient.

### Navigation flow

```text
task
  ↓
CODE_INDEX.md
  ↓
STATE.md
  ↓
plans/README.md
  ↓
relevant plan + notes/reviews
  ↓
source code
  ↓
symbols/dependencies when needed
  ↓
architecture/domain docs when needed
```

---

## Documentation map

| File                          | Use for                                               |
| ----------------------------- | ----------------------------------------------------- |
| `docs/CODE_INDEX.md`          | First-file routing and semantic code ownership        |
| `docs/STATE.md`               | Current implementation state and important boundaries |
| `docs/plans/README.md`        | Plan status, dependencies and priorities              |
| `docs/plans/`                 | Detailed implementation plans                         |
| `docs/code-map/symbols/`      | Symbol → source-file navigation                       |
| `docs/code-map/dependencies/` | Imports, importers and dependency relationships       |
| `docs/architecture/`          | Architectural constraints and system relationships    |
| `docs/reviews/`               | Implementation and performance findings               |
| `docs/VISION.md`              | Intended game direction and gameplay design           |

`CODE_INDEX.md` is a routing index, not a complete repository map.

The code map is a navigation aid, not a source of truth.

---

## Code navigation

Prefer targeted navigation.

When working on an existing system:

1. Open the `CODE_INDEX` entry point.
2. Follow the relevant control/data flow.
3. Identify the owner of the state and lifecycle.
4. Inspect relevant callers and consumers.
5. Expand into adjacent systems only when necessary.

Use `code-map/symbols/` when you know a symbol but not its file.

Use `code-map/dependencies/` when you need to understand importers, callers or centrality.

If the indexes are insufficient, search the source directly.

---

## Plans

Plans describe intended work, not current implementation.

Before implementing a substantial plan:

1. Read the complete plan.
2. Read `--implementation-notes.md` when present.
3. Read linked reviews.
4. Verify important assumptions against current code.
5. Adapt the implementation if the repository has evolved.
6. Keep the implementation scoped to the plan.

Do not force current code back into an outdated plan structure.

Record useful but out-of-scope discoveries in `docs/plans/LOOSE-ENDS.md` instead of expanding the current task.

---

## Engineering rules

### Reuse existing systems

Before creating a new abstraction, service, manager, event channel, state container or utility:

* search for an existing mechanism,
* identify its owner,
* determine whether it can be extended.

Prefer extending existing systems over creating parallel mechanisms.

Avoid abstractions that exist only for hypothetical future needs.

### Simulation

Authoritative simulation state must remain separate from Three.js runtime objects.

Runtime objects are projections of simulation state, not a second source of truth.

Entity identity must survive runtime lifecycle changes such as:

* unload/reload,
* chunk rebuilds,
* rendering reconstruction,
* save/load,
* time-skip.

Do not use transient runtime object identity as persistent entity identity.

The world simulation must not depend on the player or camera being present.

### Determinism

Preserve deterministic simulation.

Avoid introducing:

* frame-rate-dependent simulation,
* uncontrolled randomness,
* order-dependent behaviour where ordering matters,
* different rules for normal progression and time-skip.

### Lifecycle

Before changing creation, destruction, rebuild or persistence behaviour, identify:

* who owns the state,
* who owns the runtime representation,
* who owns the lifecycle,
* who performs cleanup.

---

## Performance

Performance is a first-class constraint.

Before adding recurring work, consider:

* update frequency,
* entity/chunk count,
* draw calls,
* geometry complexity,
* allocations and GC,
* worker communication,
* serialization,
* off-screen simulation cost.

Prefer lower-frequency updates, batching, lazy evaluation, caching and existing pipelines before adding per-frame work.

Do not move work to a worker mechanically. Account for worker overhead and data transfer.

For rendering changes, consider draw calls and geometry before assuming simulation is the bottleneck.

---

## Architecture invariants

Read `docs/architecture/ARCHITECTURE.md` when touching architecture, world lifecycle or shared runtime boundaries.

Important invariants:

* `WorldBundle` is the world lifetime/rebuild boundary.
* Authoritative state is not duplicated into Three.js objects.
* Entity identity survives runtime lifecycle changes.
* Time-skip follows the same simulation semantics as normal progression.
* Persistence currently uses save v1; do not add migration/version compatibility unless explicitly required.
* Split files by ownership boundaries, not by line count alone.

---

## Gameplay and design

Read `docs/VISION.md` when the task involves:

* new gameplay,
* progression,
* balancing,
* player experience,
* simulation design,
* a new system whose intended behaviour is not already established.

For implementation-only work, do not load the entire Vision document.

Prefer established game rules and existing patterns over inventing new ones.

---

## Verification

Distinguish between:

* **Implemented** — code was changed.
* **Technically verified** — relevant automated checks pass.
* **Browser/manual verified** — actual gameplay or visual behaviour was observed.

Do not claim gameplay or visual correctness from technical checks alone.

Use the smallest relevant verification set.

Typical checks:

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run build
pnpm run test
```

Do not automatically run every expensive check when targeted verification is sufficient.

For Three.js visual/gameplay changes, use the project's browser verification workflow when required. Do not launch headless browser automation by default.

---

## Generated documentation

Generated documentation must be regenerated rather than manually maintained.

Code maps live under:

```text
docs/code-map/
```

Regenerate documentation with:

```text
pnpm docs:sync
```

`docs/CODE_INDEX.md` contains manually maintained sections and a generated AI navigation section.

The section between:

```text
<!-- AI_NAVIGATION_INDEX_START -->
```

and:

```text
<!-- AI_NAVIGATION_INDEX_END -->
```

is generated.

If generated navigation is wrong, fix the generator rather than manually correcting its output.

---

## Documentation maintenance

Update documentation when implementation makes existing documentation stale.

Do not duplicate implementation details across multiple documents.

Prefer the document that owns the information.

Update:

* `docs/STATE.md` when current system state changes,
* plans when implementation status changes,
* reviews when performing the corresponding review,
* asset documentation when assets actually change.

---

## Assets

When a feature requires new media, update:

* `docs/assets/MODELS.md`
* `docs/assets/SOUNDS.md`

Do not modify these files when no new assets are required.

Local assets not stored in the repository are documented in:

```text
docs/assets/LOCAL_ASSETS.md
```

---

## Git

Work directly on `main`.

Before pushing:

```text
git pull --rebase origin main
```

Never force-push.

Never use `git reset --hard` to resolve conflicts or discard work.

Preserve existing changes, including automated commits that update generated documentation or plan files.

For completed work:

1. implement,
2. verify,
3. commit,
4. push.

Keep commits focused on the requested task.

---

## Final rule

Prefer the **smallest correct change** that:

* reuses existing mechanisms,
* preserves deterministic simulation,
* respects ownership and lifecycle boundaries,
* maintains performance,
* avoids unrelated refactoring,
* and remains easy for future agents to navigate.

**Find the correct owner, verify the current code, make the smallest coherent change, and do not create a parallel system.**
