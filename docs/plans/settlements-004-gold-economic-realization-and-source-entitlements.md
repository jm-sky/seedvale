# Plan: Gold Economic Realization & Source Entitlements

**Created:** 2026-09-08
**Status:** `draft`
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `settlements`
**Subdomains:** `economy`
**Tags:** `gold` `economy` `entitlements` `source-attribution`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

> **Draft:** ten plan jest wstępnym szkicem do sprawdzenia, uzupełnienia i poprawy przed oznaczeniem jako `planned`.

## Cel

Dodać najmniejsze reusable rozszerzenie ekonomii potrzebne do przeprowadzenia złota od rzeczywistej produkcji do ekonomicznej realizacji oraz do naliczania source-aware udziałów w przychodach.

Mechanizm ma umożliwić późniejszemu questline'owi opuszczonej kopalni zaoferowanie Playerowi 20% udziału w przyszłych przychodach z konkretnej kopalni/kolonii, bez questowego licznika i bez wyliczania udziału z aktualnego stocku, inventory albo niewydobytej rezerwy.

Docelowy kontrakt:

```text
actual attributable production
→ settlement economic stock
→ economic realization
→ source-aware realized value
→ entitlement accrual exactly once
```

## Stan obecny

Aktualny flow minera kończy się na:

```text
ResourceDeposit(gold)
→ miner mines real deposit
→ carried NPC Inventory: gold
→ successful deposit at settlement stockpile
→ SettlementEconomy.add('gold', amount)
→ persisted settlement gold stock
```

`SettlementEconomy` jest authoritative właścicielem bulk economic stock osady i jest persistowany przez `SaveData.settlementEconomies`.

Obecnie nie istnieje pełny settlement-side flow:

```text
SettlementEconomy.gold
→ sale/export
→ settlement coins/revenue
```

Merchant trade jest Player-centric. Coins są zwykłym `ItemKind = 'coin'`; nie istnieje settlement treasury ani generic settlement P&L.

## Gold value baseline

Nie tworzyć niezależnego questowego kursu złota.

Aktualny `src/items/tradeCatalog.ts` definiuje dla gold:

```text
tradeValue = 20
sellPrice  = 10
```

Dla pierwszej ekonomicznej realizacji settlement gold przyjąć jako bazowy kierunek istniejący cash realization precedent `sellPrice = 10 coins / gold`, chyba że recon przed implementacją wykaże zmianę katalogu lub nowy authoritative pricing mechanism.

Przy rezerwie kopalni z roadmapy:

```text
500 gold  → ~5,000 coins gross realized value
750 gold  → ~7,500 coins gross realized value
1000 gold → ~10,000 coins gross realized value
```

20% odpowiada orientacyjnie `1,000 / 1,500 / 2,000 coins`.

Nie kodować wartości całej kopalni ani oczekiwanej wypłaty jako runtime state — są to wartości wynikające z rzeczywistej realizacji wydobytego złota.

## Authoritative accounting boundaries

Rozdzielić dwie operacje:

### Production attribution

Source attribution powstaje dopiero, gdy wydobyte złoto rzeczywiście dociera do ekonomii osady.

Preferowana granica to istniejący successful miner deposit:

```text
carried gold
→ successful stockpile deposit
→ SettlementEconomy
```

Nie przypisywać produkcji na podstawie samego zmniejszenia `ResourceDeposit`, rozpoczęcia pracy minera ani późniejszego skanowania stocku.

### Economic realization

Entitlement nie nalicza się podczas production deposit.

Powinien naliczyć się dopiero na jawnej operacji ekonomicznej, która realizuje określoną ilość source-attributed gold do coin-equivalent value.

Ta operacja jest authoritative accounting boundary dla revenue/proceeds.

## Source attribution

Rozszerzyć gospodarkę tak, aby ilość gold wchodząca przez production deposit mogła zachować stabilną informację o ekonomicznym źródle.

Source identity musi być world/economy identity, nie quest ID.

Dla abandoned gold mine kilka fizycznych `ResourceDeposit` powinno móc należeć do jednego stabilnego economic source/site reprezentującego kopalnię. Entitlement odnosi się do tego source, a nie do pojedynczego depositu.

Nie zmieniać całego `SettlementEconomy` w per-source inventory. Zwykły aggregated stock nadal pozostaje podstawowym stockiem osady; source accounting ma być najmniejszą dodatkową strukturą potrzebną do poprawnego przypisania realizowanej ilości.

Production attribution musi zachować conservation:

```text
sum source-attributed gold <= corresponding economic gold entering/remaining in accounting flow
```

## Economic realization

Dodać mały reusable settlement-economy mechanism realizacji commodity do economic value.

Pierwszym consumerem jest gold, ale API/model nie powinien być nazwany `GoldMineRevenue` ani związany z questem.

Operacja powinna semantycznie przyjmować:

```text
settlement
commodity kind
amount
source attribution
unit realization value / authoritative pricing lookup
```

oraz atomowo:

1. zweryfikować dostępną source-attributed ilość,
2. zużyć ją z unrealized accounting state dokładnie raz,
3. wyliczyć realized coin-equivalent value,
4. naliczyć wszystkie pasujące entitlementy,
5. zapisać wynik w persistent state.

Nie wymaga to na tym etapie fizycznych caravan, merchant treasury ani pełnego settlement walletu.

Jeżeli realized value nie jest faktycznie dodawane do settlement coin treasury, nazewnictwo i dokumentacja nie mogą udawać, że taki treasury istnieje. Model może reprezentować economic realization/proceeds bez wprowadzania fikcyjnego cash inventory osady.

## Entitlements

Dodać persistent source-aware entitlement reprezentujący prawo beneficjenta do części przyszłych realized proceeds.

Minimalny model powinien umożliwiać co najmniej:

```text
beneficiary = player
sourceId = stable mine/site economic source
share = 20%
accrued/claimable coin value
```

Entitlement jest własnością systemu ekonomicznego, nie `QuestManager`.

Questline w przyszłości jedynie ustanawia entitlement jako konsekwencję wybranego outcome.

Naliczanie:

```text
realized attributable value
× entitlement share
→ claimable Player proceeds
```

Musi być exact-once. Późniejszy transfer, zużycie albo brak gold w `SettlementEconomy` nie może zmienić już naliczonej kwoty.

Obsłużyć fractional remainder deterministycznie, jeżeli integer coins i procent udziału powodują ułamki. Nie tracić systematycznie wartości przez `floor()` każdego małego eventu.

## Player payout

Rozdzielić accrual od claim/payout.

Economic realization może zachodzić off-screen i zwiększać persistent claimable amount bez bezpośredniego modyfikowania Player inventory.

Późniejszy claim powinien korzystać ze wspólnego Player item/coin grant path zamiast walletu lub bezpośredniego bypassu inventory/overflow semantics.

Szczegółowy UI/dialogue sposób odbioru może pozostać poza tym planem, jeżeli nie jest potrzebny do zweryfikowania ekonomicznego contractu.

## Buyout baseline dla questline'u

Ten plan nie implementuje questowego wyboru buyout vs share, ale ustala ekonomiczny baseline dla późniejszej integracji.

Dla representative mine ~750 gold:

```text
expected gross realized value ≈ 7,500 coins
expected nominal 20% proceeds ≈ 1,500 coins
```

Wstępny authored buyout: **~1,000 coins**.

Jest to około 67% nominalnego udziału dla typowej kopalni i daje sensowny trade-off między natychmiastową płynnością a ryzykiem/czasem przyszłego wydobycia.

Finalną wartość buyoutu zweryfikować przy planowaniu questline integration po wdrożeniu aktualnych quest reward/outcome plans i ewentualnych zmianach economy balance.

## Off-screen simulation

Mechanizm nie może zależeć od Playera, kamery ani załadowania renderowanych NPC.

Source-aware production i realization muszą działać przez authoritative simulation/economy operations używane również przez adaptive/off-screen simulation.

Jeżeli aktualny off-screen miner flow nie przechodzi przez ten sam deposit/economy contract, implementacja ma rozszerzyć wspólną domenową operację zamiast dodawać drugi licznik tylko dla off-screen simulation.

## Persistence

Persistować co najmniej stan potrzebny do kontynuowania bez rekonstrukcji z inventory/history:

- source-aware unrealized accounting quantity,
- entitlement definitions,
- accrued/claimable proceeds,
- fractional remainder, jeżeli wymagany przez model udziałów.

Nie rekonstruować entitlementów ani accrual z:

- `SettlementEconomy.query('gold')`,
- NPC/Player inventories,
- `SettlementEconomy.history()`,
- pozostałej rezerwy depositów.

`SettlementEconomy.history()` pozostaje diagnostyką, nie authoritative ledgerem.

Zmiana persisted representation musi użyć aktualnego w chwili implementacji `SaveData` migration pipeline i podbić wersję zgodnie z jego rzeczywistym stanem.

## Quest integration boundary

`quests-progression-002` i `quests-progression-003` są obecnie planami, a aktualny codebase jest jeszcze przed ich docelowym outcome/reward modelem.

Ten plan nie powinien czekać z core economy model na quest-specific state.

Późniejszy abandoned-mine questline ma użyć normalnego outcome/consequence integration do wyboru:

```text
immediate authored buyout
OR
persistent 20% economic entitlement
```

Nie dodawać do `QuestProgressEntry` pól typu `goldMined`, `revenue`, `shareEarned` ani `mineRemainingValue`.

## Non-goals

Nie implementować w tym planie:

- pełnego settlement wallet/treasury,
- business/P&L systemu,
- wages/payroll,
- taxes,
- merchant treasury,
- regional dynamic gold pricing,
- supply/demand commodity market,
- physical trade caravans tylko po to, aby zrealizować gold,
- generic company ownership,
- quest-specific mine revenue counter,
- naliczania udziału z undepleted reserve,
- inventory/stock scanning dla entitlementów,
- pełnego abandoned-gold-mine questline,
- permanent houses/colony expansion ani innych późniejszych etapów roadmapy.

## Testy

Pokryć co najmniej:

- successful miner deposit przypisuje właściwą ilość do właściwego economic source;
- kilka depositów jednej kopalni agreguje się pod jednym source;
- gold z innego source nie zasila mine entitlement;
- samo wydobycie bez dostarczenia nie tworzy source-attributed settlement production;
- samo production deposit nie nalicza entitlementu przed realization;
- partial realization nalicza udział tylko od faktycznie realizowanej ilości;
- repeated processing tego samego state nie powoduje double accounting;
- transfer/consumption po realization nie zmienia accrued proceeds;
- 20% działa deterministycznie dla małych eventów bez utraty fractional remainder;
- save/load zachowuje source accounting, entitlement i accrued value;
- off-screen path korzysta z tego samego accounting contractu;
- gold z osady niezwiązany z source nie jest błędnie przypisywany do kopalni;
- existing aggregated `SettlementEconomy` stock pozostaje poprawny.

## Implementation guidance

Przed implementacją ponownie sprawdzić aktualny codebase, szczególnie `SettlementEconomy`, miner deposit flow, off-screen work/economy paths, resource source identity, persistence oraz aktualny stan planów zależnych.

Preferować rozszerzenie istniejących economy operations i ownership boundaries zamiast równoległego managera.

Dla nowych ważnych publicznych/architektonicznych funkcji i klas dodać przydatny JSDoc, w tym `@domain settlements` tam, gdzie poprawi to preflight discovery.

## Verification

### Automated

Uruchomić focused economy/NPC logistics/persistence tests, następnie typecheck i build.

Nie uruchamiać `pnpm docs:sync` ręcznie — synchronizacja dokumentacji odbywa się przez GitHub workflow.

### Manual — User

User wykonuje browser verification po implementacji. Minimalny debug/UI sposób obserwacji powinien pozwolić potwierdzić, że wydobycie i realizacja konkretnego source naliczają właściwy entitlement również po save/load i podczas nieobecności Playera.

> **Zrób git commit i push do main, rebase jeżeli trzeba**