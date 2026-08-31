# Plan: Fishing UX and Water Support

**Created:** 2026-08-31
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** ~~159~~ ~~184~~
**Domain:** `ui-input`
**Tags:** `fishing` `quick-actions` `water`

## Cel

Dokończyć player fishing jako spójną funkcję gameplayową:

- łowienie z Quick Actions z automatycznym wyposażeniem wędki,
- łowienie w jeziorach, rzekach i oceanie,
- zachowanie istniejącej mechaniki bait/catch,
- pozostawienie jednego rodzaju ryby.

Plan nie tworzy nowego systemu fishingu. Rozszerza istniejące mechanizmy z planu 159.

## Stan obecny

Plan 159 jest zaimplementowany i posiada:

- `fishing` item capability,
- `HeldTool` jako źródło aktualnie wyposażonego narzędzia,
- fishing interaction `[E] Łów rybę · [R] Zanęć`,
- deterministic fishing roll,
- persistent bait per fishing spot,
- jeden rodzaj `fish`.

Obecne wykrywanie interakcji używa `isNearLakeShore()` i explicite odrzuca ocean. Fishing jest więc obecnie ograniczony do jezior.

## Zakres

### 1. Quick Action

Dodać do istniejącego systemu Quick Actions akcję **„Łów ryby”**.

Warunki:

- dostępna, gdy player posiada w inventory wędkę,
- wykonanie automatycznie wyposaża wędkę przez istniejący mechanizm equipment/HeldTool,
- nie tworzyć osobnego systemu wyposażania dla fishingu,
- Quick Action przygotowuje playera do fishingu; nie próbuje automatycznie znaleźć wody ani rozpocząć połowu.

Quick Action ma być głównym sposobem przygotowania playera do fishingu.

### 2. Wspólne wykrywanie brzegu wody

Zastąpić lake-only detection wspólnym rozpoznaniem brzegu wody.

Resolver powinien rozpoznawać co najmniej:

```ts
type WaterBodyKind = 'lake' | 'river' | 'ocean'
```

i zwracać typ zbiornika wraz z pozycją potrzebną przez istniejący system interakcji.

Należy wykorzystać istniejące mechanizmy rozpoznawania jeziora, rzeki i oceanu zamiast tworzyć osobne fishing detectors.

Nie tworzyć osobnych `lakeFishing`, `riverFishing` i `oceanFishing`.

### 3. Fishing na wszystkich właściwych wodach

Istniejący fishing action ma działać dla:

- lake shoreline,
- river shoreline,
- ocean shoreline.

Typ zbiornika powinien być dostępny na poziomie interakcji/fishing spot, ale **na tym etapie nie zmieniać tabeli połowu ani wyniku**.

### 4. Jeden rodzaj ryby

Pozostawić obecny `fish` jako jedyny produkt fishingu.

Nie dodawać:

- gatunków ryb,
- osobnych freshwater/saltwater items,
- catch tables,
- różnicowania szans zależnie od zbiornika.

Architektura może zachować `WaterBodyKind`, aby przyszłe rozszerzenie nie wymagało przebudowy shoreline detection.

### 5. Bait

Zachować istniejący system:

- `[R] Zanęć`,
- persistent bait per spot,
- istniejące bonusy i zużycie bait.

Bait ma działać identycznie dla lake, river i ocean.

### 6. Existing water interactions

Nie pogarszać istniejącej interakcji z wodą.

Bez wędki:

- lake/river/ocean zachowują odpowiednią interakcję wodną.

Z wyposażoną wędką:

- właściwy shoreline oferuje fishing prompt zamiast drink/fill prompt.

Nie dodawać dodatkowego fishing targetu ani równoległego promptu.

## Poza zakresem

- minigame fishing,
- animacja zarzucania,
- różne gatunki ryb,
- różne ryby dla lake/river/ocean,
- łodzie,
- fishing NPC AI,
- fishing durability,
- nowe bait types,
- balans szans połowu.

## Integracja

Należy wykorzystać istniejące:

- Quick Actions,
- inventory/equipment,
- `HeldTool`,
- item capabilities z planu 184,
- `buildInteractables`,
- `gatheringActions`,
- `world/fishing`,
- istniejące water/shoreline detection,
- istniejący persistence dla fishing bait.

Unikać tworzenia równoległego stanu „fishing rod equipped for fishing”.

### Dokumentacja / JSDoc

Przy implementacji dodać JSDoc dla istotnych publicznych/architektonicznych funkcji i klas, jeżeli jest potrzebny do późniejszego preflight discovery. Dla funkcji należących do domeny można zastosować `@domain`.

## Weryfikacja

Automated:

- test Quick Action → fishing rod becomes held tool,
- lake shoreline exposes fishing interaction with rod,
- river shoreline exposes fishing interaction with rod,
- ocean shoreline exposes fishing interaction with rod,
- no fishing interaction away from a valid shoreline,
- bait works on all supported water types,
- catch still produces the existing single `fish` item,
- existing drinking/filling interaction remains available without fishing rod.

Browser/manual:

- player buys fishing rod,
- opens Quick Actions and selects **Łów ryby**,
- rod becomes equipped,
- approaches lake → fishing prompt appears,
- `[E]` performs fishing,
- `[R]` applies bait,
- approaches river → same fishing flow works,
- approaches ocean → same fishing flow works,
- no rod equipped → normal water interaction remains,
- verify the fishing flow is understandable without developer/debug knowledge.

**Zrób git commit i push do main, rebase jeżeli trzeba**
