# Plan: Regional specialist trade and settlement-scale quality

**Created:** 2026-09-13
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~settlements-npcs-033~~
**Domain:** `settlements`
**Type:** `feature`
**Roadmap:** `economy-goods-flow.md`
**Model:** Opus, Sonnet

## Cel

Sprawić, aby większe osady miały bogatszą i bardziej zróżnicowaną warstwę handlową: więcej Merchant NPC, własne specjalizacje, czytelne miejsca handlu oraz regionalnie charakterystyczną dostępność goods.

Nie tworzyć osobnych profession shops ani drugiego systemu ekonomii. Plan rozszerza istniejący profession staffing, merchant trade i generic NPC trade z `settlements-npcs-033`.

Docelowo:

```text
real owned / produced goods
+ NPC profession
+ merchant specialization
+ settlement size
+ region / terrain
+ deterministic seed
→ player-facing assortment
```

## 1. Multiple Merchants in larger settlements

Obecny `professionStaffing.ts` traktuje `trader` jako praktycznie pojedynczą rolę. Rozszerzyć istniejący staffing zamiast tworzyć osobny merchant generator.

Rozmiar osady wyznacza capacity/weight, ale realny adult workforce pozostaje ograniczeniem:

- `SM` — zwykle 0, wyjątkowo 1 Merchant;
- `MD` — zwykle maksymalnie 1;
- `LG` — zwykle 1–2;
- `XL` — zwykle 2–3.

Nie gwarantować liczby wyłącznie po `VillageSize`. Mała populacja nie może magicznie wygenerować dodatkowych NPC.

Nie tworzyć nowych rodzin tylko po to, aby wypełnić merchant slots.

## 2. Merchant specialization

Merchant pozostaje istniejącą rolą `trader`.

Nie dodawać nowych `Role` typu `weapon_trader`, `food_trader` czy `import_trader`.

Dodać lekką, deterministyczną specjalizację przypisaną do Merchant NPC, np.:

```ts
type MerchantSpecialization =
  | 'general'
  | 'weapons-tools'
  | 'food-materials'
  | 'imports-luxury'
```

Dokładne nazwy i ownership typu dopasować podczas implementacji do aktualnych merchant/trade structures.

Specjalizacja wpływa na **assortment preference / eligibility**, a nie na:

- item ownership,
- pricing,
- production,
- internal settlement economy,
- transaction engine.

## 3. Specialization diversity

Jeśli w jednej osadzie istnieje kilku Merchantów, preferować różne specjalizacje.

Przykładowo dla trzech Merchantów system powinien preferować trzy różne profile zamiast trzech `general`.

Duplikaty są dozwolone jako fallback, gdy region, liczba Merchantów albo available specialization set tego wymaga.

Selection musi być deterministyczny i korzystać z osobnego RNG salt, aby nie przetasować istniejących seed streams.

## 4. Merchant market area and stalls

LG/XL powinny móc posiadać kilka planned merchant work/trade anchors wokół istniejącego market/plaza.

Docelowo:

```text
market / plaza
→ stall anchor A → Merchant A
→ stall anchor B → Merchant B
→ stall anchor C → Merchant C
```

V1 nie wymaga osobnego sklepu-budynku dla każdego Merchanta.

Stall/work anchors powinny:

- należeć do `VillagePlan` albo istniejącego planned landmark/workplace contract,
- uczestniczyć w istniejącym spacing/clearance,
- mieć stabilne przypisanie do konkretnego Merchant NPC,
- być normalnym miejscem pracy/handlu NPC.

Nie tworzyć `ShopManager`, `MerchantDistrictManager` ani nowego occupancy systemu.

## 5. Assortment is not guaranteed stock

Merchant specialization nie może gwarantować konkretnego przedmiotu.

Specjalizacja definiuje preferencje i kwalifikację goods, ale realna oferta nadal wynika z authoritative stock/owner state.

Przykład:

```text
weapons-tools specialization
→ prefer weapons/tools
→ jeśli brak realnych goods, oferta może być słaba
```

Nie mintować goods przy otwieraniu UI.

## 6. Generic NPC trade remains the foundation

Plan zakłada `settlements-npcs-033`:

```text
Household.items / real owner
→ protected reserve
→ trade-eligible quantity
→ shared NPC trade session
```

Nie tworzyć:

- `BlacksmithShop`,
- `HunterShop`,
- `RegionalShop`,
- osobnego `NpcShopInventory`,
- osobnego pricing systemu.

Zwykły specialist NPC nadal może sprzedawać własne realne produkty zgodnie z `033`.

Merchant pozostaje specjalnym profilem handlowym z general/import assortment.

## 7. Settlement-scale availability

Rozmiar osady wpływa na szerokość i jakość dostępnej oferty, ale bez hard unlocków.

Ogólna hierarchia:

- `SM` — głównie podstawowe/local goods; premium bardzo rzadkie;
- `MD` — szersze produkty profesji, okazjonalne quality goods;
- `LG` — dobre specialist coverage i wysoka szansa high-quality goods;
- `XL` — wiele merchant/specialist sources i bardzo wysoka szansa co najmniej jednego premium/high-quality good gdzieś w odpowiedniej sieci handlowej osady.

Mała osada może wyjątkowo posiadać rzadki przedmiot lub bardzo dobrego specialistę.

Nie wprowadzać `LG-only` / `XL-only` item unlocków.

## 8. Premium probability is settlement-level

Dla `XL` przyjąć jako punkt kalibracyjny około **80% szansy**, że gdzieś w odpowiedniej sieci Merchantów/specjalistów osady dostępne jest co najmniej jedno premium/high-quality good.

To nie jest:

- 80% per item,
- 80% per Merchant,
- gwarancja konkretnego przedmiotu.

Roll powinien być liczony jako bounded settlement-level outcome, aby kilku Merchantów nie multiplikowało przypadkowo prawdopodobieństwa do niemal 100%.

## 9. Profession fit

Specialist goods powinny przede wszystkim pochodzić od właściwych profesji albo odpowiednio wyspecjalizowanego Merchanta.

Przykładowe kierunki:

- Blacksmith → metal tools, weapons, metal equipment;
- Hunter → arrows i hunting goods, jeśli faktycznie je posiada;
- Textile Worker → textile goods;
- Herbalist → herbal/medical goods;
- Merchant `general` → general goods;
- Merchant `imports-luxury` → imports / rare general goods;
- Merchant `weapons-tools` → preferowane weapons/tools;
- Merchant `food-materials` → food/material assortment.

Nie hardkodować list w dialogu lub UI. Preferować jedną declarative policy opartą o istniejące ItemKind metadata/katalog.

## 10. Regional assortment

Region/terrain ma silnie wpływać na availability.

V1 może używać istniejącego settlement terrain/environment zamiast tworzyć osobny geopolitical region system.

### Mountain

Preferować:

- ores / metal-related goods,
- lepsze metal tools,
- weapons / heavy equipment,
- high-grade metal goods.

### Forest

Preferować:

- bows,
- arrows,
- leather/hunting goods,
- materiały związane z lasem i polowaniem.

### Coast / ocean settlement

Preferować:

- większą różnorodność general goods,
- imported goods,
- istniejące maritime-flavored goods, jeżeli ItemKind faktycznie istnieje.

Nie wymyślać nowych ItemKind tylko dla regionalnego flavor.

## 11. Local vs imported

Towary typowe dla regionu są częstsze. Towary nietypowe dla regionu pozostają możliwe jako rzadkie imports.

Przykład:

```text
mountain settlement
→ high-grade metal goods relatively plausible

forest settlement
→ same goods possible, but uncommon/imported
```

Nie tworzyć global market simulation tylko po to, aby oznaczyć item jako imported.

V1 może używać deterministic availability bias.

## 12. Coastal trade landmark

Jeżeli większa coastal settlement posiada istniejący `dock` / `dockRoute`, można rozszerzyć go do czytelniejszego small port/pier landmarku jako wizualnego uzasadnienia imports.

Reuse istniejącego landmarku i routingu.

Nie tworzyć:

- `PortSystem`,
- `HarborManager`,
- ships,
- pełnej maritime economy.

Port v1 jest worldgen landmarkiem i przyszłym anchor dla handlu/questów.

## 13. Authoritative ownership

Availability policy nigdy nie może mintować goods przy każdym otwarciu trade screen.

Preferowana kolejność źródeł:

1. real goods w `Household.items` / istniejącym owner inventory;
2. istniejący merchant stock mechanism dla general/import goods;
3. jeśli konieczne dla brakujących production chains — mały generation-time initial specialist stock u realnego ownera.

Jeżeli dodawany jest initial specialist stock:

- tylko istniejące `ItemKind`;
- posiada authoritative ownera;
- jest deterministyczny;
- nie odrasta po sprzedaży przez reopen/streaming/reload;
- późniejsza production może normalnie tworzyć nowe goods.

Nie tworzyć infinite shop inventory.

## 14. Pricing boundary

Region, settlement size i specialization wpływają na availability, nie tworzą drugiej formuły cenowej.

Ceny nadal korzystają z istniejącego trade catalogu oraz social pricing z `settlements-npcs-033`:

```text
relation with NPC
+ settlement reputation
+ renown
→ price modifier
```

Nie dodawać osobnego premium pricing formula ani regionalnego arbitrażu w tym planie.

## 15. Economy / production boundary

Ten plan nie zastępuje internal economy.

`settlements-npcs-017/020/021` mogą później wpływać na rzeczywisty stock poprzez shortage, production i logistics, ale nie są architektoniczną podstawą assortment policy.

Naturalny flow:

```text
production / logistics
→ authoritative goods owner
→ specialization / trade eligibility
→ player trade
```

Nie kopiować shortage ani transport state do merchant availability.

## 16. Persistence

Nie persistować cached offer rows ani rerollowanych assortments.

Persistuje authoritative inventory i istniejący NPC/settlement state.

Po save/load:

- sprzedany rare item nadal jest sprzedany,
- niesprzedany pozostaje u właściciela,
- Merchant zachowuje stabilną specjalizację,
- stall assignment pozostaje stabilny,
- UI rebuilds offer from live state.

## 17. Performance

Nie wykonywać globalnego skanu:

```text
all settlements × all NPCs × all ItemKinds
```

na każdej klatce.

Generation-time:

- staffing,
- specialization assignment,
- stall assignment,
- ewentualny initial specialist assortment.

Runtime player trade:

- licz ofertę tylko dla otwieranego NPC,
- reuse live owner inventory i policy z `033`.

## 18. Existing mechanisms to reuse

Kluczowe:

- `docs/plans/settlements-npcs-033-player-trading-with-any-npc.md`;
- `src/settlement/professionStaffing.ts`;
- istniejący `Role = 'trader'`;
- `Household.items`;
- existing merchant stock/special offers;
- `src/items/tradeCatalog.ts`;
- existing relationship/reputation pricing;
- `VillagePlan` / market / plaza placement;
- existing `dock` / `dockRoute`;
- real production outputs.

## Invariants

- wielu Merchantów powstaje przez istniejący staffing, nie osobny generator;
- liczba Merchantów respektuje adult workforce;
- specialization nie jest nową profesją;
- kilku Merchantów preferuje różne specialization;
- stall/work anchors należą do planned settlement layout;
- specialization filtruje assortment, nie tworzy ownership;
- region/size zmieniają availability, nie pricing;
- premium probability jest settlement-level;
- stock jest realny i nie rerolluje się po reopen;
- player/camera nie są wymagane do istnienia merchant state.

## Testy

Dodać deterministic tests obejmujące co najmniej:

### Staffing

- SM/MD nie generują nadmiarowych Traderów;
- LG może posiadać 2 Traderów przy odpowiednim workforce;
- XL może posiadać 2–3 Traderów przy odpowiednim workforce;
- insufficient adult workforce ogranicza liczbę Merchantów;
- staffing nie tworzy nowych NPC ani rodzin tylko dla trade capacity.

### Specialization

- Merchant specialization jest stabilna dla tego samego seed/NPC;
- wielu Merchantów preferuje unikalne specialization;
- duplikat jest możliwy tylko jako deterministic fallback;
- specialization nie zmienia Role.

### Market area

- każdy Merchant posiada stabilny market/stall work anchor, gdy market layout go zapewnia;
- stall anchors respektują existing spacing/clearance;
- nie nakładają się na central gameplay props.

### Settlement scale

- premium availability rośnie z `SM` → `MD` → `LG` → `XL`;
- mała osada nadal może wyjątkowo posiadać premium good;
- XL osiąga docelowo około 80% settlement-level chance co najmniej jednego premium offer;
- wielu Merchantów nie multiplikuje rolla poza zaprojektowany settlement-level target.

### Region

- mountain bias preferuje metal/high-grade goods;
- forest bias preferuje hunting/leather/bow goods;
- coast zwiększa import/general diversity;
- outside-region goods pozostają możliwe, ale rzadsze.

### Ownership / persistence

- każdy offered real item posiada authoritative ownera;
- zakup usuwa realny stock;
- reopen nie regeneruje sprzedanego rare itemu;
- save/load nie rerolluje merchant specialization ani sprzedanego stocku;
- initial specialist stock, jeśli użyty, nie jest infinite.

### Pricing

- specialization nie tworzy osobnej ceny;
- region/size nie tworzą osobnej ceny;
- existing relation/reputation/renown pricing pozostaje authoritative.

## Poza zakresem

- dynamic pricing;
- global market simulation;
- pełny inter-settlement trade;
- caravans;
- ships;
- maritime economy;
- nowe `ItemKind`;
- nowe quality tiers;
- pełne nowe production chains;
- osobne shop buildings per Merchant;
- osobne merchant professions per specialization;
- replenishing magic stock;
- settlement leveling.

## Weryfikacja przez użytkownika

W browserze sprawdzić kilka settlements o różnych rozmiarach i terrain:

1. SM/MD mają mało Merchantów;
2. LG/XL mogą mieć kilku Merchantów;
3. kilku Merchantów ma różne specjalizacje i własne stall/work areas;
4. duża osada nie wygląda jak jeden "supermerchant" z całym stockiem;
5. mountain/forest/coast dają zauważalnie różne assortments;
6. premium goods są częstsze w dużych osadach, ale nie są hard-locked;
7. zakupiony rare item nie pojawia się ponownie po reopen;
8. ceny nadal zależą od istniejącej relacji/reputacji;
9. layout marketu nie powoduje kolizji centralnych propsów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
