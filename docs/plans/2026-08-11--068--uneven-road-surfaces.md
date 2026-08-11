# Plan: Nierówne drogi (dziury + krawędzie)

**Status:** `done`
**Created:** 2026-08-11
**Priority:** ⚪ low · **Effort:** S · **Depends on:** ~~026~~

## Cel

Drogi/ścieżki mają wyglądać mniej „linijkowo”: rzadkie lekkie zagłębienia w nawierzchni oraz falujące krawędzie korytarza; trasy A* dostają lekki meander osi.

## Kontekst

Brak osobnego road mesha — korytarze to blend w `chunkHeightmap.ts` (`roadCandidate`) wokół polyline z `roadNetwork.ts` (`findRoute`). Idealna kapsuła + prostoliniowe segmenty dają zbyt równy wygląd.

## Zakres

1. **Edge wobble** — modulacja `halfWidth` simplexem w `roadCandidate` (tint + height razem).
2. **Sparse potholes** — rzadkie obniżenie `targetH` w centrum korytarza; ścieżki słabsze przez `heightStrength` blendu.
3. **Meander** — po A*, przed `smoothProfile`, offset punktów wewnętrznych wzdłuż normalnej; endpointy bez zmian.
4. Knoby w `region.roadNetwork` + GUI Roads.
5. Szerszy AABB margin przy `segmentsNear` / village paths pod max wobble.

Clearings bez zmian. Bez osobnego mesha / mostów / zmiany kosztów A*.

## Implementacja (2026-08-11)

- `src/terrain/chunkHeightmap.ts` — `roadDetail` noise, edge wobble + potholes w `roadCandidate`
- `src/settlement/roadNetwork.ts` — `meanderRoute`, margin pod wobble
- `src/config/worldConfig.ts` + `src/ui/createDebugGui.ts` — knoby; fix `applyStoredTerrain` nested merge (stale localStorage nie gubi nowych pól)
- Testy: `chunkHeightmap.test.ts`, `roadNetwork.test.ts`, `worldConfig.test.ts`

## Weryfikacja

- [x] `npx tsc --noEmit`, `npm run lint`, `npm run test` (relevant)
- [x] Ręcznie: trakt między wioskami — falująca krawędź dirtu, lokalne dołki, lekko żywa oś; ścieżki wioski głównie wobble bez agresywnych dziur

## Powiązane

- [roads-and-paths](./2026-08-07--026--roads-and-paths.md)
