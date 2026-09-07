# Implementation Notes: quests-progression-005 — Authored RPG Quests

## Stan wejściowy

- Review wykonano na `main` przed implementacją `quests-progression-002`–`004`. Aktualny `src/quests/quests.ts` nadal ma `reward`/`effects`, a `QuestManager` nadal używa `completeQuest()`/`failQuest()` i nie ma `resolvedOutcomeId`. `005` ma wejść **po** kontraktach opisanych w notes `002`–`004`, bez tworzenia tymczasowej równoległej wersji outcomes/prerequisites.
- `quests-progression-001` jest już w kodzie: `QuestDef.settlementId`, `ReputationManager` i injected `ApplySocialConsequence` działają.
- Reserved home NPC są gwarantowani przez `src/ai/characters.ts::RESERVED_CHARACTERS`: `Anna=farmer`, `Piotr=woodcutter`, `Kasia=trader`, `Marek=guard`. Używać dokładnie tych nazw; quest matching nadal jest name-based.

## Kontrakt zależności 002–004

Implementacja zakłada po `002`:

- `QuestDef.outcomes`, `QuestOutcomeId`, `QuestReward` z `visibility`, authored relation/social consequences,
- authoritative progress z `resolvedOutcomeId`,
- jeden validated terminal resolution path stosujący reward/consequences exact-once,
- item grants przez istniejący injected `QuestItemGrant`,
- brak implicit giver/target relation i brak quest EXP.

Po `004` availability ma korzystać z `availability.prerequisites` i typów `quest_outcome`/`renown`. Nie tworzyć własnego chain/availability evaluatora w `005`.

## Najważniejsze decyzje z review

### `sealed_package`: NIE jako item

Nie dodawać `sealed_package` do `ItemKind`/`ITEM_DEFS`/`ITEM_CATALOG`.

Powód nie leży w samym closed union — nowy item dałoby się dopisać — tylko w lifecycle: obecny `interact_spawner`/`interact_landmark` wyłącznie raportuje objective progress. Nie ma istniejącego stage-side „spawn/grant quest item” z exact-once persistence. Fizyczna paczka wymagałaby quest-only world spawn/grant semantics, drop/pickup edge cases i dodatkowej ochrony przed duplikacją. To jest nieproporcjonalne do contentu.

Po ukończeniu stage 0 `zaginiona-przesylka` fakt posiadania/odzyskania przesyłki wynika z authoritative quest progress. Nie zapisujemy drugiego stanu.

### Wybór przez realną rozmowę: jeden nowy objective

Obecny `QuestManager.onInteract(npcName)` umie liniowe `talk_to_npc`, ale nie umie „rozmowa z jednym z kilku NPC wybiera terminal outcome”. `QuestDialogOverride` ma tylko offer accept/decline; nie budować na nim branching dialogue UI.

Dodać do `QuestObjective` dokładnie jeden narrow primitive, używany przez A i B:

```ts
{
  type: 'talk_to_npc_choice'
  choices: readonly {
    npcName: string
    outcomeId: QuestOutcomeId
  }[]
}
```

`QuestManager.onInteract(npcName)` dla active stage:

1. przed zwykłym `npcName === giverName` reminder handling sprawdza `talk_to_npc_choice`,
2. znajduje choice o matching `npcName`,
3. prevaliduje outcome tym samym contractem co `002`,
4. terminalnie rozwiązuje quest tym outcome,
5. zwraca authored `resultText`/line bez osobnego UI wyboru.

Ordering jest istotny: w A `Kasia`, a w B `Anna`, są jednocześnie giverem i choice targetem; stary giver branch inaczej przechwyci rozmowę i zwróci reminder.

`labelMarker()` ma zwrócić talk-target marker dla **każdego** `choices[].npcName` aktywnego stage. Nie dodawać nowego marker state.

Definition validation z `004` rozszerzyć tylko o:

- co najmniej 2 choices (w obecnym content use-case),
- unikalne `npcName` w jednym objective,
- każde `outcomeId` istnieje w outcomes tego samego questa.

Nie budować generic action→outcome map ani dialogue graph.

## Questline A — `zaginiona-przesylka`

### Dlaczego Kasia

`Kasia` jest gwarantowanym `trader`; przesyłka handlowa pasuje do istniejącej roli. Pierwotne „preferuj Piotra” z planu zostało usunięte.

### Stages

1. `interact_spawner/cave` — istniejący objective i dispatch; po progress przesyłka jest logicznie odzyskana.
2. `talk_to_npc_choice`:
   - `Kasia → returned_sealed`,
   - `Marek → turned_over_to_guard`.

`interact_spawner` jest już obsługiwany przez `src/interaction/resolveInteraction.ts → QuestManager.onInteractObjective({ type:'interact_spawner', ... })`; nie dotykać interaction layer dla A.

### Outcomes

`returned_sealed`:

```text
reward: hidden 15 coin
relations: Kasia +2
social: trust +5, integrity +6, renown +3
```

`turned_over_to_guard`:

```text
reward: hidden 2 bandage
relations: Kasia -1, Marek +2
social: competence +4, courage +2, integrity +1, renown +2
```

Nie dodawać `opened_and_returned`. Brak istniejącego opening mechanic dla takiego bytu, a fake „open” button byłby dokładnie content-only frameworkiem, którego plan ma unikać.

## Questline B — `sporne-drewno`

### Konflikt

`Anna` jako farmer chce, by najbliższa praca gracza zasiliła potrzeby gospodarstwa; `Piotr` jako woodcutter chce materiał do swoich prac. Nie deklarować konkretnej naprawionej stodoły/płotu/budynku — obecny quest system nie zmienia wizualnego building state.

### `sporne-drewno`

Giver `Anna`.

Stages:

1. `talk_to_npc Piotr`,
2. `talk_to_npc_choice`: `Anna → support_anna`, `Piotr → support_piotr`.

Outcomes:

```text
support_anna:
  Anna +2, Piotr -1
  benevolence +3, trust +1, renown +2

support_piotr:
  Piotr +2, Anna -1
  competence +3, trust +1, renown +2
```

Bez rewardu na samym sporze. Bez `compromise`: nie ma trzeciego naturalnego action/content branch.

### Outcome-dependent continuation

`drewno-dla-anny`:

- prerequisite `quest_outcome(sporne-drewno, ['support_anna'])`,
- giver `Anna`,
- `gather_item branch x5`,
- outcome `delivered_to_anna`,
- hidden reward `seed_carrot x3`,
- `Anna +1`.

`drewno-dla-piotra`:

- prerequisite `quest_outcome(sporne-drewno, ['support_piotr'])`,
- giver `Piotr`,
- `gather_item branch x5`,
- outcome `delivered_to_piotr`,
- shown reward `coin x8` (zgodnie z paid-quest baseline z `003`),
- `Piotr +1`.

Oba korzystają z istniejącej `gather_item` semantyki: wymagane itemy są sprawdzane i konsumowane przy rozmowie z giverem. Po `003` final gather musi zachować validate → consume → terminal resolve atomicity; `005` nie dodaje delivery subsystemu.

## Questline C — `dzik-przy-szlaku`

### Dlaczego boar

- `createFauna.ts::SPAWNS` realnie spawnuje `boar` (`count: 2`, forest profile).
- Nie używać `bear`: `AnimalKind`/def istnieje, ale aktualny `createFauna.ts::SPAWNS` nie tworzy niedźwiedzi — authored bear quest mógłby być niewykonalny.
- Nie używać `fox`: `quests-progression-003` już planuje `lis-przy-osadzie` z `kill_target_animal fox`, a resolver nie rezerwuje targetów; dwa równoległe questy tego samego kind mogą związać się z tym samym `animalId`.
- Nie używać kolejnego wolf quest: istnieją już `grozny-wilk` i `wilcza-jama`.

### Availability

Tylko:

```ts
{ type: 'renown', minimum: 10 }
```

Nie dodawać `friendly Marek`: po `002` relation jest tylko authored, a obecny zestaw questów nie gwarantuje `Marek >= 3` bez sztucznego grind/ordering.

### Stages

1. `talk_to_npc Piotr` — drwal potwierdza problem w lesie.
2. `kill_target_animal boar` — existing resolver binduje jeden konkretny live `animalId`.

Nie ustawiaj `dangerous: true`. `AnimalAgent.markDangerous()` jest opisany/tuningowany jako mechanizm „Groźny wilk”; 005 nie ma podstaw, by redefiniować go jako generic authored-animal modifier.

Outcome `boar_removed`:

```text
reward: hidden book_defense_intermediate x1
relations: Marek +2
social: competence +6, courage +6, benevolence +2, renown +8
```

Wartości są niższe od istniejących calibration points `grozny-wilk` (+10/+12/+4/+15) i `wilcza-jama` (+15/+18/+6/+25), ale wyższe od prostego fox job z `003` (+3/+3/+3).

### Wild target lifecycle

Nie naprawiać w `005` obecnej globalnej polityki: `kill_target_animal` binding dla wild fauna jest runtime-only. `QuestManager` invaliduje active wild target przy restore / same-session `WorldBundle` rebuild, bo `animalId` nie jest stabilnie persisted. `dzik-przy-szlaku` dziedziczy tę semantykę. Testować ją, nie omijać przez zapis przypadkowego id.

## Land ownership — dlaczego NIE jest rewardem

Zweryfikowane kontrakty:

- `src/settlement/landOwnership.ts::LandOwnershipRegistry` ma tylko `isOwned`, `setOwned`, `toJSON`, `clear`.
- `landPlotKey(settlementId, plotId)` daje stabilny composite key.
- `src/settlement/landPurchase.ts::purchaseLandPlot()` jest jedyną walidowaną domenową operacją: plot istnieje w `settlement.landmarks.landPlots`, nie jest owned, cena > 0, gracz ma coins; potem pobiera coins i robi `setOwned`.
- `VillagePlanner` generuje sale plot IDs `plot-sale-${i}`, ale `SALE_PLOT_MAX` + `saleSlotCount()` pozwala na **0** sale plots nawet w normalnej osadzie; LG/XL jawnie mogą mieć 0/1/2.

Wniosek: `setOwned` nie jest bezpiecznym quest grant API, a `purchaseLandPlot` ma błędną semantykę dla nagrody (pobiera zapłatę). Do poprawnego grantu trzeba byłoby rozwiązać availability/rezerwację konkretnej działki oraz konflikt z wcześniejszym zakupem gracza. To jest osobny land-allocation feature.

Dlatego w `005`:

- nie dodawać `QuestOwnershipConsequence`, `grant_land` ani `plotKey` do quest outcomes,
- nie wołać `LandOwnershipRegistry.setOwned()` bezpośrednio,
- nie zmieniać land persistence.

### Konkretny fallback

`dzik-przy-szlaku` daje hidden `book_defense_intermediate`.

To jest już istniejący item, a jego faktyczny progression effect należy do `PlayerSkills` (`items/books.ts` / inventory `Czytaj` path). Quest jedynie grantuje item istniejącą ścieżką. Nie dodawać unlock registry.

Nie używać jako fallbacku:

- helper assignment — `NpcAgent.setHelperAssignment()` jest już normalnie dostępny z Villagers UI, więc nie jest unlockiem,
- horse ownership — brak player ownership/taming contractu,
- `map_far` item — sam item nie reveal-uje wiedzy; `LocationKnowledge` update jest obecnie specjalnym efektem merchant purchase w `inventoryWiring.ts`, więc quest grant mapy nie byłby równoważny map purchase.

## Settlement economy — świadomie bez questowego stock consequence

`SettlementEconomy` ma realne domain mutations (`add/remove`, `depositFood/...`), ale player `branch` (`ItemKind`) i bulk `wood` (`EconomicKind`) nie mają w quest systemie istniejącego, jawnego conversion contractu. Nie zgadywać `branch x1 == wood x1` i nie dodawać `settlementStock` consequence tylko dla historii B/C.

Follow-upy B pozostają ordinary `gather_item` deliveries, tak jak obecne authored/paid quests; nie narracjonować ich jako zmianę konkretnego persisted building/stock amount.

## Call sites / blast radius

### Zmiany wymagane

`src/quests/quests.ts`

- po 002/004: pięć statycznych defs z planu,
- `talk_to_npc_choice` w `QuestObjective`,
- outcomes/prerequisites zgodnie z finalnym kontraktem dependencies.

`src/quests/QuestManager.ts`

- active `talk_to_npc_choice` dispatch w `onInteract()` przed giver handling,
- `labelMarker()` dla choice targets,
- ewentualna mała presentation handling dla current objective; nie dodawać nowego managera.

Definition validator z `004` (lokacja zależy od finalnej implementacji 004)

- validate choices/outcome IDs.

`src/quests/QuestManager.test.ts` / `src/quests/quests.test.ts`

- content + branching + prerequisites + exact-once.

### Reuse bez nowego mechanizmu

`src/ui-vue/store.ts::openNpcDialogueMenu()` już wywołuje `questManager.onInteract(npc.name)` przy otwarciu rozmowy. To jest realny action point dla `talk_to_npc_choice`; nie dodawać Vue buttonów.

`src/interaction/resolveInteraction.ts` już mapuje spawner interaction do `onInteractObjective`; A nie wymaga zmian.

`src/app/createApp.ts` już:

- dopina home `settlementId` do defs,
- injectuje quest item grant,
- injectuje wild/livestock animal target resolver,
- injectuje `markDangerous` callback,
- injectuje social consequence do `ReputationManager`.

005 nie potrzebuje nowego app wiring, chyba że finalne 002/004 zmienią kształt tych deps.

Fauna death dispatch już raportuje `animal_died` do `QuestManager`; C korzysta z istniejącego path.

Quest Log po 002 ma dostawać title/description/result/reward presentation z `QuestManager.list()`. Nie dodawać story screen ani interpretation outcomes w Vue.

Persistence: żadnego nowego pola w 005. `resolvedOutcomeId` z 002 wystarcza do A/B branching i prerequisite follow-upów.

## Teksty contentu

Trzymać krótkie. Implementator może dopracować składnię językową, ale nie zmieniać faktów/mechaniki:

- A: Kasia straciła handlową przesyłkę; po odnalezieniu można ją oddać Kasi albo przekazać strażnikowi Markowi.
- B: Anna i Piotr chcą priorytetu dla tej samej pomocy/materialu; decyzja wybiera jeden follow-up delivery.
- C: Marek prosi o zajęcie się konkretnym dzikiem po potwierdzeniu problemu u Piotra.

Nie pisać, że paczka istnieje fizycznie w ekwipunku, że budynek został naprawiony, że dzik zniszczył pola, ani że działka została przyznana.

## Test matrix

### A

- cave progress przechodzi do choice stage bez item grant/spawn,
- Kasia wybiera tylko `returned_sealed`, Marek tylko `turned_over_to_guard`,
- po resolution druga rozmowa nie zmienia outcome/reward/consequences,
- różne relation/social/reward są exact,
- oba rewards hidden.

### B

- Piotr musi zostać odwiedzony przed choice,
- Anna → `support_anna`, Piotr → `support_piotr`,
- wybór jednej strony terminalnie blokuje drugą,
- tylko właściwy follow-up spełnia `quest_outcome` prerequisite,
- 5 branches są konsumowane dokładnie raz przy właściwym giverze,
- Anna branch daje 3 `seed_carrot`; Piotr branch daje 8 coins,
- save/load po decision zachowuje outcome i właściwy follow-up availability.

### C

- `renown 9` locked, `renown 10` available,
- stage 0 wymaga Piotra,
- stage 1 binduje jednego boar i tylko śmierć bound id rozwiązuje quest,
- reward `book_defense_intermediate x1` + exact relation/social,
- active wild binding zachowuje istniejące invalidation semantics na restore/rebuild.

### Regression

- zwykłe `talk_to_npc` zachowuje ordering/markers,
- giver active reminders nadal działają poza `talk_to_npc_choice`,
- existing gather quests nie tracą atomicity z 003,
- existing fox/wolf quests nadal bindują właściwe gatunki,
- `labelMarker()` nie oznacza choice targets po terminal resolution.

## Docs po implementacji

Zaktualizować tylko faktycznie dotknięte canonical docs, przede wszystkim:

- `docs/state/player-systems.md`,
- `docs/state/npc.md`,
- `docs/vision/quests.md`.

`docs/state/settlements.md` nie wymaga land-reward update, bo land ownership nie jest zmieniany. `docs/state/persistence.md` tylko jeśli finalna implementacja zależności 002/004 nadal wymaga zmian schema; 005 sam nie dodaje schema.

Nie uruchamiać `pnpm docs:sync` ręcznie — robi to GitHub workflow.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
