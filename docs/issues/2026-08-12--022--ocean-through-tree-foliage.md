# Ocean / jeziora malują się przez korony drzew

**Status:** `done`
**Created:** 2026-08-12
**Updated:** 2026-08-12
**Źródło:** screen użytkownika — niebieskie fale oceanu widoczne na pierwszym planie przez czerwone liście klonu
**Potwierdzenie:** browser OK 2026-08-12. Trwałe reguły: [GRAPHICS.md](../architecture/GRAPHICS.md) G3–G5.

## Problem

Reflective ocean (`Water.js` / `createOcean.ts`) oraz stylized woda chunków (`createWater.ts`) przebijały się wizualnie przez korony drzew (maple/birch/bush z Ultimate Stylized Nature).

## Diagnoza

1. Materiały liści w GLB mają `alphaMode: BLEND` → GLTFLoader ustawia `transparent: true`, `depthWrite: false`.
2. Chunk water: `transparent: true` + **`depthWrite: true`** + `renderOrder: 1` — rysuje się po liściach i nadpisuje piksele, bo depth buffer nadal ma teren za koroną.
3. Ocean: `alpha: 0.95` w uniformie, ale `Water.js` **nie** ustawia `material.transparent`, więc blending i tak nie działał (osobny problem „przezroczystości”).

## Naprawa (2026-08-12)

- `hardenFoliageAlpha` w `world/foliageWind.ts` — BLEND liście/kwiaty → opaque `alphaTest` cutout (jednorazowo na shared GPU material przy loadzie GLB).
- Ocean: `transparent: true`, `depthWrite: false`, fresnel-modulated alpha w patchu shadera; mirror RT **512→256** (tańszy jedyny heavy pass oceanu).
- Chunk water: `depthWrite: false`, lekko niższe `uOpacity`.

## Weryfikacja w przeglądarce

1. Podejdź do brzegu oceanu z maple/birch na pierwszym planie (jak na screenie) — fale **nie** powinny malować się po liściach.
2. Spójrz na ocean z góry vs pod kątem — z góry bardziej prześwituje, edge-on gęstszy.
3. Jezioro: widać dno/terrain przez wodę; drzewa nad brzegiem nie są „dziurawe” wodą.
4. FPS przy brzegu nie powinien spaść (mirror mniejszy); idealnie lekki wzrost vs poprzednie 512.

## Poza zakresem

Miękki fade brzegu ocean/ląd (issue 003) — nadal wymaga heightmapy / shore maski na globalnym plane; ten fix tego nie zamyka.
