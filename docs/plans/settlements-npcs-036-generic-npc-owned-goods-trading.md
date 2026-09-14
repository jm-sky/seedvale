# Plan: Generic NPC-Owned Goods Trading

**Created:** 2026-09-14  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** settlements-npcs-033  
**Domain:** `settlements-npcs`  
**Subdomains:** `economy` `household` `social`  
**Tags:** `trade` `npc` `inventory` `ownership` `surplus`  
**Roadmap:** `economy-goods-flow.md`  
**Model:** Sonnet, Grok

## Goal

Rozszerzyć fundament z `settlements-npcs-033` tak, aby zwykli NPC mogli sprzedawać graczowi realnie posiadane dobra z istniejących authoritative inventories, bez profession-specific sklepów i bez reguły `inventory.count > 0 = można sprzedać`.

`033` dostarcza shared trade session, pricing, atomic explicit-owner transaction seam i Hunter arrows jako vertical slice. Ten plan rozszerza policy i owner coverage.

## Scope

1. Rozszerzyć trade-availability policy z `033` do jawnego owner-aware resolvera: source owner, owned quantity/instances, protected reserve, trade-available quantity/instances.
2. Używać pozytywnej allowlist/policy. Nie wystawiać automatycznie całego `Household.items` ani `personalInventory`.
3. Dodać household production outputs z aktualnego kodu: `wool_material`, `linen_material`, `bandage`, `dressing`, `iron_rod`. `arrow` pozostaje przypadkiem `033`.
4. Nie wystawiać automatycznie `branch`, `beam`, seeds, household food ani production inputs (`wool`, `flax`, `herb`).
5. Dodać bezpieczny path dla `NpcAuthoritativeState.personalInventory`. `isNpcLoadoutBelonging(kind, role)` chroni role equipment; `coin`, story/quest identity items, `transportCargo` i transient `NpcAgent.carried` nie są generic stockiem.
6. Instance-backed goods, jeśli zostaną jawnie dopuszczone, muszą przenosić istniejącą instancję i zachować id/state. Nie używać `createAcquiredInstance()` dla NPC-owned goods.
7. Reuse'ować pricing/payment/session z `033`; zwykły NPC może nadal być coin-only. Nie dodawać barteru bez realnego destination dla offered player goods.
8. Commit zawsze rewaliduje live owner, eligibility/reserve, exact quantity/instance, funds, capacities i current social price context.
9. Nie dodawać `NpcShopInventory`, `MarketInventory`, household wallet, settlement treasury ani nowego save schema.
10. Resolver działa tylko dla aktualnego NPC i jego znanego household/personal inventory; bez globalnych scanów i tickerów.

## Verified current-code boundaries

- `Household.items` jest persistent family inventory i przechowuje jednocześnie food, materiały, seeds oraz production outputs.
- `NpcAuthoritativeState.personalInventory` jest persistent ownerem osobistych rzeczy NPC, odrębnym od `carried` i `transportCargo`.
- `src/ai/npcLoadout.ts` posiada `isNpcLoadoutBelonging()` dla role equipment.
- `src/items/inventoryTransfer.ts` posiada lossless `transferInventoryCount()` i `transferInventoryInstance()`; stack food zachowuje freshness, instance transfer zachowuje identity.
- `src/economy/production.ts` / `src/economy/npcWork.ts` produkują realne household items: arrows, textile outputs, dressing i iron rod.
- `src/items/tradeCatalog.ts::canSell()` opisuje Player → merchant sellability i nie jest polityką NPC-owned stock.

## Non-goals

- dynamic pricing / supply-demand market;
- profession-specific shop UI;
- household food market;
- sprzedaż work cargo / transport cargo;
- ordinary-NPC barter;
- nowe production recipes;
- automatyczne przenoszenie goods do personal inventory przed sprzedażą.

## Recommended implementation order

1. Sprawdzić finalne API wdrożonego `033` i rozszerzać je zamiast zakładać planowane nazwy.
2. Uogólnić arrow-only availability policy do explicit owner-aware rules.
3. Dodać household outputs: `wool_material`, `linen_material`, `bandage`, `dressing`, `iron_rod`.
4. Dodać testy, że inputs/reserves i przypadkowe nowe `ItemKind` pozostają ukryte.
5. Dodać personal-inventory policy z ochroną loadout/story/coin.
6. Dodać instance transfer tylko przez existing-instance ownership handoff.
7. Podłączyć nowe rows do shared trade session z `033`; bez nowego screen.
8. Dodać regressions: live revalidation, pricing, payment, persistence, merchant behavior.

Dodane lub istotnie uogólnione publiczne funkcje architektoniczne powinny mieć JSDoc; użyć `@domain settlements-npcs` tam, gdzie pomaga preflight.

## Tests

- household outputs powyżej pojawiają się jako realne oferty i po zakupie znikają dokładnie z `Household.items`;
- `branch`, `beam`, seeds, household food i production inputs nie pojawiają się bez explicit policy;
- unrelated future item nie staje się sellable tylko przez obecność w inventory;
- Hunter arrow reserve z `033` nie ma regresji;
- role loadout z `isNpcLoadoutBelonging()` nie jest sprzedawany;
- `coin`, story items, `carried` i `transportCargo` nie są ofertą;
- allowlisted personal stack item przenosi się do playera;
- allowlisted instance zachowuje exact id/state, jeśli taki przypadek jest włączony;
- zmiana stocku/protection między preview a commit daje zero mutation;
- full inventory / insufficient coins / full NPC payment inventory daje zero mutation;
- merchant specials i shared social pricing pozostają bez regresji;
- save/load korzysta wyłącznie z existing owners.

## Acceptance Criteria

- Wiele zwykłych profesji może wystawiać realne owned goods bez profession-specific trade code.
- Inventory presence samo w sobie nigdy nie oznacza sellability.
- Household reserves/inputs i NPC role equipment pozostają chronione.
- Goods pozostają własnością realnego source do successful commit.
- Stack freshness i instance identity są zachowane.
- Wszystkie ordinary-NPC offers reuse'ują session/pricing/transaction foundation z `033`.
- Dodanie przyszłego production output do handlu wymaga bounded policy/valuation extension, nie nowego shop subsystemu.
- Brak nowego save schema, wallet, market inventory i economy tickera.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
