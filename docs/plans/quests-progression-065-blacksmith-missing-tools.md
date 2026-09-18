# Plan: Blacksmith — Missing Forge Input

**Created:** 2026-09-17
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~settlements-npcs-002~~, ~~settlements-npcs-016~~, ~~settlements-npcs-017~~, ~~settlements-npcs-021~~, ~~settlements-npcs-024~~, ~~quests-progression-015~~, ~~quests-progression-016~~, ~~quests-progression-055~~
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `rewards`
**Tags:** `blacksmith` `production` `shortage` `ore` `economy`
**Roadmap:** `quests-professions-and-world-consequences.md`
**Model:** Sonnet, Composer

## Cel

Dodać krótki contextual quest Blacksmitha wynikający z **realnego, persistent production shortage**, bez tworzenia brakującego narzędzia, którego aktualny system nie wymaga.

V1 dotyczy istniejącej receptury:

```text
BLACKSMITH_IRON_ROD_PRODUCTION
iron ×2 + coal ×1
→ iron_rod
```

Flow:

```text
Blacksmith próbuje normalnie pracować
→ istniejący productionShortage utrzymuje się
→ quest binduje exact Blacksmitha + settlement + recipe + missing kind
→ gracz zdobywa realne iron albo coal
→ przekazuje je do właściwego SettlementEconomy stock
→ normalny shortage zostaje zrewalidowany
→ normalna produkcja może znowu ruszyć
→ quest obserwuje domain state
→ lokalna nagroda
```

Nie implementować `blacksmithMissingTools`, `toolsDelivered` ani quest-only inventory.

## Recon — aktualny system

### Blacksmith identity / staffing / workplace

- `blacksmith` istnieje w `src/ai/characters.ts::Role`.
- Initial staffing jest deterministyczny w `src/settlement/professionStaffing.ts`; małe osady mogą nie mieć Blacksmitha.
- `settlements-npcs-002` już podpiął realny profession work.
- `settlements-npcs-024` daje Blacksmithowi household-owned workplace: anvil + grind workbench w yardzie jego gospodarstwa.
- Giver ma być konkretnym stable `NpcId`, nie nazwą ani runtime `NpcAgent`.

### Co naprawdę blokuje pracę

Aktualny `ProductionDef` nie ma tool/capability requirement dla młotka ani innego ogólnego narzędzia.

Realne ścieżki Blacksmitha są dwie:

1. sharpening — wymaga household-held `whetstone` i odpowiedniej broni;
2. iron-rod production — wymaga settlement stock `iron ×2 + coal ×1`.

Ten plan wybiera **drugi** mechanizm, ponieważ ma już:

- authoritative recipe;
- transactional executor;
- realny blocker;
- persisted shortage observation;
- autonomous logistics mogące rozwiązać problem.

`whetstone` pozostaje istniejącym sharpening requirement, ale nie jest zakresem 065.

## Source of truth problemu

Źródłem questa jest istniejący:

`SettlementEconomy.productionShortages()`

dla:

```text
recipeId = blacksmith.iron_rod
category = stock
kind = iron | coal
```

Oferta powstaje dopiero dla shortage uznanego przez istniejące `isProductionShortagePersistent()`.

Nie dodawać drugiego cooldownu/timera ani questowego shortage state.

## Eligibility V1

Quest ma reprezentować jeden konkretny problem, którego usunięcie faktycznie odblokowuje recepturę.

Dlatego oferta jest eligible tylko gdy:

1. settlement ma adult Blacksmitha z normalnym household-owned workplace;
2. istnieje persistent shortage `blacksmith.iron_rod`;
3. shortage dotyczy `iron` albo `coal`;
4. **pozostałe inputy tej samej receptury są aktualnie wystarczające**.

Przykładowo:

```text
iron insufficient + coal sufficient
→ quest o iron

coal insufficient + iron sufficient
→ quest o coal

iron insufficient + coal insufficient
→ brak questa V1
```

Nie hardcode'ować wymagań `2/1` w quest logic. Czytać je z `BLACKSMITH_IRON_ROD_PRODUCTION.inputs`.

Jeżeli oba inputy są jednocześnie brakujące, nie tworzyć wielomateriałowego questa w tym planie.

## Binding

Contextual definition binduje dokładnie:

```text
settlementId
Blacksmith NpcId
recipeId = blacksmith.iron_rod
missingKind = iron | coal
```

Nie binduje:

- offer-time stock count;
- delivered count;
- shortage timestamps;
- runtime NPC object;
- workplace mesh;
- transport order;
- player attribution.

Quest ID ma być stabilny i deterministyczny, np.:

```text
world:blacksmith-forge-input:<settlementId>:<missingKind>
```

Jeżeli istniejący opportunities subsystem ma canonical contextual-id helper, użyć jego konwencji.

## Contextual generation

Reuse `src/quests/opportunities/` i istniejący stable settlement NPC materialization flow z quests-progression-016.

Nie tworzyć nowego profession quest managera.

Candidate selection ma być bounded i deterministic. Jeżeli w jednej osadzie jest więcej niż jeden Blacksmith, wybrać stable pierwszego eligible Blacksmitha według istniejącej kolejności settlement NPC identities.

Nowej oferty nie tworzyć, gdy istniejący ore transport ma już committed incoming supply dla tego samego uncovered shortage i można to sprawdzić istniejącym `oreTransportDemand` seamem. To jest wyłącznie filtr jakości oferty — po acceptance autonomous logistics nadal może rozwiązać quest.

## Objective

Dodać wąski state-bound objective odpowiadający realnemu blockerowi, konceptualnie:

```ts
{
  type: 'resolve_production_shortage',
  settlementId,
  recipeId: 'blacksmith.iron_rod',
  category: 'stock',
  kind: missingKind,
}
```

`QuestManager` nie importuje `SettlementEconomy`. Composition root wstrzykuje wąski lookup re-resolvujący aktualny economy owner po `settlementId`.

Stan logiczny:

```text
still_blocked
resolved
missing_owner
```

Completion następuje, gdy **dokładnie bound shortage przestaje istnieć po normalnej economy revalidation**.

Nie sprawdzać:

```text
player delivered item
player clicked dialogue action
stock >= snapshot threshold forever
toolsDelivered == 1
```

Jest to ważne, ponieważ udana produkcja może natychmiast skonsumować dostarczony input. Jeżeli Blacksmith zdąży wyprodukować `iron_rod`, quest nie może wrócić do „brakuje materiału” tylko dlatego, że stock po produkcji znów spadł.

## Player → production input transfer

Obecne transfery nie pasują do ownera:

- questowe `transferItemCount` trafia do `NpcAuthoritativeState.personalInventory`;
- `householdResourceTransfer.ts` obsługuje tylko food oraz branch/beam wood;
- generic NPC trade nie zasila `SettlementEconomy` production stock.

065 dodaje więc mały actor-neutral domain transaction:

```text
source Inventory
+ SettlementEconomy
+ iron | coal
+ amount
→ remove real item
→ add matching bulk stock
→ normal shortage revalidation
```

Preferować focused helper w economy domain i reuse istniejącego ore item → economic kind mapping.

Nie wykonywać tej mutacji bezpośrednio w:

- Vue;
- `QuestManager`;
- quest definition;
- dialogue presentation.

Player-facing delivery może być akcją dialogową przy bound Blacksmithie, ale fizyczny transfer ma przejść przez domain/app action seam.

Amount potrzebny przy kliknięciu `Przekaż` ma być liczony z **live recipe + live economy**, a nie z wartości zapamiętanej podczas offer.

## Autonomous resolution

Istniejący `src/economy/oreTransportDemand.ts` już reaguje na shortage iron/coal i może dostarczyć rudę/paliwo przez normalny `TransportOrder`.

Quest nie może blokować ani rezerwować tego systemu.

Po acceptance wszystkie poniższe drogi są poprawnym success:

```text
player delivery
Trader / resource-site transport
inna normalna zmiana SettlementEconomy
Blacksmith successful production clearing the shortage
```

Nie śledzić `deliveredByPlayer`.

Świat może rozwiązać problem bez gracza.

## Lifecycle

### Przed acceptance

Jeżeli exact shortage zniknie:

- nie oferować questa;
- stale `offered` context ma przestać być actionable;
- brak retroactive reward.

Jeżeli giver przestanie być poprawnym żywym Blacksmith contextem, nie tworzyć nowej oferty ani replacement givera.

### Po acceptance

Jeżeli exact shortage zniknie:

- objective success;
- stan przechodzi zwykłym quest lifecycle do `ready_to_report`.

Jeżeli economy owner jest technicznie niedostępny/nieodtwarzalny:

- użyć istniejącej polityki invalidation dla world-bound objectives;
- nie tworzyć replacement shortage.

Nie przepinać aktywnego questa na inny materiał, nawet jeśli później powstanie nowy shortage.

## Save/load i persistence

`productionShortages` są już częścią `SettlementEconomySnapshot` i są rewalidowane po restore.

Nie dodawać nowego pola `SaveData`.

Persisted owners pozostają:

```text
SettlementEconomySnapshot
→ stock
→ productionShortages

SaveData.quests / QuestManager
→ quest lifecycle / outcome / relation

NpcStateRegistry
→ stable Blacksmith identity/state
```

Ważne: definition dla już `offered` / `active` / `ready_to_report` questa musi zostać odtworzona z tym samym bindingiem również wtedy, gdy aktualne **new-offer eligibility** przestało być spełnione. Dopiero normalny reconciliation ma rozstrzygnąć resolved/invalidation.

## Trade / vendor

Blacksmith vendor identity i generic NPC trade nie są source of truth tego questa.

Obecnie:

```text
Blacksmith trade goods
→ Household.items / personalInventory

Blacksmith forge inputs
→ SettlementEconomy bulk stock
```

Sprzedaż ore Blacksmithowi przez zwykły trade nie może automatycznie oznaczać wykonania questa, jeżeli nie zmienia realnego production ownera.

Nie mirrorować trade inventory do economy i nie tworzyć specjalnego questowego sklepu.

## Dialogue / marker

Reuse istniejący `QuestManager.labelMarker(npcId)` i lifecycle/actionability z quests-progression-055.

Nie ma osobnego physical target markera — giver i delivery target to exact Blacksmith.

Dialogue ma opisywać tylko fakty istniejące w stanie, np.:

```text
"Kończy nam się żelazo do prętów. Jeśli zdobędziesz trochę, piec znowu ruszy."
```

albo coal variant.

Pozostała ilość może być pokazywana z live recipe/economy state.

Nie pisać o:

- zgubionym młotku;
- zepsutym kowadle;
- missing tools;
- potrzebie narzędzia, której kod nie reprezentuje.

## Reward

Mały lokalny outcome przez istniejące `QuestOutcome` / `QuestConsequences`:

- `10 × coin`;
- relation z bound Blacksmithem `+2`;
- settlement reputation:
  - `competence +2`;
  - `benevolence +1`;
- bez renown;
- bez Known Deed;
- bez unique item.

Reward/consequences są exact-once przez istniejący quest resolution path.

## Pliki / integration scope

Najbardziej prawdopodobne miejsca zmian:

- `src/quests/quests.ts` — state-bound production-shortage objective;
- `src/quests/QuestManager.ts` — injected shortage lookup + reconciliation;
- `src/quests/opportunities/` — contextual Blacksmith shortage definition;
- `src/economy/` — focused Inventory → forge stock transaction / ewentualny mały reuse z ore delivery;
- `src/app/createApp.ts` — lookup + app action composition;
- istniejący NPC dialogue quest-action path — delivery action;
- focused tests przy powyższych ownerach.

Nie rozszerzać tego planu o generic production quest framework.

## Non-goals

- hammer/tool requirement dla Blacksmith production;
- `whetstone` fetch quest;
- general tool durability;
- Woodcutter/Mining/Farmer tool quests;
- multi-input shortage quest;
- nowy crafting system;
- nowy profession inventory;
- nowy vendor/shop;
- regional prices;
- suppressing autonomous ore logistics;
- actor attribution;
- quest-only delivery counter;
- new Known Deed;
- nowy persistence registry.

## Testy

Co najmniej:

1. exact stable Blacksmith `NpcId` binding;
2. persistent `blacksmith.iron_rod` iron shortage + coal sufficient → eligible;
3. coal shortage + iron sufficient → eligible;
4. oba inputs insufficient → brak offer V1;
5. unrelated production shortage → brak offer;
6. brak Blacksmitha/workplace → brak offer;
7. player transfer usuwa realny item i zwiększa realny settlement stock;
8. unsupported item / insufficient inventory → atomic failure;
9. shortage resolution przez player delivery kończy active objective;
10. autonomous ore transport może zakończyć ten sam objective;
11. shortage resolved przed acceptance → brak reward;
12. later new shortage nie cofa completed progress;
13. normalny Blacksmith production nadal zużywa stock i tworzy `iron_rod` w `Household.items`;
14. sharpening nadal używa household `whetstone`;
15. generic NPC trade nie false-completuje questa;
16. save/load odtwarza exact binding i nie duplikuje reward;
17. settlement unload/reload nie zmienia givera ani target shortage;
18. marker używa istniejącego `labelMarker` pipeline.

## Weryfikacja

AI implementation agent uruchamia tylko focused automated tests/typecheck potrzebne dla zmian.

Browser/manual verification wykonuje User. AI nie uruchamia browser verification ani `pnpm docs:sync`.

Dla ważnych nowych publicznych/architektonicznych helperów dodać JSDoc z `@domain quests-progression` albo właściwym economy domain.

Szczegółowy recon i symbol-level guidance:
`docs/plans/implementation-notes/quests-progression-065-blacksmith-missing-tools-implementation-notes.md`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
