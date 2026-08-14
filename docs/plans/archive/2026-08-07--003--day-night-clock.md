# Plan: zegar świata — dzień / noc

**Status:** `done` (5/5) — zegar/sky/HUD + NPC sen zależny od pory + persystencja `timeOfDay` w save zaimplementowane 2026-08-09 i zweryfikowane.
**Created:** 2026-08-07  
**Priority:** polish po v0.2  

## Potrzeba

Zegar świata odwzorowujący **pory dnia i nocy**.

## Zrobione (2026-08-07)

- [x] `WorldClock` / `dayNight.ts` — `timeOfDay`, `dayLengthSec` (~8 min)
- [x] Napęd sky + sun/ambient/hemi + fog
- [x] HUD zegar + nazwa pory
- [x] NPC sen zależny od pory (2026-08-09) — `NpcAgent.ts`: nowe fazy `goSleep`/`sleep`, przy `choose` w nocy (i nie `night_owl`) NPC idzie do domu i śpi zamiast realizować potrzeby; budzi się o świcie. Noc/dzień per osada liczona z `Settlement.setDayNight`'s `t` (próg `NPC_SLEEP_NIGHT_THRESHOLD = 0.6`, `src/settlement/createSettlement.ts`), forwardowane do `agent.update(dt, observerPos, isNight)`.
- [x] Persystencja `timeOfDay` w save (2026-08-09) — `SaveData` v5 (`persistence/saveData.ts`, migracja v1-v4→v5 z domyślnym `timeOfDay = 0.32`), `createApp.ts` inicjalizuje `createDayNightState({ timeOfDay: initialSave.timeOfDay })` z zapisu.
