Already up to date
Done in 297ms using pnpm v11.20.0
# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/npc-002-npc-healing.md`
Implementation notes: `docs/plans/implementation-notes/npc-002-npc-healing-implementation-notes.md`
HEAD: afaece8 | branch: main
Working tree: HAS CHANGES — preserve them

## Relevant files

- `src/shared/HealthState.ts`
- `src/ai/Needs.ts`
- `src/items/itemCatalog.ts`
- `src/app/actions/survivalActions.ts`
- `src/ai/NpcAgent.ts`

## Limited text-search fallback

- `HealthState`
  - src/ai/npcStamina.test.ts:2:import { createHealthState, damageHealth, isAlive } from '../shared/HealthState'
  - src/ai/npcVigor.test.ts:2:import { createHealthState, damageHealth, isAlive } from '../shared/HealthState'
  - src/app/actions/gatheringActions.ts:12:import { damageHealth } from '../../shared/HealthState'

## Recommended reads

- `src/shared/HealthState.ts`
- `src/ai/Needs.ts`
- `src/items/itemCatalog.ts`
- `src/app/actions/survivalActions.ts`
- `src/ai/NpcAgent.ts`

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
