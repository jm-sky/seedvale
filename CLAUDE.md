# Seedvale — Agent Guide

Seedvale is a browser-based 3D sandbox/simulation. The player participates in a living world rather than driving it.

## Source of truth

When sources disagree, trust them in this order:

1. **Current code**
2. **Tests / build configuration**
3. **Implementation notes / reviews**
4. **Plans**
5. **Roadmap / Vision**

Never assume a planned feature exists. Verify the current implementation.

## Before changing code

For non-trivial work:

1. Read the relevant part of `docs/STATE.md`.
2. Check `docs/plans/README.md` and the relevant plan if one exists.
3. Check relevant architecture/state documentation.
4. Use the code map to locate the implementation.
5. Inspect the actual code before deciding how to implement the change.

Do not read large amounts of unrelated documentation or source code when the indexes/maps can narrow the search.

## Code navigation

Use the documentation and generated code map as a routing system:

```text
documentation README/index
        ↓
docs/CODE_INDEX.md
        ↓
code-map/symbols/
        ↓
specific source file
        ↓
code-map/dependencies/   ← callers/importers when needed
```

* `docs/CODE_INDEX.md` provides semantic system ownership and important entry points.
* `docs/code-map/symbols/` maps exported symbols to source files.
* `docs/code-map/dependencies/` maps imports and dependants.
* README indexes provide local documentation navigation.
* If the map is insufficient, use targeted search in `src/`.
* Avoid broad `src/` scans when the map can narrow the search.
* The code map is a navigation aid, not a source of truth.

Regenerate generated documentation with:

```text
pnpm docs:sync
```

Generated sections between `AUTO-GENERATED:START` and `AUTO-GENERATED:END` must not be edited manually.

## Core engineering rules

* Extend existing systems before creating parallel mechanisms.
* Reuse existing types, lifecycle boundaries and shared state.
* Keep authoritative simulation state separate from Three.js runtime objects.
* Preserve stable entity identity across unload/reload/rebuild.
* The world must continue operating independently of the player or camera.
* Prefer deterministic, event-driven, lazy or batched simulation over unnecessary per-frame work.
* Consider off-screen/remote simulation and higher-fidelity simulation only where justified.
* Keep the main thread responsive. Use existing worker pipelines for CPU-heavy data-only work when worker overhead is justified.
* Do not introduce multiplayer/netcode now, but avoid architectural decisions that unnecessarily prevent a future small shared-world model.
* Do not introduce a new abstraction merely to hide a small amount of existing logic.

## Architecture invariants

Read `docs/architecture/ARCHITECTURE.md` when touching architecture or world lifecycle.

Important invariants:

* `WorldBundle` is the world lifetime/rebuild boundary.
* Runtime objects are reconstructed from authoritative state; they are not a second owner of that state.
* Entity identity survives runtime lifecycle changes.
* Time-skip must use the same simulation semantics as normal progression.
* Persistence is currently save v1 only; do not add migration/version compatibility unless explicitly planned.
* Split large files by real ownership boundaries, not by LOC alone.

## Performance

Performance is a first-class constraint.

Before adding work, consider:

* update frequency,
* entity/chunk count,
* memory and GC,
* rendering/draw-call cost,
* worker communication,
* off-screen simulation cost.

Do not move code to a worker mechanically. Prefer batching, lazy evaluation, lower-frequency updates and existing pipelines where appropriate.

## Plans

For substantial work:

1. Read the complete plan.
2. Read `--implementation-notes.md` when present.
3. Read linked reviews.
4. Verify the plan against current code.
5. Keep implementation scoped to the plan.
6. Record out-of-scope blockers or ideas in `docs/plans/LOOSE-ENDS.md`.
7. Run appropriate verification.

Plans describe intended work, not current implementation.

## Verification

Separate these states:

* **Implemented** — code change exists.
* **Technically verified** — tests/type-check/lint/build pass.
* **Browser/manual verified** — gameplay or visual behaviour was actually observed.

Typical technical checks:

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run build
pnpm run test
```

Do not claim visual or gameplay correctness from technical checks alone.

For Three.js visual/gameplay changes, use the browser verification workflow described in the relevant project documentation. Do not launch headless browser automation by default.

## Documentation

Keep documentation synchronized with implementation.

Important entry points:

* `docs/STATE.md` — current implementation state
* `docs/CODE_INDEX.md` — semantic code ownership
* `docs/code-map/` — generated symbol/dependency maps
* `docs/plans/README.md` — plan status and priorities
* `docs/plans/` — implementation plans
* `docs/architecture/` — architectural constraints
* `docs/reviews/` — implementation/performance reviews

Use the relevant local README/index before opening an entire documentation directory.

## Assets

When a feature requires new media, update:

* `docs/assets/MODELS.md`
* `docs/assets/SOUNDS.md`

Do not modify these lists when no new assets are required.

You can find information about local assets (not stored in the repository) in `docs/assets/LOCAL_ASSETS.md`.

## Git

Work directly on `main`.

Before pushing:

```text
git pull --rebase origin main
```

Never force-push or use `git reset --hard` to resolve conflicts. Preserve other contributors' changes.

Finished work should be committed and pushed to `main`.

Expect automated commits that may update generated plan documentation.

## Final rule

Prefer the smallest change that strengthens existing systems, preserves deterministic simulation, keeps the world independent of the player, and remains cheap for future agents to understand and navigate.
