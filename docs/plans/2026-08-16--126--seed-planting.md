# Plan: Seed Planting — Trees & Crops

**Created:** 2026-08-16
**Status:** `planned` 📋
**Priority:** 🟡 medium · **Effort:** L
**Depends on:** ~~106~~ ~~122~~
**domain:** `world-terrain`
**tags:** [items-player]

## Cel

Dodać możliwość sadzenia nasion przez gracza:

- drzew,
- warzyw.

Sadzenie ma tworzyć rzeczywisty stan świata i korzystać z istniejących lifecycle'ów oraz systemów czasu, środowiska, inventory i zbierania.

Nie tworzyć osobnego, równoległego systemu wzrostu dla drzew.

## 1. Trees

### 1.1 Sadzenie

Gracz używa nasiona drzewa na odpowiednim terenie.

```text
tree seed
    ↓
planted tree
    ↓
sapling
    ↓
young
    ↓
mature
    ↓
old
```

Wykorzystać istniejący `TreeLifecycle`.

Nie tworzyć drugiego mechanizmu `PlantGrowth`.

### 1.2 Seed item

Dodać odpowiednie itemy nasion drzew do istniejącego katalogu itemów. Seed jest zwykłym itemem inventory.

Nie dodawać od razu rozbudowanego systemu drop-rate / seed economy.

### 1.3 Placement

Sprawdzić:

- pozycję,
- wysokość/teren,
- wodę,
- ewentualne kolizje,
- podstawowe warunki biome/environment.

Preferować istniejące funkcje próbkowania terenu.

### 1.4 Tree identity

Posadzone drzewo musi otrzymać stabilne ID i być zarejestrowane w istniejącym lifecycle. Nie tworzyć osobnej listy `playerTrees`, jeżeli istniejący mechanizm może zostać rozszerzony.

### 1.5 Persistence

Zapisać tylko stan potrzebny do odtworzenia posadzonego drzewa. Preferować istniejący model sparse overrides zamiast zapisywania proceduralnych właściwości drzewa.

## 2. Crops

### 2.1 Crop lifecycle

Dodać prosty, deterministyczny lifecycle:

```text
seed
 ↓
sprout
 ↓
growing
 ↓
mature
 ↓
harvested
```

Wzrost korzysta z istniejącego czasu świata. Preferować lazy resolution analogiczny do `TreeLifecycle`.

### 2.2 Crop definition

Wprowadzić data-only definicję cropów:

- `id`,
- seed item,
- harvested item,
- growth durations,
- wymagania środowiskowe,
- opcjonalny yield.

Nie tworzyć osobnego systemu dla każdego warzywa.

Pierwsze cropy powinny wykorzystywać istniejące itemy, np. tomato, jeśli jest to zgodne z katalogiem.

### 2.3 Planting

Gracz:

1. posiada seed,
2. wybiera odpowiednie miejsce,
3. wykonuje akcję sadzenia,
4. seed zostaje zużyty,
5. crop zostaje utworzony w świecie.

Nie dodawać od razu podlewania, nawożenia, chorób, chwastów ani pełnego systemu farm plots.

### 2.4 Garden integration

Wykorzystać istniejące mechanizmy garden/resource gathering. Nie tworzyć osobnego `FarmSystem`, jeżeli istniejący model garden może zostać rozszerzony.

Dojrzały crop powinien korzystać z istniejącego gather/harvest flow.

### 2.5 Visuals

Minimalna wizualizacja etapów:

- seed/sprout — mała roślina,
- growing — większa roślina,
- mature — pełna roślina,
- harvested — usunięta lub resetowana do odpowiedniego stanu.

Nie wymagać ciężkiego modelu GLB dla każdego stadium, jeśli prostsze warianty wystarczą.

### 2.6 Interaction

Wykorzystać istniejący system `Interactable`. Nie tworzyć osobnego input systemu.

Przykładowe prompty:

```text
[E] Posadź
[E] Zbierz
```

## 3. Shared lifecycle

Nie tworzyć jednego wielkiego `PlantSystem`.

```text
TreeLifecycle
    └── planted trees

CropLifecycle
    └── planted crops
```

Wspólne powinny być tylko mechanizmy infrastrukturalne: world time, persistence, placement, inventory, interaction i rendering/update lifecycle.

## 4. Persistence

Posadzone rośliny muszą przetrwać chunk unload/load, rebuild świata oraz zapis/odczyt gry.

Dla drzewa preferować:

```text
stable id
+
state override
+
stageStartedAt
```

Dla cropów podobny minimalny model:

```text
id
+
crop type
+
position
+
stage / stageStartedAt
```

## 5. Performance

- brak per-frame update każdego cropa,
- lazy growth,
- brak ciężkich obliczeń co klatkę,
- wykorzystanie istniejącego chunk lifecycle,
- preferowanie instancingu/batchingu dla dużych grup identycznych cropów.

Nie projektować teraz osobnego systemu workerów.

## 6. Verification

### Technical

- `tsc`
- lint
- tests
- build

### Browser

Sprawdzić:

- posadzenie drzewa,
- wzrost drzewa przez upływ czasu,
- harvest posadzonego drzewa,
- posadzenie cropa,
- wzrost cropa,
- harvest cropa,
- brak możliwości sadzenia w niedozwolonym miejscu,
- save/load,
- chunk unload/load,
- brak widocznych leaków lub lawinowego wzrostu liczby obiektów.

## Out of scope

Nie implementować:

- NPC farmer AI,
- automatycznego podlewania,
- nawożenia,
- chorób,
- genetyki roślin,
- zaawansowanych farm,
- player-built farmland,
- rozbudowanej ekonomii nasion.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
