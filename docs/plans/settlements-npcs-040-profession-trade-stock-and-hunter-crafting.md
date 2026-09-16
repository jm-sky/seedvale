# Plan: Profession Trade Stock and Hunter Crafting

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-033~~, ~~settlements-npcs-036~~, ~~settlements-012~~
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `household`
**Tags:** `trade` `professions` `inventory` `production`
**Roadmap:** `economy-goods-flow.md`

## Goal

Sprawić, aby lokalne profesje były realnym źródłem tematycznych przedmiotów dla gracza, bez tworzenia `HunterShop`, `BlacksmithShop`, `FarmerShop` ani drugiego systemu handlu.

Rozszerzyć istniejący przepływ:

```text
profession / household
→ real owned goods
→ protected loadout / reserve
→ npcTradeAvailability
→ shared Handel
```

V1 łączy trzy rzeczy:

1. jednorazowy, deterministyczny specialist starter stock dla wybranych householdów;
2. realną produkcję strzał i łuków przez Huntera;
3. poprawę merchant assortment tak, aby specjalizacja i region nie były blokowane zbyt małym / kolejnościowym `skuBudget`.

## Verified current-code foundations

Aktualny `main` posiada już:

- `src/ai/npcTradeAvailability.ts` — owner-aware trade policy z `Household.items` / `personalInventory`, explicit allowlist i Hunter arrow reserve;
- `src/items/trade.ts::settleOwnedGoodsPurchase()` — transfer realnego stocku; stacki przenoszą count, instance-backed goods przenoszą istniejące instancje zamiast mintować nowe;
- `src/app/inventoryWiring.ts` — ordinary NPC trade commit rewaliduje live stock, ownera i cenę przed mutacją;
- `src/ai/npcLoadout.ts::isNpcLoadoutBelonging()` — chroni osobiste wyposażenie NPC; m.in. Woodcutter `axe`, Hunter `hunting_bow`, Guard `long_sword`; Farmer ma fallback `knife`;
- `src/settlement/household.ts` — `Household.items` jest authoritative persistent family inventory i już posiada profession-derived one-time bootstrap dla Hunter bandages / Farmer seeds;
- `src/settlement/settlementAgriculture.ts::householdStartingContextFromFamily()` — istniejący seam do wyliczenia profession contextu z `FamilyDef` przed `createHousehold()`;
- `src/economy/production.ts` — `ProductionDef`, `HUNTER_ARROW_PRODUCTIONS`, textile, blacksmith i herbalist production;
- `src/economy/npcWork.ts` / `src/ai/npcProfessionWork.ts` — istniejący Hunter arrow work path;
- `src/settlement/merchantTrade.ts` — finite persisted Merchant stock, specialization, region bias i `skuBudget`;
- `src/items/tradeCatalog.ts` — wspólne ceny dla bows, arrows, tools, weapons, armor i pauldronów.

Nie tworzyć nowego inventory typu `ProfessionShopStock`. Starter goods mają od początku należeć do istniejącego authoritative ownera.

## 1. One-time profession household trade stock

Rozszerzyć istniejący profession-derived household bootstrap zamiast dodawać drugi generator sklepów.

Preferowany seam:

```text
FamilyDef
→ householdStartingContextFromFamily()
→ createHousehold(..., starting)
→ genuinely first construction only
→ Household.items
```

Starter trade stock:

- jest deterministyczny;
- jest przyznawany tylko przy genuine first construction;
- jest persistowany przez istniejący `HouseholdSnapshot.items`;
- po sprzedaży nie odrasta przy reopen trade, stream-out/in, `WorldBundle` rebuild ani save/load;
- nie wymaga nowego save schema, jeżeli `initial === undefined` pozostaje jednoznacznym first-construction gate;
- nie może zostać ponownie seedowany tylko dlatego, że stock spadł do zera.

Jeżeli current lifecycle wykaże, że `initial === undefined` nie wystarcza we wszystkich creation paths, dodać jeden jawny bootstrap marker do household snapshot zamiast odtwarzać stock z bieżącej profesji przy każdym loadzie.

Nie mieszać starter trade stock z osobistym loadoutem NPC.

## 2. Initial specialist assortment

V1 używa istniejących `ItemKind` i bounded quantities.

### Hunter household

Starter goods:

- `arrow`;
- `short_bow` lub `hunting_bow` jako towar handlowy, niezależny od osobistego `hunting_bow` Huntera;
- `dried_meat`;
- `herb`.

Hunter może nadal chronić swój własny `hunting_bow`, knife i ammo reserve. Trade stock jest osobnym owned stockiem household.

### Hunter household — leather goods bootstrap

Dopóki nie istnieje realna profesja / produkcja leatherworkera, household Huntera może dostać mały jednorazowy bootstrap istniejących leather goods:

- `waterskin_small`;
- `backpack`;
- `leather_pauldron`;
- `leather_armor`;
- opcjonalnie `saddlebags`, jeżeli recon implementacyjny potwierdzi brak kolizji z aktualnym acquisition flow.

Nie tworzyć roli `leatherworker` w tym planie.

Nie kodować tego jako nieskończonej oferty „żony Huntera”. Goods należą do household. Z istniejącego shared household trade mogą być wystawiane przez członka household zgodnie z aktualnym counterparty model; osobny seller identity / profession presentation zostawić przyszłej profesji leatherworker.

### Woodcutter household

- `axe`: maksymalnie **2 sztuki starter trade stock** w household;
- własna siekiera drwala z personal loadout pozostaje chroniona i nie liczy się do tych dwóch sztuk.

Nie produkować dodatkowych axes w tym planie.

### Farmer household

Starter goods:

- `pitchfork`;
- `sickle`.

Nie ruszać istniejących starter seeds i crop production.

### Blacksmith household

Starter goods:

- podstawowy sword (`short_sword` albo `long_sword`, wybrać jeden deterministic baseline zgodny z obecnym catalogiem);
- istniejący metal pauldron (`knight_pauldron_round` / `knight_pauldron_spike`) w małej bounded ilości;
- `iron_rod` nadal może pochodzić z istniejącej realnej produkcji.

Nie dodawać w tym planie pełnej produkcji sword/armor przez Blacksmitha.

## 3. Explicit trade eligibility for specialist goods

Obecny `HOUSEHOLD_TRADE_RESERVES` jest celowo wąski. Rozszerzyć go / zastąpić declarative policy tak, aby planowane starter goods mogły wejść do ordinary-NPC trade bez reguły:

```text
inventory presence = sellable
```

Każdy nowy kind musi mieć explicit policy.

V1 eligibility obejmuje co najmniej goods wymienione w §2 oraz Hunter-produced bows z §5.

Nie otwierać automatycznie:

- `branch`, `beam`;
- seeds;
- household food ogólnie;
- production inputs;
- story/quest items;
- przypadkowych przyszłych `ItemKind`.

`dried_meat` i `herb` są wyjątkami dodanymi jawnie dla specialist stocku, nie kategorią „każde food/material jest sellable”.

## 4. Instance-backed household goods

Broń, armor i część equipment są instance-backed. Ordinary NPC trade musi wystawić istniejące household instances, nie tworzyć replacement instance przy zakupie.

Rozszerzyć `npcTradeAvailability.ts` tak, aby household availability używało:

```text
isInstanceBackedKind(kind)
→ countInstances(kind)
```

analogicznie do obecnej personal-inventory ścieżki.

`settleOwnedGoodsPurchase()` pozostaje transaction engine i ma przenieść istniejącą instancję z `Household.items` do player inventory.

Nie używać `createAcquiredInstance()` dla already-owned specialist stock przy samym zakupie.

Starter bootstrap może utworzyć instancje dokładnie raz podczas first construction, korzystając z istniejących item-instance factory odpowiednich dla danego kindu.

Test musi potwierdzić, że sprzedana instance zachowuje id/state i nie wraca po reopen/load.

## 5. Hunter bow production

Rozszerzyć istniejący Hunter work / production path zamiast tworzyć osobny crafting loop.

Aktualny wzorzec:

```text
Hunter work
→ HUNTER_ARROW_PRODUCTIONS
→ Household.items.arrow
```

Dodać bounded bow production jako kolejne existing-mechanism recipes / profession-work choice.

Minimum V1:

- Hunter nadal produkuje `arrow`;
- Hunter może produkować nowy `short_bow` i/lub `hunting_bow` do `Household.items`;
- własny wyposażony `hunting_bow` nigdy nie jest source stockiem produkcji ani handlu;
- bow production nie może spamować bez limitu.

Wprowadzić prosty household target/cap dla trade bows, np. policy utrzymującą najwyżej małą liczbę niesprzedanych bow instances. Dokładną wartość ustalić podczas implementacji na podstawie cadence istniejącego Hunter work; celem jest finite stock, nie fabryka łuków.

Preferować input z istniejących realnych wood items (`branch` / `beam`) przez `ProductionDef.itemInputs`. Jeżeli poprawna receptura wymagałaby nowego nieistniejącego materiału (np. string/leather), nie wymyślać go w tym planie — użyć minimalnej istniejącej receptury i odnotować przyszły richer crafting chain.

Production commit ma korzystać z `executeProduction()` / istniejącego profession-work execution path.

## 6. Woodcutter / Farmer stock is not personal equipment

Nie seedować dwóch handlowych `axe` do `personalInventory` Woodcuttera.

Docelowo:

```text
Woodcutter personalInventory
→ own axe
→ protected by isNpcLoadoutBelonging()

Woodcutter Household.items
→ up to 2 trade axe instances
→ sellable
```

Analogicznie Farmer `pitchfork` / `sickle` są household trade stockiem, nie zmianą jego combat/loadout mapping.

Nie zmieniać `defaultWeaponForRole()` tylko po to, aby wystawić towar.

## 7. Merchant assortment / skuBudget

Naprawić problem, w którym `generateMerchantAssortment()` iteruje `MERCHANT_STOCK` w stałej kolejności i może osiągnąć `skuBudget` zanim dotrze do późniejszych, tematycznie poprawnych goods, np. bows/arrows.

Nie ograniczać poprawki do samego podniesienia liczby.

V1 powinien:

1. zwiększyć `skuBudget` na tyle, aby Merchant nie był sztucznie ubogi;
2. przede wszystkim dobierać stock tak, aby specialization/region faktycznie wpływały na coverage przed wypełnieniem reszty budżetu;
3. nie uzależniać wyniku od przypadkowej pozycji `ItemKind` w `MERCHANT_STOCK`.

Dopuszczalne rozwiązanie:

```text
eligible goods
→ score / bucket by specialization affinity + regional class
→ deterministic selection
→ fill to skuBudget
```

Zachować istniejące seeded RNG salts / determinism i settlement-level premium roll.

Forest / `weapons-tools` Merchant powinien mieć realną możliwość wystawienia bows/arrows/hunting goods bez konieczności zwiększania budżetu do niemal całego katalogu.

Nie zmieniać pricing formula.

## 8. Ownership and persistence invariants

- starter specialist goods mają jednego realnego ownera: `Household.items`;
- NPC personal loadout pozostaje `personalInventory` i jest chroniony;
- Merchant stock pozostaje obecnym `merchantStock`, nie mieszać go z household specialist stock;
- zakup specialist good usuwa exact stack / instance z household;
- payment nadal trafia zgodnie z existing ordinary-NPC trade flow do interacting NPC `personalInventory`;
- reopen nie rerolluje ani nie regeneruje specialist stock;
- save/load zachowuje pozostały stock dokładnie;
- brak nowego settlement wallet / shop inventory / market ticker.

## 9. Files / symbols expected to change

Implementacja powinna przede wszystkim wykorzystać / rozszerzyć:

- `src/settlement/household.ts`
  - `HouseholdStartingContext`
  - `createHousehold()` profession-derived first-construction bootstrap;
- `src/settlement/settlementAgriculture.ts`
  - `householdStartingContextFromFamily()` jako istniejący family → starting-context seam; nazwa funkcji może wymagać uogólnienia, jeśli przestanie być wyłącznie agricultural;
- `src/ai/npcTradeAvailability.ts`
  - explicit household trade policy;
  - instance-backed availability;
- `src/items/trade.ts`
  - reuse `settleOwnedGoodsPurchase()`, bez równoległego transaction engine;
- `src/app/inventoryWiring.ts`
  - live offer / commit integration tylko jeśli obecny resolver wymaga rozszerzenia dla instance rows;
- `src/economy/production.ts`
  - Hunter bow production defs;
- `src/economy/npcWork.ts` / `src/ai/npcProfessionWork.ts`
  - Hunter work selection / commit;
- `src/settlement/merchantTrade.ts`
  - `skuBudget()` i deterministic assortment selection;
- `src/items/tradeCatalog.ts`
  - tylko jeśli któryś nowo wystawiany existing `ItemKind` nie ma poprawnej shared valuation.

Dopasować finalne call-sites do aktualnego kodu podczas implementacji; nie tworzyć parallel managera, jeśli istniejące seams wystarczają.

Dodane lub istotnie uogólnione publiczne funkcje / typy powinny dostać JSDoc; użyć `@domain settlements-npcs` tam, gdzie poprawia preflight discovery.

## 10. Tests

### Starter stock

- genuine first Hunter household dostaje bounded specialist stock;
- reload / reconstruction z snapshotu nie reseeduje sprzedanych goods;
- Woodcutter household posiada maks. 2 trade `axe` instances;
- Woodcutter personal axe pozostaje osobno i nie jest sellable;
- Farmer household ma `pitchfork` / `sickle` trade stock bez zmiany Farmer loadout;
- Blacksmith household ma bounded sword / metal-pauldron stock;
- unrelated household nie dostaje tych items.

### Trade eligibility

- specialist starter good pojawia się przez normalny `resolveNpcTradeOffers()`;
- przypadkowy household weapon nie staje się sellable bez explicit policy;
- story/loadout/coin pozostają chronione;
- `dried_meat` / `herb` są sellable tylko przez jawne reguły planu;
- buying exact instance transfers identity/state;
- buy → reopen nie regeneruje itemu.

### Hunter production

- arrows nadal produkują się istniejącym path bez regresji;
- Hunter może wyprodukować bow, gdy spełnia input/stock conditions;
- bow trafia do `Household.items`, nie do personal loadout;
- cap blokuje nadprodukcję;
- sprzedaż bow zwalnia miejsce i późniejsza normalna praca może odtworzyć stock;
- Hunter nigdy nie sprzedaje wyposażonego personal bow.

### Merchant assortment

- `weapons-tools` nie jest zależny od pozycji goods w `MERCHANT_STOCK`;
- forest merchant może dostać bow/arrow/hunting goods przy odpowiednim deterministic seed;
- zwiększony `skuBudget` daje szerszy stock bez pełnego katalogu u każdego Merchanta;
- SM < MD < LG/XL nadal zachowuje rozsądny scale;
- premium settlement-level probability i finite persisted merchant stock pozostają bez regresji.

### Persistence

- save/load po częściowej sprzedaży zachowuje dokładnie pozostałe starter goods;
- sold instance nie wraca;
- Hunter-produced bows/arrows persistują przez existing `HouseholdSnapshot.items`;
- brak nowego cached trade-offer persistence.

## 11. Manual verification

Browser verification wykonuje User.

Sprawdzić co najmniej:

1. Hunter / jego household ma strzały i hunting goods; po czasie może pojawić się nowy bow z produkcji.
2. Kupiony bow/armor znika z oferty po zakupie i nie wraca po ponownym otwarciu ani reloadzie.
3. Woodcutter może sprzedać maksymalnie 2 household axes, ale nadal zachowuje swoją osobistą siekierę.
4. Farmer oferuje widły i sierp.
5. Blacksmith oferuje podstawowy sword i metalowy pauldron.
6. Merchant `weapons-tools` / forest ma sensowny hunting/weapons assortment, w tym realną szansę arrows/bow.
7. Ceny nadal reagują na istniejącą relację / reputację i nie powstał drugi pricing system.

## Non-goals

- nowa profesja `leatherworker`;
- pełny hide → leather → armor crafting chain;
- produkcja axes / farmer tools / swords / armor przez właściwe profesje;
- dynamic supply/demand pricing;
- global market simulation;
- profession-specific shop UI;
- barter dla ordinary NPC;
- nowe `ItemKind` tylko dla tego planu;
- regional pricing;
- automatyczne wystawianie całego household inventory.

## Acceptance Criteria

- Hunter household jest praktycznym źródłem arrows i hunting goods, a Hunter może realnie produkować arrows i nowe bows na sprzedaż.
- Woodcutter household może wystawić maksymalnie 2 trade axes bez naruszenia osobistego loadoutu Woodcuttera.
- Farmer household może wystawić pitchfork i sickle.
- Blacksmith household ma ograniczony startowy sword / metal-pauldron stock.
- Hunter household ma jednorazowy leather-goods bootstrap bez tworzenia fikcyjnej profesji leatherworker.
- Wszystkie specialist goods mają realnego ownera i po sprzedaży nie regenerują się magicznie.
- Instance-backed goods zachowują identity/state przy ordinary-NPC purchase.
- Merchant assortment nie jest przypadkowo ograniczony kolejnością `MERCHANT_STOCK`, a `skuBudget` jest zwiększony w kontrolowany sposób.
- Shared NPC trade / pricing / persistence pozostają jednym mechanizmem.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
