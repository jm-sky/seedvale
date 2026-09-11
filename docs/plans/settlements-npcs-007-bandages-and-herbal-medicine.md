# Plan: Bandages and herbal medicine

**Created:** 2026-08-29  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** settlements-npcs-006, ~~settlements-npcs-015~~  
**Domain:** `settlements-npcs`  
**Type:** `feature`  
**Roadmap:** `textiles-and-herbal-medicine`  

## Cel

Dodać pierwszy spójny łańcuch tekstylno-medyczny wykorzystujący aktualne mechanizmy itemów, NPC work, produkcji, storage/logistics i catalog-driven healing:

```text
wild flax
  ↓ gathering
Household.items: flax
  ↓ Textile Worker
linen_material
  ↓ Textile Worker
bandage

world herb ───────────────┐
                          ↓ Herbalist
bandage + herb → dressing

world poisonous_herb → Herbalist gathering → Household.items
```

Plan nie tworzy osobnego systemu medycyny. Produkty medyczne są zwykłymi concrete items, a healing pozostaje konsumentem danych z katalogu.

## Aktualny fundament

Plan powstał przed późniejszym rozwojem health/combat, production/economy, storage/logistics i NPC work/contracts. Implementacja ma traktować aktualny kod jako źródło prawdy.

### Istniejące `herb` i `bandage`

Codebase już posiada:

- `herb` — world-chunk collectible i health consumable,
- `bandage` — concrete item i health consumable.

Nie dodawać równoległego `medicinal_herbs` ani drugiego rodzaju bandage. W tym planie istniejący `herb` **jest medicinal herb**.

Zachować istniejące semantyki i wartości `herb`/`bandage` w `ITEM_CATALOG`, chyba że aktualny kod podczas implementacji wymaga technicznej korekty niezwiązanej z balansem.

### NPC healing / health / combat

`npc-002` definiuje healing jako normalny autonomiczny flow:

```text
healable physical injury
→ pressure / decision
→ goTo / execute
→ any ITEM_CATALOG consumable with need === 'health'
→ heal
```

007 nie dodaje healing FSM, injury managera ani callbacków z combat. Jego odpowiedzialnością jest dostarczenie realnych medical items przez istniejącą gospodarkę.

`dressing` powinien być zwykłym health consumable wykrywalnym przez ten sam catalog contract. Nie hardcodować go w NPC healing. Dokładny `relief` ustalić przy implementacji względem istniejących `herb` i `bandage`; powinien odzwierciedlać produkt wymagający obu inputów, bez zmiany istniejących wartości tych dwóch itemów.

### Production — settlements-npcs-015

`settlements-npcs-015` jest bezpośrednią zależnością: recipe mają korzystać ze wspólnego transactional production execution dla `ProductionDef`.

Wymagane flow:

```text
known owner/source
→ preview / validate
→ bounded NPC work action
→ live revalidation at completion
→ shared production transaction
→ exact consume + output
```

Nie tworzyć executora dla tekstyliów lub medycyny. Production nie wyszukuje brakujących dóbr w świecie i nie wykonuje logistyki.

### Textile Worker — settlements-npcs-006

`settlements-npcs-006` wprowadza szeroką rolę `textile_worker`, jej work integration i pierwszy recipe `wool → wool_material`. 007 rozszerza **ten sam** role/work/production path o flax i linen.

006 celowo nie implementuje flax ani linen, więc należą one do 007.

Nie dodawać drugiej roli ani drugiego textile work dispatch.

### Storage / local goods / logistics

Concrete goods należą do istniejących ownerów. Pierwszy slice produkuje z inputów już znajdujących się w owning `Household.items` i zapisuje output do tego samego inventory.

```text
world resource
→ physical/off-screen gathering
→ carried cargo where applicable
→ Household.items
→ production
→ Household.items
```

Jeżeli input znajduje się u innego ownera, production jest blocked. Ewentualny transfer ma korzystać z istniejącego local-goods/storage/logistics flow; nie wolno teleportować flax/herb/bandage między householdami ani tworzyć `medicalStock`.

### NPC work / Work Contracts

Rutynowe zbieranie i produkcja Herbalista/Textile Workera są zwykłą pracą profesji w istniejącym schedule/work arbitration.

Nie tworzyć automatycznego `WorkContract` dla każdego gathering/production task. Work Contracts pozostają mechanizmem jawnych zobowiązań worker–employer. Jeśli przyszły kontrakt wykorzysta herbal/textile work, ma reuse'ować te same action/production seams.

## Zakres

### Itemy

Dodać tylko brakujące concrete item kinds:

- `flax`,
- `linen_material`,
- `poisonous_herb`,
- `dressing`.

Reuse:

- istniejący `herb` jako medicinal herb,
- istniejący `bandage`.

Wszystkie nowe itemy mają używać istniejącego `ItemKind` / `ITEM_DEFS` / `ITEM_CATALOG` / `Inventory` modelu. Nie tworzyć osobnej listy medical/textile goods.

### Flax i linen

Minimalny łańcuch:

```text
wild flax
→ gathering
→ Household.items: flax
→ Textile Worker / ProductionDef
→ Household.items: linen_material
```

V1 może traktować flax jako naturalny, deterministyczny world resource/collectible. Nie dodawać pełnego systemu uprawy lnu tylko dla tego planu.

Pozyskanie ma rozszerzyć najmniejszy istniejący seam natural-resource gathering. Nie tworzyć globalnego flora registry ani per-frame world scan.

### Bandage

Recipe:

```text
linen_material → bandage
```

`bandage` już istnieje i zachowuje obecny catalog-driven health consumable contract. 007 dodaje jego realną ścieżkę produkcji, a nie nowy item.

Produkcję wykonuje `textile_worker` przez wspólny `ProductionDef` execution.

### Herbalist

Dodać jedną szeroką rolę `herbalist` obsługującą:

- gathering istniejącego `herb`,
- gathering `poisonous_herb`,
- gathering wild `flax`, jeżeli ten sam natural-resource seam jest właściwy,
- produkcję `dressing`.

Nie tworzyć osobnych gatherer/apothecary/dryer roles.

Role assignment ma używać istniejącego deterministic staffing/character-generation seam. Nie wystarczy dopisać roli do random pool; zaktualizować wszystkie exhaustive role maps/switches, schedule/work dispatch i loadout/workplace mappings, które faktycznie wymagają nowej roli.

### Medicinal herb

Nie dodawać `medicinal_herbs`.

Istniejący `herb` jest autorytatywnym medicinal resource i pozostaje health consumable. Herbalist ma potrafić pozyskać go z istniejącego world resource przez wspólny gathering/action flow i zdeponować jako realny item.

### Poisonous herb

`poisonous_herb` jest osobnym concrete resource, nie produktem otrzymywanym przez przetworzenie leczniczego `herb`.

V1 obejmuje:

- deterministyczne występowanie/pozyskanie przez ten sam natural-resource seam,
- carried/storage semantics,
- możliwość uczestnictwa w istniejącej gospodarce, gdy aktualny goods flow ją obsługuje.

Nie dodawać poisoning, toxin effects ani alchemii.

### Dressing

Recipe:

```text
bandage + herb → dressing
```

Dokładne dyskretne ilości zdefiniować w `ProductionDef`; nie używać niejawnego `1+`.

`dressing`:

- jest concrete item,
- powstaje przez Herbalist work,
- jest health consumable przez `ITEM_CATALOG[kind].consumable.need === 'health'`,
- nie wymaga zmian w generic NPC healing poza tym, że istniejący catalog-driven lookup automatycznie go zobaczy.

## Gathering vs production

Granica pozostaje jawna:

```text
world resource → gathering/action/logistics → Household.items
Household.items → ProductionDef → Household.items
```

Production nie może zbierać flax/herbs z terenu ani claimować obcego inventory. Gathering nie może mintować gotowego dressing/bandage.

Dla observed i off-screen work zachować ten sam authoritative outcome i conservation. Nie uzależniać symulacji od renderowanych `Object3D` ani kamery.

## Performance i determinism

- brak per-frame flora/production scans,
- bounded resource lookup na istniejących work/decision boundaries,
- deterministyczny wybór resource/recipe tam, gdzie istniejący system tego wymaga,
- brak player dependency,
- production działa przez wspólny off-screen/time-skip work lifecycle,
- off-screen gathering ma korzystać z istniejącej deterministic resource abstraction; jeżeli aktualny seam nie potrafi reprezentować zasobu bez aktywnego chunku, rozszerzyć go minimalnie zamiast tworzyć drugi globalny model świata.

## Testy

### Items / catalog

- `herb` pozostaje istniejącym health consumable,
- `bandage` pozostaje istniejącym health consumable,
- brak duplikatu `medicinal_herbs`,
- `flax`, `linen_material`, `poisonous_herb`, `dressing` są poprawnymi concrete items,
- `dressing` jest catalog-driven health consumable.

### Gathering

- Herbalist może pozyskać realny `herb`,
- Herbalist może pozyskać realny `poisonous_herb`,
- wild flax może trafić przez wspólny gathering/carry/deposit flow do `Household.items`,
- interruption nie duplikuje ani nie teleportuje cargo,
- resource lookup pozostaje bounded/deterministic.

### Production

- `flax → linen_material` konsumuje dokładne inputy,
- `linen_material → bandage` konsumuje dokładne inputy,
- `bandage + herb → dressing` wymaga obu inputów,
- brak któregokolwiek inputu daje blocked/no mutation,
- stale state jest revalidated na completion,
- failed output commit nie pozostawia partial consume,
- output powstaje dokładnie raz w prawidłowym `Household.items`.

### NPC work / integration

- 006 Textile Worker work pozostaje wspólną ścieżką dla wool i linen/bandage,
- Herbalist korzysta z istniejącego schedule/work/action arbitration,
- rutynowa praca nie tworzy automatycznego WorkContract,
- existing NPC healing nie hardcoduje dressing i może go wykryć przez catalog contract,
- combat/health flow nie ma regresji,
- local goods/storage conservation nie ma regresji,
- praca działa bez gracza oraz zgodnie z off-screen/time-skip lifecycle.

## Browser verification

Manual verification wykonuje użytkownik w przeglądarce.

Sprawdzić:

1. Herbalist pozyskuje realny herb/poisonous herb oraz, jeśli należy do tego samego gathering flow, wild flax.
2. Textile Worker przetwarza `flax → linen_material → bandage` przez zwykłą pracę.
3. Herbalist tworzy `dressing` tylko przy realnym `bandage + herb`.
4. Brak inputu blokuje produkcję bez free output.
5. Towary trafiają do prawidłowego ownera i nie teleportują się z obcego storage.
6. `dressing` jest widoczny jako health consumable bez specjalnego healing code.

## Poza zakresem

- nowe NPC healing/injury/combat systems,
- poisoning i toxin effects,
- alchemia,
- szczegółowe gatunki ziół,
- pełna uprawa flax,
- yarn/spinning,
- cloth quality/durability,
- osobne profesje spinner/weaver/apothecary,
- medical building/storage,
- nowy local-goods/transport system,
- automatyczne Work Contracts,
- globalny herbalism/flora manager,
- drugi production scheduler.

Implementation should add JSDoc with `@domain settlements-npcs` to important new public architectural functions/classes when needed for preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
