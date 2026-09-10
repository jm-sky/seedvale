# Plan: Gameplay interaction usability polish

**Created:** 2026-09-10
**Status:** `planned` 📋
**Type:** polish
**Priority:** medium · **Effort:** M
**Depends on:** ~~items-player-018~~, ~~ui-input-012~~, ~~settlements-005~~
**Domain:** `items-player`
**Subdomains:** `interaction` `items`
**Tags:** `camp` `pickup` `placement` `torch` `ux`
**Roadmap:** -

## Goal

Usunąć kilka powtarzalnych tarć z aktualnego gameplayu bez tworzenia nowych równoległych systemów:

- camp złożony z namiotu + posłania + podestu ma zachowywać się w interakcji jak jeden zestaw,
- inspection campu ma być czytelniejsze i umożliwiać naprawę konkretnej części,
- preview domu ma jednoznacznie pokazywać stronę wejścia,
- rotacja placementu ma jasno komunikować bindy klawiatury,
- kilka identycznych dropped items leżących razem ma dawać jeden cel interakcji,
- stojąca pochodnia ma wypalać się po 6 godzinach czasu świata zamiast świecić bez końca.

Nie zmieniać niezależności świata od gracza ani ownershipu istniejących obiektów. To polish istniejących mechanizmów, nie nowy `CampManager`, loot manager ani system paliwa.

## Recon — current code

### Camp

Aktualny camp już ma poprawny derived model:

```text
PlacedTents + sleepingUtilities + PlacedFires
→ resolveCampRestSnapshot()
→ CampRestSnapshot
→ explainCampRest()
→ realny rest + inspection
```

Relevant:

- `src/app/campRest.ts`
- `src/app/campRestSnapshot.ts`
- `src/app/actions/restActions.ts`
- `src/items/campRepair.ts`
- `src/app/interactables.ts`

`CampRestSnapshot` już niesie realne rekordy/ID `tent`, `bedroll`, `platform`, `fire` oraz resolved conditions. Nie dodawać persisted camp membership.

Problem UX powstaje wcześniej: `buildInteractables()` emituje osobne `tent`, `bedroll` i `platform`, więc `pickInGaze`/Tab traktuje fizycznie nakładający się setup jako trzy cele.

`formatCampInspectionDescription()` i `formatCampRestBreakdown()` spłaszczają wynik do plain text. `FlavorDialog.vue` renderuje `line` jako jeden tekst, więc obecna reprezentacja nie może semantycznie pokolorować np. dodatniego `+5%`.

Repair campu już istnieje w `src/items/campRepair.ts`; należy podpiąć go per component zamiast tworzyć nową mechanikę napraw.

### Placement

Shared placement pipeline już istnieje:

- `src/app/actions/placementPreviewActions.ts`
- `src/world/placementPreview.ts`
- `src/ui-vue/screens/PlacementPreviewOverlay.vue`

Rotacja już działa przez `[F]/[G]`, a current `main` pokazuje tekst `F / G — Obróć`. Feedback może więc pochodzić z wersji sprzed tej poprawki albo obecna prezentacja jest zbyt mało widoczna. Nie tworzyć nowych bindów.

Ghost rysuje tylko circle/box footprint. Dla domu nie pokazuje frontu/drzwi. Residential building ma już jednoznaczną semantykę frontu: `residentialBuildingApproachLocal()` wskazuje punkt przed frontową ścianą w local `-Z`. Ten sam kierunek powinien sterować markerem wejścia w preview; nie utrzymywać osobnej orientacji tylko dla UI.

### Dropped items

`src/items/createDroppedItems.ts` przechowuje każdy drop jako osobny `DroppedItem` i `collect(id)` usuwa dokładnie jedną jednostkę. `src/app/interactables.ts` tworzy jeden `kind: 'item'` candidate na każdy dropped item. Dlatego np. 6 × `branch` + 6 × `beam` daje 12 konkurujących celów.

Nie trzeba od razu zmieniać persistence ani fizycznego modelu `DroppedItems`. Najmniejsza spójna poprawa to grupowanie interaction candidates dla blisko leżących, zgodnych jednostek.

### Standing torch

`src/world/standingTorch.ts` ma tylko authoritative `lit: boolean`; brak czasu zapalenia/wypalenia. To dlatego stojąca pochodnia może świecić bez końca.

Nie mylić jej z `src/player/PlayerTorch.ts`: portable branch/wooden torch ma już osobne real-time fuel (`90s` / `240s`). Ten plan nie zmienia portable torch.

## Scope

## 1. Composite camp interaction

Dodać derived camp interaction grouping w obecnym interaction pipeline.

Gdy namiot, posłanie i supporting platform należą przestrzennie do tego samego setupu według istniejących canonical radii/resolverów:

```text
3 physical records
→ 1 interactable camp target
```

Preferowany anchor targetu: namiot, gdy istnieje. Nie tworzyć persistent `CampEntity` ani `campId`.

`CampRestSnapshot` ma pozostać źródłem informacji o składzie zestawu. Jeżeli potrzebny jest mały helper do stwierdzenia, które rekordy snapshot obejmuje, umieścić go przy `campRestSnapshot.ts`, nie w Vue.

Standalone bedroll/platform poza namiotem nadal pozostają osobnymi interactables.

Acceptance:

- namiot + bedroll + platform nakładające się przestrzennie dają jeden wybór Tab/gaze,
- sam bedroll nadal można zbadać,
- sam platform nadal można zbadać,
- dwa rzeczywiście odrębne campy nadal są odrębnymi targetami.

## 2. Camp inspection jako structured view

Nie tworzyć `TentModal.vue`.

Rozszerzyć istniejący `FlavorDialog` o minimalny, reusable structured details model, np. wiersze typu:

```ts
{ label, value, secondaryValue?, tone? }
```

Semantyka wystarczająca dla campu:

- primary condition/state,
- contribution do comfort,
- positive contribution renderowane pozytywnym kolorem,
- warning/low condition może używać istniejącej semantyki warning/error, jeżeli jest potrzebna.

Nie przenosić żadnych formuł camp quality do Vue. Dane nadal pochodzą z `CampRestSnapshot.explanation`.

Docelowy odczyt powinien rozdzielać np.:

```text
Namiot       stan 100%     +5%
Posłanie     stan 82%      +12%
Platforma    stan 64%      +3%
Ognisko      rozpalone     +...
Survival                  +...
Komfort                    91%
```

Dodatnie contribution (`+N%`) pokazać semantycznie jako positive/green zamiast ciągu `100%: +5%`.

## 3. Repair per camp component

Inspection jednego composite camp targetu ma oferować akcje dla realnie wykrytych części:

- `Napraw namiot`,
- `Napraw posłanie`,
- `Napraw podest`.

Pokazywać tylko komponenty, które istnieją. Disabled reason powinien używać istniejącego repair quote/preflight (brak materiału, pełny stan, blokada działania itd.).

Akcje muszą reuse:

- `resolveCampRepairQuote()`,
- `beginCampRepair()` / istniejący repair lifecycle,
- istniejący Repair skill/capability rules.

Nie dodawać zbiorczego "repair whole camp" w tym planie.

## 4. House entrance marker in placement preview

Rozszerzyć shared `PlacementPreviewGhost` o opcjonalny marker frontu/wejścia zamiast budować osobny house-preview renderer.

Dla `smallHouse` i `mediumHouse` marker ma pokazywać stronę wejścia wynikającą z tej samej local-front semantyki co `residentialBuildingApproachLocal()`.

Preferowana forma v1:

- krótki marker/chevron/door segment na odpowiedniej krawędzi footprintu,
- obraca się razem z yaw,
- dziedziczy valid/invalid feedback ghosta,
- nie wymaga ładowania pełnego modelu domu podczas preview.

Inne placeables nie muszą dostać entrance markeru.

## 5. Rotation controls discoverability

Nie zmieniać bindów `[F]/[G]`.

Current main już ma `F / G — Obróć`; poprawić discoverability wyłącznie w obecnym `PlacementPreviewOverlay.vue`, np. przez etykiety bezpośrednio przy przyciskach:

```text
↶ [F]    [G] ↷
```

oraz zachować touch buttons bez keyboard hints na touch-only device.

Nie tworzyć drugiego systemu input hints.

## 6. Group nearby identical dropped-item targets

Grupować na poziomie interaction candidate, nie przez scalanie authoritative `DroppedItem` records.

Minimalna polityka:

- tylko `source: 'dropped'`,
- ten sam `ItemKind`,
- mały spatial cluster wokół kupki,
- plain stackable records mogą być grupowane swobodnie,
- rekordów z `instance` lub `foodBatch` nie wolno bezmyślnie scalać tak, by zgubić identity/provenance.

Prompt:

```text
Podnieś: gałąź ×6
Podnieś: belka ×6
```

Przykład 6 × branch + 6 × beam powinien dawać zasadniczo 2 cele Tab zamiast 12.

Pickup grupy powinien korzystać z istniejącej inventory capacity/add path i zebrać tyle jednostek, ile legalnie może wejść. Nie duplikować logiki collect; nadal konsumować konkretne `DroppedItem.id` przez authoritative `DroppedItems.collect()`.

Jeżeli tylko część grupy mieści się w inventory:

- zebrać legalną liczbę,
- resztę zostawić jako prawdziwe dropped records,
- prompt następnej klatki ma pokazać nową ilość.

World-generated oraz renewable spawner pickups pozostawić bez zmian w tym planie, chyba że podczas implementacji istniejący helper pozwoli bez dodatkowej architektury zastosować tę samą prezentację bez utraty ich lifecycle semantics.

## 7. Standing torch — 6 world hours burn duration

Dodać deterministic world-time expiry dla **player-built standing torch**.

V1:

```text
ignite
→ burns for 6 world hours
→ becomes unlit
```

Bez inventory fuel/refuel w tym planie. Po wypaleniu można ponownie zapalić istniejącą akcją; koszt paliwa jest osobnym przyszłym problemem.

Authoritative record powinien przechowywać minimalny timestamp potrzebny do odtworzenia stanu, preferencyjnie `litAtDays` albo `burnUntilDays`, zamiast per-frame `remainingSeconds`.

Wymagania:

- używać world elapsed days, nie render `dt`,
- expiry działa po time skip,
- save/load zachowuje pozostały czas logicznie przez timestamp,
- WorldBundle rebuild nie resetuje czasu palenia,
- stary save z `lit: true` musi dostać jednoznaczną migration policy; nie zostawiać immortal legacy torch.

Preferencja: `burnUntilDays` jako prostszy authority dla off-screen/time-skip resolution.

Rendering w `createStandingTorches.ts` nadal ma być pochodną authoritative state, nie właścicielem timera.

Portable `PlayerTorch` (`TORCH_FUEL_BRANCH` / `TORCH_FUEL_WOODEN`) jest poza scope.

## Architecture decisions

- Camp pozostaje derived state; zero persisted membership.
- Interaction grouping jest presentation/interaction projection nad istniejącymi world records.
- Camp repair nadal operuje na konkretnych rekordach komponentów.
- Camp quality nadal liczy wyłącznie `campRest.ts`.
- Placement nadal przechodzi przez jeden `PlacementPreviewActions` + `PlacementPreviewGhost`.
- House entrance marker używa istniejącej residential front orientation, nie nowej stałej niezależnej od gameplay approach point.
- Dropped items nadal są authoritative per-unit records; stack to interaction projection.
- Standing torch expiry należy do world object state/lifecycle i jest deterministyczny względem world time.
- Dodać JSDoc / `@domain` tylko dla nowych ważnych publicznych helperów/kontraktów, aby preflight mógł je znaleźć.

## Likely files

Camp:

- `src/app/interactables.ts`
- `src/interaction/Interactable.ts`
- `src/app/campRestSnapshot.ts`
- `src/app/actions/restActions.ts`
- `src/items/campRepair.ts`
- `src/ui-vue/store.ts`
- `src/ui-vue/screens/FlavorDialog.vue`

Placement:

- `src/app/actions/placementPreviewActions.ts`
- `src/world/placementPreview.ts`
- `src/ui-vue/screens/PlacementPreviewOverlay.vue`
- `src/world/residentialBuilding.ts`

Pickup:

- `src/app/interactables.ts`
- `src/interaction/Interactable.ts`
- pickup dispatch in `src/app/gameLoop.ts` / relevant action module
- `src/items/createDroppedItems.ts` only if a bounded helper is actually needed

Standing torch:

- `src/world/standingTorch.ts`
- `src/world/createStandingTorches.ts`
- standing-torch action/interaction path
- `src/persistence/saveData.ts`
- SaveData serialization/rebuild wiring for standing torches

## Tests

Automated coverage should include at least:

- composite tent/bedroll/platform creates one camp interaction target,
- unrelated/standalone sleeping utilities remain independent,
- camp structured rows match canonical `CampRestExplanation`,
- repair action targets correct component ID and respects existing quote/preflight,
- house preview entrance marker follows yaw and local front convention,
- F/G remain the only keyboard rotation actions,
- 6 identical nearby plain drops collapse to one candidate with quantity 6,
- branch + beam form separate groups,
- partial group pickup leaves correct remaining records,
- instance/perishable provenance is not lost through grouping,
- standing torch is lit before deadline and unlit at/after 6 world hours,
- expiry works across time skip/save restore/rebuild semantics,
- legacy standing-torch migration cannot create permanently lit records.

## Manual verification

User verifies in browser:

1. Postaw namiot, podest i posłanie w jednym campie — Tab/gaze powinien widzieć jeden zestaw, inspection wszystkie części i repair per część.
2. Sprawdź czy condition/contribution są wizualnie rozdzielone, a dodatnie `+N%` czytelnie zaznaczone.
3. Ustaw małą i średnią chatę, obróć ją kilka razy i sprawdź, czy wejście jest jednoznaczne przed confirm.
4. Sprawdź czy `[F]` / `[G]` są oczywiste bez zgadywania.
5. Ściąć drzewo tak, aby powstała kupka branch + beam; Tab powinien przechodzić po grupach, nie po każdej sztuce.
6. Zapalić stojącą pochodnię, przesunąć czas świata przez granicę 6 h oraz sprawdzić save/load — pochodnia ma zgasnąć deterministycznie.

## Non-goals

- persisted `CampEntity` / `CampManager`,
- auto-repair całego campu,
- nowy inventory stack model,
- scalanie wszystkich typów world pickups,
- paliwo/refuel dla standing torch,
- zmiana portable `PlayerTorch`,
- nowe rotation keybinds,
- pełny model domu jako placement ghost.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
