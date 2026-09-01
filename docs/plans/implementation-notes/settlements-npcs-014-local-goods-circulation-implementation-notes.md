# Implementation Notes: Local Goods Circulation

**Plan:** `settlements-npcs-014-local-goods-circulation.md`  
**Reviewed:** 2026-09-01  
**Status:** `planned` 📋

## Review result

Plan jest wykonalny, ale część fundamentów jest już zaimplementowana. Nie należy odtwarzać planów 005/008/009. Najważniejsza nowa praca to fizyczny Trader pickup cudzego householdu oraz poprawne ownership/conservation między claim i deposit.

## 1. Aktualny ownership

- `Household.items` — authoritative concrete `ItemKind` storage, w tym food.
- `Household.stock` — praktycznie tylko `wood`.
- `SettlementEconomy.items` — authoritative settlement food storage.
- `SettlementEconomy.stock` — bulk economic kinds, bez food.
- `NpcAgent.carried` — tymczasowy fizyczny cargo NPC.
- `landmarks.settlementStorage` — fizyczny punkt settlement food storage; ilość należy do ekonomii.

Kluczowe pliki: `src/settlement/household.ts`, `src/economy/settlementEconomy.ts`, `src/items/foodItems.ts`, `src/settlement/storageDestinations.ts`.

## 2. Concrete food już istnieje

`src/items/foodItems.ts` ma `claimFoodItems()` i `depositFoodItems()` oraz deterministyczne `FOOD_ITEM_KINDS`. `SettlementEconomy.withdrawFood()` korzysta z tego mechanizmu, a Household ma `depositFood()/takeFood()`.

Nie wracać do scalar `food`. Istniejący `claimHouseholdSurplus()/claimEconomySurplus()` z `src/economy/localExchange.ts` jest po migracji 008 praktycznie wood-only.

## 3. Ważna luka obecnego exchange

Aktualne `NpcAgent.beginEconomyWithdraw()` i `beginHouseholdExchange()` robią:

```
goTo source → claim → goTo destination → deposit
```

Claimed food nie trafia jednak do `NpcAgent.carried`. Oznacza to niejawne „in transit” ownership i potencjalną utratę przy cancellation/interruption między legami.

Dla 014 physical collection powinien obowiązywać invariant:

`source + NPC carried + destination = constant`

Po claimie dobra muszą mieć jednoznacznego właściciela. Najprostszy model dla konkretnego food to claim → `carried` → deposit.

## 4. Nie traktować localExchange.ts jako gotowego ItemKind API

`src/economy/localExchange.ts` jest dobrym wzorcem owner-agnostic live claimu, ale operuje na `EconomicKind`/`EconomicStock`. Nie konwertować sztucznie `food` scalar ↔ `ItemKind`.

Dla 014 można:
- rozszerzyć istniejący moduł o mały concrete-goods seam, jeśli odpowiedzialność pozostaje mała,
- albo dodać `src/economy/localGoodsFlow.ts`, jeśli flow zacznie obejmować wybór/claim/deposit concrete items.

Nie tworzyć TradeManager, MarketInventory ani transport FSM.

## 5. Concrete item selection

`Household.surplus('food')` jest agregatem wszystkich food items względem targetu 3. Physical claim musi więc wybrać konkretny `ItemKind`.

Reużyj deterministycznego `FOOD_ITEM_KINDS`. Dla pierwszego Hunter → meat przypadku lepiej wybrać jeden konkretny kind + bounded quantity niż budować od razu mieszany cargo.

Reserve należy sprawdzać agregatowo przed claimem, ale claim musi ponownie sprawdzić live state.

## 6. Trader — obecny kod nie realizuje planu 014

`NpcAgent.beginTraderWork()` obecnie:
- patrzy tylko na własny household,
- obsługuje food/wood,
- wykonuje abstrakcyjny transfer do SettlementEconomy,
- food: `claimFoodItems()` → `economy.depositFood()`,
- wood: `claimHouseholdSurplus()` → `economy.add()`.

Nie ma fizycznego zbierania od innego householdu.

014 powinien dodać bounded same-settlement source selection i fizyczny pickup, zachowując istniejący own-household → settlement behaviour jako regression.

Trader nie powinien korzystać z player-facing `items/trade.ts`.

## 7. Wykorzystać istniejący household lookup

`src/settlement/householdExchange.ts` już posiada `HouseholdSurplusCandidate`, `selectHouseholdSurplusSource()` i `HouseholdExchangeHooks`. `createSettlement.ts` buduje kandydatów raz z lokalnej tablicy householdów.

Nie dodawać globalnego HouseholdRegistry index/query. Rozszerzyć istniejący bounded lookup, jeśli potrzeba informacji o konkretnym food kind.

Kandydat: ten sam settlement, nie własny household, realny surplus, deterministic nearest/id tie-break.

## 8. AI integration

`NpcAgent` ma już flow:

```
generateNeedPressures → choose → strategy candidates → beginNeed/beginIdle
```

Nie dodawać Need `trade`. Trader collection jest role/work behaviour, analogicznie do obecnego `beginTraderWork()`.

`npcStrategies.ts` już zna strategie `economyWithdraw` i `householdExchange` dla food/wood; nie budować drugiego scoring engine.

## 9. Physical destination

`src/settlement/storageDestinations.ts` jest wspólnym resolverem:
- household food → home,
- settlement food → `landmarks.settlementStorage`,
- wood → shared stockpile.

Nie tworzyć market storage ani nowego propa.

## 10. Cargo i failure semantics

`Inventory.add()` jest all-or-nothing dla danego kind i respektuje weight/size. Przed claimem trzeba zapewnić miejsce na requested quantity.

Po claimie:
1. source ma mniej o dokładnie claimed amount,
2. cargo posiada claimed amount,
3. destination przyjmuje dokładnie deposited amount.

Przy partial acceptance remainder zostaje w cargo. Przy cancellation/failure trzeba mieć jawny recovery owner, np. zwrot do source household, a gdy source nie jest już bezpiecznie dostępny — settlement storage.

Nie przechowywać claimed state wyłącznie w closure. Wykorzystać istniejący `startAction()/next/watchdog/cancellation`.

## 11. Freshness

`Inventory` posiada perishable-food `FoodBatch`. Zwykłe `Inventory.add(kind, n)` może nadać batch acquisition day 0.

To jest istotna pułapka dla meat/fish. Physical transfer nie może nieświadomie resetować świeżości. Przed implementacją sprawdzić, czy concrete cargo seam powinien przenosić także istniejące batch metadata; nie dodawać nowego modelu freshness.

## 12. Hunter

Hunter już produkuje realne meat kinds i dostarcza je do `Household.items` przez istniejący hunting/harvest flow. 014 nie powinien zmieniać polowania.

Food może być circulating good; hide, equipment, weapons, quest items itp. pozostają poza automatycznym obiegiem.

## 13. Performance

Nie robić `Trader × every Household × every ItemKind` per tick.

Query tylko podczas decyzji/work block, tylko w bieżącym settlement, z istniejącej lokalnej listy householdów. Bez globalnego market indexu i bez workera.

## 14. Persistence / streaming

`HouseholdRegistry` i `SettlementEconomy` przeżywają WorldBundle rebuild, ale pełny NPC runtime nie jest persisted.

Nie dodawać persistence aktywnego transportu. Jednocześnie cancellation/stream cleanup nie może gubić claimed cargo.

## 15. Najważniejsze testy

- concrete food claim respektuje household reserve,
- live revalidation / concurrent claim,
- Trader nie wybiera własnego householdu,
- tylko ten sam settlement,
- deterministic source/kind selection,
- source → carried → settlement conservation,
- cancellation po claimie,
- failed/partial destination,
- meat → SettlementEconomy.items,
- consumer później pobiera meat przez istniejący acquisition,
- freshness nie resetuje się,
- regression istniejącego Trader own-household transferu.

End-to-end:

`Hunter → household meat surplus → Trader physical pickup → settlement storage → consumer household withdraw → NPC eat`.

## 16. Zalecana kolejność

```
1. Ustalić/naprawić ownership istniejącego food exchange między claim i deposit.
2. Dodać mały concrete-goods claim/cargo seam z conservation invariant.
3. Dodać bounded Trader source selection.
4. Implementować physical pickup → carried → settlement deposit.
5. Minimalnie rozszerzyć consumer acquisition tylko jeśli test wykaże brak obsługi.
6. Dodać cancellation/concurrency/freshness tests i Trader regression.
7. End-to-end deterministic test.
```

## 17. Rozbieżności względem planu

- Fundamenty 008/009 są już w codebase.
- Plan 005 jest również faktycznie zaimplementowany, mimo historycznego statusu `planned`.
- Concrete food ma osobny mechanizm `claimFoodItems()/withdrawFood()`; nie należy używać scalar local-exchange API dla food.
- Obecny Trader nie zbiera cudzego householdu fizycznie.
- Obecny household-to-household food exchange nie przenosi claimed goods do `NpcAgent.carried`, więc ma lukę ownership podczas drugiego lega.

Kod jest źródłem prawdy. Nie cofać obecnej architektury do starszego modelu tylko po to, aby literalnie odpowiadała treści planu.

**Zrób git commit i push do main, rebase jeżeli trzeba**
