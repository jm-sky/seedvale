# Plan: zegar świata — dzień / noc

**Status:** `in progress` (3/5) — zegar/sky/HUD zrobione; NPC sen zależny od pory i persystencja `timeOfDay` w save nadal nie zaimplementowane (patrz checklist niżej, oba świadomie oznaczone "później" w oryginalnym planie, ale nigdy nie wykonane — zweryfikowane 2026-08-08).  
**Created:** 2026-08-07  
**Priority:** polish po v0.2  

## Potrzeba

Zegar świata odwzorowujący **pory dnia i nocy**.

## Zrobione (2026-08-07)

- [x] `WorldClock` / `dayNight.ts` — `timeOfDay`, `dayLengthSec` (~8 min)
- [x] Napęd sky + sun/ambient/hemi + fog
- [x] HUD zegar + nazwa pory
- [ ] NPC sen zależny od pory (później)
- [ ] Persistencja `timeOfDay` w save
