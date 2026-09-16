# Plan: Vendor Identity and Settlement-Scaled Stock

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-033~~, ~~settlements-npcs-036~~, ~~settlements-npcs-040~~, ~~settlements-012~~, items-player-040
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `household`
**Tags:** `trade` `vendors` `inventory` `labels`
**Roadmap:** `economy-goods-flow.md`

## Goal

Uporządkować pojęcie vendora i początkowego stocku bez tworzenia osobnych systemów sklepów.

Docelowy model:

```text
NPC profession / merchant profile
→ vendor identity
→ vendor marker in NPC label

settlement size
+ terrain / dominant resource
+ profession / merchant specialization
+ home-settlement rules
→ finite initial stock
→ existing authoritative inventory
→ existing shared trade system
```

Każdy NPC nadal może handlować przez istniejący generic NPC trade, jeżeli posiada kwalifikujące się dobra. Vendor marker oznacza natomiast NPC, którego świat przedstawia jako stałe i rozpoznawalne źródło określonego rodzaju towarów.

Nie tworzyć nowej profesji `Vendor`, osobnych `BlacksmithShop` / `HunterShop` ani nowego inventory sklepu.

## Verified current-code foundations

Aktualny `main` posiada już fundamenty, które ten plan ma rozszerzyć, a nie zastępować:

- `settlements-npcs-033` / `settlements-npcs-036` — wspólny handel z NPC oparty o realne owned goods;
- `settlements-npcs-040` — profession-derived specialist starter stock dla m.in. Huntera, Woodcuttera, Farmera i Blacksmitha oraz Hunter bow/arrow production;
- `src/settlement/merchantTrade.ts` — finite persisted `merchantStock`, `MerchantSpecialization`, settlement-size `skuBudget`, terrain / dominant-resource bias, premium roll i home starter overlay;
- `src/ai/npcTradeAvailability.ts` — explicit ordinary-NPC trade eligibility nad owned goods;
- `src/settlement/household.ts` — authoritative persistent `Household.items` dla specialist stocku;
- `src/ui/agentStatusLabel.ts` — wspólny DOM/CSS2D label NPC z name row, quest markerem i bars;
- `items-player-040` — quality / pricing / world availability dla armor i instance-backed quality.

Plan nie może uzależniać architektury handlu od warstwy UI.

## 1. Vendor identity is semantic, not trade eligibility

Wprowadzić jeden wspólny resolver semantycznej tożsamości vendora, np.:

```ts
type NpcVendorKind =
  | 'merchant'
  | 'blacksmith'
  | 'hunter'
```

oraz jeden resolver używany przez presentation layer, np. `resolveNpcVendorKind(...)`.

V1:

```text
Trader / Merchant → vendor
Blacksmith        → vendor
Hunter            → vendor

Woodcutter        → no vendor marker
Farmer            → no vendor marker
Guard             → no vendor marker
others            → no vendor marker
```

Nie rozrzucać po UI warunków typu `role === 'trader' || ...`.

Kluczowe rozdzielenie:

```text
trade eligibility
→ existing owned-goods trade policy

vendor identity
→ profession / merchant-profile semantic
```

Zwykły Woodcutter może mieć `Handel`, jeżeli posiada kwalifikujące się goods, ale nie staje się przez to rozpoznawalnym vendorem.

Vendor identity nie może zależeć od `offers.length > 0`. Po wykupieniu chwilowego stocku NPC nadal pozostaje vendorem.

## 2. Vendor marker in NPC label

Rozszerzyć istniejący shared label z `src/ui/agentStatusLabel.ts` zamiast tworzyć drugi `CSS2DObject`.

Docelowa pierwsza linia konceptualnie:

```text
NPC name   [quest marker] [vendor marker]
```

Vendor marker:

- jest osobnym elementem od quest markera;
- nie steruje handlem;
- nie zależy od aktualnej liczby ofert;
- powinien respektować istniejące zasady observation / knowledge — nie ujawniać profesji/vendor identity wcześniej niż aktualna presentation policy pozwala poprawnie zidentyfikować NPC;
- powinien być prosty i czytelny, bez tworzenia nowego HUD subsystemu.

Preferować wspólny marker/icon seam w `AgentStatusLabelController`, tak aby nie dodawać profession-specific DOM mutations w `NpcAgent`.

## 3. Preserve existing stock ownership split

Zachować dwa istniejące źródła stocku:

```text
Merchant
→ merchantStock

Specialist NPC / family
→ Household.items
```

Nie scalać `merchantStock` z `Household.items` i nie tworzyć trzeciego `VendorStock`.

Każdy item ma nadal jednego realnego ownera i istniejące transaction paths odpowiadają za transfer do gracza.

## 4. Settlement-scaled initial specialist stock

Rozszerzyć profession starter-stock policy z `settlements-npcs-040` tak, aby initial specialist assortment zależał od istniejącego kontekstu osady:

```text
profession
+ VillageSize
+ SettlementTerrain
+ dominantResource
+ isHome
→ deterministic initial stock
```

Skala osady wpływa głównie na:

- liczbę dostępnych SKU;
- bounded quantities;
- baseline quality distribution dla instance-backed equipment;
- dostęp do bardziej zaawansowanych goods.

Terrain / dominant resource działają jako bias asortymentu, nie twarda blokada.

Starter stock nadal:

- powstaje tylko przy genuine first construction;
- trafia do istniejącego authoritative ownera;
- jest deterministyczny;
- nie odrasta po reopen / stream-in / rebuild / save-load;
- później może być uzupełniany wyłącznie przez realną produkcję / logistykę, jeśli dany system istnieje.

## 5. Home settlement SM — guaranteed starter availability

Początkowa osada jest `SM`, ale nie może zachowywać się jak losowa mała osada w zakresie podstawowego wyposażenia gracza.

Home settlement ma otrzymać minimalną gwarantowaną dostępność starter gear przez istniejące merchant/specialist stock mechanisms.

Co najmniej:

```text
backpack
waterskin_small
tent
firestarter
blanket
knife
axe
pickaxe
bandage
leather_pauldron
```

`leather_pauldron` ma być realną instance-backed sztuką z niską jakością — preferencyjnie najniższą istniejącą quality (`poor`), jeżeli jest zgodna z finalnym shared quality contract z `items-player-040`.

Home override gwarantuje **availability**, nie podwyższoną jakość.

Nie wszystkie te przedmioty muszą należeć do jednego NPC. Mogą być rozłożone między Merchant / Hunter / Blacksmith zgodnie z normalnym ownership modelem, ale test końcowy ma potwierdzać ich rzeczywistą dostępność w home settlement.

Home starter overlay ma rozszerzać normalny regionalny stock, a nie zastępować go.

## 6. General Merchant must remain genuinely general

`MerchantSpecialization` jest biasem, nie wyłącznością kategorii.

`general` Merchant powinien mieć szeroki bazowy przekrój dóbr, obejmujący również podstawową broń, narzędzia i okazjonalnie podstawowy armor.

Przykładowe goods odpowiednie dla general assortment:

```text
knife
short_sword
axe
pickaxe
arrow
leather_pauldron
```

Nie wymaga to gwarancji każdego SKU u każdego Merchanta. Wymaga natomiast, aby basic weapon/tool/armor nie były logicznie wykluczone przez specjalizację `general` i miały realną szansę wejść do finite assortment.

Invariant:

> Żadna Merchant specialization nie może powodować, że podstawowa broń lub podstawowe narzędzia stają się praktycznie niedostępne w małej osadzie tylko dlatego, że lokalny Merchant nie jest `weapons-tools`.

`weapons-tools` pozostaje wyraźnie lepszym źródłem tej kategorii:

```text
general
→ broad baseline assortment
→ basic weapon/tool/armor can appear

weapons-tools
→ stronger category coverage
→ more relevant SKU
→ larger relevant quantities where appropriate
→ better quality bias where shared quality resolver allows it
→ premium weapon/armor eligibility / stronger chance
```

Nie tworzyć osobnych catalogów zduplikowanych między specializationami. Użyć wspólnego katalogu + affinity/bias.

## 7. Hunter vendor stock

Hunter pozostaje specialist vendorem opartym o `Household.items`.

Preferowany settlement-scale shape:

### SM

Core:

```text
arrow
dried_meat
herb
```

Mała ilość / bounded availability odpowiednich dóbr:

```text
short_bow
waterskin_small
leather_pauldron
```

Home `SM` musi współuczestniczyć w gwarancji starter availability z §5 — jeżeli Merchant nie zapewnia danego leather/travel good, Hunter może być jego authoritative source.

### MD

Rozszerzenie m.in. o:

```text
hunting_bow
leather_pauldron
waterskin_small
backpack
```

### LG / XL

Większa szerokość i/lub jakość hunting assortment, np.:

```text
better bows
leather_armor
better arrows
higher-quality leather equipment
```

Nie tworzyć nowej profesji leatherworker w tym planie.

Hunter bow/arrow replenishment nadal korzysta z istniejącej realnej produkcji z `settlements-npcs-040`.

## 8. Blacksmith vendor stock

Blacksmith jest drugim głównym specialist vendorem.

Preferowany settlement-scale shape:

### SM

Mały basic metal assortment, np.:

```text
knife
short_sword or long_sword
basic metal tool
metal pauldron
```

Jakość głównie low/common zgodnie ze wspólnym quality resolverem.

### MD

Większy wybór:

```text
swords
axes
pickaxe
pauldrons
basic armor where currently supported
```

### LG

Możliwe:

```text
chainmail
better swords
better armor pieces
```

### XL

Mała deterministyczna możliwość premium metal goods, np.:

```text
masterwork_sword
damascus weapons
high-quality armor
premium metal equipment
```

Nie implementować w tym planie pełnej produkcji sword/armor przez Blacksmitha. Initial finite stock pozostaje bootstrapem; późniejsze replenishment wymaga realnego production chain.

## 9. Settlement character bias

Wykorzystać już istniejące informacje o świecie zamiast dodawać nowy `SettlementTradeType`.

Przykładowy bias:

```text
mountain + iron/coal
→ stronger metal assortment
→ Blacksmith / weapons-tools relevance increases

forest
→ bows / arrows / hunting / leather relevance increases

ocean
→ imports / travel / fishing relevance increases
```

Bias nie może oznaczać absolutnego zakazu. Importowane goods nadal mogą trafić do settlement przez Merchant assortment.

Nie tworzyć duplikującej mapy biome→goods, jeżeli istniejące `regionalClass()` / specialization-affinity mechanisms w `merchantTrade.ts` mogą zostać rozszerzone.

## 10. Essential / advanced / premium availability

Plan ma jawnie rozróżnić oczekiwania dotyczące dostępności.

### Essential

Powinny być stosunkowo łatwo osiągalne i nie zależeć od jednego rzadkiego RNG rolla:

```text
waterskin
backpack
tent
knife
axe
pickaxe
basic bow
basic arrows
basic leather protection
```

Home `SM` ma szczególną gwarancję z §5.

### Advanced

Mogą wymagać większej osady, odpowiedniego vendora lub regionu:

```text
chainmail
better bows
better armor
damascus weapons
```

### Premium

Pozostają rzadkie:

```text
masterwork_sword
masterwork-quality armor
top-quality specialist equipment
```

Powinny wynikać z większej osady / właściwego regionu / odpowiedniego vendora / istniejącego premium roll, a nie być gwarantowane w starter settlement.

## 11. Quality policy

Nie tworzyć vendor-specific quality systemu.

Instance-backed equipment ma korzystać ze wspólnego quality modelu z `items-player-040`.

Docelowy bias skali osady:

```text
SM     → mostly poor/common
MD     → mostly common, occasional good
LG     → common/good, rare masterwork
XL     → stronger good availability, rare masterwork
```

To jest kierunek balance policy, nie drugi quality resolver. Implementacja ma wykorzystać shared quality mechanism po zweryfikowaniu finalnego kontraktu `items-player-040`.

Home `SM` może gwarantować np. `leather_pauldron` o `poor` quality, ale nie dostaje sztucznego quality boostu.

## 12. Merchant assortment cleanup

Zachować istniejące mechanizmy:

```text
VillageSize
SettlementTerrain
dominantResource
MerchantSpecialization
premium roll
skuBudget
```

Sprawdzić i poprawić selection coverage tak, aby wynik był sterowany affinity / regional relevance, a nie pozycją `ItemKind` w katalogu.

W szczególności:

- `general` ma realnie obejmować basic weapons/tools/armor;
- `weapons-tools` ma mieć silniejsze coverage bows/arrows/weapons/tools/armor;
- specialty affinity jest biasem;
- basic short sword może pojawić się u general Merchanta;
- premium goods (`masterwork_sword`, premium armor itd.) pozostają kontrolowane przez istniejące rarity/quality/premium mechanisms.

Nie rozwiązywać problemu wyłącznie przez bezwarunkowe podniesienie `skuBudget`.

## 13. Ownership and persistence invariants

- Merchant assortment pozostaje w istniejącym `merchantStock`;
- specialist goods pozostają w `Household.items`;
- NPC personal loadout pozostaje osobnym ownership layer i nie staje się stockiem sklepu;
- vendor marker nie nadaje prawa do sprzedaży żadnego itemu;
- zakup usuwa exact stack / instance z authoritative stocku;
- instance-backed purchase zachowuje existing identity/state/quality;
- reopen nie regeneruje stocku;
- stream-out/in nie regeneruje stocku;
- save/load zachowuje zredukowany stock;
- brak nowego settlement wallet / vendor inventory / market state.

## 14. Expected implementation seams

Implementacja powinna przede wszystkim rozszerzyć istniejące mechanizmy. Relevant current seams obejmują:

- `src/ui/agentStatusLabel.ts`
  - shared label DOM/controller;
- `src/ai/NpcAgent.ts`
  - tylko przekazanie semantic presentation context, jeżeli potrzebne;
- istniejący role/profession/profile context używany do rozpoznania NPC vendora — finalny resolver ulokować przy authoritative semantic data, nie w DOM helperze;
- `src/settlement/household.ts`
  - one-time specialist bootstrap / `Household.items`;
- istniejący family→starting-context seam użyty przez `settlements-npcs-040`;
- `src/settlement/merchantTrade.ts`
  - specialization affinity, regional bias, home overlay, quantity/budget/selection;
- `src/ai/npcTradeAvailability.ts`
  - reuse existing trade policy; nie uzależniać go od vendor marker;
- shared item-instance / quality helpers z `items-player-040` po finalizacji jego kontraktu.

Dopasować finalne call-sites do aktualnego kodu podczas implementacji. Nie tworzyć parallel managera, jeżeli obecne seams wystarczają.

Dla nowych ważnych publicznych/architektonicznych resolverów dodać JSDoc; użyć `@domain settlements-npcs` tam, gdzie poprawia preflight discovery.

## 15. Focused tests

### Vendor identity / label

```text
Trader / Merchant → vendor marker
Blacksmith        → vendor marker
Hunter            → vendor marker
Woodcutter        → no vendor marker
```

Woodcutter z kwalifikującym się owned good nadal może pokazać `Handel` bez vendor markera.

Vendor marker nie znika tylko dlatego, że stock chwilowo spadł do zera.

Observation/knowledge test potwierdza, że marker nie ujawnia profession identity wcześniej niż istniejąca presentation policy na to pozwala.

### Home SM starter availability

W home settlement realnie dostępne są co najmniej:

```text
backpack
waterskin_small
tent
firestarter
blanket
knife
axe
pickaxe
bandage
leather_pauldron
```

`leather_pauldron` jest realną low-quality instance-backed sztuką.

### General Merchant

- `general` Merchant może otrzymać `short_sword`;
- może mieć również basic tool / basic armor;
- nie wymaga `weapons-tools`, aby basic weapon był osiągalny;
- `weapons-tools` nadal ma statystycznie / deterministycznie silniejsze category coverage niż równoważny `general` profile.

### Settlement scaling

- SM specialist stock jest węższy / mniejszy niż LG/XL przy porównywalnym kontekście;
- mountain + iron/coal wzmacnia metal assortment względem równoważnego forest settlement;
- forest wzmacnia hunting assortment;
- bias nie usuwa całkowicie importowanych/basic goods.

### Quality

- SM stock korzysta głównie z low/common jakości;
- home guaranteed leather pauldron zachowuje low quality;
- większa osada może wygenerować lepszy equipment bez osobnego vendor quality systemu;
- zakup exact instance zachowuje quality.

### Persistence

```text
buy item
→ close/reopen
→ item stays gone

buy item
→ save/load
→ item stays gone
```

Starter stock nie odrasta wskutek reconstruction.

## 16. Explicit non-goals

Nie implementować tutaj:

- Blacksmith player orders;
- pełnego Blacksmith weapon/armor production chain;
- automatic stock respawn;
- timer-based fake replenishment;
- dynamic pricing;
- merchant profit / wages;
- Travelling Merchant lifecycle (`settlements-npcs-038`);
- caravans / trade routes;
- nowych profesji `vendor` / `leatherworker`;
- osobnego shop inventory;
- nowego quality systemu.

## 17. Follow-up: Blacksmith orders

Zamówienia gracza u Blacksmitha powinny być osobnym przyszłym planem, dopiero po uporządkowaniu stocku i realnej produkcji.

Docelowy kierunek:

```text
player chooses order
→ Blacksmith accepts
→ payment / materials commitment
→ real profession production work
→ world time passes
→ finished real item
→ player pickup
```

Nie implementować tego jako prostego timera mintującego item niezależnie od świata.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
