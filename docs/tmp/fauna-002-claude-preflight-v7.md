# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/fauna-002-livestock-food-production.md`
Implementation notes: `docs/plans/implementation-notes/fauna-002-livestock-food-production-implementation-notes.md`
HEAD: efffef9 | branch: main
Working tree: HAS CHANGES — preserve them

## Relevant files

- `docs/architecture/ARCHITECTURE.md`
- `docs/plans/LOOSE-ENDS.md`
- `docs/items/CATALOG.md`

## Limited text-search fallback

- `ItemKind`
  - src/ai/NpcAgent.ts:8:import type { ItemKind } from '../items/items'
  - src/ai/NpcAgent.ts:558:const FISH_YIELD_KINDS: readonly ItemKind[] = ['fish']
  - src/ai/NpcAgent.ts:580:/** Helper resource delivery (plan 167) — the concrete `ItemKind` a
- `startCookAt`
  - src/app/actions/survivalActions.ts:55:  startCookAt: (fire: VillageFire) => void
  - src/app/actions/survivalActions.ts:212:  const startCookAt = (fire: VillageFire): void => {
  - src/app/actions/survivalActions.ts:400:    startCookAt,
- `startIgniteFire`
  - src/app/actions/survivalActions.ts:54:  startIgniteFire: (fire: VillageFire) => void
  - src/app/actions/survivalActions.ts:139:  const startIgniteFire = (fire: VillageFire): void => {
  - src/app/actions/survivalActions.ts:399:    startIgniteFire,

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
