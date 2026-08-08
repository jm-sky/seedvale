# Plan: Kierunkowskazy przy drogach do wiosek

**Status:** `todo`
**Created:** 2026-08-08
**Scope:** rozszerza [roads-and-paths](./2026-08-07--026--roads-and-paths.md) (`roadNetwork.ts` — grafowanie osad, nazwane trasy) i [village-generation](./2026-08-08--031--village-generation.md) (`SettlementDef.name`)

## Skąd to się wzięło

Propozycja użytkownika po teście wiosek: przy drogach międzyosadowych postawić kierunkowskazy pokazujące, dokąd prowadzą (nazwa docelowej osady) — dziś gracz nie ma żadnej wskazówki poza wizualnym śledzeniem drogi (lub minimapą, jeśli osada jest już znana/widoczna).

## Stan obecny (dla kontekstu)

- `settlement/roadNetwork.ts` już zna pełny graf: `neighborsFor(cell, ctx)` (kandydaci-sąsiedzi wg realnego dystansu), `roadSegmentsForSettlement(def, ctx)` (faktycznie połączone drogi, do `maxNeighborRoads`), każda `SettlementDef` ma unikalną nazwę (`generateSettlementName`, `shared/SettlementName.ts`).
- Drogi są dziś **czysto terenowe** (spłaszczenie + tinting w `chunkHeightmap.ts`) — żadnych propsów/oznaczeń wzdłuż nich.
- Wzorzec etykiet w świecie: `.npc-label`/`CSS2DObject` (etykiety NPC, skalowane opacity z dystansem przez `labelOpacityForDistance`, `src/ui/labelDistance.ts`) — gotowy do reużycia dla tekstu kierunkowskazu zamiast wymyślania nowego systemu renderowania tekstu 3D.

## Koncepcja v1

**Jeden kierunkowskaz na drogę, przy krawędzi osady, z której droga wychodzi** — nie próbujemy jednego złożonego, wieloramiennego drogowskazu na skrzyżowaniu (prostsze, więcej propsów ale każdy trywialny).

1. **Pozycja i orientacja:** dla każdego `RoadSegment` (`kind: 'road'`) należącego do osady — pierwszy punkt trasy (`segments[0].a`, blisko `def`) daje pozycję; kierunek do drugiego punktu (`segments[0].b` lub kolejnego) daje orientację (rotacja słupka + tabliczki wzdłuż drogi, ten sam wzorzec co `MinorLocation.angle` dla doku w `minorLocations.ts`).
2. **Nowy prop `createSignpost()`** (`settlement/props.ts`, styl spójny z `createWell`/`createDock` — prosty słupek + tabliczka, flat-shaded, `BoxGeometry`/`CylinderGeometry`).
3. **Etykieta:** `CSS2DObject` (jak `.npc-label`) z tekstem nazwy docelowej osady (`neighbor.name`, już dostępne z `roadSegmentsForSettlement`/`neighborsFor`) — reużywa `labelOpacityForDistance` dla zanikania z dystansem, spójnie z NPC-ami.
4. **Gdzie wpiąć:** `createSettlement.ts` już rozwiązuje `roadCtx` dla doku (`minorLocationsFor`/`routeToMinorLocation`) — analogiczny krok: dla każdego `roadSegmentsForSettlement(def, ctx)` segmentu typu `'road'`, dodać signpost do grupy osady, tak jak dziś dodawany jest dok.

## Poza zakresem v1

- Kierunkowskazy przy ścieżkach do mniejszych lokalizacji (`kind: 'path'`, np. do doku) — tylko drogi międzyosadowe, jak prosił user.
- Dystans do celu na tabliczce (np. „Lipowo — 340m") — możliwe rozszerzenie, nie blokujące, do dodania jeśli wygląda dobrze bez tego.
- Wieloramienne drogowskazy na skrzyżowaniu — jeden słupek na drogę, nawet jeśli wizualnie blisko siebie przy większych osadach (`maxNeighborRoads` do 3-4).
- Kierunkowskazy dla dróg, które akurat nie są jeszcze rozwiązane (osada poza `SettlementsManager` load radius) — te i tak nie generują się, dopóki obie strony drogi nie zostaną załadowane (ta sama „eventual consistency" co reszta `roadNetwork.ts`).

## Weryfikacja

- Kilka `?seed=` z widocznymi drogami międzyosadowymi (patrz [roads-and-paths](./2026-08-07--026--roads-and-paths.md)) — kierunkowskaz stoi przy wyjściu drogi z osady, tabliczka pokazuje poprawną nazwę sąsiedniej osady, orientacja zgodna z kierunkiem drogi.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`.

## Powiązane

- [roads-and-paths](./2026-08-07--026--roads-and-paths.md) — `roadNetwork.ts`, `neighborsFor`/`roadSegmentsForSettlement`
- [village-generation](./2026-08-08--031--village-generation.md) — `SettlementDef.name`
- `src/settlement/minorLocations.ts` — wzorzec orientacji propsa wzdłuż kierunku (`MinorLocation.angle`, dok)
- `src/ui/labelDistance.ts` — `labelOpacityForDistance`, reużyte dla etykiety kierunkowskazu
