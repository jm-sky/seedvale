# Seedvale

Seedvale is a browser-based 3D sandbox: a procedurally generated world with settlements, NPCs and wildlife, built with **Three.js + WebGL2 + Vite + TypeScript**. The player explores and participates in a world that keeps existing and changing on its own. Full product vision: [docs/VISION.md](docs/VISION.md).

## Current state (short version)

The project is well past the original terrain-and-walking spike. Implemented today: procedural chunked terrain with streaming, villages with NPC needs/schedules/dialogue and a household economy, predator/prey fauna with herds, player inventory/items/survival needs, a multi-stage quest system, and IndexedDB save/continue. This README doesn't track that in detail — [docs/STATE.md](docs/STATE.md) does, and is kept current.

## Running it

```bash
pnpm install
pnpm run dev
```

Dev server runs on port `5577` (`vite.config.ts`, `strictPort`).

```bash
pnpm run build      # type-check (vue-tsc) + production build
pnpm run preview    # preview a production build
pnpm run test       # unit tests (Vitest)
pnpm run lint:fix   # ESLint
```

## Where to look next

| Question | Document |
|---|---|
| What exists in the code right now? | [docs/STATE.md](docs/STATE.md) |
| What is Seedvale trying to be? | [docs/VISION.md](docs/VISION.md) |
| Where is the project headed? | [docs/ROADMAP.md](docs/ROADMAP.md) |
| How is it architected? | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| What's being worked on? | [docs/plans/README.md](docs/plans/README.md) |
| Full documentation hub | [docs/README.md](docs/README.md) |

Agents (Claude Code, Cursor, etc.) working in this repo should read [CLAUDE.md](CLAUDE.md) first — it sets the read order, plan-execution rules, and workflow conventions.
