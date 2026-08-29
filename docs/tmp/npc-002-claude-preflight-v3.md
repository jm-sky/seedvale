Already up to date
Done in 296ms using pnpm v11.20.0
# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/npc-002-npc-healing.md`
Implementation notes: `docs/plans/implementation-notes/npc-002-npc-healing-implementation-notes.md`
HEAD: d0aa3e1 | branch: main
Working tree: HAS CHANGES — preserve them

Plan sections: Cel · Kluczowa zasada: niskie HP ≠ potrzeba leczenia · Przygotowanie pod przyszłe injuries / conditions · Źródła obrażeń · Consumables · Kiedy NPC powinien się leczyć? · Walka · Leczenie poza walką · Gdzie NPC się leczy? · Wykonanie leczenia · Priorytet wobec Hunger / Thirst · Integracja z przyszłymi injuries · Zakres implementacyjny · Przypadki do sprawdzenia · Weryfikacja techniczna

## Relevant files
- `src/shared/HealthState.ts`
- `src/ai/Needs.ts`
- `src/items/itemCatalog.ts`
- `src/app/actions/survivalActions.ts`
- `src/ai/NpcAgent.ts`

## Limited text-search fallback

- `HealthState`
  - src/ai/npcCombat.ts:13: * phase, `HealthState`/target-owner death consequences stay with the target.
  - src/ai/npcCombat.ts:126: *  `finalDamage` to `HealthState` itself (this stays a pure resolver, no
  - src/ai/npcCombat.ts:127: *  `HealthState` import). `defenseSkillValue` defaults to `0` (no bonus) —

## Recommended reads
- `src/shared/HealthState.ts`
- `src/ai/Needs.ts`
- `src/items/itemCatalog.ts`
- `src/app/actions/survivalActions.ts`
- `src/ai/NpcAgent.ts`

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
