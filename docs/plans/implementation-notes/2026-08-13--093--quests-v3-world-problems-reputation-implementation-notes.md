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

---

## 10. Stan implementacji (2026-08-14)

Zaimplementowano **Etap A–C** z §2 (pierwszy milestone minus quest "groźny wilk"):

### Etap A — relation levels + availability

- `src/quests/quests.ts`: `RelationLevel`, `RELATION_LEVEL_THRESHOLDS` (`stranger: 0, acquainted: 1, friendly: 3, trusted: 6`), `relationToLevel()`, `QuestAvailability` (`{ relation?: { npcName, minimum } }`), opcjonalne `QuestDef.availability`.
- `src/quests/QuestManager.ts`: `getRelationLevel(npcName)`, prywatne `meetsAvailability(def)`, publiczne `isQuestAvailable(id)`.
- `handleGiverInteract()` nie przechodzi `not_offered → offered`, jeśli `meetsAvailability` zwraca `false` (zwraca `null`, NPC wraca do zwykłego dialogu).
- `labelMarker()` nie pokazuje `!` nad głową NPC dla `not_offered` questa, który nie spełnia availability.

### Etap B — quest effects

- `src/quests/quests.ts`: `QuestEffects = { relation?: number, exp?: number }`, opcjonalne `QuestDef.effects`.
- `completeQuest()` używa `def.effects?.relation ?? QUEST_RELATION_REWARD` i `def.effects?.exp ?? QUEST_EXP_REWARD` — istniejące questy v2 (bez `effects`) zachowują dotychczasowe `+1 relation` / `+10 exp`.

### Etap C — UI

- `QuestManager.list()` filtruje questy `not_offered`, które nie spełniają availability — **domyślnie ukryte**, zgodnie z preferowanym wariantem z Fazy 11 planu (brak jeszcze bannera „🔒 Zaufanie wymagane" — to osobny, nie zaimplementowany krok, gdyby design tego zażądał).
- Nie ruszano `QuestListEntry`, `QuestLogScreen.vue` ani `store.ts` — ukrywanie dzieje się w `QuestManager`, UI konsumuje dane bez zmian.

### Nie zaimplementowano po Etapie A–C (odłożone w tamtym przebiegu, domknięte niżej lub nadal otwarte)

- `WolfDen` (Etap E), livestock identity (Etap G), landmark objectives (Etap F), tree/dig/resource objectives (Etap H), bandyci (Faza 9) — nadal bez zmian, patrz §12.

### Testy (Etap A–C)

`src/quests/QuestManager.test.ts` (stan po Etapie A–C: 9 testów): `relationToLevel` progi, quest niedostępny/ukryty poniżej progu, `isQuestAvailable` nie mutuje stanu, odblokowanie po przekroczeniu progu (przez `effects.relation`), domyślne nagrody v2 nienaruszone, custom `effects` aplikowane dokładnie raz, `reset()` czyści relation/exp/progress.

### Weryfikacja (Etap A–C)

`npx tsc --noEmit`, `npm run lint` (0 błędów w plikach questów — pozostałe błędy lintera są w niepowiązanym, niewersjonowanym `_temp/asset-audit/inspect.mjs`), `npm run build`, `npm run test` (599/599, 87 plików) — wszystkie przechodzą. Weryfikacja w przeglądarce nie została wykonana w tym przebiegu.

---

## 11. Stan implementacji — Etap D: quest „groźny wilk” (2026-08-14, drugi przebieg)

Zaimplementowano pełny end-to-end vertical slice, zgodnie z §2 Etap D. Nie zaczęto od `WolfDen` (Etap E nadal otwarty) — wilk jest jednym z dwóch ambientowych wilków spawnowanych już dziś w initial ring (`createFauna.ts`'s `SPAWNS`), nie nowym bytem generowanym przez „world problem”.

### Identity zwierzęcia

- `src/fauna/AnimalAgent.ts`: nowe pole `readonly animalId: string`, wymagany parametr konstruktora (wstawiony zaraz po `def`, przed resztą pozycyjnych argumentów) — stabilne przez cały czas życia instancji, odrębne od `def.kind` (współdzielonego przez cały gatunek).
- `src/fauna/createFauna.ts`: `spawnAgent()` generuje `` `${kind}-${licznik}` `` z lokalnego licznika w domknięciu `createFauna` — pokrywa zarówno initial ring, jak i respawny ze spawnera.
- `src/settlement/livestock.ts`: `spawnLivestock()` generuje `` `${kind}-house${i}-${indeksWDomu}` `` — wystarczające dla pola, choć pełna semantyka „Etap G” (`ownerHouseId` jako osobny, udokumentowany koncept) nadal nie istnieje.
- Oba miejsca konstrukcji `new AnimalAgent(...)` w repo zaktualizowane (potwierdzone grepem — nie ma innych call site'ów, żadne testy nie konstruują `AnimalAgent` bezpośrednio).

### Wiązanie celu questa (bez importowania fauny do QuestManagera)

Zamiast dopisywać `onDeath`-callback do `AnimalAgent`/`collapse()` (co wymagałoby generycznego event-bus po stronie `Fauna`), przyjęto węższe, wystarczające dla tego questa rozwiązanie: **QuestManager wiąże cel raz, w momencie przyjęcia questa**, przez wstrzykniętą funkcję-resolver — nie skanuje fauny sam i nie obserwuje śmierci drapieżnik-na-zwierzę (tylko zabicie przez gracza jest dziś zgłaszane; patrz „Co świadomie pominięto” niżej).

- `src/quests/quests.ts`: nowy wariant `QuestObjective` — `{ type: 'kill_target_animal', kind: AnimalKind }` (statyczna definicja, „jakiś wilk”, nie konkretna instancja).
- `src/quests/QuestManager.ts`:
  - nowy wariant `ObjectiveRef` — `{ type: 'animal_died', animalId: string }` (zdarzenie zgłaszane przez świat, z konkretnym id);
  - `AnimalTargetResolver = (kind: AnimalKind) => string | undefined`, wstrzykiwany jako opcjonalny 6. parametr konstruktora `QuestManager` (domyślnie `() => undefined`), więc `QuestManager` nadal nie importuje `AnimalAgent`;
  - `private readonly animalTargets = new Map<string, string>()` — `questId → animalId` związany dla bieżącego etapu `kill_target_animal`;
  - `bindAnimalTargetIfNeeded(def, stageIndex)` — wywoływana z `onAccept` (etap 0) i z `advanceStage` (kolejne etapy); no-op jeśli już związany albo etap nie jest `kill_target_animal`; jeśli resolver nic nie zwróci, wiązanie po prostu nie następuje (bez błędu — quest zostaje aktywny, ale nieukończalny dopóki gracz/retry nie odświeży stanu przez ponowne wejście w ten etap — akceptowalne dla pierwszego wcielenia, bo w praktyce zawsze są ≥2 wilki na osadę);
  - `objectiveMatchesRef()` dostał trzeci parametr `boundAnimalId?: string` i case `animal_died`: `objective.type === 'kill_target_animal' && boundAnimalId === ref.animalId` — dopasowanie po konkretnym osobniku, nie po gatunku;
  - `completeQuest()` czyści `animalTargets.delete(def.id)`; `reset()` czyści całą mapę.
- `src/app/gameLoop.ts`: w bloku wykrywania zabicia melee (istniejący `beforeDead`/`killed` diff, linia ok. 530) po `killed === true` wywoływane jest `questManager.onInteractObjective({ type: 'animal_died', animalId: target.animal.animalId })`; jeśli quest to skonsumuje, toast pokazuje `override.line` (np. „Wilk pokonany. Wróć do Anny.”) zamiast domyślnego „<Zwierzę> pada.” — ten sam fallback-pattern co `resolveInteraction.ts`.
- `src/app/createApp.ts`: `new QuestManager(...)` dostaje resolver `(kind) => bundle.fauna.getAgents().find((a) => a.def.kind === kind && !a.isDead())?.animalId` — czyta `bundle` (nie zdestrukturyzowane `bundle.fauna`), więc zostaje poprawny po `rebuildWorldBundle()`.

### Quest „groźny wilk”

- `src/quests/quests.ts`, `QUESTS`: nowy `QuestDef` `id: 'grozny-wilk'`, `giverName: 'Anna'`, `availability: { relation: { npcName: 'Anna', minimum: 'trusted' } }`, jeden etap `kill_target_animal` (`kind: 'wolf'`), `effects: { relation: 2, exp: 20 }` (wyżej niż domyślne v2 `+1/+10` — odpowiedzialniejszy problem świata w duchu przykładowego przepływu z planu).

### Co świadomie pominięto w tym przebiegu

- **Drapieżnik-na-zwierzę śmierć nie jest obserwowana.** Jeśli inny wilk/drapieżnik zabije związanego wilka (`AnimalAgent.attack()` → `prey.takeDamage()`, `AnimalAgent.ts`), quest tego nie zauważy — tylko zabicie przez gracza w `gameLoop.ts` zgłasza `animal_died`. `collapse()` (jedyny wspólny punkt śmierci obu ścieżek) nie dostał żadnego callbacku. Dla „groźnego wilka” to wystarczające (cel questa to eliminacja przez gracza), ale nie jest to generyczny event śmierci — przyszły quest w stylu „chroń owcę przed wilkami” będzie tego wymagał i to osobna, większa zmiana w `AnimalAgent`/`Fauna`.
- **Brak retry/re-bindingu po nieudanym resolverze poza naturalnym wejściem w kolejny etap** — jeśli oba wilki zdążą zginąć/zniknąć między `offer` a `accept` (skrajnie mało prawdopodobne przy 2 stałych wilkach bez respawnu), quest zostaje aktywny bez związanego celu; nie dodano żadnego UI-komunikatu na ten wypadek.
- **Brak markera w świecie** nad związanym wilkiem (odpowiednika `setSpawnerMarker`/`labelMarker`) — quest log jest jedynym źródłem informacji „gdzie szukać”, zgodnie z Fazą 11 planu (feedback minimalny, nie GPS-marker).
- `WolfDen`, livestock identity (pełne `ownerHouseId`), landmark objectives, tree/dig/resource objectives, bandyci — bez zmian, patrz §12.

### Testy (Etap D)

Rozszerzony `src/quests/QuestManager.test.ts` (12 testów łącznie, +3): wiązanie do id zwróconego przez resolver na accept + dopasowanie tylko tego id (inny `animalId` nie ukończy questa), brak wiązania gdy resolver zwraca `undefined` (quest zostaje `active`, żadne zdarzenie go nie kończy), `completeQuest()` czyści wiązanie (spóźnione zdarzenie po ukończeniu jest no-opem).

### Weryfikacja (Etap D)

`npx tsc --noEmit`, `npm run lint` (0 błędów w zmienionych plikach — te same niepowiązane błędy w `_temp/asset-audit/inspect.mjs` co poprzednio), `npm run build`, `npm run test` (602/602, 87 plików) — wszystkie przechodzą. Weryfikacja w przeglądarce **nie została wykonana** — brak potwierdzenia, że wilk faktycznie zostaje związany i zabity end-to-end w realnej rozgrywce (spawn, `trusted` relation z Anną, walka melee, powrót do Anny).

## 12. Co zostawało otwarte po Etapie D (domknięte niżej w §13, gdzie zaznaczono)

- ~~**Etap E — `WolfDen`**~~ — zaimplementowane, patrz §13.
- **Etap F — landmark objectives**: czeka na potwierdzenie stabilnego `landmarkId` z planu 049 (nadal `in progress`).
- **Etap G — livestock identity**: `animalId` już istnieje (ten przebieg), ale bez udokumentowanego/ustandaryzowanego `ownerHouseId` jako osobnego pola/konceptu — dziś tylko zakodowany w stringu id.
- **Etap H — tree/dig/resource objectives**.
- **Faza 9 — bandyci**.
- **Generyczny event śmierci zwierzęcia** (niezależny od przyczyny) — potrzebny, jeśli przyszły quest ma obserwować zabicie przez inne zwierzę, nie tylko przez gracza. Nadal otwarte po Etapie E — patrz §13.

---

## 13. Stan implementacji — Etap E: „wilcza jama” (`WolfDen`) (2026-08-14, trzeci przebieg)

Zaimplementowane **celowo minimalnie** — użytkownik potwierdził, że docelowo `WolfDen` może kiedyś stać się prawdziwą jaskinią (plan 104, `CaveVolume`, nadal `planned`/pre-review), ale na tym etapie ma zostać prosty. Nie czekano więc na plan 104 ani nie próbowano przewidzieć jego API — tylko zostawiono komentarz-wskazówkę w kodzie, że wizualizacja/pozycja jamy da się później podmienić bez zmiany kontraktu questowego (`denId`/`clear_wolf_den`).

### Decyzja architektoniczna: rozszerzono `PreySpawner`, bez `QuestSpawnera`

Zgodnie z planem („Jeżeli istniejący `PreySpawner` może zostać rozszerzony semantycznie do tego przypadku, należy go wykorzystać”):

- `src/fauna/AnimalSpawner.ts`: `SpawnerType` dostał czwartą wartość `'wolfDen'`; nowa wyeksportowana stała `WOLF_DEN_ID = 'wolf-den'` — jedna jama na osadę (tak jak dziś istnieje dokładnie jedna `cave` i jeden `thicket` na osadę), więc stały string identity jest wystarczający zamiast rejestru/licznika.
- `src/fauna/createFauna.ts`:
  - `SPAWNER_SPECS` dostał wpis `{ type: 'wolfDen', kind: 'wolf', respawnTime: Infinity, maxPreyCount: 2 }` — `Infinity` gwarantuje, że generyczna pętla `updateSpawners()` (współdzielona z cave/thicket) nigdy nie odpali dla niego respawnu; populacja jamy jest jednorazowa, nie utrzymywana w czasie jak u prey.
  - Wizualnie jama używa tego samego propa co `cave` (`createCaveMouth`) — bez carvingu terenu (to specyficzne dla cave/083) i bez wyszukiwania zbocza (to też cave-specific); placement jak `thicket` (płasko, `offRoad`, z dala od innych spawn-pointów).
  - Zaraz po umieszczeniu spawnera i propa, w tej samej gałęzi `if/else if`, jama od razu spawnuje `spec.maxPreyCount` (2) wilków w jej okolicy (`findWalkableNear(pos, 0, 4)`), ich `animalId` trafiają do nowego `Set<string>` `denWolfAnimalIds` w domknięciu `createFauna`.
  - Nowa metoda `Fauna.isWolfDenCleared()`: `false` jeśli `denWolfAnimalIds` jest puste (jama nie została poprawnie umieszczona — nigdy fałszywie „cleared”) albo dowolny śledzony wilk wciąż żyje w `agents`; w przeciwnym razie `true`. Nie wymaga osobnego rejestru per-den (jest tylko jeden), ale kształt (`Set` + prosty predykat) łatwo rozszerzyć na wiele jam później.
- `SPAWNER_LABELS` dostał `wolfDen: 'wilcza jama'` — etykieta/opacity-by-distance działają od razu, za darmo, dzięki reużyciu istniejącego `spawnerLabels` mechanizmu.

### Quest-facing kontrakt — bez wiązania per-instancja (prościej niż Etap D)

W przeciwieństwie do „groźnego wilka” (gdzie `QuestManager` wiąże się do JEDNEGO konkretnego `animalId` przez wstrzyknięty resolver), „wilcza jama” nie potrzebuje takiego mechanizmu — jama ma jedną, znaną już w momencie definicji questa tożsamość (`WOLF_DEN_ID`), więc dopasowanie jest bezpośrednie:

- `src/quests/quests.ts`: nowy wariant `QuestObjective` — `{ type: 'clear_wolf_den', denId: string }`; import `WOLF_DEN_ID` z `fauna/AnimalSpawner` (moduł już importowany dla `SpawnerType`).
- `src/quests/QuestManager.ts`: nowy wariant `ObjectiveRef` — `{ type: 'wolf_den_cleared', denId: string }`; `objectiveMatchesRef()` dostał case `objective.type === 'clear_wolf_den' && objective.denId === ref.denId` — brak zmian w `onInteractObjective()` (już generyczna).
- `src/app/gameLoop.ts`: w tym samym bloku wykrywania zabicia melee co Etap D, po zgłoszeniu `animal_died`, sprawdzane jest `bundle.fauna.isWolfDenCleared()`; jeśli `true`, dodatkowo zgłaszane jest `{ type: 'wolf_den_cleared', denId: WOLF_DEN_ID }`. Sprawdzenie jest bezwarunkowe po każdym zabiciu (nie tylko wilka) — tanie (mały `Set`, krótka pętla po `agents`), a `onInteractObjective` jest bezpieczne do wywoływania wielokrotnie/gdy żaden quest nie słucha (zwraca `null`). Toast pokazuje `wolf_den_cleared`-line jeśli dopasowany, inaczej `animal_died`-line, inaczej domyślny „<Zwierzę> pada.”

### Quest „wilcza jama”

- `src/quests/quests.ts`, `QUESTS`: `id: 'wilcza-jama'`, `giverName: 'Anna'`, `availability: { relation: { npcName: 'Anna', minimum: 'trusted' } }` (ten sam próg co „groźny wilk” — nie ma jeszcze mechanizmu wymagania „quest X ukończony” jako warunku dostępności, więc oba questy stają się dostępne razem po osiągnięciu `trusted`; to świadome uproszczenie, nie próbowano dodawać prerekwizytów międzyquestowych w tym przebiegu), jeden etap `clear_wolf_den`, `effects: { relation: 3, exp: 30 }` (wyżej niż „groźny wilk” — odpowiada narracyjnie „większemu problemowi”).

### Co świadomie pominięto

- **Nadal brak generycznego eventu śmierci zwierzęcia niezależnego od przyczyny.** `isWolfDenCleared()` jest sprawdzane tylko z poziomu gameLoop.ts po zabiciu przez gracza — jeśli inny drapieżnik zabije jednego z wilków jamy, quest tego nie zauważy, dopóki gracz nie zabije *czegokolwiek* melee (co odpali sprawdzenie ponownie). W praktyce to rzadki edge case (drapieżnik rzadko atakuje innego wilka), ale to nadal nie jest prawdziwy event-driven system.
- **Brak realnej groty/jaskini** — celowo, zgodnie z wytyczną użytkownika. `createCaveMouth` jest reużyty jeden do jednego z istniejącym `cave` — bez nowego modelu/assetu (nic do dopisania w `docs/assets/MODELS.md`).
- **Brak wielu jam / rejestru per-osadę** — jeden `WOLF_DEN_ID`, jak opisano wyżej; wystarczające przy jednej żywej `Fauna` na sesję gry (potwierdzone w Etapie D).
- **Jama nie odradza się nigdy** (`respawnTime: Infinity`) — to zamierzone (jednorazowy „world problem”, nie nieskończona farma wilków), ale oznacza, że po wyczyszczeniu jama fizycznie zostaje na mapie bez żadnych wilków (prop nie znika) — brak wizualnego/fabularnego zamknięcia poza samym questem. Uznane za akceptowalne dla tego zakresu.

### Testy

`src/quests/QuestManager.test.ts` (13 testów łącznie, +1): `clear_wolf_den`/`wolf_den_cleared` dopasowanie po `denId` — inny `denId` nie kończy questa, właściwy `denId` przenosi do `ready_to_report`. (`isWolfDenCleared()` samo w sobie nie ma testu jednostkowego — wymagałoby budowania pełnego `Fauna` przez `createFauna()`, co ciągnie za sobą async GLB loading/Three.js scene; uznano to za nieproporcjonalne dla tego zakresu, skoro logika jest trywialna (pusty `Set` → `false`, w przeciwnym razie liniowe „czy ktoś żyje”) i przejrzysta przy code review.)

### Weryfikacja

`npx tsc --noEmit`, `npm run lint` (0 błędów w zmienionych plikach — te same niepowiązane błędy w `_temp/asset-audit/inspect.mjs`), `npm run build`, `npm run test` (603/603, 87 plików) — wszystkie przechodzą. Weryfikacja w przeglądarce **nie została wykonana** — brak potwierdzenia, że jama faktycznie pojawia się w świecie z etykietą „wilcza jama”, że oba wilki się spawnują obok niej, i że zabicie obu kończy quest po powrocie do Anny.

## 14. Co zostaje otwarte po Etapie E

- **Etap F — landmark objectives**: nadal czeka na potwierdzenie stabilnego `landmarkId` z planu 049.
- **Etap G — livestock identity**: `ownerHouseId` jako osobny, udokumentowany koncept (dziś tylko w stringu id).
- **Etap H — tree/dig/resource objectives**.
- **Faza 9 — bandyci**.
- **Generyczny event śmierci zwierzęcia** (niezależny od przyczyny/obserwatora) — potrzebny dla przyszłych questów typu „chroń zwierzę gospodarskie przed drapieżnikami” i dla w pełni poprawnego `isWolfDenCleared()` bez zależności od tego, kiedy akurat gracz coś zabije.
- **Weryfikacja w przeglądarce Etap D + E** — oba przebiegi mają tylko zieloną weryfikację techniczną.

---

## 15. Stan implementacji — Etap G: livestock `ownerHouseId` + quest „zagubiona owca” (2026-08-14, czwarty przebieg)

### Review względem kodu przed implementacją

Sprawdzono `createSettlement.ts`/`livestock.ts`/`household.ts`: `spawnLivestock()` iteruje `landmarks.homes` z tym samym indeksem `i`, którego `createSettlement.ts` używa zarówno do `homePlaces[i].id` (`` `${def.id}:home:${i}` ``) jak i do `households[familyIndex]` (`homePlaces[familyIndex % homePlaces.length]`). Innymi słowy — indeks domu, do którego już dziś kotwiczone jest zwierzę gospodarskie (`findSpotNearHouse(home, ...)`), jest tym samym indeksem co istniejący `Place.id` domu. Nie trzeba było wprowadzać żadnego nowego rejestru — wystarczyło policzyć ten sam string w miejscu spawnu.

### Zmiany

- `src/settlement/places.ts`: nowa funkcja `homePlaceId(settlementId, index)` — scentralizowany format `` `${settlementId}:home:${index}` ``, który wcześniej był inline'owany tylko w `createSettlement.ts`. `createSettlement.ts`'s `homePlaces` teraz go używa (bez zmiany zachowania — sam refaktor).
- `src/settlement/livestock.ts`: `spawnLivestock()` dostał nowy parametr `settlementId: string` (przekazywany z `createSettlement.ts` jako `def.id`); liczy `ownerHouseId = homePlaceId(settlementId, i)` raz na dom i przekazuje go do każdego `new AnimalAgent(...)` z tego domu.
- `src/fauna/AnimalAgent.ts`: nowe `readonly ownerHouseId?: string` — opcjonalny, trailing parametr konstruktora (nie przesuwa pozycji istniejących parametrów, więc `createFauna.ts`'s dzika fauna, która go nie przekazuje, ma po prostu `undefined`).

`ownerHouseId` nie jest jeszcze konsumowany przez żaden quest ani UI poza samym polem — to świadomie zakres Etapu G ([]„zwierzę gospodarskie musi posiadać stabilną identity oraz informację o właścicielu/gospodarstwie”), przygotowujący grunt pod przyszłe questy odwołujące się do konkretnego gospodarstwa (np. „to zwierzę Anny”), bez ich jeszcze implementowania.

### Quest-facing kontrakt: `find_animal` / `animal_found` (nowy, osobny od `kill_target_animal`)

Ten sam mechanizm wiązania co „groźny wilk” (resolver → `animalTargets: questId → animalId`), ale zdarzenie źródłowe to **znalezienie** zwierzęcia (`[E]` interact), nie jego śmierć:

- `src/quests/quests.ts`: nowy wariant `QuestObjective` — `{ type: 'find_animal', kind: AnimalKind }`.
- `src/quests/QuestManager.ts`:
  - nowy wariant `ObjectiveRef` — `{ type: 'animal_found', animalId: string }`;
  - `objectiveMatchesRef()` dostał case `animal_found` (analogiczny do `animal_died`);
  - `bindAnimalTargetIfNeeded()` teraz wiąże zarówno `kill_target_animal` jak i `find_animal` (ten sam `AnimalTargetResolver`, ta sama mapa `animalTargets` — jeden mechanizm bindowania na dwa różne "co się liczy jako ukończenie" zdarzenia).
- `src/interaction/resolveInteraction.ts`: `'animal'` case najpierw próbuje `animal_found` (po `animalId` związanego zwierzęcia), dopiero potem — jeśli nic nie dopasowało — istniejący `spot_animal` (po `kind`). Oba mogą być aktywne jednocześnie (np. „zwiadowca” i „zagubiona owca” równolegle); `find_animal` ma pierwszeństwo, bo jest bardziej specyficzny.
- `src/app/createApp.ts`: `AnimalTargetResolver` wstrzykiwany do `QuestManager` teraz przeszukuje **najpierw dziką faunę** (`bundle.fauna.getAgents()`, jak wcześniej), **a jeśli nic nie znajdzie — inwentarz żywy każdej załadowanej osady** (`bundle.settlementsManager.getLoaded()[].livestock`). Działa bez rozgałęzień na "czy to zwierzę dzikie czy gospodarskie", bo populacje są rozłączne po `kind` (wilk/sarna/itd. nigdy nie są livestock; owca/kura/itd. nigdy nie są dzikie — `AnimalAgent.ts`'s `ANIMAL_DEFS`).

### Nowe questy

- `zagubiona-owca` (Anna, **bez `availability`** — celowo, w przeciwieństwie do obu questów wilczych): „Owca gdzieś mi się zawieruszyła...”, jeden etap `find_animal: { kind: 'sheep' }`, domyślne nagrody v2 (`+1 relation`/`+10 exp`, brak `effects`). Anna dziś ma tylko dwa questy zablokowane `trusted` — ten quest daje jej pierwszy, od razu dostępny problem, więc realnie staje się drogą do zbudowania relacji, która później odblokowuje „groźnego wilka”/„wilczą jamę” (dokładnie przepływ z §„Przykładowy przepływ” planu).
- `drewno-na-naprawe` (Piotr — woodcutter, więc tematycznie spójny): „Płot mi się rozłazi...”, jeden etap **istniejącego** `gather_item: { kind: 'branch', count: 5 }` — zero nowego kodu mechaniki, czysto nowe dane. To jest przykład z §Etap H („Zdobądź drewno potrzebne do naprawy”) zrealizowany bez ruszania tree lifecycle: `branch` to już dziś zbieralny item (odnawialne gałęzie, plan 091), a `gather_item` już dziś generycznie obsługuje dowolny `ItemKind`. Uwaga terminologiczna: w `Inventory`/`ItemKind` nie ma osobnego itemu `'wood'` (to tylko `EconomicKind` w household/economy) — `branch` jest najbliższym odpowiednikiem „drewna" po stronie gracza, stąd fabularne „gałęzie na płot”, nie „drewno na dom”.

### Co świadomie pominięto / dlaczego Etap F (landmarki) nadal nie ruszony

Sprawdzono `src/terrain/chunkEnvironment.ts` (monolith/stoneCircle/smallRuins/cemetery, plan 049): `EnvironmentPlacement` **nie ma pola `id`** — to czysto proceduralna, deterministyczna z seeda geometria liczona per-chunk on-the-fly, bez żadnego globalnego rejestru "odkrytych" landmarków, bez punktu interakcji (`[E]`), bez query typu "najbliższy landmark typu X". W przeciwieństwie do `WolfDen`/`AnimalAgent`/`Household`, tu nie ma czego rozszerzyć — brakująca `landmarkId`/rejestr to nie brakujące pole na istniejącej strukturze, tylko cała nieistniejąca warstwa (odkrywanie, identity, ewentualnie trwałość w save). Zbudowanie jej "przy okazji" tego przebiegu byłoby dokładnie tym rodzajem architektonicznego skoku, przed którym ostrzega plan (i użytkownik w briefie tej sesji) — nie podjęto tej próby. Etap F zostaje zablokowany na tym samym warunku co poprzednio (plan 049), z dopiskiem: **potrzebna praca to nie "dodaj pole do questa", tylko projekt osobnego rejestru identity dla proceduralnych landmarków** — warto to rozważyć jako osobny, świadomie zaplanowany krok (ew. osobna notatka/ADR), a nie doklejać pod postacią questa.

Etap H (drzewa/kopanie/zbieractwo) potraktowano jako **częściowo zamknięty** — `gather_item` już dziś pokrywa "zbierz X" dla dowolnego zbieralnego itemu (branch/stone/shell pokazane), więc kolejne tego typu questy to czyste dane, nie nowy kod. Nie ruszono `interact_tree` w stronę "ścinanie jako cel questa" (odróżnienie od samej inspekcji) ani obiektów typu "wykop kamień z konkretnego miejsca" — to nadal wymagałoby nowego `ObjectiveRef`/eventu z `treeHarvest.ts`/digging, analogicznie do `animal_found` powyżej, ale nie było potrzebne dla tego przebiegu.

### Testy

- `src/settlement/places.test.ts` (nowy plik): `homePlaceId()` format.
- `src/quests/QuestManager.test.ts` (+3 testy, 16 łącznie): `find_animal`/`animal_found` — wiązanie do resolver-owego id, inny `animalId` nie kończy questa, brak wiązania gdy resolver nic nie zwraca.
- Nie dodano testu integracyjnego na `spawnLivestock()`'s `ownerHouseId` bezpośrednio (wymagałoby budowania sceny/async GLB load jak w Etapie E dla `Fauna`) — pole jest trywialnym przekazaniem stringa z `homePlaceId()`, którego format jest już przetestowany osobno; ryzyko uznano za niskie i nieproporcjonalne do kosztu testu integracyjnego.

### Weryfikacja

`npx tsc --noEmit`, `npm run lint` (0 błędów w zmienionych plikach — te same niepowiązane błędy w `_temp/asset-audit/inspect.mjs`), `npm run build`, `npm run test` (647/647, 90 plików) — wszystkie przechodzą. Weryfikacja w przeglądarce **nie została wykonana** — brak potwierdzenia, że quest „zagubiona owca” faktycznie oferuje się od razu u Anny, że `[E]` na żywej owcy go kończy, i że „drewno na naprawę” u Piotra działa jak istniejące questy `gather_item`.

## 16. Co zostaje otwarte po Etapie G

- **Etap F — landmark objectives**: zablokowane na braku `landmarkId`/rejestru dla proceduralnych landmarków (patrz §15) — to teraz jawnie większy, osobny kawałek pracy, nie tylko "czekanie na plan 049".
- **Etap H — pozostała część**: ścinanie/kopanie jako bezpośredni cel questa (odróżniony od `interact_tree`/inspekcji) wciąż wymaga nowego `ObjectiveRef`.
- **Faza 9 — bandyci**.
- **Generyczny event śmierci zwierzęcia** (niezależny od przyczyny) — jak w §14, nadal otwarte.
- **`ownerHouseId` bez konsumenta** — pole istnieje i jest poprawnie wypełniane, ale żaden quest/UI jeszcze go nie czyta (np. by nazwać questa po konkretnym gospodarstwie/domu zamiast ogólnie po gatunku).
- **Weryfikacja w przeglądarce Etap D–G** — wszystkie cztery przebiegi mają tylko zieloną weryfikację techniczną.

### Addendum (2026-08-14) — domknięte przez plan 110

Plan [110](./2026-08-14--110--quests-v3-closure-world-identity-and-lifecycle.md) domknął większość powyższej listy:

- **Generyczny event śmierci zwierzęcia** — zrobione: `AnimalAgent.collapse()` woła wstrzyknięty `onDeath?(animalId)`, niezależnie od przyczyny śmierci (gracz melee lub predator).
- **Etap F — landmark objectives** — częściowo: `EnvironmentPlacement.id` dodane (deterministyczne z `seed/chunk/kind/ordinal`), ale świadomie **bez** rejestru/lookupu/discovery UI — brak jeszcze konsumenta. Rejestr zostaje do zaprojektowania osobno, gdy pojawi się realny quest/system, który go potrzebuje.
- **`ownerHouseId` bez konsumenta** — potwierdzone ponownie audytem w planie 110: nadal zero konsumentów, świadomie bez zmian.
- **Weryfikacja w przeglądarce Etap D–G** — nadal otwarte; plan 110 dodaje kroki weryfikacji obejmujące też nowe `failed`/`invalidated`/dangerous-wolf flow, patrz jego implementation notes.

Wciąż otwarte, poza zakresem planu 110: Etap H (ścinanie/kopanie jako cel questa), Faza 9 (bandyci), pełny rejestr/discovery landmarków.
