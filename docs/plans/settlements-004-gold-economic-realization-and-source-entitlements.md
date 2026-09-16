# Plan: Gold Economic Realization & Source Entitlements

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Model:** Sonnet, Grok
**Depends on:** world-018
**Domain:** `settlements`
**Subdomains:** `economy`
**Tags:** `gold` `economy` `entitlements` `source-attribution`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

## Goal

Dodać najmniejsze reusable rozszerzenie ekonomii potrzebne do przeprowadzenia commodity od rzeczywistej, source-attributed produkcji do ekonomicznej realizacji i naliczania udziałów w przychodach.

Pierwszym consumerem jest złoto z opuszczonej kopalni, ale mechanizm nie może być nazwany ani zaprojektowany jako quest-specific `GoldMineRevenue`.

Docelowy flow:

```text
real production from economic source
→ SettlementEconomy aggregate stock
+ source-attribution ledger
→ explicit economic realization
→ realized source value
→ entitlement accrual exactly once
```

## Recon baseline — current `main`

Zweryfikowane kontrakty:

- `src/economy/settlementEconomy.ts::SettlementEconomy` jest authoritative ownerem aggregated settlement stock.
- `SettlementEconomySnapshot` persistuje `stock`, concrete food oraz production shortages; nie ma obecnie source ledger ani realized proceeds.
- `SettlementEconomy.history()` jest bounded diagnostyką i nie może być ledgerem księgowym.
- `EconomyRegistry` żyje na `SettlementsManager`; economy state przeżywa stream-out/in i WorldBundle rebuild.
- obecny miner flow (`planOreGathering`) po successful stockpile deposit wywołuje `SettlementEconomy.add(oreEconomicKind(...))`; gold trafia więc do zwykłego aggregated stock.
- obecny codebase nie ma settlement treasury/P&L ani settlement-side cash-sale flow.
- `src/items/tradeCatalog.ts` jest obecnym pricing precedentem dla item trade; finalna implementacja ma odczytać aktualny authoritative gold value zamiast duplikować stałą w queście.
- `world-018` ma dostarczyć rich finite mine deposits oraz stabilne powiązanie depositów z jednym mine/site economic source; dlatego jest implementation prerequisite tego planu.

## Core ownership decision

Source accounting ma należeć do settlement economy domain i być persistowany razem z economy, ale nie ma zastępować aggregated `EconomicStock`.

Model:

```text
SettlementEconomy
├─ aggregate stock: gold = 120
└─ source ledger:
   ├─ mine:A → gold unrealized 80
   └─ mine:B → gold unrealized 25
```

Pozostałe 15 gold może być unattributed/legacy/innym flow. Invariant:

```text
sum(unrealized source quantities for kind) <= aggregate stock(kind)
```

## Economic source identity

Wprowadzić w economy layer prosty stable identifier, np.:

```ts
type EconomicSourceId = string
```

Nie używać quest ID ani `ResourceDeposit.id` jako entitlement identity.

`world-018` powinien mapować kilka fizycznych depositów opuszczonej kopalni do jednego stable mine/site source ID. Deposit ID może pozostać provenance detail poza entitlement contractem.

## Production attribution seam

Nie zmieniać generic `SettlementEconomy.add(...)` tak, aby każde dodanie wymagało source.

Dodać jawny attributed mutation path, konceptualnie:

```ts
economy.addAttributed(kind, amount, sourceId, simTime)
```

który atomowo:

1. zwiększa istniejący aggregate stock;
2. zwiększa source-unrealized quantity dla `(sourceId, kind)`;
3. zapisuje zwykłą diagnostykę/history, jeżeli obecny history model tego wymaga.

Unattributed `add(...)` nadal działa bez zmian dla pozostałej ekonomii.

Miner deposit flow używa `addAttributed(...)` tylko wtedy, gdy mined resource hook niesie stable economic source z `world-018`; w przeciwnym razie zachowuje zwykły `add(...)`.

Attribution powstaje dopiero przy successful deposit do settlement stockpile, nie przy samym `ResourceDeposits.mine()`.

## Source ledger representation

Rozszerzyć `SettlementEconomySnapshot` o opcjonalny, backward-compatible plain-data ledger, np. semantycznie:

```ts
sourceAccounting?: {
  unrealized: Record<EconomicSourceId, Partial<Record<EconomicKind, number>>>
}
```

Finalny kształt może być array/map-friendly dla serializacji, ale musi być:

- deterministic,
- sparse,
- łatwy do migracji,
- bez quest-specific pól,
- bez kopiowania całego stocku per source.

Zero entries usuwać z persisted shape.

## Economic realization

Dodać explicit reusable operation na `SettlementEconomy`, konceptualnie:

```ts
realizeAttributed(input: {
  kind: EconomicKind
  sourceId: EconomicSourceId
  amount: number
  unitValue: number
  eventId: string
  simTime?: number
}): RealizationResult
```

`eventId`/stable operation key służy exact-once semantics. Operacja:

1. odrzuca non-positive amount/value;
2. sprawdza unrealized source quantity;
3. sprawdza aggregate stock;
4. atomowo usuwa `amount` z aggregate stock i source ledger;
5. liczy `grossValue = amount * unitValue`;
6. tworzy persistent realization record/idempotency marker;
7. nalicza pasujące entitlementy;
8. zwraca plain result.

Nie udawać settlement treasury: realized value jest accounting proceeds, dopóki osobny system nie doda fizycznego treasury.

## Realization trigger

Ten plan dostarcza domain operation, ale nie wymusza pełnego regional trade/caravan systemu.

V1 może mieć mały deterministic economy-side realization policy dla gold surplus, wywoływany przez istniejący settlement/off-screen economy tick lub explicit integration seam. Musi jednak przechodzić przez `realizeAttributed(...)` i nie może zależeć od renderowanego NPC lub Playera.

Jeżeli current main przy implementacji ma już generic inter-settlement goods trade/transport consumer, podłączyć realization tam zamiast tworzyć drugi timer.

## Pricing

Nie zapisywać kursu na entitlement.

Realization event otrzymuje/resolve'uje unit value w chwili realizacji z aktualnego authoritative pricing mechanism. Dla obecnego baseline gold `sellPrice` w trade catalog wynosi 10 coins, ale implementacja ma importować lookup/helper zamiast kopiować `10`.

Dzięki temu późniejsza zmiana ceny wpływa na przyszłą realizację, nie retroaktywnie na już naliczone proceeds.

## Entitlements

Wprowadzić persistent economy-owned definition, semantycznie:

```ts
type SourceEntitlement = {
  id: string
  sourceId: EconomicSourceId
  beneficiary: { kind: 'player' }
  shareBps: number
  accruedWholeCoins: number
  remainderNumerator: number
}
```

Dla 20% użyć `shareBps = 2000` lub równoważnej integer representation. Nie używać runtime float accumulator.

Entitlement ID powinno być deterministic/idempotentne dla agreement identity; repeated establishment tego samego agreement zwraca existing, nie tworzy duplikatu.

## Fractional accounting

Accrual musi zachowywać remainder pomiędzy realization events.

Przykład dla basis points:

```text
numerator = grossCoins * shareBps + previousRemainder
whole = floor(numerator / 10_000)
remainder = numerator % 10_000
```

Dzięki temu wiele małych realizacji nie traci systematycznie wartości.

## Claim / payout boundary

Accrual i claim są oddzielne.

Dodać economy operation:

```ts
claimEntitlement(entitlementId): number
```

która atomowo przenosi `accruedWholeCoins` do `0` i zwraca kwotę do wypłaty przez caller.

Quest/dialogue/UI ma następnie użyć istniejącego Player inventory coin grant path. Economy nie importuje Player inventory i nie wypłaca bezpośrednio.

Jeżeli grant po claim może failować z powodu inventory semantics, caller musi użyć istniejącego atomic/overflow-safe reward path; nie zerować accrual przed zapewnieniem delivery. Finalny API może więc preferować `peekClaimable + commitClaim(id, operationId)` jeśli obecny reward contract tego wymaga.

## Persistence and idempotency

`SettlementEconomySnapshot` lub sąsiedni economy registry snapshot ma persistować:

- unrealized source quantities;
- entitlement definitions;
- accrued whole coins;
- fractional remainder;
- bounded/exact-once realization operation identity potrzebną do retry safety.

Nie rekonstruować z `history()`, inventory, current stock ani deposit reserve.

Wykorzystać aktualny `SaveData` migration/version pipeline; pola mają być optional dla legacy saves.

## Off-screen simulation

Attributed production i realization są domain operations, więc detailed i off-screen consumers muszą używać tych samych seams.

Nie dodawać `MiningColonyOffscreenRevenue` ani okresowego skanowania stocku.

Jeżeli off-screen mining produkuje yield bez przejścia przez zwykły stockpile action, jego shared result musi nadal wywołać tę samą `addAttributed(...)` operation dokładnie raz.

## Quest integration boundary

`quests-progression-010` może:

- utworzyć deterministic 20% entitlement dla mine source po wyborze share;
- odczytać claimable proceeds;
- uruchomić normalny Player coin payout path.

Quest nie posiada:

- source ledger,
- production cursor,
- realized amount,
- fractional remainder,
- accrued proceeds.

Buyout pozostaje authored quest reward; nie jest entitlementem.

## Balance baseline

Przy aktualnym baseline `10 coins / gold`:

```text
500 gold  → ~5,000 gross → ~1,000 at 20%
750 gold  → ~7,500 gross → ~1,500 at 20%
1000 gold → ~10,000 gross → ~2,000 at 20%
```

Te liczby są planning sanity check, nie runtime constants. Wstępny quest buyout ~1,000 coins należy ponownie ocenić w `quests-progression-010` względem aktualnego reward balance.

## Scope

In scope:

- `EconomicSourceId` contract;
- attributed economy deposit seam;
- sparse persistent source-unrealized ledger;
- explicit exact-once realization operation;
- persistent source entitlements;
- integer fractional remainder accounting;
- claimable proceeds API;
- SaveData/rebuild integration;
- miner deposit integration dla sourced deposits;
- shared detailed/off-screen accounting seam.

## Non-goals

- settlement treasury/wallet;
- full P&L;
- wages/taxes;
- merchant treasury;
- dynamic commodity market;
- physical caravans solely for realization;
- company ownership;
- quest-owned counters;
- entitlement from undepleted reserves;
- inventory/stock scans;
- full abandoned-mine questline.

## Verification

Automated tests:

- sourced successful deposit increments aggregate + matching source ledger;
- failed/mined-but-not-delivered yield creates no attribution;
- several deposits under one source aggregate correctly;
- unrelated source never accrues mine entitlement;
- unattributed `SettlementEconomy.add` remains unchanged;
- partial realization removes exactly the realized attributed quantity;
- realization operation ID cannot double-process;
- entitlement accrues exactly once;
- 20% remainder across many small events equals 20% aggregate within integer coin semantics;
- save/load and WorldBundle rebuild preserve ledger, entitlements and remainder;
- claim is idempotent/atomic according to final API;
- legacy economy snapshots restore with empty source accounting;
- detailed/off-screen callers produce identical accounting results.

Run focused economy/mining/persistence tests, typecheck and build. Player performs browser/gameplay verification; AI does not run browser verification.

Before implementation create/update focused implementation notes. Add useful JSDoc with `@domain settlements` to new public economy/source contracts.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
