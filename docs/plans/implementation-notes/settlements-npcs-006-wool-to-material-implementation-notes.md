# Implementation notes: settlements-npcs-006 — Wool to material

Plan: `docs/plans/settlements-npcs-006-wool-to-material.md`

**Reviewed:** 2026-09-06  
**Status:** `planned` 📋

## Review outcome

Plan wymagał aktualizacji po późniejszych zmianach architektury.

Najważniejsze ustalenia z aktualnego `main`:

- `fauna-004` **nie jest jeszcze zaimplementowany** — nadal ma status `planned`; `settlements-npcs-006` nie może zakładać istniejącego runtime `wool`.
- `settlements-npcs-014` local goods circulation został faktycznie zaimplementowany i ustanowił fizyczne `source → carried → destination` oraz conservation/freshness semantics dla concrete food, ale nie jest automatycznym obiegiem każdego `ItemKind`.
- `settlements-npcs-015` production foundation nadal jest `planned`; aktualny kod nadal ma split między stock production i Hunter item production. To jest realna zależność 006.
- physical storage/logistics już rozdziela ownership ilości od fizycznego destination. Nie tworzyć textile storage ani teleportowanego transferu.
- Work Contracts są obecnie realnym, authoritative systemem jawnych zobowiązań worker–employer, ale zwykła household profession work nie jest kontraktem.

Plan został poprawiony tak, aby zależeć od `fauna-004` i `settlements-npcs-015`, a nie od nieistniejącego „już gotowego” production pipeline.

## 1. Production — obecny stan kodu

`src/economy/production.ts` nadal definiuje `ProductionDef` oraz dwa execution styles:

- stock recipes wykonywane przez `SettlementEconomy` / `EconomicStock`,
- Hunter item recipes wykonywane przez `produceFirstAvailableItemRecipe()` → `Inventory.applyRecipe()`.

Nie ma jeszcze `ProductionExecutor` z planu 015.

Dlatego wool processing nie powinien być implementowany przed 015 przez skopiowanie Hunter path. Docelowo recipe ma być zwykłym:

```text
itemInputs: wool × N
itemOutputs: wool_material × M
```

wykonywanym przez wspólny transactional execution path.

Istotne pliki po 015 trzeba ponownie zweryfikować, ponieważ jego implementacja może zmienić dokładne API:

- `src/economy/production.ts`,
- `src/economy/npcWork.ts`,
- `src/economy/settlementEconomy.ts`,
- `src/economy/stock.ts`,
- `src/items/Inventory.ts`.

## 2. Ownership wool/material

Dla pierwszego slice właściwym ownerem jest `Household.items`.

Nie dodawać:

- `EconomicKind: wool`,
- `SettlementEconomy.wool`,
- `WoolStorage`,
- `TextileInventory`,
- production inventory.

`Household.stock` nie jest generic concrete-item storage; po wcześniejszych migracjach jest praktycznie wood-only. Wool/material powinny pozostać `ItemKind`.

Produkcja może bezpośrednio używać znanego inventory ownera. Nie ma powodu przepuszczać wool przez settlement economy tylko po to, aby recipe mogło się wykonać.

## 3. Fauna-004 — poprawna granica odpowiedzialności

Aktualny `fauna-004` planuje:

```text
owned sheep
→ Shepherd + shearing capability
→ carried wool
→ owner Household.items
```

006 zaczyna się dopiero od istniejącego `Household.items: wool`.

Poprzednie implementation notes błędnie sugerowały dodanie/provisioning `shearing` dla Textile Workera. To należy usunąć z implementacji 006:

- shears/capability są odpowiedzialnością Shepherda z fauna-004,
- Textile Worker nie strzyże sheep,
- 006 nie modyfikuje wool growth anchor ani livestock production,
- 006 nie implementuje ponownie deposit wool.

Po wylądowaniu fauna-004 należy reconfirmować finalny `ItemKind`/quantity semantics zamiast zakładać historyczny draft.

## 4. Local goods circulation po settlements-npcs-014

014 zaimplementował ważny invariant dla fizycznych transferów:

```text
source + NPC carried + destination = constant
```

oraz live claim/revalidation i preservation freshness dla food.

Nie należy jednak wyciągać z tego wniosku, że wool automatycznie krąży lokalnie. Obecny concrete flow jest przede wszystkim food-specific, a `localExchange.ts` pozostaje bulk/wood-oriented.

Dla 006 najprostszy i poprawny model to:

```text
known Household.items contains wool
→ local production
→ same Household.items receives wool_material
```

Jeśli wool znajduje się u innego ownera, production ma zwrócić blocked/missing input. Ewentualny transfer powinien zostać wykonany przez istniejący/future local-goods transport seam przed kolejną próbą produkcji.

Nie rozszerzać 006 o generic non-food circulation tylko po to, aby Textile Worker zawsze znalazł surowiec.

## 5. Physical storage / logistics

Późniejsze storage plans ustanowiły rozdział:

- authoritative quantity/ownership w inventory/economy,
- fizyczny destination do którego NPC idzie,
- carried inventory jako owner dóbr w ruchu tam, gdzie zachodzi transfer.

006 nie potrzebuje fizycznego przenoszenia input/output, jeśli source i destination są tym samym `Household.items`.

Jeżeli implementacja wybierze fizyczny textile workplace oddalony od owner storage, wtedy trzeba reuse'ować istniejący storage destination + carried action lifecycle. Nie wolno trzymać claimed wool wyłącznie w closure ani teleportować go do workplace.

Nie dodawać workplace bez rzeczywistej potrzeby istniejącego work contract/API.

## 6. NPC work integration

Textile Worker powinien wejść w istniejący `NpcAgent` schedule/work arbitration, analogicznie do innych profesji.

Granica odpowiedzialności:

```text
NpcAgent
→ wybiera bounded work opportunity/action
→ movement/work lifecycle
→ on completion: shared production execution
```

NPC nie powinien sam mutować wool/output poza wspólnym production API.

Revalidation na completion jest ważniejsza niż preview przy wyborze pracy: inny aktor może wcześniej zużyć wool.

Nie tworzyć per-frame recipe scan ani drugiego production scheduler.

## 7. Work Contracts po npc-018

Aktualny codebase ma działający `WorkContract` i shared-work integration dla jawnych zleceń. `WorkContractRecord.workerNpcId`/contract state pozostają authority dla takiego zobowiązania.

Nie używać WorkContract do rutynowej produkcji własnego household:

```text
normal profession work ≠ WorkContract
```

Textile Worker ma działać autonomicznie bez gracza/employera.

Jeżeli w przyszłości production stanie się contract targetem, kontrakt powinien tylko skierować worker do tej samej production action/executor. Nie tworzyć contract-specific wool recipe ani drugiego ownership modelu.

## 8. Role assignment

Dodanie `textile_worker` nadal jest exhaustive `Role` change. Sprawdzić po aktualnym main co najmniej:

- `src/ai/characters.ts`,
- `src/ai/schedule.ts`,
- role dispatch w `src/ai/NpcAgent.ts`,
- `src/ai/npcLoadout.ts` tylko jeśli rola faktycznie wymaga narzędzia,
- exhaustive role maps/tests.

Nie dodawać roli bezwarunkowo do random pool.

Lepszy warunek to realny dostęp household do wool/production opportunity. Nie wiązać jednak Textile Workera na stałe z ownership sheep — po rozwoju local goods circulation surowiec może pochodzić od innego gospodarstwa.

Assignment ma używać istniejącego staffing/character-generation seam; bez drugiego profession systemu.

## 9. Item definition

`wool_material` powinien być zwykłym stackowalnym `ItemKind` z istniejącym `ITEM_DEFS`/catalog metadata.

Nie ma obecnie uzasadnienia dla:

- `ItemInstance`,
- durability/quality,
- yarn intermediate item,
- textile-specific metadata system.

Recipe quantity ma być gameplayową dyskretną wartością w `ProductionDef`. Roadmapowe `1 kg wool → ~3 m² cloth` jest tylko punktem odniesienia i nie powinno tworzyć osobnego unit-conversion subsystem.

## 10. Transaction boundary

Po 015 użyć jego finalnego production transaction contract.

Wymagany outcome dla 006:

1. preview input availability przy wyborze pracy,
2. bounded normal NPC action,
3. live revalidation na completion,
4. atomic consume + output commit,
5. success dopiero po skutecznym zapisaniu outputu.

Nie usuwać wool na starcie akcji.

Nie polegać na starym `Inventory.applyRecipe()` jako nowym publicznym textile execution path — 015 ma rozwiązać m.in. validation, duplicate inputs, output capacity i wspólną transaction boundary.

## 11. Off-screen / time skip

Nie tworzyć textile-specific catch-up simulation.

Produkcja ma korzystać z istniejącego NPC work lifecycle/fidelity. Jeżeli aktualny runtime nie symuluje dokładnego NPC action podczas dalekiego/off-screen stanu, 006 ma rozszerzyć wspólny mechanizm tylko wtedy, gdy jest to potrzebne i zgodne z aktualnym modelem — nie dodawać równoległego „offline textile production”.

Fauna wool readiness pozostaje osobną absolute-time odpowiedzialnością fauna-004.

## 12. Najważniejsze testy

Po implementacji 015 użyć jego production tests jako bazowego contractu i dodać textile-specific coverage:

- `wool → wool_material` happy path,
- missing/insufficient wool = zero mutation,
- exact input/output quantity,
- stale input przed completion = blocked bez partial consume,
- interruption = zero recipe mutation,
- output created exactly once,
- source/destination są prawidłowym `Household.items`,
- brak automatycznego claimu z innego household,
- Textile Worker work pozostaje normalnym profession work, bez WorkContract,
- brak regresji Hunter/shared production,
- fauna-004 wool deposit może być później skonsumowany przez recipe.

Jeżeli pojawi się fizyczny transfer do workplace, dodatkowo testować conservation przez `carried` i cancellation recovery.

## 13. Zalecana kolejność

1. Wylądować/zweryfikować `fauna-004` — realny `wool` i household deposit.
2. Wylądować `settlements-npcs-015` — shared transactional production execution.
3. Ponownie zrobić mały recon finalnych API po obu dependencies.
4. Dodać `wool_material` i recipe.
5. Dodać `textile_worker` przez istniejące role/schedule/staffing seams.
6. Dodać bounded profession work action wywołującą shared production executor na completion.
7. Dodać targeted tests ownership/transaction/revalidation.
8. Manual browser verification pozostawić użytkownikowi.

## 14. Relevant current files

- `src/economy/production.ts` — `ProductionDef`; aktualnie split execution, 015 jeszcze nie wylądował.
- `src/economy/npcWork.ts` — istniejący work → economy/production integration seam.
- `src/items/Inventory.ts` — concrete item owner/primitives; nie robić z niego textile scheduler.
- `src/items/items.ts` — authoritative `ItemKind` / `ITEM_DEFS`.
- `src/items/itemCatalog.ts` — capabilities/catalog; shearing należy do fauna-004.
- `src/settlement/household.ts` — authoritative `Household.items`.
- `src/economy/localExchange.ts` — bulk local exchange seam; nie jest generic ItemKind circulation API.
- `src/items/foodItems.ts` — concrete physical food transfer semantics z 014; wzorzec conservation, nie textile API.
- `src/settlement/storageDestinations.ts` — physical destination resolution, jeśli produkcja faktycznie będzie wymagała transportu.
- `src/ai/characters.ts` — `Role` i assignment seams.
- `src/ai/schedule.ts` — role schedule.
- `src/ai/NpcAgent.ts` — profession work, `PlannedAction`, carried inventory i WorkContract arbitration/integration.
- `src/world/workContract.ts` — authoritative contract state; nie używać do rutynowej household production.
- `src/ai/npcLoadout.ts` — role loadout tylko jeśli finalny textile work wymaga narzędzia.
- `src/fauna/livestockProduction.ts`, `src/settlement/livestock.ts` — fauna-004 integration context; 006 nie powinien przejmować ich ownership.

## 15. Najważniejsze różnice względem poprzednich notes

- `fauna-004` nie jest done; wcześniejsze sformułowanie „After fauna-004” nie może być traktowane jako obecny stan kodu.
- `settlements-npcs-015` nadal nie jest done i pozostaje blokującą zależnością.
- usunięto błędne przypisanie `shearing`/shears do Textile Workera,
- local goods circulation jest realnym fundamentem ownership/transport, ale nie daje jeszcze automatycznego generic wool circulation,
- Work Contracts są realne, ale nie powinny przejąć normalnej profesyjnej produkcji,
- storage/logistics należy reuse'ować tylko gdy zachodzi rzeczywisty transfer między ownerami; same-household recipe nie potrzebuje sztucznego transportu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
