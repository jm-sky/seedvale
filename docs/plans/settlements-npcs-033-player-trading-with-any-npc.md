# Plan: Player Trading with Any NPC

**Created:** 2026-09-12  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** L  
**Depends on:** ~~settlements-npcs-014~~  
**Domain:** `settlements-npcs`  
**Subdomains:** `economy` `household` `social`  
**Tags:** `trade` `npc` `inventory` `pricing` `surplus`  
**Roadmap:** `economy-goods-flow.md`  
**Model:** Opus, Sonnet

## Goal

Umożliwić graczowi handel z dowolnym żywym NPC przez istniejący dialog, bez tworzenia osobnych sklepów per profesja i bez kopiowania merchant-only systemu transakcji.

NPC powinien móc zaoferować realne dobra, których jest właścicielem lub które może legalnie wystawić ze swojego gospodarstwa, a cena powinna korzystać z tych samych istniejących czynników społecznych co handel z Kupcem:

```text
relacja z konkretnym NPC
+
reputacja w jego osadzie
+
renown w jego osadzie
→ cena
```

Pierwszy obowiązkowy vertical slice:

```text
Hunter work
  ↓
1 branch → 1 arrow / 1 beam → 8 arrows
  ↓
Hunter Household.items
  ↓
trade reserve zachowuje zapas potrzebny Hunterowi
  ↓
pozostałe arrows są ofertą handlową
  ↓
Player → dialog Huntera → Handel
  ↓
realne arrows przechodzą do Player Inventory
  ↓
realne coins/payment przechodzą do sprzedającej strony
```

System ma od razu nadawać się do późniejszych produktów Blacksmitha, Leatherworkera, Textile Workera i innych profesji bez profession-specific trade subsystemów.

## Verified current-code foundations

Aktualny `main` posiada już:

- `src/items/trade.ts` — walidację i rozliczanie transakcji, barter, coin settlement, capacity preflight oraz obsługę instance-backed items;
- `src/items/tradeCatalog.ts` — `tradeValue`, merchant pricing, `SellPriceContext`, `relationshipEffect()`, `reputationEffect()`, sell-price bounds i deterministic rounding;
- `src/app/inventoryWiring.ts` — istniejący resolver `SellPriceContext` oparty o:
  - `questManager.getRelation(npc.id)`,
  - `questManager.getRelationLevel(npc.id)`,
  - `reputationManager.getReputation(settlementId)`,
  - `reputationManager.getRenown(settlementId)`;
- Vue `MerchantScreen` i dialog NPC jako istniejące player-facing seams;
- `Household.items` jako authoritative persistent concrete-item inventory rodziny;
- `NpcStateRegistry.personalInventory` jako persistent inventory osobistych rzeczy NPC;
- `settlements-npcs-014` local goods circulation i istniejące zasady chronienia household reserve przed automatycznym odebraniem surplusu;
- Hunter arrow production w normalnym `work`: realne `arrow` trafiają do `Household.items`;
- istniejący `HUNTER_ARROW_STOCK_CAP` / hunter ammo replenishment semantics, których handel nie może łamać.

Nie tworzyć nowego `TradeManager`, `NpcShop`, `ProfessionShop`, `MarketInventory` ani osobnego katalogu cen dla zwykłych NPC.

## 1. One shared NPC trade session

Uogólnić istniejący player↔merchant UI/transaction seam do player↔trade-counterparty session.

Session powinien jawnie zawierać co najmniej:

- sprzedającego NPC / counterparty identity;
- source owner(s) oferowanych dóbr;
- live offer quantities;
- pricing context;
- commit callback/transaction adapter;
- opcjonalne capabilities merchant-only, np. specjalne mapy/koń, które pozostają wyłącznie Kupcem.

Nie kopiować `MerchantScreen` do `NpcTradeScreen`, jeśli istniejący ekran można uogólnić bez mieszania merchant-only features z core transaction UI.

UI nie może być authoritative ownerem stocku ani cen.

## 2. Trade availability is not `inventory.count > 0`

Sam fakt, że `Household.items` posiada przedmiot, nie oznacza, że NPC może go sprzedać.

Dodać jeden współdzielony mechanizm określający live sellable quantity dla counterparty, np. policy/reserve resolver oparty o:

```text
owned quantity
-
protected reserve
=
trade-available quantity
```

Mechanizm ma działać per `ItemKind` i owner, ale nie ma być globalnym dynamic-market systemem.

Nie wprowadzać założenia, że każdy `ItemKind` w household inventory automatycznie jest towarem.

### Initial eligibility

V1 powinien wspierać wyłącznie jawnie kwalifikujące się goods, przede wszystkim:

- wybrane produkty profesji przechowywane w `Household.items`;
- `arrow` jako obowiązkowy pierwszy przypadek;
- ewentualne dobra z `personalInventory` tylko wtedy, gdy istniejąca klasyfikacja pozwala je bezpiecznie sprzedać i nie są equipment/quest/committed items.

Rozszerzanie listy później nie może wymagać nowego UI ani nowego transaction engine.

## 3. Hunter arrow reserve

Hunter nie może sprzedać całego rodzinnego zapasu strzał i sam pozbawić się amunicji potrzebnej do swojej pracy.

Dla `arrow` protected reserve musi reuse'ować istniejącą semantykę Hunter arrow stock/replenishment zamiast wprowadzać drugi niezależny magic number.

Docelowo:

```text
Household.items.arrow = 31
protected hunter reserve = existing configured threshold
trade available = 31 - reserve
```

Jeśli ilość spadnie do reserve lub poniżej, `arrow` znika z oferty przy następnym live refresh/revalidation.

Sprzedaż nie może zmieniać recipe, work scheduler ani ranged-combat consumption Huntera.

## 4. Live stock and atomic transaction

Lista oferty jest tylko preview.

Przy commit:

1. ponownie odczytać authoritative source inventory;
2. ponownie policzyć protected reserve i sellable quantity;
3. sprawdzić player payment/barter;
4. sprawdzić destination capacity;
5. wykonać atomowy transfer ownership/payment albo nie wykonać nic.

Nie wolno:

- mintować przedmiotu na podstawie UI row;
- pozwolić na sprzedaż quantity, która przestała być surplus po otwarciu ekranu;
- najpierw pobrać monety, a dopiero potem odkryć brak stocku;
- duplikować instance-backed items.

Rozszerzyć/reuse'ować istniejące transaction primitives w `items/trade.ts`; nie implementować konkurencyjnej atomowości w UI.

## 5. Pricing — same social model as merchant

Ceny handlu z NPC muszą korzystać z istniejącego `SellPriceContext` i tego samego social input:

```text
relation with NPC
relation level
settlement reputation
settlement renown
```

Nie tworzyć `NpcPriceContext` ani drugiej tabeli relationship/reputation modifiers.

### Direction semantics

Obecny social pricing został zbudowany przede wszystkim dla wartości, jaką merchant płaci graczowi za jego goods. Dla player-buying-from-NPC należy zdefiniować wspólną, symetryczną interpretację społeczną na bazie tych samych efektów:

- lepsza relacja / reputacja nie może pogarszać ceny dla gracza;
- zła relacja / negatywna reputacja nie może dawać przypadkowego rabatu;
- wynik pozostaje deterministic integer coins;
- zachować bounded modifiers, aby bardzo wysoka reputacja nie zerowała cen ani nie tworzyła arbitrażu.

Preferować wydzielenie czystego shared social trade modifier z obecnych `relationshipEffect()` / `reputationEffect()` i użycie go przez oba kierunki, zamiast odtwarzania wzorów.

Plan nie wymaga dynamic pricing, podaży/popytu ani osobnych marż per profesja.

## 6. Base value for NPC-produced goods

Cena bazowa zwykłego NPC goods powinna pochodzić z istniejących wartości `tradeCatalog.ts` (`merchantPrice` / `tradeValue` zgodnie z aktualną klasyfikacją), nie z profession-specific hardcode w dialogu.

Jeżeli `arrow` lub przyszły produkt nie ma właściwej nominalnej wartości dla player purchase, rozszerzyć jedną istniejącą authoritative tabelę/katalog, nie dodawać `HUNTER_ARROW_PRICE` w AI/dialog code.

V1 może stosować stałą bazową marżę sprzedaży NPC, ale social adjustment musi być współdzielony i deterministic.

## 7. Payment ownership

Płatność nie może znikać.

Dla sprzedaży household goods należy zdefiniować jednego authoritative recipienta pieniędzy.

Preferowany V1:

- coins trafiają do `NpcStateRegistry.personalInventory` NPC, z którym gracz zawiera transakcję;
- przedmiot pozostaje własnością `Household.items` do chwili successful commit;
- nie dodawać household coin ledger ani abstrakcyjnego settlement money balance tylko dla tego planu.

To wykorzystuje istniejące persistent `personalInventory` i daje realny majątek konkretnemu NPC.

Jeżeli capacity `personalInventory` uniemożliwia otrzymanie należnej płatności, transakcja ma być blocked bez częściowych mutacji; nie teleportować nadmiaru monet do settlement stock.

## 8. Player barter

Zachować istniejącą możliwość rozliczenia:

```text
coins
or
sellable/barter goods + coins
```

ale barter jest rozliczany w tej samej transakcji, nie jako fizyczne trwałe przyjęcie wszystkich offered goods przez household w V1.

Implementacja przed commit musi jawnie ustalić destination/ownership offered goods. Najprostszy poprawny V1 może ograniczyć non-merchant NPC trade do coin payment, **jeżeli** recon implementacyjny wykaże, że przejęcie barter goods wymagałoby nowego nieuzasadnionego ownera lub utraty item-instance semantics.

Nie wolno używać istniejącego merchant barteru tak, aby offered player items po prostu znikały bez authoritative recipienta.

## 9. Dialogue integration

Dla żywego NPC, który posiada co najmniej jedną live trade-eligible ofertę, zwykły dialog może pokazać akcję:

```text
Handel
```

Nie uzależniać możliwości otwarcia handlu od profesji `trader`.

Jeżeli NPC chwilowo niczego nie może sprzedać:

- preferowane: nie pokazywać `Handel`, albo pokazać disabled/empty-state zgodnie z aktualnym dialogue UX;
- nie generować fake stock.

Merchant nadal otwiera ten sam trade surface z własnym merchant stock i special offers.

Dead/incapacitated/unavailable NPC nie otwiera nowej trade session.

## 10. Merchant remains a specialization

Kupiec nadal ma:

- `MERCHANT_STOCK`;
- merchant special offers;
- mapy;
- konia przy wozie;
- istniejące buyback semantics.

Generalizacja nie może usunąć tej specjalizacji.

Docelowy podział:

```text
shared trade session / transaction / pricing
         ↑                 ↑
 ordinary NPC          Merchant
 real owned goods      catalog stock + specials
```

Nie przenosić `MERCHANT_STOCK` do każdego NPC.

## 11. Persistence and lifecycle

Nie dodawać nowego save schema, jeśli nie jest konieczne.

Po successful trade persistence wynika z istniejących ownerów:

- player `Inventory`;
- `Household.items`;
- NPC `personalInventory`.

Trade session, quote i UI offer są ephemeral i muszą być odbudowywane z live state po reopen/reload.

Nie persistować cached prices ani cached sellable quantities.

## 12. Performance

Nie skanować wszystkich NPC/households/items globalnie.

Oferta jest liczona:

- dla aktualnie otwieranego NPC;
- z jego znanego household/personal owner context;
- przy otwarciu/refresh oraz ponownie podczas commit.

Nie dodawać economy tickera dla player trading.

## 13. Future production seam

Nowa produkcja musi móc wejść do handlu przez prostą konfigurację/policy:

```text
Blacksmith produces tool
→ Household.items
→ reserve/eligibility
→ NPC trade offer
```

Analogicznie:

```text
Leatherworker → leather goods / armor
Textile Worker → textiles / bandages
Herbalist → dressings
Carpenter → tools/components/furniture
```

Nie zmieniać tych production chains w tym planie.

## Tests

### Trade availability

- ordinary NPC without eligible stock → no sell offer;
- eligible household good above reserve → correct available quantity;
- stock exactly at reserve → unavailable;
- stock changes while screen is open → commit uses live quantity;
- private/equipment/quest/committed items are not accidentally exposed.

### Hunter vertical slice

- Hunter household with arrows above protected reserve exposes only excess;
- buying arrows removes exact quantity from `Household.items`;
- player receives exact quantity;
- Hunter reserve remains protected;
- later Hunter production can replenish stock and create new excess;
- Hunter ranged-combat ammo consumption and production cap semantics remain unchanged.

### Pricing

- neutral relation/reputation produces deterministic baseline NPC price;
- better relation lowers or does not increase player purchase price;
- worse relation raises or does not improve player purchase price;
- positive settlement reputation/renown improves price according to shared social effect;
- negative reputation worsens it;
- modifier bounds prevent zero/negative/extreme prices;
- merchant existing sell/buyback tests remain green.

### Payment / atomicity

- sufficient coins + destination capacity → one successful exchange;
- insufficient player coins → zero mutation;
- player inventory full → zero mutation;
- source stock consumed before commit → zero mutation;
- NPC payment destination unavailable/full → zero mutation;
- repeated commit cannot duplicate goods;
- instance-backed goods preserve identity if/when enabled.

### Dialogue/UI

- eligible ordinary NPC exposes `Handel`;
- NPC without goods does not expose fake stock;
- merchant still exposes current merchant experience and specials;
- closing/reopening rebuilds offer from live state;
- social context is resolved for the actual NPC and owning settlement.

### Persistence

- save/load after trade preserves reduced household stock, player goods and NPC coins through existing persistence;
- no trade-session state is added to `SaveData`.

## Acceptance Criteria

- Gracz może handlować z dowolnym żywym NPC, jeśli NPC ma realne trade-eligible goods.
- Handel używa jednego shared transaction/pricing mechanism, nie profession-specific shops.
- Hunter może sprzedać realne, wyprodukowane strzały ze swojego `Household.items`.
- Hunter zachowuje protected ammo reserve.
- Oferta i commit używają live authoritative inventory.
- Ceny zależą od relacji z konkretnym NPC oraz reputacji/renown jego osady, reusing istniejący social pricing model.
- Lepsze standing daje graczowi korzystniejszą cenę zakupu; gorsze — mniej korzystną.
- Payment ma realnego authoritative ownera i nie znika.
- Transakcja jest all-or-nothing względem stocku, payment i player capacity.
- Merchant pozostaje specjalizacją tego samego mechanizmu, z obecnym catalog stock i special offers.
- Dodanie przyszłego produktu profesji do NPC trade nie wymaga nowego ekranu ani nowego transaction subsystemu.
- Brak nowego global trade tickera, market inventory i save schema.

## Out of Scope

- NPC↔NPC monetary trade;
- dynamic supply/demand pricing;
- negotiation/minigame;
- player orders / commissions;
- crafting on demand;
- production changes;
- inter-settlement commerce;
- merchant caravans;
- credit/debt;
- household shared coin ledger;
- taxation;
- profession-specific storefront UI;
- exposing every inventory item automatically.

## Verification

Automated:

- targeted trade availability/reserve tests;
- social pricing tests;
- transaction atomicity tests;
- Hunter arrow trade integration test;
- merchant regression tests;
- persistence regression tests;
- typecheck, lint, build, full test suite.

Runtime, performed manually by the player:

1. Hunter produces arrows above his protected reserve.
2. Talk to Hunter and open `Handel`.
3. Verify only excess arrows are offered.
4. Buy arrows and verify household/player quantities plus NPC coins.
5. Change relation/reputation and verify price direction changes.
6. Consume Hunter arrows through normal hunting and verify trade stock disappears at reserve.
7. Let Hunter produce again and verify offer returns.
8. Verify another ordinary NPC with no eligible goods does not invent stock.
9. Verify Kupiec still supports existing merchant trade and special offers.
10. Save/load after a completed trade and verify all authoritative inventories.

Important new public architectural helpers should receive JSDoc and `@domain settlements-npcs` where useful for preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
