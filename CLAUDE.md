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
- Shader GLSL lives inside JS/TS template literals. Never put backticks or markdown in comments inside those strings: a backtick closes the template literal and is a syntax error.
- **Performance is an architectural constraint.** Keep the main thread responsive; prefer event-driven/batched simulation and use workers for CPU-heavy, data-oriented work when the cost of worker communication is justified. See [Performance & Simulation Architecture](docs/architecture/performance-and-workers.md).
- **Seedvale is single-player today; do not build multiplayer, netcode or WebSockets.** But keep decisions from foreclosing a later move to a small (~2–5 player) shared world with server-authoritative simulation: keep simulation state representable independently of Three.js/rendering objects and avoid baking in an implicit single-client owner of world state. See [Performance & Simulation Architecture](docs/architecture/performance-and-workers.md) and [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

## Development

```text
pnpm run dev
```

The Vite dev server uses port `5577` with `strictPort` (`vite.config.ts`).

### Asset lists (models & sounds)

When planning or implementing a feature, review and update the living asset backlogs if the work needs new media:

- [docs/assets/MODELS.md](docs/assets/MODELS.md) — required / not-yet-wired models
- [docs/assets/SOUNDS.md](docs/assets/SOUNDS.md) — required / not-yet-wired sounds
- [docs/items/CATALOG.md](docs/items/CATALOG.md) — item gameplay flags / hold / melee / roadmap (`src/items/itemCatalog.ts`)

If the feature needs a new model or sound, add (or update) a row during planning/implementation. If nothing new is needed, leave the lists unchanged. Credits for models already in the repo live in [docs/assets/CREDITS.md](docs/assets/CREDITS.md); sound file sources in [`public/sounds/README.md`](public/sounds/README.md). Folder index: [docs/assets/README.md](docs/assets/README.md).

Technical verification normally includes:

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run build
pnpm run test
```

For `.vue` files, `npm run build` uses `vue-tsc`. Unit tests use Vitest (`*.test.ts`). Current unit coverage is primarily pure logic rather than Three.js/DOM/`.vue` integration.

Don't lint/test/build changes made only to .md files in docs/ folder.

CI (`.github/workflows/ci.yml`) runs `type-check`, `lint`, `build` and `test` on every PR and on push to `main` as a verification gate — it does not replace running these locally before committing.

### Browser verification

Do **not** launch headless Chrome/Playwright yourself as the default way to test visual/gameplay changes. First run technical checks. If manual browser verification is needed, ask the user to test the already-running dev server and provide concrete steps and expected results.

In case of running benchmarks in browser - check `docs/performance/agent-browser-benchmarking.md`

## Documentation workflow

| Area | Source |
|---|---|
| Product vision | [docs/VISION.md](docs/VISION.md) |
| Current implementation state | [docs/STATE.md](docs/STATE.md) |
| Where a system lives in the code | [docs/CODE_INDEX.md](docs/CODE_INDEX.md) |
| Settlements / NPC life | [docs/state/settlements.md](docs/state/settlements.md) |
| Graphics decisions / visual contracts | [docs/architecture/GRAPHICS.md](docs/architecture/GRAPHICS.md) |
| Water (ocean + lakes + rivers) | [docs/state/water.md](docs/state/water.md) |
| Terrain/world generation (chunking, vegetation, mountains, weather) | [docs/state/terrain-and-world-generation.md](docs/state/terrain-and-world-generation.md) |
| Combat (melee/ranged, NPC combat, animal defense) | [docs/state/combat.md](docs/state/combat.md) |
| Player survival/world-object systems (needs, skills, wells, traps, planting) | [docs/state/player-systems.md](docs/state/player-systems.md) |
| Strategic roadmap | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Plan index/status | [docs/plans/README.md](docs/plans/README.md) |
| Loose ends found mid-plan (blockers, spun-off ideas, unfinished threads) | [docs/plans/LOOSE-ENDS.md](docs/plans/LOOSE-ENDS.md) |
| Implementation plans | [docs/plans/](docs/plans/) |
| Archived plans (frozen batch) | [docs/plans/archive/](docs/plans/archive/) |
| Architecture | [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md), [docs/architecture/](docs/architecture/) |
| Issues | [docs/issues/README.md](docs/issues/README.md) |
| Reviews | [docs/reviews/README.md](docs/reviews/README.md) |
| Research | [docs/research/README.md](docs/research/README.md) |
| Required models / sounds | [docs/assets/MODELS.md](docs/assets/MODELS.md), [docs/assets/SOUNDS.md](docs/assets/SOUNDS.md) |
| Item catalog (hold/melee/spawn) | [docs/items/CATALOG.md](docs/items/CATALOG.md) |
| Weapon stats / prices | [docs/items/WEAPONS.md](docs/items/WEAPONS.md) |
| Blender / MPFB2 AI character pipeline | [docs/blender/README.md](docs/blender/README.md) |

Statuses are: `todo` · `planned` · `in progress` · `done` · `verification needed`.

New plans files use `<domain>-<id>-<title>.md` with an independent sequence per domain.
New issue/review/research files use `YYYY-MM-DD--NNN--slug.md` with an independent sequence per document type.
New plans stay in `docs/plans/` regardless of status; `docs/plans/archive/` is a one-time freeze of the 2026-08-07–2026-08-14 batch.

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
10. If a side blocker, spun-off idea, or unfinished thread comes up that's out of scope for the current plan, add a one-line entry to [docs/plans/LOOSE-ENDS.md](docs/plans/LOOSE-ENDS.md) instead of expanding scope or silently dropping it.

## Git workflow for agents

`main` is the production branch — Cloudflare Pages deploys it automatically on every push. There is no separate deploy step to trigger; CI (see below) is the verification gate before/after a change lands, not a replacement for it.

- Committing is part of finishing a task, not an optional extra step — don't leave finished work uncommitted.
- Before pushing, sync with the remote (`git pull --rebase origin main`, or the current branch's upstream) rather than pushing on top of stale local history.
- Never use `git reset --hard` or force-push to resolve a rejected push or a conflict. Rebase, resolve conflicts normally, and keep other agents'/contributors' changes — do not silently overwrite them.
- If a push is rejected because `main` moved, rebase, re-resolve, re-run the relevant technical checks, then push again.
- Expect commits from Github workflow that update `docs/plans/README.md` and/or `docs/plans/PLANNED_PLANS_WITHOUT_NOTES.md`

## Important architecture

`WorldBundle` (`src/app/worldBundle.ts`) is the core world lifetime/rebuild boundary. The authoritative rebuild/lifetime rule (don't capture a replaceable bundle field in a stale closure) lives in [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) — "World lifecycle" / "Rebuild / lifetime invariants". Read it there; it is not restated here.

Entry points: the canonical, kept-current list is [docs/STATE.md](docs/STATE.md) — "Important code entry points".

### Architecture invariants that are easy to miss

- **Authoritative state is not runtime representation.** Streaming/rebuild must reconstruct runtime objects from authoritative state; runtime objects must not become a second owner.
- **Entity identity survives runtime lifecycle.** Unload/reload/rebuild must preserve stable entity identity rather than treating a new runtime object as a new entity.
- **Time-skip uses the same simulation semantics.** Do not add a separate accelerated simulation path that bypasses normal state transitions.
- **Persistence is currently save v1 only.** Do not add legacy save-version compatibility or migration unless explicitly planned.
- **Large files are not problems because of LOC alone.** Split by real responsibility/ownership boundaries; a coherent large coordinator may remain large.

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
