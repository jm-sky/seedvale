# Plan: Quest giver cap, markers, dialogue and target lifecycle

**Created:** 2026-09-15
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** M
**Depends on:** ~~quests-progression-033~~
**Domain:** `quests-progression`  
**Type:** `fix`  
**Model:** Sonnet, Composer
**Roadmap:** `quests-and-reputation.md`  

## Implementation status

Implemented 2026-09-14. Ordinary giver `active`/`ready_to_report` quests occupy a derived per-giver capacity of 2 (`QuestManager.activeOrdinaryGiverQuestCount`); admission and stale `onAccept` both gate on it. `QuestOfferPolicy.urgency: 'urgent'` and `exposure: 'story'` bypass that cap without blocking foreign-quest talk/hand-in/report. `labelMarker` treats a live gather hand-in as `✓` (outranking `!`); `notifyInventoryChanged()` dirties only when an active gather stage exists. Generic abandon actions are `topicScoped` so multi-quest NPC dialogue uses titled `QuestDialogTopic`s instead of duplicate "Przykro mi…" buttons. `animal_died` no longer rebinds via `resolveAnimalTarget` (that skipped the corpse and could steal another live animal); an unbound slot binds to the dying exact id when the world reports `kind`. No save-version bump — capacity is derived.

Automated quest/dialogue tests are green. Browser/gameplay verification remains user-owned.

## Goal

Doprecyzować ekspozycję i prezentację questów u NPC tak, aby:

- zwykły giver miał domyślnie maksymalnie 2 aktywne questy gracza,
- ważne/world-driven/narrative sytuacje mogły jawnie ominąć ten limit,
- limit givera nigdy nie blokował dialogu lub akcji wynikającej z questa rozpoczętego przez innego NPC,
- marker nad NPC odzwierciedlał najważniejszą aktualną akcję questową, a nie wyłącznie surowy lifecycle state,
- wiele równoległych questów nie generowało nierozróżnialnych akcji rezygnacji,
- `kill_target_animal` zachowywał spójność między bound targetem, śmiercią zwierzęcia i przejściem questa do reportu.

## Current behaviour / problems

### Active quest cap

`quests-progression-033` ogranicza ekspozycję nowych ofert, ale świadomie nie ogranicza liczby aktywnych questów. W praktyce gracz może:

```text
accept → zwolnić offer slot → dostać kolejną ofertę → accept → ...
```

i zebrać wiele zwykłych aktywnych questów od jednego givera.

Docelowo zwykły giver ma maksymalnie **2 aktywne zwykłe questy**.

### Important bypass

Limit nie może blokować ważnej sytuacji wygenerowanej przez świat/narrację, np. nagłego ataku watahy wilków. Taka oferta może pojawić się i zostać przyjęta niezależnie od dwóch zwykłych aktywnych questów.

Nie tworzyć osobnego schedulera ani równoległego systemu priorytetów. Rozszerzyć/reużyć istniejące `QuestOfferPolicy` i ranking z `quests-progression-033`.

### Cross-quest dialogue must remain available

Limit dotyczy wyłącznie capacity givera dla **jego własnych nowych zwykłych questów**. Nie może blokować:

- `talk_to_npc`,
- `talk_to_npc_choice`,
- `dialogueActions`,
- gather hand-in,
- report,
- innych required interactions,

jeżeli NPC jest targetem/stacją dialogową questa, którego giverem jest ktoś inny.

### Quest markers

Aktualny marker reduction używa lifecycle state (`? > ✓ > ! > …`). To nie wystarcza dla `gather_item`: gdy gracz ma wymagane przedmioty, dialog może już pokazać hand-in, ale quest nadal formalnie jest `active`, więc równoległa nowa oferta może wygrać markerem `!`.

Docelowo marker ma reprezentować **najważniejszą questową interakcję dostępną teraz**:

```text
required talk/action
> ready hand-in/report/completion action
> new exposed offer
> ordinary active reminder
> null
```

Mapowanie glyphów może pozostać zgodne z obecnym systemem:

- `?` — wymagany talk/action target,
- `✓` — można teraz oddać/zakończyć etap lub quest u tego NPC,
- `!` — nowa wystawiona oferta,
- `…` — aktywny quest bez natychmiastowej akcji.

`✓` ma obejmować nie tylko `ready_to_report`, ale również aktywny quest z realnie dostępnym teraz hand-in/completion action.

### Abandon actions

Obecnie każdy abandonable active giver quest może dodać tę samą akcję:

> Przykro mi, jednak nie dam rady ci pomóc.

Przy kilku questach powstają nierozróżnialne przyciski. Prezentacja ma jednoznacznie wskazywać quest, najlepiej przez istniejące `QuestDialogTopic` / `QuestDef.title`, bez quest-id logic w Vue.

### `kill_target_animal` — „Lis przy osadzie”

Zaobserwowany przypadek:

- quest „Lis przy osadzie” jest aktywny,
- specjalnie widoczny/oznaczony lis został zabity,
- ciało pozostaje w świecie,
- Marek nie daje możliwości zakończenia/reportu,
- brak innego oczywistego lisa w okolicy.

Recon/fix ma zweryfikować pełną ścieżkę exact-instance:

```text
accept
→ bindAnimalTargetIfNeeded()
→ animalTargets[questId] = animalId
→ animal death
→ onAnimalDeathTarget
→ QuestManager.onInteractObjective({ type: 'animal_died', animalId })
→ objectiveMatchesRef(...boundAnimalId...)
→ advanceStage()
→ ready_to_report
→ giver report / ✓
```

Nie zmieniać `kill_target_animal` na „dowolny osobnik gatunku”. Exact identity pozostaje właściwym mechanizmem.

## Architecture

### Active capacity

Dodać derived check per giver, np. mały helper/policy oparty o aktualne `QuestDef` + `QuestState`.

Zasada bazowa:

```text
max 2 active ordinary giver quests
+ explicit important/story/urgent bypass
```

Nie zapisywać licznika ani slotów w save. Capacity jest derived z authoritative quest progress.

Do liczenia giver capacity wchodzą wyłącznie questy, dla których `def.giver.npcId === npcId` i które zajmują zwykły slot. Required-dialogue target z obcego questa nigdy nie zajmuje capacity tego NPC.

`ready_to_report` pozostaje istniejącym questem givera i powinien liczyć się jako zajmujący slot aż do terminalnego resolution; nie otwierać zwykłego nowego slotu tylko dlatego, że objective jest już skończony.

### Bypass metadata

Reużyć istniejące `QuestOfferPolicy` (`urgency`, `exposure`, `priority`) zamiast nowego równoległego typu, o ile recon nie wykaże brakującej semantyki.

Preferowana interpretacja:

- ordinary `exposure: normal`, `urgency: normal` — podlega active cap,
- `urgency: urgent` lub jawny story exposure — może ominąć active cap,
- bypass musi być explicit i rzadki; nie każdy world-driven quest automatycznie staje się wyjątkiem.

Jeżeli obecne pola nie pozwalają jednoznacznie rozdzielić offer-ranking urgency od active-cap bypass, rozszerzyć `QuestOfferPolicy` jednym minimalnym polem zamiast tworzyć nową politykę obok.

### Marker derivation

Nie mutować quest state tylko po to, by uzyskać marker. Marker pozostaje derived/read-only.

Wydzielić/helperować ocenę „actionable now” tak, aby `labelMarker()` używał tej samej semantyki co `onInteract()` dla:

- gather hand-in,
- report,
- required talk,
- authored stage dialogue action.

Nie duplikować całego dialog resolvera i nie wykonywać callbacków podczas marker calculation.

### Multi-quest presentation

`QuestManager` pozostaje właścicielem quest semantics. Vue renderuje label/callback/topic i nie interpretuje quest id, objective type ani stage state.

Wiele abandon actions ma być dostępne przez jednoznaczny quest context — preferowane wykorzystanie istniejącego `QuestDialogTopic` z `QuestDef.title`.

### Animal target lifecycle

`QuestManager.animalTargets` pozostaje runtime-only ownerem bindingu. Fauna/world raportuje factual `animal_died`; nie przenosić quest knowledge do `AnimalAgent`.

Fix ma znaleźć realną przyczynę „Lisa przy osadzie” i naprawić wspólną ścieżkę, nie specjalny case dla quest id.

## Relevant files

### Quest lifecycle / dialogue / markers

- `src/quests/QuestManager.ts`
  - `selectableOfferIds`
  - `admitOffersForGiver`
  - `onInteract`
  - `labelMarker`
  - abandon action construction
  - gather/report/action contribution helpers
  - `bindAnimalTargetIfNeeded`
  - `onInteractObjective`
  - `advanceStage`
  - `clearAnimalTargetsForQuest`
- `src/quests/quests.ts`
  - `QuestOfferPolicy`
  - `QuestState`
  - `rankQuestOfferCandidates`
  - `lis-przy-osadzie`
- `src/ui-vue/NpcDialogueMenu.vue`
  - `helpActions`
  - `helpTopics`
  - drilled quest topic UX
- `src/ui-vue/store.ts`
  - quest dialogue payload forwarding only if required by presentation change

### Animal death integration

- `src/app/createApp.ts`
  - injected `AnimalTargetResolver`
  - `onAnimalDeathTarget`
- fauna death call sites feeding `onAnimalDeathTarget`
- `src/quests/QuestManager.test.ts`

### Runtime marker update

- `src/app/gameLoop.ts`
  - `QuestManager.isDirty()` / `labelMarker()` refresh
- `src/ai/NpcAgent.ts`
  - `setQuestMarker()` only as presentation sink

## Implementation stages

1. **Active giver capacity**
   - derived ordinary active count,
   - max 2,
   - block admission/acceptance of further ordinary giver quests,
   - preserve all foreign-quest actions targeting the NPC.

2. **Important bypass**
   - reuse/extend `QuestOfferPolicy`,
   - allow explicit urgent/story/world/narrative offer beyond normal active capacity,
   - tests proving ordinary third offer is blocked while explicit bypass is not.

3. **Marker semantics**
   - derive actionable hand-in/report state,
   - `✓` outranks `!`,
   - verify initial/restore/dirty refresh does not leave stale marker.

4. **Multi-quest abandon UX**
   - remove indistinguishable flat abandon buttons,
   - route/select by player-facing quest title/context.

5. **Exact animal target recon/fix**
   - reproduce `lis-przy-osadzie` in unit/integration-level tests,
   - trace bound id vs death id,
   - fix shared lifecycle/event path.

## Verification

Automated:

- giver with 0/1 active ordinary quests can expose/accept another ordinary quest,
- giver with 2 active ordinary quests does not expose/accept a third ordinary giver quest,
- `ready_to_report` still occupies ordinary giver capacity,
- urgent/story explicit bypass can be offered/accepted above the ordinary cap,
- NPC with 2 own active quests still exposes required `talk_to_npc` / `talk_to_npc_choice` / report / hand-in actions from quests owned by another giver,
- player with required gather items gets `✓` even while quest state is still `active`,
- actionable `✓` outranks simultaneous `!`,
- ordinary active reminder remains `…`,
- multiple abandonable quests produce distinguishable quest contexts,
- exact bound animal death advances `kill_target_animal`, unrelated same-kind animal death does not,
- `lis-przy-osadzie` reaches `ready_to_report` after the bound fox dies,
- existing world-fact fan-out still advances all matching quests.

Manual browser verification — User:

1. Kasia: max 2 ordinary active quests; third ordinary offer stays hidden/unavailable.
2. Important/urgent world event can appear despite 2 active ordinary quests.
3. NPC used as a target by another giver's quest still exposes the required dialogue despite its own cap.
4. Piotr with 6 stones shows `✓`, not `!`, when hand-in is available.
5. Multiple active quests have unambiguous abandon flow.
6. „Lis przy osadzie”: kill the visibly bound fox, then Marek exposes report/completion and `✓`.
7. Initial load/save restore does not leave stale quest markers.

## Non-goals

- global limit of all player active quests,
- persistent quest queue,
- QuestScheduler,
- blocking foreign quest interactions based on target NPC capacity,
- changing exact-instance `kill_target_animal` into species-wide kill counting,
- new quest marker rendering system,
- quest log redesign,
- new dialogue engine.

## Guardrails

- `QuestManager` remains the owner of quest lifecycle/progress.
- Active capacity is derived, not separately persisted.
- Capacity is per giver and applies only to ordinary giver quests.
- Important bypass is explicit metadata, not heuristic world inspection inside `QuestManager`.
- Required interactions from other quests are never hidden by giver capacity.
- Marker semantics reuse existing quest/action evaluation; no second progress owner.
- Vue stays presentation-only.
- Animal death remains a factual world event; quest matching remains in `QuestManager`.
- Fix shared mechanisms, not quest-id special cases.
- Add/update JSDoc for new architectural helpers/types with `@domain quests-progression` where useful for preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**