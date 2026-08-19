# 036 — Koń, wóz i sterta drewna bez kolizji

**Status:** `verification needed` — zaimplementowane 2026-08-19; browser: użytkownik.
**Created:** 2026-08-19
**Źródło:** playtest (przechodzenie przez propsy osady jak duch)

## Objaw / prośba

Koń kupca, wóz i sterta drewna nie miały collidersów. Gracz (i NPC/fauna) przechodzili przez mesh.

Rejestr (`ColliderRegistry`, plan 097) miał tylko studnię i ściany/drzwi domów.

## Naprawa

Ten sam kształt (koło XZ), bez silnika fizyki.

- Landmarki: `merchantWagon?`, `merchantHorse?`, `stockpileSecondary?`
- [`settlementPropColliders.ts`](../../src/settlement/settlementPropColliders.ts) — sterta 1.2, wóz/koń z `merchantWagon.ts` (2 / 1), ognisko wioskowe 0.6
- `createSettlement.registerSettlementColliders` dopina te dyski

NPC idący na `landmarks.stockpile` stają na obręczy (`applyRimDestination`).

Poza zakresem: równy pad pod ogniskiem ([037](./2026-08-19--037--village-campfire-flat-pad.md)), żywy inwentarz, palisada/beczki/siano/skrzynia/woodshed, capsule/OBB.

## Weryfikacja

Techniczna: `tsc` / `lint:fix` / `test` — zielona 2026-08-19.
Ręczna: podejść do sterty, wozu i konia kupca — ciało ma się zatrzymać; NPC drewna przy krawędzi, nie w meshu.
