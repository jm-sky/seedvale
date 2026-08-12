# Seedvale — Agent Guide

Seedvale is a browser 3D sandbox built with **Three.js + WebGL2 + Vite + TypeScript**. The simulation/game layer is vanilla Three.js; UI is currently hybrid vanilla DOM + Vue 3/Tailwind v4.

## Read order

Before making a non-trivial change:

1. **[docs/STATE.md](docs/STATE.md)** — factual current implementation state.
2. **[docs/VISION.md](docs/VISION.md)** — product intent and architectural philosophy.
3. **[docs/plans/README.md](docs/plans/README.md)** — current plan/status index.
4. The selected plan, its implementation notes, and any linked review.

`docs/STATE.md` is the compact handoff for the codebase. Do not reconstruct the whole project from old plans when the state document already answers the question.

## Core principles

- Seedvale is about a world that lives independently of the player. Prefer systems that create emergent behaviour over scripted player-centric flows.
- Extend existing system couplings before creating parallel mechanisms.
- Reuse shared domain types and lifecycle boundaries. In particular inspect `WorldBundle`, `HealthState`, `NpcAgent`, `AnimalAgent`, `Inventory`, `QuestManager` and `ChunkManager` before introducing new abstractions.
- Keep the simulation/game layer vanilla Three.js. Do not introduce React/R3F or another rendering abstraction unless explicitly planned.
- UI migration to Vue is incremental. Do not migrate or rewrite unrelated vanilla screens just because Vue exists.
- Do not infer that a planned feature is implemented. Verify the code.
- Do not mark visual Three.js work as fully verified solely because TypeScript/lint/build pass.
- **Performance is an architectural constraint.** Keep the main thread responsive; prefer event-driven/batched simulation and use workers for CPU-heavy, data-oriented work when the cost of worker communication is justified. See [Performance & Simulation Architecture](docs/architecture/performance-and-workers.md).

## Development

```text
npm run dev
```

The Vite dev server uses port `5577` with `strictPort` (`vite.config.ts`).

### Asset lists (models & sounds)

When planning or implementing a feature, review and update the living asset backlogs if the work needs new media:

- [docs/assets/MODELS.md](docs/assets/MODELS.md) — required / not-yet-wired models
- [docs/assets/SOUNDS.md](docs/assets/SOUNDS.md) — required / not-yet-wired sounds

If the feature needs a new model or sound, add (or update) a row during planning/implementation. If nothing new is needed, leave the lists unchanged. Credits for models already in the repo live in [docs/assets/CREDITS.md](docs/assets/CREDITS.md); sound file sources in [`public/sounds/README.md`](public/sounds/README.md). Folder index: [docs/assets/README.md](docs/assets/README.md).

Technical verification normally includes:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

For `.vue` files, `npm run build` uses `vue-tsc`. Unit tests use Vitest (`*.test.ts`). Current unit coverage is primarily pure logic rather than Three.js/DOM/`.vue` integration.

### Browser verification

Do **not** launch headless Chrome/Playwright yourself as the default way to test visual/gameplay changes. First run technical checks. If manual browser verification is needed, ask the user to test the already-running dev server and provide concrete steps and expected results.

## Documentation workflow

| Area | Source |
|---|---|
| Product vision | [docs/VISION.md](docs/VISION.md) |
| Current implementation state | [docs/STATE.md](docs/STATE.md) |
| Graphics decisions / visual contracts | [docs/GRAPHICS.md](docs/GRAPHICS.md) |
| Strategic roadmap | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Plan index/status | [docs/plans/README.md](docs/plans/README.md) |
| Implementation plans | [docs/plans/](docs/plans/) |
| Architecture | [docs/architecture/](docs/architecture/) |
| Issues | [docs/issues/README.md](docs/issues/README.md) |
| Reviews | [docs/reviews/README.md](docs/reviews/README.md) |
| Research | [docs/research/README.md](docs/research/README.md) |
| Required models / sounds | [docs/assets/MODELS.md](docs/assets/MODELS.md), [docs/assets/SOUNDS.md](docs/assets/SOUNDS.md) |

Statuses are: `todo` · `planned` · `in progress` · `done` · `verification needed`.

New issue/plan/review/research files use `YYYY-MM-DD--NNN--slug.md` with an independent sequence per document type.

## Plan execution rules

1. Do not implement a large change from the plan title alone.
2. Read the complete plan.
3. Read implementation notes if present.
4. Read linked review material before implementation; review findings are actionable constraints, not background commentary.
5. Inspect the actual code paths named by the plan. If the repository differs from the plan, trust the code and update the plan/notes as appropriate.
6. Keep the change scoped to the plan. Do not opportunistically redesign unrelated systems.
7. If the plan needs new models or sounds, update [docs/assets/MODELS.md](docs/assets/MODELS.md) / [docs/assets/SOUNDS.md](docs/assets/SOUNDS.md) as part of the work (skip when no new assets are required).
8. Run the relevant technical checks.
9. Clearly separate **implemented**, **technically verified**, and **browser/manual verified**.

## Important architecture

The core world lifetime is grouped in `src/app/worldBundle.ts` as `WorldBundle`. `rebuildWorldBundle()` disposes and recreates its members while mutating the same bundle object. Code that must survive a world rebuild should capture the bundle object and read fields through it; do not destructure a replaceable member into a stale closure.

Important entry points:

```text
src/app/createApp.ts
src/app/gameLoop.ts
src/app/worldBundle.ts
src/config/worldConfig.ts
src/terrain/chunkManager.ts
src/terrain/chunkEnvironment.ts
src/settlement/SettlementsManager.ts
src/settlement/createSettlement.ts
src/ai/NpcAgent.ts
src/ai/Needs.ts
src/fauna/AnimalAgent.ts
src/fauna/HealthState.ts
src/items/Inventory.ts
src/quests/QuestManager.ts
src/persistence/saveData.ts
src/persistence/saveDb.ts
src/ui/
src/ui-vue/
```

## Current configuration / stack facts

- Three.js + WebGL2, Vite, TypeScript.
- `simplex-noise` and `lil-gui` are used by the world/config layer.
- Vue 3 + Tailwind v4 + `lucide-vue-next` are used by the current Vue UI overlay.
- Vue is mounted through `src/ui-vue/mount.ts` into `#vue-ui`.
- IndexedDB persistence lives in `src/persistence/`.
- World configuration is merged from URL/localStorage/defaults; inspect `src/config/worldConfig.ts` before changing precedence or save compatibility.

## When changing architecture

Before introducing a new cross-system service, ask:

- Does an existing manager/agent already own this responsibility?
- Can the existing shared type be extended instead?
- Does the new lifecycle match `WorldBundle`?
- Does the change need persistence?
- Does it need to work when the player is far away from the relevant world location?
- Does it create a second implementation of an existing mechanic?
- **Does the work need frame-rate resolution, or can it be event-driven, lazy or batched?**
- **Can CPU-heavy data-only work reuse an existing worker pipeline without unnecessary serialization/synchronization cost?**

Prefer a small, explicit seam over a new generic framework.

## Truth hierarchy

For implementation questions:

1. **Current code** — what actually exists.
2. **Tests/build configuration** — what is mechanically verified.
3. **Implementation notes/reviews** — known decisions and constraints.
4. **Plan** — intended implementation.
5. **Roadmap/Vision** — product direction, not implementation evidence.

When documentation and code disagree, do not silently assume the documentation is correct. Call out the discrepancy and update the appropriate document when part of the task.
