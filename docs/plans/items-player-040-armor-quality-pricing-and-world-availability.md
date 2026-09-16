# Plan: Armor quality pricing and world availability

**Created:** 2026-09-16
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~items-player-030~~, ~~settlements-012~~
**Domain:** `items-player`
**Type:** `feature`
**Subdomains:** `items` `inventory`
**Tags:** `armor` `quality` `trade` `merchant`
**Roadmap:** -
**Model:** Opus, Sonnet

## Cel

Domknąć istniejący system jakości zbroi tak, aby jakość konkretnej sztuki miała znaczenie nie tylko dla parametrów użytkowych, ale również dla ceny, wartości sprzedaży i dostępności u Merchantów.

Plan rozszerza system wprowadzony przez `items-player-030` i integruje go z finite merchant stock z `settlements-012`.

Docelowy flow:

```text
armor ItemKind
+ ArmorQuality
→ effective gameplay properties
→ effective economic value

settlement
+ merchant specialization
+ settlement size
+ region
+ deterministic seed
→ existing ItemKind assortment
→ concrete ArmorQuality
→ finite owned ArmorItemInstance
```

Nie tworzyć osobnych `ItemKind` dla jakości.

## 1. Rozszerzenie ArmorQuality

Obecnie:

```ts
type ArmorQuality = 'common' | 'good' | 'masterwork'
```

Rozszerzyć do:

```ts
type ArmorQuality = 'poor' | 'common' | 'good' | 'masterwork'
```

Player-facing labels:

```text
poor       → Kiepska
common     → Zwykła
good       → Dobra
masterwork → Mistrzowska
```

Kodowy tier pozostaje `poor`; dokładny label może zostać dopasowany do istniejącego UI podczas implementacji.

## 2. Poor jako prawdziwy tier jakości

`poor` nie jest stanem zużycia ani durability.

Reprezentuje np. słabszy materiał, niedokładne wykonanie, gorsze dopasowanie, nadmiar materiału lub mniej efektywną konstrukcję.

Quality i przyszłe condition/durability pozostają osobnymi pojęciami.

## 3. Quality wpływa na gameplay

Rozszerzyć istniejący centralny resolver jakości zbroi.

```text
ArmorConfig
+ ArmorQuality
→ protection
→ effective weight
→ direct armor penalties
```

Kierunek:

```text
poor
→ mniejsza ochrona
→ większa efektywna masa
→ większe ograniczenia ruchu/staminy/recovery

common
→ baseline

good
→ lepszy protection / weight / penalty ratio

masterwork
→ najlepszy protection / weight / penalty ratio
```

Nie tworzyć per-item quality stat tables. Jeden centralny tuning pozostaje authoritative.

## 4. Uogólnić penalty tuning

Obecny quality tuning przesuwa penalties w stronę neutralnego `1`, co pasuje do `good/masterwork`, ale nie do `poor`.

Uogólnić model tak, aby jawnie obsługiwał oba kierunki:

```text
poor        → penalties dalej od neutralnego 1
common      → baseline
good        → penalties bliżej 1
masterwork  → jeszcze bliżej 1
```

Nie stosować nieczytelnego hacka z ujemnym `penaltyEase` bez jasno zdefiniowanego kontraktu.

## 5. Quality-aware economic value

Obecny pricing jest przede wszystkim `ItemKind`-level, więc różne jakości tej samej zbroi mogą mieć tę samą wartość ekonomiczną.

Wprowadzić jeden centralny resolver wartości, np. koncepcyjnie:

```ts
armorQualityValueMultiplier(quality)
```

Kierunkowe wartości:

```text
poor        ~0.50–0.65
common       1.00
good        ~1.25–1.40
masterwork  ~1.70–2.00
```

Finalne liczby są balance detail. Wymagana relacja:

```text
poor < common < good < masterwork
```

## 6. Base price pozostaje ItemKind-level

Nie tworzyć osobnego cennika dla każdej jakości.

`MERCHANT_PRICES[kind]` pozostaje bazową wartością `common`.

```text
base ItemKind price
× ArmorQuality multiplier
→ nominal concrete-instance value
```

Nowe armor kinds mają automatycznie korzystać z tej samej jakościowej polityki cenowej.

## 7. Instance-aware buy i sell pricing

Cena konkretnej fizycznej zbroi musi wynikać z `ArmorItemInstance.quality`.

Rozszerzyć obecne pricing boundaries zamiast dodawać osobny armor trade system.

Dodać wspólny instance-aware resolver dla ceny zakupu, np. koncepcyjnie:

```ts
merchantInstancePrice(instance)
```

oraz rozszerzyć `resolveInstanceSellPrice()` dla armor.

Docelowo:

```text
tradeValue(kind)
× armorQualityValueMultiplier(quality)
× existing social sell/buy factor where applicable
→ concrete-instance price
```

Dotyczy co najmniej:

- Merchant → Player,
- Player → Merchant,
- NPC → Player, jeśli istniejąca `ArmorItemInstance` trafia do generic NPC trade.

Zachować istniejące rounding i social pricing boundaries.

## 8. Transfer tej samej instancji

Merchant posiada konkretną `ArmorItemInstance`.

Zakup musi przenieść tę samą fizyczną instancję:

```text
merchant Inventory
→ ArmorItemInstance { id, kind, quality }
→ player Inventory
```

Nie:

```text
remove merchant armor
→ createAcquiredInstance(kind)
→ common
```

Quality oraz stable instance identity muszą przechodzić przez transaction boundary.

## 9. Granica settlements-012 vs items-player-040

`settlements-012` pozostaje właścicielem wyboru dostępnego rodzaju towaru:

```text
settlement size
+ terrain
+ Merchant specialization
+ deterministic seed
→ ItemKind assortment
```

`items-player-040` działa dopiero po wyborze konkretnego armor `ItemKind`:

```text
selected armor ItemKind
+ settlement / Merchant context
+ deterministic seed
→ ArmorQuality
```

Quality nie może wpływać na samą dostępność `ItemKind` ani tworzyć równoległego assortment systemu.

## 10. Merchant stock shape

Nie ma potrzeby przebudowywać całego `generateMerchantAssortment()` z `ItemKind -> quantity` na listę instancji tylko po to, aby obsłużyć armor quality.

Preferowany kierunek:

1. istniejący assortment wybiera `ItemKind` i quantity,
2. podczas authoritative stock initialization każda armor sztuka dostaje deterministycznie resolved quality,
3. tworzona jest konkretna `ArmorItemInstance`,
4. stock pozostaje finite i owned.

Rozszerzyć istniejące `seedMerchantStockIfNeeded()` lub bezpośredni helper na tej granicy zamiast tworzyć drugi merchant stock pipeline.

## 11. Quality distribution

Rozkład jakości powinien zależeć głównie od skali źródła handlowego.

### SM

- `poor` częste,
- `common` częste,
- `good` rzadkie,
- `masterwork` bardzo rzadkie.

### MD

- `poor` możliwe,
- `common` dominujące,
- `good` okazjonalne,
- `masterwork` rzadkie.

### LG

- `poor` rzadsze,
- `common` częste,
- `good` częste,
- `masterwork` możliwe.

### XL

- `poor` rzadkie,
- `common` normalne,
- `good` częste,
- `masterwork` realnie dostępne.

Nie wprowadzać hard unlocków quality per `VillageSize`.

## 12. Merchant specialization jako bias

`weapons-tools` Merchant może mieć umiarkowanie lepszy quality bias dla armor niż `general`.

Specialization nie może jednak posiadać własnego quality systemu. Jest tylko jednym wejściem do wspólnego resolvera.

Settlement size pozostaje głównym sygnałem jakości handlowej.

## 13. Region wpływa na ItemKind, nie bezpośrednio na quality

Region z `settlements-012` pozostaje odpowiedzialny głównie za rodzaj goods:

```text
mountain → metal armor bardziej prawdopodobny
forest   → leather armor bardziej prawdopodobny
```

Nie zakładać automatycznie:

```text
mountain → masterwork
forest   → poor
```

Quality opisuje wykonanie konkretnego egzemplarza, nie pochodzenie regionu.

## 14. Integracja z premium outcome settlements-012

Nie tworzyć drugiego niezależnego premium rolla dla armor quality.

Jeżeli istniejący settlement-level premium outcome z `settlements-012` dotyczy armor, powinien **silnie biasować** quality w stronę `good/masterwork`.

Nie zakładać automatycznie `premium armor => masterwork`.

Jeżeli podczas implementacji obecny kontrakt premium jednoznacznie oznacza premium egzemplarz, można zagwarantować minimum `good`; w przeciwnym razie zachować mocny deterministic bias bez twardej gwarancji.

## 15. Merchant stock pozostaje finite

Quality generation odbywa się tylko podczas authoritative stock initialization.

Nie rerollować quality:

- przy otwarciu UI,
- przy stream-in,
- przy rozmowie,
- przy save/load,
- po sprzedaży przedmiotu.

Sprzedana `good chainmail` pozostaje sprzedana i nie odrasta przy reopen/reload.

## 16. Determinism

Quality roll musi być deterministyczny i używać osobnego RNG salt względem istniejących merchant profile / assortment / premium streams.

Ten sam:

```text
world seed
+ settlement
+ Merchant
+ armor stock entry / unit index
```

musi generować tę samą quality przy inicjalizacji tego samego świata.

Nie zmieniać istniejących seed streams.

## 17. Ordinary acquisition default

Zachować istniejącą semantykę:

```ts
createArmorInstance(kind)
```

→ `common`.

Dotyczy m.in.:

- legacy migration,
- zwykłego `grantItem`,
- starych quest rewards,
- debug grants,
- systemów, które nie deklarują jakości.

Nie losować quality globalnie w `createAcquiredInstance()`.

Quality musi być jawnie przekazana przez system, który rzeczywiście ją determinuje.

## 18. World availability

`poor` armor powinien być łatwiej dostępny niż wysokiej jakości armor.

V1 osiąga to przede wszystkim przez istniejący Merchant stock.

Nie tworzyć w tym planie nowego world-loot generatora.

Jeśli istniejące authoritative armor reward/spawn paths już potrafią przekazać konkretną instancję, mogą korzystać z quality, ale nie rozszerzać zakresu o nowe systemy lootowania.

## 19. Generic NPC trade

Jeżeli NPC posiada realną `ArmorItemInstance`, generic NPC trade musi zachować:

```text
instanceId
kind
quality
```

oraz wycenić ją quality-aware.

Nie generować w tym planie nowego armor stocku zwykłym NPC.

## 20. Trade UI

Trade UI musi rozróżniać różne jakości tej samej zbroi oraz pokazywać cenę konkretnej instancji.

Przykład:

```text
Kolczuga — Kiepska
Kolczuga — Dobra
Kolczuga — Mistrzowska
```

Nie grupować kilku jakości w jeden wiersz, jeśli prowadziłoby to do utraty informacji o quality lub cenie.

Reuse istniejące instance-row presentation, jeśli pasuje do aktualnego UI.

## 21. Inventory UI

Existing armor quality presentation pozostaje authoritative.

Dodać `poor` do:

- label mapping,
- sorting/grouping,
- effective stat presentation.

UI korzysta z tych samych resolverów co gameplay/trade. Nie duplikować formuł w Vue.

## 22. Persistence

`ArmorItemInstance.quality` już jest persistowane.

Rozszerzyć walidację i normalizację o `poor`.

Starsze save'y:

```text
missing / invalid quality
→ common
```

pozostają kompatybilne.

Merchant stock quality musi przechodzić istniejącą persisted instance ścieżką bez osobnego cached offer state.

## 23. Existing mechanisms to reuse

Kluczowe:

- `src/items/itemInstances.ts`
  - `ArmorQuality`
  - `ArmorItemInstance`
  - armor validation / cloning
- `src/items/armorItemInstances.ts`
  - `createArmorInstance`
  - centralized quality tuning
  - `resolveEffectiveArmorPiece`
- `src/items/tradeCatalog.ts`
  - `MERCHANT_PRICES`
  - `tradeValue`
  - `resolveInstanceSellPrice`
  - social pricing
- `src/items/trade.ts`
  - instance-backed transaction paths
  - acquisition / transfer helpers
- `src/settlement/merchantTrade.ts`
  - `MerchantProfile`
  - `generateMerchantAssortment`
  - settlement-level premium outcome
  - finite stock initialization
  - deterministic merchant RNG
- existing inventory/trade UI instance presentation.

## 24. Ownership

Nie tworzyć:

- `ArmorQualityManager`,
- `MerchantQualityManager`,
- osobnego armor price table,
- quality-specific `ItemKind`,
- cached UI offers jako source of truth.

Ownership pozostaje:

```text
Inventory
→ owns ArmorItemInstance

ArmorItemInstance
→ owns quality

ITEM_CATALOG
→ owns base armor stats

tradeCatalog
→ owns base economic value / pricing rules

merchantTrade
→ owns merchant ItemKind assortment / stock initialization context
```

## 25. Performance

Quality jest generation-time / transaction-time concern.

Nie wykonywać globalnego skanu `all settlements × all Merchants × all armor` per frame.

Quality generation zachodzi przy stock initialization, pricing przy trade preview/transaction, a gameplay nadal korzysta z istniejących equipment resolvers.

## 26. Scope

Implement:

1. `poor` w `ArmorQuality`;
2. player-facing label;
3. poor gameplay tuning;
4. uogólniony penalty tuning;
5. centralny armor quality value multiplier;
6. quality-aware concrete-instance sell value;
7. quality-aware concrete-instance Merchant buy price;
8. transfer istniejącej Merchant armor instance zamiast recreate jako `common`;
9. deterministic Merchant armor quality generation po istniejącym ItemKind assortment;
10. settlement-size quality bias;
11. umiarkowany Merchant specialization bias;
12. integrację z istniejącym premium outcome bez drugiego premium systemu;
13. finite persistent quality stock;
14. generic instance trade continuity;
15. trade UI quality + concrete-instance price;
16. persistence validator support dla `poor`;
17. testy;
18. JSDoc dla ważnych publicznych quality/value resolver APIs z `@domain items-player`.

## 27. Poza zakresem

Nie implementować:

- weapon quality;
- weapon pricing changes;
- weapon durability redesign;
- armor durability;
- armor repair;
- crafting;
- smith skill;
- leatherworking skill;
- NPC autonomous armor equipment;
- NPC production-quality simulation;
- global economy quality simulation;
- dynamic regional pricing;
- merchant restocking;
- random rerolls przy reopen;
- nowych armor `ItemKind` tylko dla jakości;
- nowych world loot systems;
- hit-location damage;
- armor penetration.

## 28. Invariants

- quality należy do `ArmorItemInstance`;
- `poor/common/good/masterwork` nie są osobnymi `ItemKind`;
- `MERCHANT_PRICES[kind]` pozostaje common/base value;
- cena konkretnej instancji wynika z quality;
- istniejący assortment wybiera `ItemKind` przed quality;
- quality nie zmienia dostępności samego `ItemKind`;
- ten sam quality/value resolver nie jest kopiowany do UI;
- Merchant posiada konkretną armor instance;
- zakup przenosi tę instancję zamiast odtwarzać `common`;
- quality nie rerolluje się przy reopen/save/load;
- `createArmorInstance(kind)` nadal domyślnie daje `common`;
- premium outcome z `settlements-012` jest reuse, nie dublowany;
- broń pozostaje bez zmian.

## 29. Testy

### Quality

- `poor` jest poprawnym `ArmorQuality`;
- invalid/missing quality nadal normalizuje się do `common`;
- dla protection zachodzi kierunek `poor < common < good < masterwork`;
- dla weight zachodzi `poor > common > good > masterwork`;
- armor restriction penalties pogarszają się dla `poor`.

### Pricing

Dla tego samego `ItemKind`:

```text
poor < common < good < masterwork
```

Sprawdzić:

- Merchant concrete-instance buy price,
- player sell price,
- social modifiers,
- deterministic rounding.

### Merchant generation

Dla tego samego seed:

- quality stock jest stabilne;
- reopen nie zmienia quality;
- save/load nie zmienia quality.

Deterministic multi-seed tests:

- SM generuje więcej `poor/common` niż LG/XL;
- LG/XL generują więcej `good/masterwork`;
- nie istnieją hard unlocki quality.

### Premium

- premium outcome nie tworzy drugiego niezależnego quality roll systemu;
- premium armor jest silnie biasowane w stronę `good/masterwork`;
- wynik pozostaje deterministic.

### Transaction

- Merchant `good chainmail` trafia do gracza z tą samą `instanceId`/quality zgodnie z istniejącym ownership transfer contract;
- zakup nie recreates `common`;
- sprzedaż `masterwork` armor używa masterwork value;
- generic NPC instance trade zachowuje quality.

### Persistence

- `poor` round-trip save/load;
- old missing quality → `common`;
- Merchant stock quality round-trip.

### UI/data

- różne jakości tego samego armor kind są rozróżnialne;
- cena wyświetlana odpowiada concrete instance;
- effective stats odpowiadają gameplay resolverowi.

## 30. Weryfikacja przez użytkownika

W browserze:

1. znaleźć Merchantów w osadach różnej wielkości;
2. sprawdzić armor w jakości `Kiepska / Zwykła / Dobra / Mistrzowska`;
3. SM/MD powinny częściej oferować niższe jakości;
4. LG/XL powinny zauważalnie częściej oferować `good/masterwork`;
5. porównać ceny różnych jakości tego samego armor kind;
6. kupić `good/masterwork` armor i potwierdzić zachowanie quality;
7. sprzedać armor różnych jakości i porównać ceny;
8. save/load z Merchantem posiadającym niesprzedany quality armor;
9. potwierdzić, że stock i quality pozostają identyczne;
10. sprzedać rare/high-quality piece, save/load i potwierdzić, że nie odrasta.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
