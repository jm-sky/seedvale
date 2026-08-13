# Plan: Fauna GLB, held farm tools, lights, death VFX

**Created:** 2026-08-13  
**Status:** `verification needed`  
**Priority:** medium · **Effort:** L  
**Depends on:** ~~082~~ ~~085~~

## Cel

Podpiąć `blood_splat.glb` przy śmierci zwierząt; GLB kury/owcy/krowy/konia/osła
zamiast simple-poly w wiosce; holdable sierp i widły; większy krąg ogniska i
pochodni; płomień+iskry i PointLight na czubku gałęzi/pochodni w ręce.

## Fazy

1. Blood splat na `AnimalAgent.collapse()` — sibling w scenie, nie child tipped mesh.
2. Livestock GLB + nowy `AnimalKind` `donkey`.
3. Sierp/widły `HeldTool` + melee 12/14.
4. Campfire 6/16, village torch 3.2/14.
5. `SHOW_HAND_FLAME_VISUAL`, zunifikowany attach, offset na tip. Zamyka plan 085.

## Weryfikacja techniczna

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`

## Manual (browser)

1. Zabij zwierzę → splat na ziemi; znika z ciałem / po zakopaniu.
2. Wioska: kura/owca/krowa/koń/osioł to GLB (koń przy wozie bez regresji).
3. Weź sierp/widły → mesh w `WristR`; `[E]` na zwierzęciu zadaje melee.
4. Noc: ognisko i pochodnie wioski — większy krąg światła.
5. Zapal gałąź / pochodnię: płomień+iskry na czubku, hotspot nie przy dłoni.
