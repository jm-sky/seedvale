# Plan: Natural Crop Lifecycle

**Created:** 2026-08-20  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~140~~  
**domain:** `world-terrain`  
**tags:** [items-player]

## Cel

Zastąpić obecny model proceduralnego pojawiania się roślin jadalnych jako gotowych, statycznych obiektów deterministycznym lifecycle.

Dotyczy przede wszystkim naturalnie występujących roślin, takich jak marchew, ziemniak, kapusta i kolejne przyszłe rośliny jadalne.

Plan nie implementuje sadzenia przez gracza — jest to zakres istniejącego planu `126 Seed Planting — Trees & Crops`.

## 1. Crop lifecycle

Wprowadzić prosty lifecycle oparty o czas świata:

```text
young
  ↓
mature
  ↓
spoiled
```

- `young` — roślina rośnie i nie daje normalnego zbioru,
- `mature` — właściwe okno zbioru,
- `spoiled` — dojrzała roślina, której nie zebrano na czas.

Lifecycle powinien być deterministyczny i korzystać z istniejącego world time.

Nie aktualizować każdej rośliny co klatkę. Preferować lazy resolution, analogicznie do `TreeLifecycle`.

## 2. Data-driven crop definitions

Nie tworzyć osobnej logiki dla każdego gatunku.

Wprowadzić definicję cropa zawierającą co najmniej:

- `id`,
- gatunek/typ,
- czas przejścia `young → mature`,
- czas przejścia `mature → spoiled`,
- item zbierany w `mature`,
- opcjonalny produkt `spoiled`,
- informacje potrzebne do wizualizacji.

Przykładowo:

```text
potato
  young
  mature → potato
  spoiled → spoiled potato / organic matter
```

Marchew, kapusta i kolejne cropy korzystają z tego samego mechanizmu.

## 3. Natural spawn

Zmienić proceduralny spawn naturalnych cropów tak, aby nie tworzył automatycznie gotowego, dojrzałego plonu.

Naturalnie wygenerowana roślina otrzymuje:

```text
crop type
+ initial stage
+ stageStartedAt
```

Początkowe stadium może być deterministycznie wybrane podczas proceduralnego generowania.

Nie wprowadzać osobnego runtime managera dla naturalnych cropów.

## 4. Visual lifecycle

Wizualizacja musi odpowiadać aktualnemu stadium:

```text
young   → mała/młoda roślina
mature  → pełna roślina
spoiled → wizualnie przejrzała/obumarła
```

Wykorzystać istniejący mechanizm instancingu/batchingu roślin tam, gdzie jest to możliwe.

Nie wymagać osobnego ciężkiego GLB dla każdego stadium, jeżeli skalowanie, wariant modelu lub prostsza reprezentacja daje wystarczający efekt.

## 5. Harvest

Istniejący gather/harvest flow powinien respektować lifecycle:

- `young` → brak normalnego zbioru,
- `mature` → normalny zbiór,
- `spoiled` → brak normalnego plonu lub specjalny produkt zgodny z definicją cropa.

Po zbiorze naturalna roślina powinna zostać usunięta albo przejść do odpowiedniego istniejącego mechanizmu odnowienia/spawnu.

Nie tworzyć nowego systemu interakcji.

## 6. Shared lifecycle infrastructure

Wykorzystać wzorce istniejącego `TreeLifecycle`:

- jawne stage,
- `stageStartedAt`,
- world time,
- lazy resolution,
- proceduralny stan bazowy + sparse overrides tam, gdzie potrzebny jest trwały stan.

Nie tworzyć `PlantManager`, `CropManager` ani per-frame `CropSystem`.

Jeżeli wspólna infrastruktura lifecycle z drzew może zostać bezpiecznie wyodrębniona, zrobić to minimalnie. Nie przeprojektowywać `TreeLifecycle` bez potrzeby.

## 7. Persistence / chunks

Naturalne cropy powinny zachowywać ciągłość lifecycle przy:

- chunk unload/load,
- rebuild świata,
- save/load, jeżeli dany crop jest trwałym stanem świata.

Nie zapisywać zbędnych proceduralnych właściwości.

Preferować minimalny stan:

```text
id
+ crop type
+ position
+ stageStartedAt / minimal override
```

## 8. Relationship with plan 126

Plan `126 Seed Planting — Trees & Crops` pozostaje odpowiedzialny za:

- nasiona,
- sadzenie drzew,
- sadzenie cropów,
- placement,
- inventory,
- interakcję gracza.

Ten plan dostarcza lifecycle naturalnych cropów, z którego `126` powinien korzystać również dla nowo posadzonych roślin zamiast tworzyć drugi mechanizm wzrostu.

Nie dublować implementacji w `126`.

## 9. Performance

- brak per-frame tickowania cropów,
- lazy lifecycle resolution,
- wykorzystanie istniejącego chunk lifecycle,
- zachowanie instancingu dla dużych grup roślin,
- brak nowych Workerów tylko dla lifecycle.

## 10. Verification

### Technical

- `pnpm lint:fix`
- `pnpm typecheck`
- testy,
- build.

### Browser

Sprawdzić:

- naturalna młoda roślina rośnie do `mature`,
- `mature` można zebrać,
- niezbierana roślina przechodzi do `spoiled`,
- `young` nie daje dojrzałego plonu,
- różne cropy używają wspólnego mechanizmu,
- lifecycle zachowuje się poprawnie po chunk unload/load,
- naturalny spawn nie tworzy wyłącznie gotowych, dojrzałych roślin,
- brak widocznego wzrostu kosztu CPU wraz z liczbą cropów.

## Out of scope

Nie implementować:

- sadzenia przez gracza — plan `126`,
- NPC farmerów,
- podlewania,
- nawożenia,
- chorób,
- chwastów,
- genetyki,
- farm plots,
- zaawansowanej ekonomii nasion,
- pełnego systemu regeneracji naturalnej roślinności.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
