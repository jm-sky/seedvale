# Implementation notes: Questy v3 — problemy świata, reputacja i questy kontekstowe

**Plan:** `2026-08-13--093--quests-v3-world-problems-reputation.md`
**Review:** 2026-08-13
**Status po review:** ready for implementation, ale zakres należy realizować etapami

## 1. Review — wnioski

Plan jest zgodny z obecną architekturą Seedvale i dobrze wzmacnia istniejący model: `QuestManager` pozostaje konsumentem stanu świata, a fauna/NPC/landmarki/zasoby zachowują własną logikę.

Najważniejsza korekta: **nie próbować implementować całego XL jednocześnie**. Obecny codebase ma dobry fundament dla availability + relation + quest effects, natomiast questy typu „konkretny wilk”, „wilcza jama” i „zaginiona owca” wymagają wcześniej stabilnych identity/eventów świata.

### Stan obecny

- `QuestManager` już posiada `relations: Map<string, number>`, zapis/odczyt relacji oraz automatyczne `+1` po ukończeniu questa.
- Relacja jest obecnie identyfikowana nazwą NPC, tak samo jak `giverName` i `talk_to_npc`. Nie należy teraz robić pełnego refaktoru na `npcId`, ale trzeba ograniczyć nowe zależności od nazw do minimum.
- `QuestObjective` obsługuje obecnie: rozmowę z NPC, studnię, drzewo, spawner, obserwację zwierzęcia i zebranie itemów.
- `ObjectiveRef` jest już punktem integracji między światem a questami; należy go rozszerzać zamiast dodawać bezpośrednie wywołania `QuestManager` z obiektów świata.
- `HealthState` jest wspólny dla NPC/fauny/gracza, a śmierć zwierząt już istnieje. Brakuje jednak questowego eventu/identity pozwalającej stwierdzić, że zginęło **konkretne** zwierzę będące celem questa.
- Save zawiera już `quests.progress`, `exp` i `relations`; nie trzeba tworzyć nowego persistence systemu.
- Quest log już otrzymuje `relation(name)`, więc UI może zostać rozszerzone bez tworzenia drugiego źródła danych.
- Landmark pipeline istnieje, ale plan 049 jest nadal `in progress`; questy zależne od stabilnego `landmarkId` powinny wejść dopiero po potwierdzeniu identity landmarków.
- Livestock ma modele i spawn, ale w obecnym stanie nie znaleziono stabilnego `animalId + ownerHouseId`, więc questy „znajdź konkretną owcę/konia” są przedwczesne.

## 2. Zalecana kolejność implementacji

### Etap A — relation levels + availability

1. W `src/quests/quests.ts` dodać typ `RelationLevel` oraz `QuestAvailability`.
2. Umieścić progi poziomów w jednym miejscu, np. `RELATION_LEVEL_THRESHOLDS`.
3. Dodać do `QuestDef` opcjonalne `availability`.
4. W `QuestManager` dodać małe, czyste API:
   - `getRelationLevel(npcName)`;
   - `meetsAvailability(def)` / równoważne prywatne sprawdzenie;
   - `isQuestAvailable(id)`.
5. Warunek musi być sprawdzany przed `handleGiverInteract()` i przed oznaczeniem questa jako `offered`.
6. Nie zmieniać istniejącego modelu `relations: Map<string, number>` na osobny manager.

**Ważne:** `trusted` powinno być rzeczywistym poziomem wyliczanym z liczby, a nie drugim stanem przechowywanym obok sympathy.

### Etap B — relation effects

1. Zastąpić hard-coded `QUEST_RELATION_REWARD = 1` opcjonalnym efektem z `QuestDef`.
2. Najmniejszy sensowny model:

```ts
export type QuestEffects = {
  relation?: number
  exp?: number
}
```

3. Zachować istniejące domyślne nagrody v2 (`+1 relation`, `10 exp`) tam, gdzie definicje ich nie nadpisują — albo jawnie przepisać istniejące questy na nowy model. Nie zmieniać zachowania istniejących questów przypadkiem.
4. Efekty powinny być zastosowane wyłącznie w jednym miejscu (`completeQuest`).

Nie implementować jeszcze inventory/world/village/NPC effects jako generycznego frameworka.

### Etap C — UI availability

1. `QuestListEntry` rozszerzyć tylko o dane potrzebne UI, np. `availability` / `requiredRelation`.
2. Rozróżnić:
   - quest niewidoczny, bo nie jest jeszcze dostępny;
   - quest znany NPC-owi, ale zablokowany relacją.
3. Domyślnie preferować **ukrycie** niedostępnego questa.
4. Jeśli design chce pokazywać blokadę, Quest Log powinien pokazywać `Friendly → Trusted`, bez ujawniania całego questa, jeśli nie jest to zamierzone.
5. Nie przenosić logiki relacji do Vue/store — UI ma konsumować dane z `QuestManager`.

### Etap D — pierwszy quest v3: „groźny wilk”

To powinien być pierwszy end-to-end vertical slice.

Nie zaczynać od `WolfDen`.

Minimalny model:

```text
QuestDef
  availability: Anna/trusted
  objective: world event / target animal
       ↓
AnimalAgent.takeDamage()
       ↓
HealthState death
       ↓
quest objective event
       ↓
ready_to_report
       ↓
Anna
       ↓
completeQuest()
       ↓
relation + exp
```

Potrzebna jest warstwa identyfikacji celu. Najpierw preferować stabilne `animalId` na `AnimalAgent` i referencję w objective, np. `animalId`, zamiast skanowania wszystkich zwierząt po gatunku.

Jeżeli konkretny wilk ma być generowany dopiero przez world problem, identity powinna powstać w systemie fauna, nie w `QuestManager`.

### Etap E — world problem / WolfDen

Dopiero po stabilnym identity/event flow.

`WolfDen` powinien być elementem świata i właścicielem informacji o swoim stanie. Quest ma tylko referencję do `denId`/world-state.

Nie robić:

```text
QuestManager → spawn wolf
QuestManager → create den
```

Preferować:

```text
World/Spawner → WolfDen + wolves
                       ↓
                 world state/event
                       ↓
                  QuestManager
```

Jeżeli obecny `PreySpawner` może otrzymać identity i stan problemu bez utraty swojej ogólności, rozszerzyć go. Nie tworzyć `QuestSpawner`.

### Etap F — landmark objectives

Po potwierdzeniu planu 049.

Objective powinien wskazywać stabilne `landmarkId`, ewentualnie `landmarkType` jako ograniczenie/fallback. Pozycja nie powinna być kopiowana do definicji questa, jeśli landmark ma już własną identity/pozycję.

### Etap G — livestock identity

Dopiero gdy fauna gospodarska ma:

```text
animalId
kind
ownerHouseId / owner household
```

Wtedy można dodać objective typu:

```ts
{ type: 'find_animal', animalId: string }
```

Nie implementować „zaginionej owcy” przez `kind === 'sheep'`, bo nie rozwiązuje to problemu konkretnego zwierzęcia.

### Etap H — tree/dig/resource objectives

Wykorzystać istniejące lifecycle/events.

Dla drzew nie dodawać questowej wersji `chopTree()`. Jeżeli obecny lifecycle nie emituje wystarczającego zdarzenia, dodać mały world event/identity bridge.

Analogicznie dla kopania/miningu/zbierania: quest powinien obserwować istniejący rezultat akcji, a nie wykonywać akcję samodzielnie.

## 3. Zalecany model danych

Minimalny kierunek:

```ts
type RelationLevel =
  | 'stranger'
  | 'acquainted'
  | 'friendly'
  | 'trusted'

const RELATION_LEVEL_THRESHOLDS: Record<RelationLevel, number> = {
  stranger: 0,
  acquainted: 1,
  friendly: 3,
  trusted: 6,
}

type QuestAvailability = {
  relation?: {
    npcName: string
    minimum: RelationLevel
  }
}

type QuestEffects = {
  relation?: number
  exp?: number
}
```

Progi są przykładowe; przed implementacją można je skorygować, ale muszą istnieć w jednym miejscu.

Nie dodawać jeszcze `Village`, `Faction` ani regional reputation do runtime API. Typy mogą być później rozszerzalne, ale pierwszy runtime pozostaje per-NPC.

## 4. Integracja z eventami świata

Najważniejsza zasada implementacyjna:

```text
world system owns state
        ↓
world system emits/reports event
        ↓
QuestManager checks active objectives
        ↓
QuestManager advances quest
```

`QuestManager` nie powinien importować `AnimalAgent`, `ChunkManager`, `LandmarkManager` itd. tylko po to, aby samodzielnie wyszukiwać i zmieniać ich stan.

Obecny `ObjectiveRef` jest dobrym punktem wejścia. Można go rozszerzyć np. o:

```ts
| { type: 'animal_died', animalId: string }
| { type: 'landmark_discovered', landmarkId: string }
| { type: 'tree_harvested', treeId: string }
| { type: 'resource_collected', ... }
```

Nazwy powinny odpowiadać faktycznym eventom/rezultatom istniejących systemów, a nie być projektowane wyłącznie pod questa.

## 5. Co wymaga ostrożności

### Relation po nazwie NPC

Obecny system używa `npcName` jako klucza. To jest akceptowalne dla obecnego placeholderowego świata, ale ogranicza przyszłą persystencję i multi-settlement.

Na tym planie nie robić dużego refaktoru identity NPC. Jednak nowe API nie powinno dodawać kolejnych map opartych o imiona.

### Kolejność dostępności

Nie wolno oznaczyć questa jako `offered`, jeśli relation jest zbyt niskie. W przeciwnym razie quest zostanie „zapamiętany” jako oferowany mimo niespełnienia warunku.

### Completion i efekty

`completeQuest()` musi być jedynym miejscem wykonywania końcowych efektów. Dzięki temu relation/exp nie będą naliczane wielokrotnie.

### Persistence

Obecny save już ma relation i quest progress. Dodanie relation levels nie wymaga migracji, bo level jest funkcją istniejącego numeric relation.

Jeżeli pojawią się nowe quest target identities zapisujące się w stanie świata, trzeba dopiero wtedy rozszerzyć save schema o ten konkretny stan — nie wprowadzać teraz ogólnego „quest persistence framework”.

## 6. Testy

### Unit

`QuestManager` powinien mieć testy dla:

- relation → level;
- poniżej progu → quest niedostępny;
- osiągnięcie progu → quest dostępny;
- availability nie zmienia stanu questa przed rozmową;
- completion zwiększa relation dokładnie raz;
- effects `relation` i `exp` są stosowane dokładnie raz;
- reset czyści relation/effects/progress;
- istniejące questy v2 zachowują dotychczasowe zachowanie.

### Integration / browser

Minimalny scenariusz:

1. Nowa gra.
2. Relation z Anną poniżej `trusted`.
3. Quest v3 nie jest oferowany.
4. Ukończenie wcześniejszych questów zwiększa relation.
5. Po przekroczeniu progu quest pojawia się.
6. Gracz wykonuje problem świata.
7. NPC przyjmuje raport.
8. Relation i EXP rosną.
9. Quest nie wykonuje logiki walki/świata samodzielnie.

## 7. Acceptance criteria — korekta względem planu

Pierwszy milestone powinien wymagać tylko:

- [ ] relation levels działają na istniejącym numeric relation;
- [ ] quest availability działa przed ofertą;
- [ ] `trusted` jest osiągalne przez istniejące questy;
- [ ] quest effect relation/exp działa przez `QuestManager`;
- [ ] istniejące questy v2 nadal działają;
- [ ] UI nie pokazuje błędnie zablokowanego questa jako dostępnego;
- [ ] pierwszy quest v3 działa end-to-end;
- [ ] `npx tsc --noEmit` przechodzi;
- [ ] `npm run lint` przechodzi;
- [ ] `npm run build` przechodzi.

Pozostałe kryteria planu — `WolfDen`, livestock identity, landmark objectives, bandits — traktować jako kolejne milestone'y, a nie jako warunek ukończenia pierwszego vertical slice.

## 8. Kolejność względem roadmapy

Plan 093 jest obecnie `planned` i ma spełnione zależności `015` + `018`. fileciteturn4file0L1-L20

Nie blokować jednak pierwszej implementacji na ukończenie wszystkich planów świata. W szczególności landmark questy mogą zostać później spięte z planem 049, który nadal jest `in progress`.

Obecny STATE potwierdza, że fundamenty potrzebne do pierwszego vertical slice już istnieją: QuestManager/relation, HealthState/death, fauna oraz tree lifecycle. fileciteturn3file0L1-L2

## 9. Final recommendation

**Implementować 093 jako serię małych milestone'ów, zaczynając od `availability → relation levels → effects → UI → jeden quest world-problem`.**

Nie zaczynać od bandytów, livestock ani pełnego WolfDen.

Najważniejszą wartością tego planu nie jest liczba typów questów, tylko stworzenie stabilnego wzorca:

```text
existing world state/event
        ↓
contextual quest availability
        ↓
player action through existing system
        ↓
world state changes
        ↓
quest completion
        ↓
relation / consequences
```

To dobrze pasuje do obecnego kierunku Seedvale i pozwala później dokładać kolejne problemy świata bez budowania drugiego systemu questów.
