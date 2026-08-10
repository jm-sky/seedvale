# Review 004 — inline union types → dedykowane nazwane typy

**Status:** `planned`
**Data:** 2026-08-10
**Zakres:** `src/` — pola/parametry z inline `'a' | 'b' | ...` zamiast nazwanego type alias, zgodnie z regułą z globalnego CLAUDE.md („Prefer creating dedicated union types instead of just defining them on interface prop").
**Powód:** nowy audyt, nie część review #002.

## Metoda

Grep po `: 'literal' | 'literal'` (top-level pól i parametrów) w `src/`, weryfikacja każdego trafienia +
sprawdzenie duplikacji tego samego zbioru wartości w innych plikach. Kontrola pozytywna: codebase już ma
~20 poprawnie wydzielonych nazwanych unii (`ItemCategory`, `AnimalRole`, `FoodSourceType`, `QuestState`,
`PlacedFireKind`, itd.) — problem jest punktowy, nie systemowy.

---

## Findings

### `VegetationKind`

`src/terrain/chunkVegetation.ts:15` — `VegetationPlacement.kind: 'tree' | 'bush' | 'cactus' | 'reed'` inline.
Ten sam zbiór wartości jako kształt (nie unia, ale ten sam vocabulary) w
`src/terrain/chunkHeightmap.ts:175` — `vegetationSpeciesCount: { tree: number; bush: number; cactus: number; reed: number }`.
`chunkManager.ts:376-381`'s `templatesByKind` obiekt też ma te same cztery klucze.

Dodać `export type VegetationKind = 'tree' | 'bush' | 'cactus' | 'reed'` w `chunkHeightmap.ts` (nie w
`chunkVegetation.ts` — `chunkVegetation.ts` importuje z `chunkHeightmap.ts`, odwrotny import zapętliłby się).
`VegetationPlacement.kind` i `vegetationSpeciesCount`/`templatesByKind` referencują ten jeden alias
(`Record<VegetationKind, number>` zamiast wypisanych czterech pól).

### `PlacedFireKind` — duplikat, nie brak nazwy

`src/persistence/saveData.ts:31` — `SavePlacedFire.kind: 'simple' | 'pit'` inline, mimo że dokładnie ten sam
zbiór już ma nazwany typ: `PlacedFireKind` w `src/settlement/PlacedFires.ts:11`. Import bezpieczny — `saveData.ts`
dziś nie importuje z `settlement/`, a `PlacedFires.ts` nie importuje z `persistence/` (brak cyklu).

Fix: `SavePlacedFire.kind: PlacedFireKind` (import), usunąć powieloną definicję z `saveData.ts`. To nie jest
„dodaj nazwę", to „przestań duplikować źródło prawdy" — dwa miejsca dziś mogłyby się rozjechać przy dodaniu
trzeciego rodzaju ogniska.

### `RestVariant` / `RestOutcome`

Ten sam para zbiorów wartości wpisana inline w **trzech** plikach:

- `src/ui/createQuickActions.ts:18` — `onRest?: (variant: 'camp' | 'town') => 'ok' | 'too-far' | 'no-blanket'`
- `src/ui-vue/store.ts:31` — `onRest: ((variant: 'camp' | 'town') => 'ok' | 'too-far' | 'no-blanket') | null`
- `src/ui-vue/screens/QuickActionsScreen.vue:13,56` — `Record<'too-far' | 'no-blanket', string>` (podzbiór) i
  `function rest(variant: 'camp' | 'town')`

Cztery inline wystąpienia dwóch zbiorów wartości w trzech plikach — najsilniejszy kandydat w tym audycie.
Dodać `export type RestVariant = 'camp' | 'town'` i `export type RestOutcome = 'ok' | 'too-far' | 'no-blanket'`
w `src/ui/createQuickActions.ts` (właściciel `QuickActionsHandlers`, jedyny plik nie-Vue z tych trzech), reeksportowane/importowane przez `ui-vue/store.ts` i `QuickActionsScreen.vue`.

### `RoadSegmentKind` — słabszy przypadek, jeden plik

`src/settlement/roadNetwork.ts:32` — `RoadSegment.kind: 'road' | 'path'`. `RoadSegment` nie jest eksportowany
poza ten plik; wartości `'road'`/`'path'` używane tylko wewnątrz `roadNetwork.ts` (5 miejsc: `:342`, `:370`,
`:411`, `:468`, `:534`, `:563`). Brak duplikacji między plikami — słabszy przypadek niż powyższe, ale wciąż
pasuje do reguły (pole interfejsu z inline unią). `type RoadSegmentKind = 'road' | 'path'` lokalnie w tym
samym pliku — tani, opcjonalny.

### `Interactable` Exclude-subset — nie wart wydzielenia

`src/interaction/resolveInteraction.ts:45` — `Exclude<Interactable, { kind: 'campfire' | 'item' | 'npc' }>`.
`Interactable` (`src/interaction/Interactable.ts:19-26`) sam jest już poprawną nazwaną unią dyskryminowaną.
Jedyne wystąpienie tego `Exclude` w kodzie — nazwanie go (`type FlavorInteractable = ...` w `Interactable.ts`)
nie usuwa duplikacji, bo duplikacji nie ma (jeden call site). Zostawić jak jest; przeciwwskazanie z zadania
(„a true one-off with no reuse elsewhere is a much weaker case") pasuje wprost.

### Sprawdzone, bez akcji

- `src/terrain/chunkManager.ts:504` — `field: 'heights' | 'floorHeights' | 'biomes' | 'continentalness' | 'mountainRidge' | 'moistureRegion'`
  to podzbiór `keyof ChunkTileData` (`chunkHeightmap.ts:212-226`), ale używany tylko przez jedną funkcję
  (`readField`) w jednym pliku. Nazwanie dodałoby pośredni alias bez realnego zysku czytelności ani ochrony
  przed rozjazdem (nie ma drugiego miejsca do zsynchronizować). Pominięte.
- `src/interaction/Interactable.ts:11` — `WorldItemRef.source: 'world' | 'spawner' | 'dropped'` — jedno
  wystąpienie, `ref.source` switch w `createApp.ts::collectItem` czyta przez `WorldItemRef` (już nazwany
  kontener), nie przez osobną literalną unię gdzie indziej. Pominięte.
- `QuestState`, `ItemCategory`, `AnimalRole`, `AnimalSociability`, `FoodSourceType`, `PlaceType`, `Role`,
  `Trait`, `NpcGender`, `ScheduleActivity`, `EnvironmentKind`, `SpawnerType`, `VillageSize`,
  `FamilyRelation`, `ToastVariant`, `NameCulture`, `Personality`, `CurrentActivityKind`, `NeedId`,
  `AoQuality`, `StartScreenChoice`, `SettlementTerrain` — już poprawnie wydzielone nazwane typy w osobnych
  plikach, zero akcji.

---

## Priorytet wykonania

1. `PlacedFireKind` w `saveData.ts` — 1-linijkowa zmiana, usuwa realną duplikację źródła prawdy.
2. `RestVariant`/`RestOutcome` — 3 pliki dziś muszą się zgadzać ręcznie; największe ryzyko rozjazdu.
3. `VegetationKind` — dotyka worker-safe `chunkHeightmap.ts`, ostrożniej (współdzielony z workerem).
4. `RoadSegmentKind` — kosmetyczne, jeden plik, zrobić przy okazji innej zmiany w `roadNetwork.ts`.
