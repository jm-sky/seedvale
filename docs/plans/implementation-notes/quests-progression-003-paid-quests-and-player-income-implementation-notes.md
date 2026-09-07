# Implementation Notes: quests-progression-003 — Paid Quests & Player Income

## Rozstrzygnięcia z review

- Nie tworzyć osobnego jobs/contracts/payment systemu. `QuestManager` pozostaje jedynym runtime ownerem quest progress; paid quest to zwykły `QuestDef` z coin rewardem z kontraktu `quests-progression-002`.
- Coins pozostają `ItemKind = 'coin'`. Reward musi przejść przez istniejący injected `QuestItemGrant` w `QuestManager` i `src/app/createApp.ts::grantItem()`; nie używać `inventory.add('coin')` bezpośrednio z quest code.
- `gather_item` **już dziś konsumuje** itemy przy rozmowie z giverem. Nie dodawać osobnego `deliver_item` objective ani delivered-state.
- `gather_item` oznacza aktualne posiadanie wymaganej liczby itemów w momencie turn-in, nie historyczne „zebrałeś kiedyś X”. `QuestManager.objectiveDescription()` pokazuje live `inventory.count(kind)`, a `handleGiverInteract()` używa `inventory.has/remove`.
- Plan 003 nie potrzebuje nowych `ObjectiveRef`, resolverów, persistence fields ani UI surface. Powinien być głównie data/tuning + wzmocnienie finalnego gather turn-in po zmianach z 002.

## Kontrakt zależności `quests-progression-002`

003 implementować dopiero na outcome modelu opisanym przez 002:

- `QuestDef.outcomes: readonly QuestOutcome[]`;
- `QuestReward.items[]`, `visibility`;
- terminal resolution zapisuje `resolvedOutcomeId` i stosuje reward/consequences exact-once;
- successful turn-in wybiera konkretny authored complete outcome;
- reward itemy iterują przez injected `QuestItemGrant`;
- brak implicit relation/EXP;
- `invalidated` pozostaje technicznym terminal state, poza outcomes.

Nie odtwarzać w 003 starych `reward: { kind, count }`, `effects`, `completeQuest()` semantics. Jeżeli implementacja 002 różni się nazwami helperów od planu, trzymać jego faktyczny kontrakt runtime; 003 wymaga tylko jednej synchronicznej ścieżki validate → consume → resolve → reward.

## `gather_item` — obecny kod i dokładna atomicity

Aktualny path w `src/quests/QuestManager.ts::handleGiverInteract()`:

```text
state === active
→ currentStage()
→ objective.type === gather_item
→ inventory.has(kind, count)
→ inventory.remove(kind, count)
→ advanceStage(def, s)
→ jeśli ready_to_report: completeQuest(def)
```

`Inventory.remove(kind, n)` (`src/items/Inventory.ts`) jest synchroniczne: przy niedoborze zwraca `false` bez mutacji; przy sukcesie odejmuje dokładnie `n` i dla perishables usuwa oldest batches. Herb jest zwykłym stack countem w tej ścieżce; nie potrzeba instance handling.

Problem obecnej kolejności: itemy są usuwane zanim terminal completion zostanie zweryfikowany. Po 002 resolution może odrzucić unknown/niepasujący outcome lub już-terminalny quest, więc finalny gather turn-in nie może robić `remove()` przed sprawdzeniem rozwiązywalności.

Wymagany wspólny kontrakt dla **finalnego** `gather_item`:

```text
A. potwierdź active quest + current gather stage
B. ustal authored successful outcome używany przez ten existing giver interaction path
C. potwierdź, że ten outcome jest poprawny i quest może zostać nim rozwiązany teraz
D. inventory.has(kind, count)
E. inventory.remove(kind, count) — oczekiwane true
F. resolve przez ten sam terminal resolution path z 002
G. reward/consequences exact-once
```

Nie robić `advanceStage()` do `ready_to_report` przed walidacją terminal outcome tylko po to, by potem odkryć, że resolution jest niepoprawne. Dla finalnego gather interaction rozmowa z giverem jest jednocześnie delivery/report, więc po consume można bezpośrednio wejść w validated successful resolution.

Dla gather w środku wieloetapowego questa (`zwiadowca` jest istniejącym realnym przypadkiem: ostatni stage jest gather, ale mechanizm powinien pozostać ogólny):

- jeżeli po gather pozostaje kolejny stage: `has → remove → advanceStage`, bez reward;
- jeżeli gather jest ostatnim stage: użyć terminal flow powyżej.

Nie budować rollback/transaction abstraction. Wystarczy, że wszystkie warunki mogące legalnie odrzucić turn-in są sprawdzone przed `Inventory.remove()`, a później synchroniczny resolution path nie ma już gameplay branchu typu „nie można rozwiązać”. Test ma pinować brak consume przy invalid outcome/state.

## Coin reward — istniejący grant path

`src/app/createApp.ts` definiuje lokalne `grantItem(kind, count)`:

1. per unit wywołuje `createAcquiredInstance(kind)`;
2. instance-backed kind → `inventory.addInstance(instance)`;
3. zwykły stack kind → `inventory.add(kind)`;
4. brak capacity → `bundle.droppedItems.drop(...)` przy graczu;
5. potem synchronizuje HUD weight, held tool i quick actions.

`QuestManager` dostaje callback, który po istniejącym `long_sword` guardzie wywołuje `grantItem(kind, count)` i toast. Po 002 multiple reward items mają wołać ten callback per pozycja.

Dla `coin` `createAcquiredInstance('coin')` nie daje instancji, więc monety korzystają z `Inventory.add('coin')`; overflow nadal idzie w dropped-item path. To jest dokładnie ścieżka, której trzeba użyć. Nie dodawać walletu, balance field ani osobnego coin grant helpera.

## Economy — faktyczne wartości

`src/items/tradeCatalog.ts` jest jedynym źródłem prawdy.

Istotne buy prices (`MERCHANT_PRICES`):

| Item | Buy price |
|---|---:|
| bread | 6 |
| firestarter | 8 |
| knife | 12 |
| trap_simple | 14 |
| shovel | 20 |
| axe | 25 |
| pickaxe | 30 |
| tent | 30 |
| short_sword | 40 |
| long_sword | 50 |
| backpack | 70 |
| basic skill books | 20–30 |
| intermediate skill books | 50–60 |
| advanced skill books | 100–120 |

Resource values:

| Item | `tradeValue()` | `sellPrice()` | Quest use |
|---|---:|---:|---|
| branch | 1 | 1 | 5 units → 8 coins |
| stone | 1 | 1 | 6 units → 9 coins |
| herb | 3 | 1 | 3 units → 8 coins |

`tradeValue()` dla listed merchant stock = buy price; dla resource używa `RESOURCE_TRADE_VALUE`. `sellPrice()` = `max(1, floor(tradeValue * 0.5))`, poza `shell`/`coin`.

Nie importować `tradeValue()` do quest runtime i nie wyliczać rewardów automatycznie. Te wartości są planning/tuning baseline, nie nowa zależność `QuestManager`.

## Konkretne quest definitions

Wszystkie cztery nowe questy dodać do `QUESTS` w `src/quests/quests.ts`. Dzięki temu są zawsze częścią tego samego static authored setu i automatycznie przechodzą przez istniejące `createApp.ts` mapowanie `settlementId`.

### `ziola-dla-anny`

- giver: `Anna`;
- potwierdzona rola: `farmer` (`src/ai/characters.ts::RESERVED_SEEDS`);
- objective: `{ type: 'gather_item', kind: 'herb', count: 3 }`;
- successful shown reward: `8 x coin`;
- relation/social: none.

Offer/report/reminder text ma mówić o 3 ziołach i 8 monetach.

### `kamienie-dla-piotra`

- giver: `Piotr`;
- potwierdzona rola: `woodcutter`;
- objective: `{ type: 'gather_item', kind: 'stone', count: 6 }`;
- shown reward: `9 x coin`;
- relation/social: none.

To rozszerza już istniejący motyw napraw u Piotra (`drewno-na-naprawe`) bez tworzenia construction state change.

### `sprawdz-szlak`

- giver: `Kasia`;
- potwierdzona rola: `trader`;
- objective: `{ type: 'interact_spawner', spawnerType: 'cave' }`;
- shown reward: `12 x coin`;
- relation/social: none.

Wybrano `interact_spawner`, nie nowy landmark quest. Ten objective + `'cave'` jest już używany przez `zwiadowca`; `QuestManager.objectiveMatchesRef()` i world interaction dispatch już go obsługują. Nie trzeba dotykać `buildLandmarkQuests()` ani `ChunkManager.findLandmarkNear()`.

### `lis-przy-osadzie`

- giver: `Marek`;
- potwierdzona rola: `guard`;
- objective: `{ type: 'kill_target_animal', kind: 'fox' }` bez `dangerous: true`;
- shown reward: `20 x coin`;
- relation: none;
- social: `{ reputation: { competence: 3, courage: 3 }, renown: 3 }`.

Dlaczego `fox`, nie `wolf`:

- `createFauna.ts::SPAWNS` realnie spawnuje `wolf:2` i `fox:2`;
- `ANIMAL_DEFS.fox.role === 'predator'`;
- istniejący `AnimalTargetResolver` w `createApp.ts` wybiera pierwszy live agent `kind`, bez rezerwacji per quest;
- `grozny-wilk` już ma `kill_target_animal wolf`;
- dwa aktywne wolf quests mogłyby więc związać się z tym samym `animalId` i jeden kill zakończyłby oba.

`fox` nie jest targetem istniejącego questa, więc reuse nie tworzy tej kolizji. Nie dodawać target reservation systemu w 003.

Social deltas są jawnie mniejsze od istniejących calibration points:

- `grozny-wilk`: competence +10, courage +12, benevolence +4, renown +15;
- `wilcza-jama`: competence +15, courage +18, benevolence +6, renown +25.

## Existing paid quests — konkretne korekty

Po 002:

- `woda-dla-marka`: shown `5 x coin`, explicit `Marek +1`; 003 bez dalszej zmiany.
- `zagubiona-owca`: successful outcome **`found_and_reported`**, `10 x coin`, explicit `Anna +1`; failed `sheep_died`, zero reward. Nie używać `returned_to_owner` — aktualny `find_animal` tylko binduje konkretną owcę, `animal_found` przechodzi do report; brak livestock transfer.
- `drewno-na-naprawe`: zmienić shown reward `15 → 8 x coin`; brak relation consequence.

## Existing objective / call-site reuse

### `gather_item`

- type: `src/quests/quests.ts::QuestObjective`;
- progress display: `QuestManager.objectiveDescription()`;
- turn-in: `QuestManager.handleGiverInteract()`;
- inventory primitive: `Inventory.has()` + `Inventory.remove()`.

### `interact_spawner`

- objective matcher: `QuestManager.objectiveMatchesRef()`;
- runtime ref: `ObjectiveRef { type: 'interact_spawner', spawnerType }`;
- existing real authored use: `zwiadowca` / `spawnerType: 'cave'`.

Nie dodawać nowego integration call site.

### `kill_target_animal`

- binding: `QuestManager.bindAnimalTargetIfNeeded()`;
- resolver injection: `src/app/createApp.ts` scans `bundle.fauna.getAgents()`, then settlement livestock;
- death dispatch: `onAnimalDeathTarget = animalId => questManager.onInteractObjective({ type: 'animal_died', animalId })`;
- matching: exact bound `animalId`, nie dowolny animal kind;
- same-session rebuild/save-load semantics dla wild targetów pozostają jak dziś/002: runtime-only binding może zostać invalidated; 003 nie dodaje persistence target id.

### Social consequence

`QuestManager` ma injected `ApplySocialConsequence`; `createApp.ts` mapuje go do `applySocialConsequence(reputation, consequence)` + Character Screen refresh. Fox quest wykorzystuje dokładnie ten seam. Nie importować `ReputationManager` do quest definitions/runtime.

## NPC reuse

`src/ai/characters.ts::RESERVED_SEEDS` gwarantuje w home settlement quest-critical NPC i role:

```text
Anna  → farmer
Piotr → woodcutter
Kasia → trader
Marek → guard
```

Nowe questy rozłożyć po jednym na każdego. Nie tworzyć nowych NPC ani giver identity systemu. `QuestDef.giverName` nadal jest stringiem odpowiadającym reserved character name.

## Quest Log / dialogue

Po 002 `QuestManager.list()` ma wystawiać promised shown reward. 003 nie zmienia DTO shape ani Vue. W nowych questach authored `offerLine` musi jawnie zawierać tę samą kwotę, którą ma `QuestOutcome.reward`.

Nie dodawać dynamic reward formattera do dialogu i nie tworzyć jobs screen.

## Persistence

003 nie zmienia save schema. Exact-once opiera się na `resolvedOutcomeId` + terminal state z 002. Nie dodawać:

- `paidQuestRewardsClaimed`,
- delivered-item flags,
- coin wallet/balance,
- osobnego payment history.

Inventory coins zapisują się zwykłym player inventory path.

## Miejsca zmian

Po 002 oczekiwany minimalny blast radius:

1. `src/quests/quests.ts`
   - `drewno-na-naprawe` reward 8;
   - 4 nowe quest definitions/outcomes;
   - teksty offer/report/reminder.
2. `src/quests/QuestManager.ts`
   - tylko jeżeli 002 nie zapewni już wymaganej prevalidation ordering dla finalnego `gather_item`;
   - nie dodawać paid-specific branching.
3. `src/quests/QuestManager.test.ts`
   - atomic delivery, exact rewards, fox binding/social consequence, no implicit relation.

Pliki do **reuse bez zmian mechanizmu**:

- `src/app/createApp.ts` — grant, animal resolver/death dispatch, settlement/social seam;
- `src/items/Inventory.ts` — has/remove/add semantics;
- `src/items/tradeCatalog.ts` — tuning reference only;
- `src/ai/characters.ts` — reserved giver roles;
- `src/fauna/createFauna.ts` / `src/fauna/AnimalAgent.ts` — istniejący fox population/role.

## Testy

Rozszerzyć istniejący `src/quests/QuestManager.test.ts`; nie tworzyć drugiego paid-quest harnessu.

Najważniejsze przypadki:

- final gather, brak itemów: state/inventory/grant bez zmian;
- final gather, poprawny turn-in: wymagane itemy dokładnie raz usunięte, `resolvedOutcomeId` ustawiony, coin grant dokładnie raz;
- final gather z niepoprawnym/niemożliwym outcome: **zero consume**;
- repeated giver interaction po resolution: zero dodatkowego consume/reward/consequence;
- gather w non-terminal stage: consume + next stage, zero reward;
- `drewno-na-naprawe`: 5 branch → 8 coin, relation unchanged;
- `woda-dla-marka`: 5 coin;
- sheep success `found_and_reported`: 10 coin; `sheep_died`: 0;
- `ziola-dla-anny`: herb ×3 → 8 coin;
- `kamienie-dla-piotra`: stone ×6 → 9 coin;
- `sprawdz-szlak`: matching cave ref → ready/report → 12 coin;
- `lis-przy-osadzie`: resolver binds fox id; death innego id nie progressuje; matching death + report → 20 coin + exact `{ competence:+3, courage:+3, renown:+3 }` once;
- wszystkie cztery nowe formalne questy: brak relation consequence;
- terminal restore z 002 nie pozwala odebrać reward drugi raz.

Jeżeli 002 ma już UI tests dla shown reward DTO, 003 nie potrzebuje duplikować generic UI testu; wystarczy data assertion, że nowe outcomes są `visibility: 'shown'` z oczekiwanym coin count.

## Guardrails

- Nie używać `returned_to_owner` dla owcy.
- Nie używać wolf jako nowego paid targetu bez rozwiązania target reservation; w 003 użyć fox.
- Nie oznaczać foxa `dangerous: true` tylko po to, by uzasadnić reward.
- Nie konsumować delivery itemów przed walidacją terminal outcome/state.
- Nie traktować relation/reputation/renown jako reward items.
- Nie importować merchant pricing do quest runtime.
- Nie zmieniać merchant economy, fauna spawning ani NPC professions w ramach 003.
- Nie uruchamiać `pnpm docs:sync` ręcznie.

> **Zrób git commit i push do main, rebase jeżeli trzeba**