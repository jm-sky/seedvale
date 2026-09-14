# Implementation Notes: Economy-driven Transport Demand Integration

**Plan:** `settlements-npcs-020-economy-driven-transport-demand-integration.md`  
**Reviewed:** 2026-09-14  
**Status:** `planned` 📋

## Review result

Plan pasuje do obecnej architektury: `SettlementEconomy` / `Household` są authority dla shortage/surplus, a `TransportOrder` jest commitmentem logistycznym. Nie dodawać demand registry, ticka ani nowego managera.

Ważna rozbieżność z planem: `planTraderWork()` nadal ma legacy own-household branch przed `planTraderCollection()`. Dla `food` ten branch faktycznie nic nie przenosi, bo `claimHouseholdSurplus(..., 'food', ...)` zwraca `0`, a jednocześnie może zablokować wejście w transport flow. Aktywny `TransportOrder` także może nie zostać wznowiony, jeśli ten branch wygra wcześniej. 020 musi naprawić tę kolejność.

## Istniejące systemy do reuse

- `src/economy/settlementEconomy.ts`: `shortage('food')` wynika z realnego `SettlementEconomy.items`; unload automatycznie zmniejsza shortage.
- `src/settlement/household.ts`: `surplus('food')` to agregat concrete food ponad household target.
- `src/items/foodItems.ts`: używać istniejącej food category i `FOOD_ITEM_KINDS`; nie tworzyć drugiej listy food kinds.
- `src/world/transportOrder.ts`: order jest metadata commitmentu i ma jeden concrete `itemKind`.
- `src/world/createTransportOrders.ts`: `list()` wystarcza do bounded accounting w tym slice; bez nowych indeksów.
- `src/world/transportTransactions.ts`: jedyny pickup/unload transaction seam; nie duplikować transferu/freshness.
- `src/settlement/householdExchange.ts`: zachować local same-settlement, nearest-first + stable-id selection.
- `src/ai/npcProfessionWork.ts`: właściwy integration point.

## Commitment accounting

Dodać mały pure/derived helper nad `readonly TransportOrder[]`.

Incoming food do `settlement-storage(settlementId)`:
- `pending` / `assigned` -> `requestedQuantity`,
- `in-transit` -> `claimedQuantity`,
- terminal -> `0`.

Pre-pickup outgoing z `household(householdId)`:
- tylko `pending` / `assigned`,
- `in-transit` i terminal -> `0`.

Food rozpoznawać przez istniejącą kategorię itemu. Nie persistować `uncoveredDemand`, `availableSupply` ani reservation records.

## Aggregate food vs concrete item kind

`Household.surplus('food')` jest agregatem, ale order transportuje jeden konkretny `ItemKind`. Trzeba więc liczyć dwa limity:

```text
aggregateAvailable = household.surplus('food') - allPrePickupFoodCommitments
kindAvailable = household.items.count(kind) - prePickupCommitmentsForSameKind
```

Requested quantity:

```text
min(uncoveredDemand, aggregateAvailable, kindAvailable, HOUSEHOLD_EXCHANGE_MAX_TRANSFER.food)
```

Iterować kindy w `FOOD_ITEM_KINDS` order. Bez per-kind subtraction można double-promise ten sam konkretny food item mimo poprawnego aggregate accounting.

## Source selection

Obecne `findSurplusSource()` filtruje tylko po raw surplus, więc nearest household może mieć cały surplus już committed. Minimalnie rozszerzyć istniejący lokalny lookup tak, aby caller mógł odrzucić candidate z `availableUncommittedSupply <= 0` i selection przeszło do następnego. Transport-specific accounting powinien zostać poza `householdExchange.ts`.

Own household Tradera też jest realnym source. Dla food nie używać legacy `claimHouseholdSurplus('food')`. Włączyć own household do tego samego order-based flow; legacy direct path może zostać dla `wood`, które jest poza zakresem 020.

## Trader ordering

W `planTraderWork()` najpierw wznowić `transportOrders.findByCarrier(ctx.npcId)` przed jakąkolwiek nową oceną ekonomii.

Docelowo:

```text
active carrier order -> resume
else derive uncovered settlement food demand
-> deterministic local source with uncommitted supply
-> deterministic concrete food kind
-> create assigned TransportOrder
-> existing planTransportOrderExecution()
```

Nie reevaluować zasadności aktywnego orderu po zmianie shortage; order jest commitmentem do terminal state.

## Pickup revalidation

`planTransportOrderExecution()` już rewaliduje current kind count i current household food surplus przed `executeTransportPickup()`.

Dla 020 revalidation powinna też odjąć inne pre-pickup commitments tego source/kind, ale nie własny wykonywany order. Helper powinien obsługiwać `excludeOrderId`.

Nie zmieniać `executeTransportPickup()`; obecny clamp, rollback/conservation i lifecycle commit po transferze są właściwe.

## Testy o najwyższej wartości

- active order resume wygrywa nawet przy own-household food surplus,
- own-household food nie wpada w legacy dead branch,
- nearest raw-surplus household w pełni committed jest pomijany,
- aggregate commitments różnych food kinds zmniejszają total supply,
- same-kind commitment zmniejsza `kindAvailable`,
- pickup revalidation wyklucza własny order,
- `in-transit` incoming liczy `claimedQuantity`, ale nie rezerwuje już source.

Preferować pure tests helpera/accountingu + istniejący transport transaction test style; nie budować nowego dużego `NpcAgent` harness.

## Zalecana kolejność

```text
1. Pure incoming/pre-pickup commitment helpers.
2. Minimalne rozszerzenie local household lookup o candidate eligibility.
3. Concrete-kind selector z aggregate + per-kind limits.
4. Active-order resume na początku Trader flow.
5. Food shortage -> source -> assigned order; wood legacy bez zmian.
6. Commitment-aware pickup revalidation z excludeOrderId.
7. Focused tests.
```

Nie zmieniać persistence/off-screen code z 019 ani `TransportOrder` lifecycle bez konkretnej potrzeby.

> **Zrób git commit i push do main, rebase jeżeli trzeba**