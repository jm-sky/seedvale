# Implementation Notes: settlements-npcs-007 — Bandages and herbal medicine

**Plan:** `docs/plans/settlements-npcs-007-bandages-and-herbal-medicine.md`  
**Reviewed:** 2026-09-06  
**Status:** `planned` 📋  
**Source of truth:** current `main` code + docs; plan is intent, not current implementation.

## Review result

Plan wymagał ponownego uzgodnienia z późniejszymi zmianami w NPC healing/health/combat, economy/production, storage/logistics i Work Contracts oraz z aktualnie poprawionym `settlements-npcs-006`.

Najważniejsze korekty:

- `herb` i `bandage` już istnieją — nie tworzyć duplikatów;
- `npc-002` jest catalog-driven, więc 007 ma dostarczyć `dressing` jako zwykły health consumable, a nie rozszerzać healing AI;
- 006 wprowadza `textile_worker`, ale jawnie wyklucza flax/linen — 007 rozszerza tę samą rolę o linen chain;
- 015 jest realną bezpośrednią zależnością dla transactional production execution;
- routine profession work nie jest automatycznie `WorkContract`;
- concrete medical/textile goods pozostają w istniejącym ownership/logistics modelu;
- poisonous herb powinien być osobnym zasobem, a nie produktem przerabiania medicinal herb.

Praktyczny fundament:

```text
settlements-npcs-015
        ↓
settlements-npcs-006
        ↓
settlements-npcs-007
```

006 ma dodatkowo własną zależność od `fauna-004` dla wool flow, ale 007 nie powinien implementować sheep/shearing.

## 1. Existing health items

Aktualny codebase posiada już `herb` i `bandage` w item modelu/catalog.

`ITEM_CATALOG` traktuje oba jako:

```text
consumable.need === 'health'
```

`herb` jest world-chunk collectible; `bandage` jest istniejącym concrete itemem. Zachować ich aktualne wartości relief i semantykę.

Wniosek:

```text
medicinal herb == existing `herb`
bandage        == existing `bandage`
```

Nie dodawać `medicinal_herbs`, `medical_herb` ani drugiego bandage kind.

## 2. npc-002 changes the integration boundary

Aktualny plan `npc-002-npc-healing.md` nie hardcoduje medicine kinds. Healing wybiera dowolny item spełniający catalog contract `consumable.need === 'health'` i wykonuje leczenie przez normalny pressure/decision/action lifecycle.

Dlatego 007:

- nie dodaje healing pressure,
- nie dodaje injury state,
- nie zmienia combat damage flow,
- nie dodaje healing FSM/managera,
- nie powinien wymagać zmian w `npcDecision.ts` tylko po to, aby obsłużyć dressing.

`dressing` powinien zostać zdefiniowany jako health consumable. Wtedy generic healing z `npc-002` zobaczy go automatycznie.

Dokładny `relief` dressing należy dobrać w 007 względem istniejących wartości herb/bandage. To jest item/catalog balance, nie healing-AI policy. Nie zmieniać przy tym istniejących relief values.

## 3. Current settlements-npcs-006 contract

Aktualny 006 został doprecyzowany względem późniejszej architektury:

- zależy od `settlements-npcs-015`,
- wprowadza `wool_material`,
- wprowadza szeroką rolę `textile_worker`,
- używa shared `ProductionDef` execution,
- produkuje z/do owning `Household.items`,
- nie tworzy WorkContract dla rutynowej produkcji,
- nie wykonuje logistyki w production executorze,
- jawnie pozostawia flax, linen, bandage i herbs poza swoim zakresem.

007 ma więc **rozszerzyć 006**, a nie odtwarzać Textile Workera.

Reuse z 006:

- role definition i exhaustive role integration,
- schedule/work arbitration,
- profession work dispatch,
- production action lifecycle,
- shared production executor,
- ownership/revalidation/interruption semantics.

Nowe w 007:

```text
flax → linen_material → bandage
```

Nie dodawać drugiego textile scheduler/work helpera, jeśli istniejący 006 seam można rozszerzyć danymi/recipe selection.

## 4. Production — settlements-npcs-015

015 pozostaje źródłem wspólnej orkiestracji `ProductionDef` nad rzeczywistymi ownerami.

007 potrzebuje item recipes:

```text
flax → linen_material
linen_material → bandage
bandage + herb → dressing
```

Wszystkie powinny przechodzić przez ten sam transaction boundary:

```text
validate all live inputs
→ claim / transactional commit
→ consume exact inputs
→ create exact outputs
→ ProductionResult
```

Ważne invariants:

- selection/preview nie konsumuje inputów;
- completion rewaliduje live state;
- missing input = blocked/no mutation;
- failed output = brak trwałego partial consume;
- output powstaje dokładnie raz;
- production nie szuka inputów w świecie ani u innych ownerów.

Nie kopiować starego Hunter-specific `Inventory.applyRecipe()` path jako osobnej ścieżki.

## 5. Storage, goods and logistics

Aktualna zasada ownership dla tego slice:

```text
Household.items = authoritative concrete goods
NpcAgent.carried = cargo podczas fizycznego transferu/action flow
SettlementEconomy = istniejący settlement-level economy owner, nie medical inventory
```

Pierwszy production slice może działać:

```text
Household.items → ProductionDef → Household.items
```

Jeżeli wymagany flax/herb/bandage jest u innego ownera:

```text
missing local input
→ production blocked
→ existing local goods / storage / transport may move it
→ later retry
```

Nie wolno:

- teleportować inputu,
- skanować globalnie inventories,
- wkładać concrete medical items do nowego `medicalStock`,
- omijać carried cargo tam, gdzie aktualny transfer flow wymaga fizycznego przewozu.

Jeśli nowe goods zostaną włączone do trade/local circulation, użyć istniejących katalogów i claim/delivery seams zamiast osobnego herbal trade path.

## 6. Work Contracts

Późniejsze plany `npc-014`–`npc-018` ustanowiły Work Contracts jako jawny, persistent contract lifecycle i shared-work mechanism.

To nie oznacza, że każda praca profesji jest kontraktem.

Dla 007:

```text
normal schedule work
→ Textile Worker / Herbalist profession action
→ gathering or production
```

bez automatycznego `WorkContract`.

Jeżeli w przyszłości kontrakt zleci textile/herbal work, powinien reuse'ować tę samą authoritative work/production action. 007 nie rozszerza `ContractTarget`, payment ani employer interaction.

## 7. Flax source

006 nie dostarcza flax. 007 musi jawnie zapewnić realny input dla linen chain.

Najmniejszy V1:

- `flax` jako concrete `ItemKind`,
- naturalny/deterministyczny world collectible/resource,
- pozyskanie przez istniejący natural-resource gathering seam,
- deposit do `Household.items`,
- bez pełnego farming/crop lifecycle dla lnu.

Preferować rozszerzenie istniejącego chunk/natural-item modelu. Nie tworzyć `FlaxSystem`, globalnego flora registry ani per-frame scanner.

Jeżeli aktualny natural-resource seam potrafi reprezentować tylko aktywne chunk items, off-screen extension ma zachować tę samą deterministic resource truth; nie tworzyć drugiej niezależnej populacji flax tylko dla remote simulation.

## 8. Herbalist role

`herbalist` jest jedną szeroką rolą.

Zakres V1:

- gather existing `herb`,
- gather `poisonous_herb`,
- opcjonalnie gather wild `flax` przez ten sam seam, jeśli jest to najprostsza spójna odpowiedzialność,
- produce `dressing`.

Przy dodawaniu roli ponownie wyszukać wszystkie exhaustive role sites w aktualnym HEAD. W szczególności sprawdzić:

- role type/character generation,
- deterministic staffing/random assignment,
- schedule,
- profession work dispatch,
- role loadout/workplace maps,
- debug/UI labels lub exhaustive records.

Nie tworzyć gatherer/apothecary/dryer subroles.

Nie przypisywać Herbalistów bez sensownej dostępności pracy, jeśli aktualny staffing seam pozwala tego uniknąć.

## 9. Herb gathering

Istnienie `herb` jako world collectible nie oznacza automatycznie, że NPC potrafi go zbierać.

007 ma rozszerzyć najmniejszy istniejący natural-item gathering/action seam tak, aby Herbalist mógł wykonać:

```text
known world herb
→ reserve/approach
→ pickup/harvest completion
→ carried cargo where applicable
→ deposit
→ Household.items
```

Nie budować drugiego flora scanner ani specjalnego `HerbalismSystem`.

Observed i off-screen outcome muszą zachowywać conservation i deterministic resource ownership.

## 10. Poisonous herb

Stary plan sugerował:

```text
herbs → poisonous herbs
```

To jest mylące i powinno zostać usunięte. Poisonous herb jest innym naturalnym zasobem, nie przetworzonym medicinal herb.

Dodać:

- `poisonous_herb` item definition/catalog entry,
- natural resource occurrence kompatybilne z istniejącym world-item seam,
- Herbalist gathering,
- ordinary Inventory/carried/storage semantics.

Nie dodawać consumable health effect, poison damage, toxin condition ani alchemy recipe bez osobnego planu.

## 11. Dressing

Dressing jest finalnym produktem tego slice:

```text
bandage + herb → dressing
```

Wymagania:

- zwykły stackowalny concrete item,
- output `ProductionDef`,
- produced by Herbalist work,
- stored w existing inventory owner,
- `ITEM_CATALOG[kind].consumable.need === 'health'`,
- żadnego hardcoded `if (kind === 'dressing')` w NPC healing.

Jeśli player consumable UI jest również catalog-driven, dressing powinien automatycznie wejść w ten sam shared item contract zamiast dostawać osobną akcję.

## 12. Gathering vs production boundary

Zachować:

```text
world resource
→ gathering / logistics
→ Household.items

Household.items
→ production
→ Household.items
```

Nie mieszać tych etapów. Production recipe nie może samodzielnie znaleźć najbliższego herb/flax i go usunąć. Gathering nie może od razu mintować bandage/dressing.

To jest ważne dla przyszłych shortages, trade, transport i emergent economy.

## 13. Off-screen / time-skip

Production ma korzystać z istniejącego work lifecycle i nie zależeć od render frames/Object3D.

Gathering jest większym ryzykiem: herb/flax/poisonous herb mogą być reprezentowane przez streamed world items. Implementacja powinna najpierw sprawdzić aktualny deterministic resource abstraction i istniejące off-screen profession patterns.

Wymagany invariant:

```text
same authoritative resource cannot be harvested once on-screen and again off-screen
```

Nie rozwiązywać tego globalnym managerem tylko dla ziół. Jeżeli obecny seam wymaga minimalnego uogólnienia, zrobić je współdzielone dla natural resources.

## 14. High-value tests

### Existing contracts

- existing `herb` remains health consumable,
- existing `bandage` remains health consumable,
- no duplicate medicinal-herb item exists,
- npc-002 generic health-consumable lookup remains sufficient.

### New items

- `flax`, `linen_material`, `poisonous_herb`, `dressing` are valid concrete items,
- dressing is a health consumable,
- poisonous herb has no accidental health/poison effect.

### Gathering

- Herbalist can gather existing `herb`,
- Herbalist can gather `poisonous_herb`,
- flax reaches real household inventory through the shared gathering/carry/deposit path,
- interruption does not duplicate cargo/resource,
- observed/off-screen resource conservation holds.

### Production

- flax → linen consumes exact input,
- missing flax leaves state unchanged,
- linen → bandage consumes exact input,
- missing linen leaves state unchanged,
- bandage + herb → dressing requires both inputs,
- missing either input leaves state unchanged,
- stale state is revalidated on completion,
- failed output commit cannot leave partial consumption,
- output is created exactly once in correct owner.

### Work / economy regression

- 006 wool → wool_material still uses the same Textile Worker path,
- Herbalist uses normal schedule/work arbitration,
- no automatic WorkContract is created,
- Hunter/shared production execution has no regression,
- local goods/storage ownership remains conserved,
- health/combat flow has no regression,
- work remains player-independent and compatible with off-screen/time-skip simulation.

## 15. Recommended implementation order

1. Verify current HEAD and that `settlements-npcs-015` shared production execution is actually implemented before coding 007.
2. Verify the implemented/current state of 006 and reuse its `textile_worker` seams exactly.
3. Reconfirm current `herb`/`bandage` catalog contracts and `npc-002` healing integration.
4. Add only missing item kinds: flax, linen material, poisonous herb, dressing.
5. Extend the existing natural-resource representation/gathering seam for flax/herbal resources without a parallel flora model.
6. Add `herbalist` through all current exhaustive role/work sites.
7. Add `ProductionDef` recipes for flax → linen, linen → bandage, bandage + herb → dressing.
8. Execute all recipes through shared 015 transaction semantics against known `Household.items` owners.
9. Make dressing catalog-driven health consumable; do not modify healing AI for its kind.
10. Add targeted item/gathering/production/work regression tests.
11. Run technical verification from `CLAUDE.md`; browser verification remains user-owned.

## 16. Scope traps

Do not implement in 007:

- NPC healing/injury redesign,
- combat changes,
- poison conditions/effects,
- alchemy,
- full flax farming,
- yarn/spinning,
- detailed herb species,
- medical building/storage,
- a new economy resource model,
- global flora/herbalism manager,
- second production scheduler,
- automatic Work Contracts,
- contract payment/employer changes,
- new long-distance transport system.

Architectural boundary:

```text
world resources → shared gathering/logistics → concrete items
concrete items  → shared ProductionDef execution → concrete goods
medical goods   → ITEM_CATALOG health contract → generic healing
```

Implementation should add JSDoc with `@domain settlements-npcs` to important new public architectural functions/classes when needed for preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
