# Plan: Wool to material

**Created:** 2026-08-29  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~fauna-004~~, ~~settlements-npcs-015~~  
**Domain:** `settlements-npcs`  
**Subdomains:** `economy`  
**Tags:** `production` `items` `textiles`  
**Roadmap:** `textiles-and-herbal-medicine`

## Cel

Dodać pierwszy rzeczywisty etap przetwarzania wełny: **materiał wełniany**, wykorzystując wspólne mechanizmy NPC work, produkcji i ownership dóbr.

Celowo pomijamy przędzę.

```text
sheep
  ↓ istniejący fauna wool cycle
Household.items: wool
  ↓
Textile Worker
  ↓ ProductionDef + executeProduction()
Household.items: wool_material
```

Plan nie tworzy własnego systemu tekstyliów, storage ani logistyki.

## Aktualny fundament

Plan powstał przed późniejszym rozwojem fauna/economy/work. Implementacja ma traktować aktualny kod jako źródło prawdy.

### Wool input — fauna-004 jest wdrożone

Aktualny runtime już dostarcza realny wool input:

- `wool` jest zwykłym stackowalnym `ItemKind`,
- owca ma absolute-time wool readiness,
- `WOOL_GROWTH_DAYS = 24`,
- `WOOL_YIELD = 4`,
- Shepherd fizycznie strzyże owned sheep,
- wool trafia przez carried inventory do authoritative `Household.items`,
- shearing/tool capability należy do flow Shepherda, nie Textile Workera.

`settlements-npcs-006` konsumuje ten istniejący stan. Nie implementuje ponownie sheep/shearing/deposit ani wool growth.

### Production — settlements-npcs-015 jest wdrożone

Aktualny codebase ma wspólny synchroniczny, transactional production boundary:

```ts
executeProduction(def: ProductionDef, ctx: ProductionContext): ProductionResult
```

w `src/economy/productionExecutor.ts`.

`ProductionDef` w `src/economy/production.ts` obsługuje `itemInputs` i `itemOutputs`, a executor:

- preflightuje inputy i output capacity,
- agreguje duplicate inputs/outputs,
- wykonuje item recipe przez istniejące `Inventory` primitives,
- nie szuka dóbr u innych ownerów,
- zwraca jawny success/failure result,
- zachowuje wspólną transaction boundary zamiast textile-specific mutation path.

Wool processing musi użyć tego executora. Nie tworzyć wool-specific executora ani kopiować Hunter path.

### Goods / storage / logistics

`Household.items` pozostaje authoritative storage dla konkretnego `wool` i `wool_material` w pierwszym slice.

Istniejące local goods circulation i physical storage/logistics ustanawiają zasadę jawnego ownership i fizycznego cargo podczas transferów. Ten plan nie wymaga transportowania wool przez settlement storage tylko po to, aby uruchomić produkcję.

Jeżeli wool/material zostaną później zakwalifikowane jako circulating production goods, transfer między ownerami ma korzystać ze wspólnego goods/logistics flow. **Production nie wyszukuje ani nie teleportuje brakującego inputu.**

### NPC work / Work Contracts

Textile Worker jest zwykłą profesją wykonywaną przez istniejący NPC schedule/work arbitration.

Rutynowa produkcja własnego household nie jest `WorkContract`. Nie tworzyć automatycznego kontraktu na każde przetwarzanie wool.

Work Contracts pozostają authoritative dla jawnych zobowiązań worker–employer. Przyszły kontrakt tekstylny powinien reuse'ować tę samą production action, a nie tworzyć drugą implementację; jest to poza zakresem tego planu.

## Zakres

- dodać `wool_material` jako zwykły stackowalny `ItemKind`,
- dodać jedną szeroką rolę `textile_worker`,
- dodać `ProductionDef` dla `4 wool → 12 wool_material`,
- wykonywać recipe przez istniejący `executeProduction()`,
- zintegrować wybór i wykonanie produkcji z istniejącym NPC work pipeline,
- source i destination pierwszego slice: owning `Household.items`,
- zachować poprawność przy interruption, revalidation i off-screen/time-skip work zgodnie z istniejącym work lifecycle.

## Jednostki i receptura

Nie implementować fizycznego etapu yarn.

Plan używa istniejącego punktu odniesienia:

```text
1 kg wool
→ ~200 yarn units
→ ~3 m² wool cloth
```

Dla obecnych dyskretnych itemów przyjmujemy prostą recepturę zgodną z tym przelicznikiem:

```text
4 wool
→ 12 wool_material
```

czyli:

```text
1 wool
→ 3 wool_material
```

Recipe ma być jawnie zapisane w `ProductionDef` jako `ItemAmount`. Nie dodawać runtime unit-conversion subsystem ani `yarn` jako itemu.

## Profesja

Dodać szeroką rolę `textile_worker`.

Jedna profesja ma docelowo obsługiwać produkcję tekstyliów. Nie tworzyć osobnych `spinner`, `weaver` ani `cloth_maker`.

Role assignment ma używać istniejącego staffing/character generation seam. Nie dodawać `textile_worker` bezwarunkowo do generic random pool.

Preferować deterministyczne powiązanie z realną możliwością pozyskania wool przez household/settlement, korzystając z istniejącego staffing seam zamiast tworzenia drugiego profession resolvera. Nie wymagać posiadania sheep przez ten sam household, jeśli realny local-goods flow dostarczył wool do niego fizycznie; źródłem prawdy dla wykonania recipe jest rzeczywisty inventory state.

## Produkcja

Minimalny flow:

```text
Textile Worker work opportunity
  ↓
preview recipe against known Household.items
  ↓
normal bounded work action
  ↓
live revalidation at completion
  ↓
executeProduction(recipe, { inventory: household.items, simTime })
  ↓
consume 4 wool + create 12 wool_material
  ↓
Household.items
```

Wymagania:

- `ProductionDef` pozostaje źródłem prawdy recipe,
- `executeProduction()` jest jedyną mutation boundary dla recipe,
- produkcja nie może tworzyć materiału bez skutecznego commitu 4 wool,
- failed/revalidated recipe nie może częściowo zużyć inputu ani stworzyć outputu,
- nie usuwać wool na początku akcji,
- nie skanować świata/global inventory w poszukiwaniu wool,
- nie tworzyć `WoolProcessingSystem`, `TextileInventory` ani production schedulera.

## Workplace i narzędzia

Nie dodawać automatycznie shears do Textile Workera — `shearing` należy do istniejącego Shepherd flow.

Nowy textile workplace/tool jest opcjonalny. Dodać go tylko wtedy, gdy aktualny wspólny work/production contract rzeczywiście wymaga fizycznego miejsca lub capability. Nie tworzyć budynku/landmarku wyłącznie jako dekoracyjnego warunku recipe.

## Local goods i fizyczna logistyka

Pierwszy slice może produkować z wool znajdującego się już w `Household.items` i zapisywać output do tego samego ownera.

Jeżeli input jest w innym household/settlement storage:

```text
missing local input
→ production blocked
→ existing local goods / transport system may move goods
→ later production retry
```

`executeProduction()` dostaje jawny owner inventory i nie może samodzielnie claimować dóbr z obcego ownera ani omijać carried/physical delivery semantics.

## Performance i determinism

- brak per-frame production scan,
- recipe selection na istniejących work/decision boundaries,
- input lookup przez znanego ownera, bez global inventory search,
- deterministyczny recipe/worker selection tam, gdzie istniejący system tego wymaga,
- brak player dependency,
- zachować możliwość hybrid/off-screen simulation.

## Testy

### Items / recipe

- `wool_material` jest poprawnym stackowalnym itemem,
- recipe ma dokładnie `4 wool → 12 wool_material`,
- 4 wool tworzy dokładnie 12 wool material,
- 0–3 wool blokuje recipe bez mutation.

### Transaction / ownership

- source i destination używają realnego `Household.items`,
- recipe przechodzi przez `executeProduction()`,
- output powstaje dokładnie raz,
- interruption przed completion nie konsumuje wool,
- stale state jest revalidated na completion,
- failed output commit nie pozostawia częściowej konsumpcji,
- production nie pobiera automatycznie wool z innego household/settlement storage.

### NPC work

- Textile Worker wybiera produkcję tylko gdy recipe jest wykonalne,
- istniejący schedule/work arbitration pozostaje aktywny,
- brak wool daje normalny blocked/fallback work outcome,
- nie powstaje równoległy scheduler ani automatyczny WorkContract.

### Regression / integration

- istniejący Shepherd wool deposit pozostaje źródłem realnego inputu,
- shared production/Hunter paths nie mają regresji,
- local goods/storage flow nie traci ownership/conservation,
- produkcja działa bez gracza oraz zgodnie z istniejącym off-screen/time-skip lifecycle.

## Browser verification

Manual verification wykonuje użytkownik w przeglądarce.

Sprawdzić:

1. Household otrzymuje realny wool po strzyżeniu sheep przez Shepherda.
2. Textile Worker podejmuje normalną pracę bez WorkContract.
3. Przy minimum 4 wool recipe konsumuje dokładnie 4 wool i tworzy dokładnie 12 `wool_material` w prawidłowym inventory.
4. 0–3 wool blokuje produkcję bez free output.
5. Przerwanie pracy nie powoduje partial consume.
6. Produkcja nie teleportuje wool z innego storage/householdu.

## Poza zakresem

- yarn i spinning jako osobny etap/item,
- sheep/shearing/Shepherd implementation,
- flax i linen material,
- bandage, herbs i dressing,
- cloth quality/durability,
- textile market/pricing,
- nowy local-goods lub transport system,
- automatyczne Work Contracts dla Textile Workera,
- nowy global production scheduler,
- specjalne persistence tylko dla tekstyliów.

Implementation should add JSDoc with `@domain settlements-npcs` to important new public architectural functions/classes when needed for preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
