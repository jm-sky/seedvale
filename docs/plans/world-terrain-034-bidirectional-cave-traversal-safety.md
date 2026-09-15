# Plan: Bidirectional cave traversal safety

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** bug
**Priority:** high · **Effort:** M
**Depends on:** ~~world-terrain-019~~, ~~world-terrain-020~~
**Domain:** `world-terrain`
**Subdomains:** `terrain` `landmarks`
**Tags:** `caves` `heightfield` `traversal` `soft-lock`
**Roadmap:** -
**Model:** `Opus`, `Sonnet`

## Cel

Usunąć przypadki, w których gracz może wejść do wygenerowanej jaskini, ale nie może z niej wyjść z powodu lokalnie zbyt stromego finalnego gameplay floor.

Naprawa ma wzmacniać istniejący kontrakt `CaveTopology -> CaveHeightfieldRepresentation -> cave gameplay query`, bez teleportów awaryjnych, player-only wyjątków ani drugiego systemu nawigacji.

## Recon

- `src/world/caves/productionTopology.ts` ogranicza nachylenie centerline przez `MAX_TRAVERSABLE_FLOOR_GRADE`.
- Finalny gameplay floor powstaje jednak w `src/world/caves/caveHeightfieldRepresentation.ts`; reprezentacja może lokalnie skoncentrować zmianę wysokości bardziej niż topology.
- `src/world/caves/productionTopology.floor-continuity.test.ts` ma już dwa `it.fails` dla znanego przypadku seed `1136726869`, gdzie widening -> chamber daje około 2.5 m dropu na około 1.3 m mimo poprawnej topology.
- Obecne testy potwierdzają istniejący problem reprezentacji, ale komentarz traktuje go jako quality issue. Z gameplay feedback wynika, że taki kształt może być rzeczywistym blockerem wyjścia.
- `SLOPE_MAX_WALKABLE_DEG` jest istniejącym physical movement limitem i powinien pozostać źródłem prawdy dla akceptowalnego gameplay grade.

## Zakres

1. Poprawić generowanie/interpolację cave floor w `caveHeightfieldRepresentation.ts`, tak aby przejścia między passage/widening/chamber/branch nie tworzyły lokalnego floor grade większego niż player walkability contract.
2. Zachować topology jako źródło geometrii trasy; nie dodawać post-processu niezależnego od centerline, który mógłby rozjechać rendering, occupancy i gameplay query.
3. Walidować finalny heightfield, nie tylko topology stations.
4. Główna droga od wejścia do wnętrza ma być traversable w obie strony.
5. Mouth/portal carve może mieć własną specyfikę, ale nie może pozostawiać jednostronnej pułapki na granicy surface <-> cave.
6. Istniejące `it.fails` w `productionTopology.floor-continuity.test.ts` po poprawce mają stać się normalnymi testami regresyjnymi.
7. Dodać test obejmujący kierunek interior -> entrance dla znanego failing fixture oraz reprezentatywnych production topology seeds.

## Guardrails

- Nie dodawać przycisku/teleportu „wydostań się z jaskini” jako rozwiązania.
- Nie zwiększać globalnie player slope limitu tylko po to, aby przejść wadliwy floor.
- Nie tworzyć osobnego cave navmesh/pathfinding systemu.
- Nie modyfikować world seed semantics ani cave siting, jeśli problem można rozwiązać w reprezentacji floor.
- Zachować deterministyczność worldgen.

## Relevant files

- `src/world/caves/caveHeightfieldRepresentation.ts`
- `src/world/caves/caveHeightfieldQuery.ts`
- `src/world/caves/productionTopology.ts`
- `src/world/caves/productionTopology.floor-continuity.test.ts`
- `src/world/caves/mouthCarve.ts`
- `src/terrain/slopeConstraint.ts`
- `docs/plans/implementation-notes/world-terrain-019-cave-heightfield-production-migration-implementation-notes.md`

## Verification

Automated:

- failing heightfield floor-continuity fixtures przechodzą jako zwykłe `it`,
- max sampled gameplay floor grade na main-route/branch pozostaje <= walkability limit,
- brak regresji w cave topology/query tests.

Manual browser verification wykonuje User:

- wejście do kilku jaskiń i wyjście tą samą drogą,
- szczególnie cave z dużą różnicą wysokości komory,
- brak widocznych cliffów/stepów blokujących ruch.

Przy nowych/zmienianych publicznych helperach dodać JSDoc z `@domain world-terrain`, jeśli poprawia to preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
