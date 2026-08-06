# Plan: zegar świata — dzień / noc

**Status:** `planned`  
**Created:** 2026-08-07  
**Priority:** polish po v0.2 (osada już „żyje”); tani wow + gameplay hooks  

## Potrzeba

Zegar świata odwzorowujący **pory dnia i nocy** — słońce/niebo nie tylko z GUI, tylko płynnie w czasie gry.

## Zakres (szkic)

| Element | Opis |
|---------|------|
| **World clock** | `timeOfDay ∈ [0,1)` lub minuty w dobie; prędkość (np. 1 dzień = 10–20 min real) |
| **Sun drive** | `inclination` / `azimuth` (lub kąt elewacji) z zegara → `createSky.setParams` + światło |
| **Ambient / hemi** | noc = chłodniejsze, słabsze; świt/zmierzch = warm tint |
| **Fog** | lekka zmiana koloru/gęstości nocą |
| **HUD (opcjonalnie)** | prosty wskaźnik godziny — łączy się z [game-ui-screens](./2026-08-07-game-ui-screens.md) |
| **NPC (później)** | sen / inne potrzeby zależne od pory |

## Poza zakresem na start

- Pełny kalendarz / pory roku  
- Księżyc z fazami (może później)  
- Real-time sync z zegarem systemowym  

## Persistencja

Zapis `timeOfDay` w save (gdy będzie [streaming + persistence](./2026-08-07-world-streaming-persistence.md)).

## Trigger

Po stabilnym v0.2 albo gdy sky/GUI przestanie wystarczać do dema „żywej” doliny.
