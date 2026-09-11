# Implementation notes: settlements-npcs-006 — Wool to material

Plan: `docs/plans/settlements-npcs-006-wool-to-material.md`

**Reviewed:** 2026-09-11  
**Status:** `verification needed` 🔍

## Review outcome

Plan został ponownie zweryfikowany po wdrożeniu dawnych zależności.

Najważniejsze ustalenia z aktualnego `main`:

- `fauna-004` jest wdrożone: runtime ma `wool`, shearing, Shepherd flow, `WOOL_GROWTH_DAYS = 24`, `WOOL_YIELD = 4` i fizyczny deposit wool do owner `Household.items`.
- `settlements-npcs-015` jest wdrożone: wspólnym production transaction boundary jest `executeProduction()` z `src/economy/productionExecutor.ts`.
- `ProductionDef` obsługuje `itemInputs`/`itemOutputs`; wool processing nie potrzebuje osobnego executora ani bezpośrednich textile-specific mutation primitives.
- local goods/storage nadal wymagają jawnego ownership; production nie może wyszukiwać lub teleportować inputu z innego household/storage.
- Work Contracts pozostają osobnym systemem jawnych zobowiązań; rutynowa textile profession work nie jest kontraktem.
- receptura z planu jest jawna: **`4 wool → 12 wool_material`**.

Dawne instrukcje „najpierw wdrożyć fauna-004/settlements-npcs-015” są nieaktualne i zostały usunięte.

## 1. Shared production executor — aktualny contract

Authoritative API jest w:

- `src/economy/productionExecutor.ts`
- `src/economy/production.ts`

Aktualny contract:

```ts
executeProduction(def: ProductionDef, ctx: ProductionContext): ProductionResult
```

`ProductionContext` może dostać jawny `inventory`, a `ProductionDef` wspiera:

```ts
itemInputs?: readonly ItemAmount[]
itemOutputs?: readonly ItemAmount[]
```

Ważne zachowanie executora:

- synchronizuje cały recipe commit przez jeden wspólny entry point,
- normalizuje/agreguje duplicate inputs/outputs,
- waliduje recipe amounts,
- preflightuje item inputs i output capacity,
- wykonuje item mutation przez istniejący `Inventory.applyRecipe()` lifecycle,
- nie szuka zapasów u innych ownerów,
- zwraca jawny failure reason zamiast textile-specific wyjątków,
- nie wymaga dodatkowego managera ani scheduler-a.

Dla tego planu completion powinno finalnie prowadzić do:

```ts
executeProduction(WOOL_MATERIAL_PRODUCTION, {
  inventory: household.items,
  simTime,
})
```

Nie wywoływać `Inventory.applyRecipe()` bezpośrednio z Textile Worker code; publiczną mutation boundary pozostaje `executeProduction()`.

## 2. Recipe i item ownership

Dla pierwszego slice ownerem inputu i outputu jest ten sam `Household.items`.

Recipe:

```text
4 wool
→ 12 wool_material
```

czyli w `ProductionDef`:

```text
itemInputs: wool × 4
itemOutputs: wool_material × 12
```

Nie dodawać:

- `EconomicKind.wool`,
- `EconomicKind.wool_material`,
- `SettlementEconomy.wool`,
- `WoolStorage`,
- `TextileInventory`,
- yarn intermediate item,
- runtime unit-conversion subsystem.

`wool_material` powinien być zwykłym stackowalnym `ItemKind` z normalnym `ITEM_DEFS`/catalog metadata.

## 3. Fauna boundary — wool już istnieje

Wool production jest już własnością fauna/Shepherd flow.

Aktualny contract wejściowy dla 006:

```text
owned sheep
→ Shepherd shearing
→ 4 wool
→ shepherd carried inventory
→ physical deposit
→ owner Household.items
```

006 zaczyna się od istniejącego `Household.items: wool`.

Nie modyfikować w tym planie:

- wool growth/readiness,
- `WOOL_GROWTH_DAYS`,
- `WOOL_YIELD`,
- owned sheep selection,
- Shepherd work arbitration,
- shears provisioning,
- shearing capability,
- wool deposit action.

Textile Worker nie potrzebuje shears.

## 4. Relevant role/staffing seam

`Role` jest exhaustive i obecnie obejmuje m.in. `shepherd`; `textile_worker` trzeba dodać do istniejących role-owned struktur zamiast tworzyć nowy profession type.

Sprawdzić i rozszerzyć co najmniej:

- `src/ai/characters.ts` — `Role` oraz random/staffed role semantics,
- `src/settlement/professionStaffing.ts` — authoritative deterministic staffing policy,
- `src/ai/schedule.ts` — schedule dla nowej profesji,
- `src/ai/NpcAgent.ts` / aktualny profession-work dispatch,
- exhaustive role maps/tests.

`professionStaffing.ts` ma zamknięty `ROLE_STAFFING_POLICY: Record<Role, RoleStaffingPolicy>`; dodanie nowej roli wymusi jawne policy.

Nie dodawać `textile_worker` bezwarunkowo do generic random pool. Zachować kierunek z planu: specialist ma wynikać z istniejącego deterministic staffing seam i realnej możliwości korzystania z wool, bez drugiego profession resolvera.

Jeżeli podczas implementacji aktualny staffing context nadal nie ma wystarczającego sygnału do rozstrzygnięcia tego bez nowej gameplayowej reguły, nie wymyślać losowego procentu ani nowego classifiera — zatrzymać tę decyzję jako gameplayową zamiast tworzyć parallel logic.

## 5. NPC work integration

Textile Worker ma wejść w istniejący profession work lifecycle:

```text
normal schedule/arbitration
→ profession work opportunity
→ preview known owner inventory
→ bounded work action
→ completion
→ live executeProduction()
→ success/blocked result
```

Ważne:

- preview przy wyborze pracy nie jest mutation,
- wool nie jest rezerwowane/usuwane na początku akcji,
- completion musi użyć live state,
- drugi NPC może wcześniej zużyć wool; wtedy executor zwraca blocked/failure bez partial consume,
- interruption/path failure przed completion = zero recipe mutation,
- nie tworzyć per-frame textile scan ani osobnego production scheduler-a.

Warto reuse'ować istniejący bounded profession-work pattern zamiast nowego textile-specific action framework.

## 6. Work Contracts

Rutynowa household textile production pozostaje normalną profesją:

```text
normal profession work ≠ WorkContract
```

Nie tworzyć automatycznych kontraktów dla wool processing.

Jeżeli w przyszłości contract wskaże textile work, contract powinien tylko kierować NPC do tej samej action/executor path. Nie tworzyć contract-specific recipe, storage ani owner modelu.

## 7. Local goods i fizyczny transport

Pierwszy slice nie wymaga transferu, jeśli input i output są w tym samym `Household.items`.

```text
household.items has wool
→ execute local recipe
→ same household.items gets wool_material
```

Jeżeli wool jest u innego ownera:

```text
missing local input
→ production blocked
→ existing goods/transport flow may move wool physically
→ later retry
```

Nie rozszerzać 006 o generic wool circulation tylko po to, aby worker zawsze mógł produkować.

Jeżeli implementacja faktycznie wprowadzi physical workplace wymagający transferu, reuse'ować istniejące carried inventory + destination semantics. Nie trzymać claimed wool tylko w closure i nie teleportować go między ownerami.

## 8. Workplace i tools

Plan nie wymaga nowego budynku ani narzędzia dla Textile Workera.

Nie dodawać:

- shears do Textile Workera,
- textile-only capability bez potrzeby istniejącego work contractu,
- decorative loom/workshop jako sztucznego warunku recipe.

Jeżeli aktualny profession work API wymaga fizycznego targetu, użyć istniejącego reusable work/place mechanismu. Nowy gameplayowy workplace powinien być osobną świadomą decyzją, nie technicznym obejściem.

## 9. Off-screen / time skip

Nie tworzyć textile-specific catch-up simulation.

Produkcja ma korzystać z istniejącego NPC work/fidelity lifecycle. Wool readiness jest już osobnym absolute-time fauna state i nie należy do 006.

Nie replayować hipotetycznych pominiętych textile cycles tylko dlatego, że świat był off-screen. Zachować wspólny model symulacji zamiast parallel offline production.

## 10. Targeted tests

### Recipe / executor

- `wool_material` jest poprawnym stackowalnym itemem,
- `4 wool → 12 wool_material`,
- 4 wool daje dokładnie 12 output,
- 0–3 wool = failure/blocked i zero mutation,
- recipe id/result przechodzi przez `executeProduction()`,
- output capacity failure nie zostawia częściowego input consume.

### Work lifecycle

- preview nie mutuje inventory,
- interruption przed completion = zero mutation,
- stale input na completion = failure bez partial consume,
- successful completion wykonuje recipe dokładnie raz,
- brak wool prowadzi do normalnego fallback/blocked profession outcome.

### Ownership

- input i output są w właściwym `Household.items`,
- production nie pobiera wool z innego household,
- production nie pobiera wool z settlement storage bez jawnego transferu,
- Shepherd wool deposit może być później skonsumowany przez textile recipe.

### Regression

- shared Hunter/item production dalej działa przez wspólny executor,
- istniejące stock production nie ma regresji,
- Shepherd/shearing flow pozostaje bez zmian,
- role/schedule exhaustive tests uwzględniają `textile_worker`,
- Work Contracts nie stają się wymagane do normalnej textile production.

## 11. Zalecana kolejność implementacji

1. Dodać `wool_material` do istniejącego item modelu/catalogu.
2. Dodać `WOOL_MATERIAL_PRODUCTION` (`4 wool → 12 wool_material`) do `src/economy/production.ts` lub aktualnego miejsca recipe definitions.
3. Dodać `textile_worker` do `Role` i wszystkich exhaustive role-owned map.
4. Rozszerzyć istniejący deterministic staffing seam bez generic random-pool assignment.
5. Dodać schedule/profession work integration.
6. Na completion bounded action wywołać `executeProduction()` z owning `Household.items`.
7. Dodać targeted executor/work/ownership tests.
8. Manual browser verification pozostawić użytkownikowi.

## 12. Relevant current files

- `src/economy/production.ts` — `ProductionDef`, existing production definitions, role production lookup.
- `src/economy/productionExecutor.ts` — authoritative shared synchronous production transaction boundary.
- `src/items/Inventory.ts` — lower-level item mutation/capacity primitives używane przez executor; nie wywoływać jako textile public boundary.
- `src/items/items.ts` — authoritative `ItemKind` / item definitions; `wool` już istnieje, `wool_material` jeszcze nie.
- `src/settlement/household.ts` — authoritative household concrete-item owner.
- `src/ai/characters.ts` — exhaustive `Role`; `shepherd` istnieje, `textile_worker` jeszcze nie.
- `src/settlement/professionStaffing.ts` — deterministic role staffing policy; rozszerzyć in place.
- `src/ai/schedule.ts` — role schedule.
- `src/ai/NpcAgent.ts` oraz aktualne profession-work helpers — work arbitration/action integration.
- `src/ai/npcProfessionWork.ts` — istniejące profession-specific bounded work patterns, w tym Shepherd integration.
- `src/world/workContract.ts` — authoritative contract state; nie używać do rutynowej household production.
- `src/fauna/livestockProduction.ts` — wool readiness/yield contract (`24` days, `4` wool); tylko context, nie ownership 006.
- `src/fauna/shepherdFlock.ts` / `src/settlement/livestock.ts` — owned flock context; 006 nie powinien przejmować ich odpowiedzialności.

## 13. Różnice względem poprzednich notes

- `fauna-004` jest już wdrożone; wool jest realnym runtime itemem.
- `settlements-npcs-015` jest już wdrożone; `executeProduction()` jest istniejącym shared executor-em.
- usunięto dawną kolejność „najpierw land dependencies”.
- recipe jest już jawne: `4 wool → 12 wool_material`.
- Textile Worker nie dostaje shears ani shearing responsibility.
- production używa jednego jawnego `Household.items` ownera i nie claimuje dóbr z innych inventory.
- staffing ma rozszerzać istniejący `professionStaffing.ts`, nie tworzyć równoległego resolvera.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
