# Plan: Hunter Arrow Production

**Created:** 2026-08-26  
**Status:** `verification needed` 🔍 — implemented + technically verified (`tsc`/lint/build/test); browser/gameplay not yet verified. See [implementation notes](./implementation-notes/settlements-npcs-003-hunter-arrow-production-implementation-notes.md).
**Priority:** medium · **Effort:** M  
**Depends on:** ~~178~~ ~~184~~ ~~187~~  
**Domain:** `settlements-npcs`

## Cel

Dokończyć produkcję strzał zaplanowaną w planie 178.

Hunter powinien podczas normalnej pracy samodzielnie uzupełniać zapas strzał, wykorzystując istniejące systemy produkcji, ekonomii, inventory i item capabilities.

Nie tworzymy osobnego systemu craftingu tylko dla Huntera.

Docelowy przepływ:

```text
Household resources
       ↓
arrow production recipe
       ↓
Household.items
       ↓
Hunter uses arrows
       ↓
low stock
       ↓
next production cycle
```

## 1. Aktualny stan

Plan 178 wprowadził:

- rolę `hunter`,
- łuk Huntera,
- początkowe strzały,
- `Household.items`,
- polowanie,
- ranged combat,
- zużywanie strzał,
- mechanizm `beginArrowCrafting()`.

Aktualny problem polega na tym, że produkcja strzał jest zaimplementowana jako logika specyficzna dla Huntera, zamiast korzystać z właściwego mechanizmu produkcji.

Production system posiada już `ProductionDef`, `productionForRole()` oraz `SettlementEconomy.produce()`.

Jednocześnie `arrow` jest itemem inventory, więc nie należy traktować go jako kolejnego `EconomicKind`.

Plan 184 wprowadził również generyczne capabilities itemów i powinien zostać wykorzystany zamiast tworzenia kolejnych równoległych abstrakcji.

## 2. Materiały i receptury

W repozytorium istnieją już właściwe itemy:

```text
branch — gałąź
beam   — belka
```

`beam` pochodzi z planu 187. Nie tworzyć `wood_beam`.

Produkcja strzał:

```text
1 × branch → 1 × arrow
1 × beam   → 8 × arrow
```

### Priorytet materiałów

Hunter powinien preferować:

```text
branch → beam
```

czyli najpierw wykorzystywać gałęzie, a dopiero później belki.

Nie dodawać na tym etapie:

- `arrow_shaft`,
- `feather`,
- `arrowhead`,
- innych nowych materiałów.

## 3. Docelowa architektura

Produkcja ma korzystać z istniejącego mechanizmu produkcji.

Docelowo:

```text
Hunter work
    ↓
production definition
    ↓
generic production execution
    ├── consume input
    └── create item output
            ↓
      Household.items
```

Nie tworzyć:

- `HunterCraftingSystem`,
- `HunterArrowFactory`,
- `ArrowProductionSystem`,
- ani podobnego mechanizmu wyłącznie dla Huntera.

## 4. Wykorzystanie Item Capability Abstraction

Przed rozszerzeniem `ProductionDef` należy sprawdzić aktualną implementację planu 184.

**Nie zakładać z góry**, że należy dodać do `ProductionDef` `itemOutputs`.

Najpierw wykorzystać istniejące abstrakcje.

Jeżeli obecny production system nie potrafi reprezentować outputu będącego itemem, należy rozszerzyć go minimalnie tak, aby wspierał:

```text
economic inputs
+
item outputs
```

Rozszerzenie powinno pozostać generyczne i nadawać się później do innych produkowanych itemów.

Nie przebudowywać całego economy systemu.

## 5. Rozdzielenie EconomicStock i Inventory

Nie dodawać `arrow` do `EconomicKind`, jeżeli `arrow` jest normalnym itemem.

Strzały mają być przechowywane w:

```text
Household.items
```

Materiały ekonomiczne muszą być pobierane zgodnie z aktualnym modelem gospodarki.

Należy wykorzystać istniejące mechanizmy stock/inventory zamiast tworzyć drugi magazyn strzał.

## 6. Atomowość receptury

Każda receptura jest atomowa.

Przykład:

```text
1 beam → 8 arrows
```

albo wykonuje się w całości, albo nie wykonuje się wcale.

Nie dzielić receptury, aby idealnie dopasować ją do limitu.

## 7. Arrow stock cap

Zachować istniejący `HUNTER_ARROW_STOCK_CAP`, jeżeli nadal jest właściwym miejscem konfiguracji.

Cap jest **progiem rozpoczęcia produkcji**, a nie twardym limitem wyniku.

Przykład:

```text
cap = 10
current = 9
```

Jeżeli dostępna jest belka:

```text
9 → 17
```

To jest poprawne.

Nie niszczyć pozostałych 7 strzał tylko dlatego, że przekroczyły cap.

## 8. Produkcja podczas normalnej pracy

Hunter powinien produkować strzały w ramach istniejącej aktywności:

```text
work
```

Nie tworzyć osobnego harmonogramu.

Docelowo:

```text
Hunter
  ↓
normal work decision
  ↓
arrow production
```

`NpcAgent` nie powinien zawierać szczegółów receptury.

Jeżeli `beginArrowCrafting()` pozostanie jako metoda przejściowa, powinna być cienkim adapterem do generycznego mechanizmu produkcji. Preferowane jest jednak usunięcie Hunter-specific implementation po migracji.

## 9. Wybór materiału

Algorytm:

```text
if arrows >= HUNTER_ARROW_STOCK_CAP:
    do not produce

if branch available:
    produce 1 arrow from branch
else if beam available:
    produce 8 arrows from beam
else:
    production unavailable
```

Jeżeli istnieje kilka dostępnych jednostek materiału, nie należy wprowadzać losowania.

Zachowanie powinno być deterministyczne.

## 10. Inventory i stacking

Wykorzystać istniejący sposób przechowywania `arrow` w `Inventory`.

Nie tworzyć osobnych `ArrowInstance`, jeżeli obecny inventory traktuje strzały jako stackowany item.

Docelowo:

```text
Household.items
    arrow × N
```

Produkcja powinna zwiększać istniejący stack zgodnie z API `Inventory`.

## 11. Zużywanie strzał

Istniejący ranged combat pozostaje źródłem zużywania amunicji.

Nie zmieniać w tym planie:

- projectile system,
- ranged attack,
- combat intent,
- projectile lifecycle,
- damage resolution.

Przepływ ma być:

```text
Household.items
    ↓
Hunter ammo
    ↓
ranged attack
    ↓
arrow consumed
```

Po spadku zapasu poniżej cap Hunter podczas kolejnej pracy może ponownie rozpocząć produkcję.

## 12. Economic side effects

Produkcja musi rzeczywiście zużywać materiał.

Nie wolno produkować strzał bez zmniejszenia ilości materiału wejściowego.

Input consumption i output creation muszą być wykonane atomowo.

Nie implementować w tym planie pełnego `production → surplus → trade`.

Household może posiadać nadwyżkę strzał, ale integracja z handlem pozostaje zakresem przyszłego systemu, jeśli nie istnieje już odpowiedni generic bridge.

## 13. Testy

### Production

Dodać testy:

- `1 branch → 1 arrow`,
- `1 beam → 8 arrows`,
- branch jest wybierany przed beam,
- brak materiału blokuje produkcję,
- materiał wejściowy zostaje zużyty,
- output trafia do `Household.items`,
- receptura jest atomowa,
- produkcja jest deterministyczna.

### Cap

Sprawdzić:

```text
arrows >= cap → no production
arrows < cap + branch → +1
arrows < cap + beam → +8
```

oraz szczególnie:

```text
9 / 10 + beam → 17 / 10
```

czyli receptura może przekroczyć cap.

### Hunter

Sprawdzić:

- Hunter wykorzystuje normalną aktywność `work`,
- nie powstaje osobny scheduler,
- zwykły NPC nie wykonuje receptury Huntera,
- Hunter może ponownie produkować po zużyciu amunicji.

### Regression

Istniejące produkcje:

- woodcutter,
- farmer,
- fisher,
- miner,

muszą nadal działać bez zmian.

## 14. Browser verification

Zweryfikować w grze:

1. Utworzyć settlement z Hunterem.
2. Zapewnić gospodarstwu gałęzie.
3. Obserwować pracę Huntera.
4. Potwierdzić wzrost liczby strzał.
5. Potwierdzić zużycie gałęzi.
6. Doprowadzić do użycia strzał podczas polowania.
7. Sprawdzić ponowne uzupełnienie.
8. Usunąć/zużyć gałęzie.
9. Zapewnić belkę.
10. Potwierdzić produkcję `+8`.
11. Sprawdzić przypadek przekroczenia cap.
12. Sprawdzić zachowanie bez gracza i bez aktywnej kamery.

Kluczowy scenariusz:

```text
branch available
    ↓
1 branch → 1 arrow

branch unavailable
    ↓
beam available
    ↓
1 beam → 8 arrows

arrows > cap
    ↓
production stops
```

## 15. Pliki do przeanalizowania przed implementacją

Przed zmianami agent powinien ponownie sprawdzić aktualny kod, szczególnie:

```text
src/economy/production.ts
src/economy/npcWork.ts
src/economy/settlementEconomy.ts
src/economy/stock.ts

src/items/items.ts
src/items/itemCatalog.ts
src/items/Inventory.ts

src/ai/NpcAgent.ts
src/ai/npcLoadout.ts
src/ai/characters.ts

src/settlement/household.ts
```

oraz:

```text
docs/plans/2026-08-20--178--hunter-profession-and-household.md
docs/plans/implementation-notes/2026-08-20--178--hunter-profession-and-household-implementation-notes.md
```

i dokumentację/implementację planu 184 oraz 187.

## 16. Definition of Done

- [x] `branch` jest używany jako materiał do produkcji strzał.
- [x] `beam` jest używany jako alternatywny materiał.
- [x] `1 branch → 1 arrow`.
- [x] `1 beam → 8 arrows`.
- [x] Branch ma priorytet nad beam.
- [x] Produkcja korzysta z istniejącego/generycznego production mechanism (`ProductionDef` rozszerzony o `itemInputs`/`itemOutputs`, `Inventory.applyRecipe`).
- [x] Nie istnieje równoległy Hunter-specific crafting system.
- [x] Strzały trafiają do `Household.items`.
- [x] Materiał wejściowy jest zużywany.
- [x] `HUNTER_ARROW_STOCK_CAP` działa jako próg rozpoczęcia produkcji.
- [x] Pojedyncza receptura może przekroczyć cap.
- [x] Hunter produkuje podczas normalnej pracy.
- [x] Ranged combat nadal prawidłowo zużywa strzały (niezmienione).
- [x] Istnieją testy jednostkowe/integracyjne.
- [x] Testy, lint, typecheck i build przechodzą.
- [ ] Browser/gameplay verification wykonane.

**Zrób git commit i push do main, rebase jeżeli trzeba**
