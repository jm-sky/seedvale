# Plan: Settlement Rat Infestation

**Created:** 2026-09-07  
**Status:** `planned` 📋
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** fauna-016, settlements-npcs-012, quests-progression-002  
**Domain:** `quests-progression`  
**Subdomains:** `quests` `progression`  
**Tags:** `rats` `settlement` `storage` `world-problem` `persistence`  
**Roadmap:** `quests-and-reputation.md`

## Cel

Dodać authored/systemowy scenariusz **„Plaga szczurów”**, w którym quest opisuje i obserwuje realny problem osady zamiast tworzyć quest-only szczury lub quest-only stan świata.

Problem dotyczy istniejącego **settlement storage**. Uszkodzone / źle zabezpieczone składowisko generuje dodatkową presję szczurów. Dopóki problem istnieje, settlement-local rat population jest podtrzymywana na wysokim poziomie. Gracz musi:

1. dowiedzieć się o problemie od NPC,
2. zbadać magazyn osady,
3. odkryć źródło presji,
4. naprawić magazyn,
5. doprowadzić liczbę żywych szczurów w osadzie do **maksymalnie 1**.

Quest kończy się dopiero wtedy, gdy oba warunki świata są prawdziwe:

```text
storage pressure source removed
AND
alive settlement rats <= 1
```

Nie ma objective „zabij N szczurów”. Gracz może zmniejszyć populację dowolnym istniejącym sposobem, w tym własną walką lub naturalnym działaniem psów.

## Zasada architektoniczna

Quest nie jest właścicielem plagi.

Docelowy przepływ:

```text
persistent settlement storage condition
        ↓
real rat pressure input
        ↓
existing settlement rat reconciliation
        ↓
real AnimalAgent('rat') population
        ↓
player / dogs / other world causes reduce population
        ↓
quest observes live world condition
```

`QuestManager` nie może przechowywać flagi typu `ratInfestationResolved` jako substytutu stanu settlement/fauna.

## Stan wejściowy

Aktualny `src/settlement/rats.ts` już:

- tworzy zwykłe `AnimalAgent('rat')`,
- oblicza target populacji z household food + settlement food - dog suppression,
- reconciluje populację co 0.5 dnia,
- zwiększa/zmniejsza ją stopniowo po jednym osobniku,
- kieruje realne straty żywności przez `Household.takeFood()` / `SettlementEconomy.withdrawFood()`,
- forwarduje śmierć szczura przez istniejący `onAnimalDeath`.

Normalny target ma obecnie cap 5. Plan musi zachować istniejące zachowanie normalnej populacji i dodać osobny wpływ aktywnej plagi.

Aktualny settlement storage już istnieje jako fizyczny destination/interactable i jest inspectable przez standardowy interaction pipeline. Nie tworzyć osobnego magazynu na potrzeby questa.

## 1. Settlement-owned infestation state

Wprowadzić wąski, authoritative stan problemu przypisany do konkretnego settlementu i jego settlement storage.

Minimalna semantyka V1:

```text
inactive / repaired
active / damaged
```

Stan musi należeć do settlement/world lifecycle, przeżyć:

- settlement stream-out / stream-in,
- in-session `WorldBundle` rebuild,
- save/load.

Nie przechowywać go w Three.js propie ani w `QuestManager`.

Nie tworzyć generycznego `SettlementProblemManager`, `BuildingConditionManager` ani ogólnego frameworku awarii budynków w tym planie.

## 2. Rat pressure from damaged settlement storage

Rozszerzyć istniejący rat population calculation zamiast tworzyć drugi spawn path.

Aktywne uszkodzenie settlement storage ma dodawać **stały infestation pressure bonus `+3`** do istniejącego normalnego targetu i jednocześnie wymuszać floor 7:

```text
active infestation target = max(normalTarget + 3, 7)
```

Normalne settlements bez aktywnej plagi zachowują dotychczasową formułę i cap 5.

Wymagania:

- aktywna plaga może przekroczyć normalny cap 5;
- psy nadal obniżają `normalTarget` przez istniejącą formułę i nadal polują na szczury;
- floor 7 oznacza, że same psy / samo wybicie aktualnych szczurów nie usuwają źródła plagi;
- po naprawie znika bonus `+3` i floor 7, a target wraca do zwykłej formuły;
- istniejące żywe szczury nie despawnują się magicznie w momencie naprawy;
- dalszy spadek populacji ma wynikać z normalnego reconciliation / śmierci.

Ta formuła jest zamkniętym kontraktem V1, nie tuningiem pozostawionym implementatorowi.

## 3. Inspection and discovery

Gracz nie powinien dostać od questa abstrakcyjnej informacji „napraw magazyn” bez kontaktu z obiektem świata.

Reuse istniejącego settlement-storage interaction pipeline:

```text
buildInteractables()
→ normal target selection
→ resolveInteraction()
→ existing FlavorDialog / interaction outcome
```

Aktywny problem powinien zmienić wynik inspekcji settlement storage tak, aby gracz mógł odkryć uszkodzenie / nieszczelność będącą źródłem plagi.

Nie dodawać osobnego inspect mode, quest scanner ani nowego UI.

Quest może prowadzić gracza tekstem do zbadania magazynu, ale discovery ma wynikać z interakcji z realnym settlement storage.

## 4. Repair

Po odkryciu problemu settlement storage ma oferować wąską akcję naprawy przez istniejący interaction/action stack.

V1 nie buduje generic repair framework.

Naprawa wymaga dokładnie:

```text
2 × ItemKind 'beam'
```

`beam` jest istniejącym concrete `ItemKind` reprezentującym belkę; nie dodawać nowego itemu ani nie używać bulk `wood` jako zamiennika.

Naprawa powinna:

- sprawdzić posiadanie 2 × `beam` przed rozpoczęciem/commit zgodnie z istniejącymi action requirement semantics,
- być realną timed/busy akcją gracza, nie natychmiastową flagą ustawianą przez dialog NPC,
- zużyć dokładnie 2 × `beam` przy skutecznym commit akcji,
- mutować settlement-owned infestation/storage condition,
- usuwać dodatkowy rat pressure source dopiero po zakończeniu akcji,
- nie tworzyć równoległego systemu construction/repair progress.

Jeżeli podczas implementation current code pozwala tanio użyć actor-neutral work semantics bez rozszerzania zakresu, można to zrobić. V1 nie wymaga jednak wieloetapowego construction site ani NPC repair work.

## 5. Quest objective: world-condition resolution

Nie dodawać objective `kill_rats(count)`.

Quest ma obserwować dwie realne właściwości świata:

```text
storage infestation inactive
alive rats for bound settlement <= 1
```

Preferować jeden wąski world-condition objective / resolver dla tego scenariusza zamiast systemu dowolnych expression trees.

Quest powinien być związany z konkretnym settlementem, a world layer ma dostarczać `QuestManager` tylko potrzebny, read-only wynik. Zachować istniejącą zasadę, że `QuestManager` nie importuje settlement/fauna managerów, aby samodzielnie skanować świat.

Stan pośredni wymagany przez UX:

- jeśli rats <= 1, ale storage nadal uszkodzony — quest pozostaje aktywny; NPC sygnalizuje, że źródło problemu nadal istnieje;
- jeśli storage naprawiony, ale rats > 1 — quest pozostaje aktywny; NPC sygnalizuje, że plaga jeszcze nie wygasła;
- dopiero oba warunki dają `ready_to_report` / terminalny outcome zgodny z quest lifecycle po `quests-progression-002`.

## 6. Quest flow V1

Authored flow:

```text
NPC zgłasza plagę
→ player accepts
→ inspect settlement storage
→ discover damage
→ repair storage (2 × beam)
→ bring live settlement rat count down to <= 1
→ report to giver
→ complete
```

Kolejność dwóch środkowych działań nie może być sztucznie wymuszona przez quest state.

Gracz może najpierw zabić/ograniczyć szczury, a potem znaleźć i naprawić źródło. Może też najpierw naprawić magazyn, a później wyczyścić pozostałą populację.

Quest text/reminders mają odzwierciedlać aktualny stan świata, nie tylko `stageIndex`.

## 7. Persistence — infestation state and rats

Ten plan zamyka obecny znany persistence gap dla settlement rats.

Persistować:

1. settlement-owned infestation/storage condition,
2. aktualne settlement rat individuals potrzebne do ciągłości populacji przez save/load.

Nie zapisywać Three.js runtime objects.

Reuse `AnimalAgent.snapshot()` / `hydrate()` i wzorzec registry używany przez `src/settlement/livestock.ts`:

- per-manager registry owned by `SettlementsManager`,
- capture loaded rat agents before settlement unload/save,
- serialized plain-data records in `SaveData`,
- hydrate matching rat individuals when settlement is reconstructed,
- keep stable rat identity across stream-out/in and save/load,
- prevent dead/removed individuals from being resurrected by reconciliation.

Rat persistence nie powinno zmieniać livestock ownership ani scalać rats z household-owned livestock. Reuse dotyczy persistence pattern / `AnimalSaveState`, nie semantyki ownership.

Dodać nowe pole/pola `SaveData`, bump `CURRENT_SAVE_VERSION` i realną migrację/defaulting zgodnie z aktualnym persistence pipeline.

## 8. Reconciliation after restore

Po restore:

- najpierw odtworzyć zapisane żywe szczury,
- następnie zwykły low-frequency reconciliation ma dostosowywać populację do aktualnego targetu,
- nie spawnąć natychmiast pełnego targetu w jednej klatce,
- aktywna plaga nadal wymusza target >= 7,
- naprawiona plaga nie może wrócić tylko dlatego, że zapis zawierał dużą populację.

Zapisany count/individual state i aktualny pressure target pełnią różne role: save zachowuje ciągłość istniejących osobników, a pressure decyduje o późniejszym wzroście/spadku populacji.

## 9. NPC/dialog feedback

Nie budować nowego dialogue engine.

Existing quest giver interaction ma wystarczyć do kilku authored wariantów reminder/progress text zależnych od read-only world condition:

- storage damaged + rats > 1,
- storage damaged + rats <= 1: „Coś jeszcze jest nie w porządku.”,
- storage repaired + rats > 1: źródło usunięte, ale szczury nadal są,
- storage repaired + rats <= 1: można raportować rozwiązanie.

Jeżeli `quests-progression-002` dostarczy unified outcome/result text, completion ma użyć tego path zamiast dodawać drugi reward/completion mechanism.

## 10. Dependencies

### `fauna-016`

Wymagany istniejący foundation:

- settlement rats as normal `AnimalAgent`,
- population reconciliation,
- food drain,
- dog suppression and pest hunting.

Nie tworzyć quest spawns.

### `settlements-npcs-012`

Wymagany existing storage inspection / interaction seam. Plan może rozszerzyć wynik interakcji settlement storage, ale nie zastępuje obecnego inspection systemu.

### `quests-progression-002`

**Twarda zależność implementacyjna.** Ten plan czeka na `quests-progression-002` i nie powinien być implementowany na tymczasowej semantyce obecnego quest completion.

Po 002 użyć jego unified quest outcomes/rewards/consequences i `ready_to_report`/terminal outcome contract. Jeżeli post-002 code różni się od obecnych symboli, aktualny kod jest źródłem prawdy; zachować semantykę tego planu bez odtwarzania pre-002 lifecycle.

`quests-progression-003`–`005` nie są wymagane funkcjonalnie dla V1 plagi, chyba że aktualny code po ich implementacji zmieni kontrakty, które ten plan dotyka.

## 11. Non-goals V1

Poza zakresem:

- emergentne losowe plagi bez authored triggera,
- wiele typów rat pressure source,
- generic settlement problem framework,
- generic building condition / maintenance framework,
- alternatywne sposoby naprawy,
- „utrzymaj niską populację przez kilka dni”,
- disease/contamination system,
- nowe mechaniki psów — używamy istniejących,
- nowe typy szczurów,
- quest-only spawned rats,
- automatyczne usuwanie pozostałych szczurów po naprawie.

## 12. Verification

Automated verification ma pokryć co najmniej:

- normal rat target nadal zachowuje dotychczasowe zachowanie bez infestation,
- aktywna infestation liczy `max(normalTarget + 3, 7)`,
- usunięcie source usuwa bonus/floor, ale nie zabija/despawnuje natychmiast istniejących szczurów,
- dogs nadal wpływają na normalną część population logic zgodnie z istniejącym kontraktem,
- repair wymaga i zużywa dokładnie 2 × `beam`,
- brak wymaganych belek nie mutuje infestation state,
- quest world condition jest false przy każdym pojedynczym spełnionym warunku i true tylko dla `repaired && aliveRats <= 1`,
- save/load round-trip dla infestation state,
- save/load round-trip dla rat individual state/identity,
- removed/dead rat nie wraca po restore,
- old saves migrują z bezpiecznym defaultem bez aktywnej plagi i bez zapisanych szczurów.

Browser/manual verification wykonuje User:

- przy aktywnej pladze populacja jest odbudowywana do targetu wynikającego z `max(normalTarget + 3, 7)`,
- zabicie szczurów bez naprawy nie rozwiązuje problemu i populacja wraca,
- inspection settlement storage ujawnia uszkodzenie,
- bez 2 × `beam` naprawa nie może zostać skutecznie wykonana,
- repair zużywa 2 × `beam` i usuwa pressure source,
- po naprawie żywe szczury pozostają w świecie,
- quest kończy się dopiero przy naprawionym storage i <=1 żywym szczurze,
- save/load w trakcie plagi zachowuje problem i istniejące szczury.

## 13. Implementation guidance

Przed kodowaniem uruchomić preflight dla tego planu **po implementacji `quests-progression-002`** i zweryfikować aktualne kontrakty zależności.

Dodać JSDoc do nowych ważnych publicznych/architektonicznych funkcji lub typów tak, aby preflight mógł odnaleźć ownership i integrację; użyć `@domain` tam, gdzie pomaga.

Preferować najmniejsze rozszerzenia istniejących właścicieli:

```text
SettlementsManager / settlement state
→ infestation ownership + rat persistence registry

rats.ts
→ pressure input + reconciliation

existing storage interaction
→ discovery + 2 × beam repair action

QuestManager
→ injected read-only world-condition result
```

Nie tworzyć globalnego event busa, `RatManager`, `QuestRatManager`, `SettlementProblemManager` ani osobnego persistence subsystemu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
