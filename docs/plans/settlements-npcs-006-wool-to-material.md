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
  ↓ fauna-004
Household.items: wool
  ↓
Textile Worker
  ↓ ProductionDef / shared production execution
Household.items: wool_material
```

Plan nie tworzy własnego systemu tekstyliów, storage ani logistyki.

## Aktualny fundament

Plan powstał przed późniejszym rozwojem economy/storage/work. Implementacja ma traktować aktualny kod jako źródło prawdy.

### Wool input — fauna-004

`fauna-004` jest nadal planem `planned`, więc nie traktować wool jako już dostępnego runtime inputu.

Po implementacji `fauna-004`:

- `wool` jest zwykłym `ItemKind`,
- Shepherd fizycznie strzyże owned sheep,
- wool trafia przez carried inventory do authoritative `Household.items`,
- shearing/tool capability należy do flow Shepherda, nie Textile Workera.

`settlements-npcs-006` konsumuje ten realny stan. Nie implementuje ponownie sheep/shearing/deposit.

### Production — settlements-npcs-015

Aktualny codebase ma `ProductionDef`, ale wykonanie nadal jest rozdzielone między stock production i item-only Hunter production. `settlements-npcs-015` ma dostarczyć wspólny transactional production execution path.

Dlatego `settlements-npcs-015` jest rzeczywistą zależnością tego planu.

Nie implementować wool-specific executora i nie kopiować bezpośrednio obecnego Hunter `Inventory.applyRecipe()` jako nowej równoległej ścieżki.

### Goods / storage / logistics

`Household.items` pozostaje authoritative storage dla konkretnego `wool` i `wool_material` w tym pierwszym slice.

Późniejsze local goods circulation i physical storage/logistics ustanowiły zasadę jawnego ownership i fizycznego cargo podczas transferów. Ten plan nie wymaga jednak transportowania wool przez settlement storage tylko po to, aby uruchomić produkcję.

Jeżeli wool/material zostaną później zakwalifikowane jako circulating production goods, transfer między ownerami ma korzystać ze wspólnego goods/logistics flow. **Production nie wyszukuje ani nie teleportuje brakującego inputu.**

### NPC work / Work Contracts

Textile Worker jest zwykłą profesją wykonywaną przez istniejący NPC schedule/work arbitration.

Rutynowa produkcja własnego household nie jest `WorkContract`. Nie tworzyć automatycznego kontraktu na każde przetwarzanie wool.

Work Contracts pozostają authoritative dla jawnych zobowiązań worker–employer. Przyszły kontrakt tekstylny powinien reuse'ować tę samą production action, a nie tworzyć drugą implementację; jest to poza zakresem tego planu.

## Zakres

- dodać `wool_material` jako zwykły stackowalny `ItemKind`,
- dodać jedną szeroką rolę `textile_worker`,
- dodać `ProductionDef` dla `wool → wool_material`,
- wykonać recipe przez wspólny production execution z `settlements-npcs-015`,
- zintegrować wybór i wykonanie produkcji z istniejącym NPC work pipeline,
- source i destination pierwszego slice: owning `Household.items`,
- zachować poprawność przy interruption, revalidation i off-screen/time-skip work zgodnie z istniejącym work lifecycle.

## Jednostki i receptura

Nie implementować fizycznego etapu yarn.

Punkt odniesienia pozostaje informacyjny:

```text
1 kg wool
→ ~200 yarn units
→ ~3 m² wool cloth
```

Gameplay quantity ma być jawnie zdefiniowane w `ProductionDef` jako dyskretne `ItemAmount`. Nie wyprowadzać runtime conversion z powyższego przelicznika i nie dodawać `yarn` jako itemu.

## Profesja

Dodać szeroką rolę `textile_worker`.

Jedna profesja ma docelowo obsługiwać produkcję tekstyliów. Nie tworzyć osobnych `spinner`, `weaver` ani `cloth_maker`.

Role assignment ma używać istniejącego staffing/character generation seam. Preferować sensowne, deterministyczne powiązanie z household mającym dostęp do wool zamiast bezwarunkowego dodania roli do random pool.

Nie wymagać posiadania sheep przez ten sam household, jeśli aktualny local-goods flow już dostarczył wool do niego fizycznie; źródłem prawdy jest realny inventory state.

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
shared production transaction
  ↓
consume wool + create wool_material
  ↓
Household.items
```

Wymagania:

- `ProductionDef` pozostaje źródłem prawdy recipe,
- produkcja nie może tworzyć materiału bez skutecznego commitu wymaganej ilości wool,
- failed/revalidated recipe nie może częściowo zużyć inputu ani stworzyć outputu,
- nie usuwać wool na początku akcji,
- nie skanować świata/global inventory w poszukiwaniu wool,
- nie tworzyć `WoolProcessingSystem`, `TextileInventory` ani production schedulera.

## Workplace i narzędzia

Nie dodawać automatycznie shears do Textile Workera — `shearing` należy do Shepherd flow z `fauna-004`.

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

Production execution nie może samodzielnie claimować dóbr z obcego ownera ani omijać carried/physical delivery semantics.

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
- wool jest poprawnym `itemInput`,
- poprawna ilość wool tworzy dokładnie zdefiniowaną ilość wool material,
- brak/za mało wool blokuje recipe bez mutation.

### Transaction / ownership

- source i destination używają realnego `Household.items`,
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

- `fauna-004` wool deposit pozostaje źródłem realnego inputu,
- Hunter/shared production execution nie ma regresji,
- local goods/storage flow nie traci ownership/conservation,
- produkcja działa bez gracza oraz zgodnie z istniejącym off-screen/time-skip lifecycle.

## Browser verification

Manual verification wykonuje użytkownik w przeglądarce.

Sprawdzić:

1. Household otrzymuje realny wool z `fauna-004`.
2. Textile Worker podejmuje normalną pracę bez WorkContract.
3. Przy dostępnym wool recipe konsumuje dokładny input i tworzy `wool_material` w prawidłowym inventory.
4. Brak wool blokuje produkcję bez free output.
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
