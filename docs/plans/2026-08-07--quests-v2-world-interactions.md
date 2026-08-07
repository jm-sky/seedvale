# Plan: Questy v2 — multi-stage + interakcje ze światem (zwierzęta/studnia/drzewa) + itemy (muszle/kamienie)

**Status:** `verification needed`
**Created:** 2026-08-07
**Scope:** nadbudowa nad [quests-v1.md](./2026-08-07--quests-v1.md) (`verification needed`), domyka generalizację interakcji zaproponowaną (ale niezaimplementowaną) w [gaze-highlight-labels.md](./2026-08-07--gaze-highlight-labels.md)

## Kontekst

Quest v1 udowodnił pipeline na jednym typie questa: relay NPC→NPC, bez itemów, bez zapisu (świadomie pominięty — patrz `quests-v1.md` "Poza zakresem"). Użytkownik chce realnego rozszerzenia: **więcej typów questów i questy wieloetapowe**, **interakcje ze światem** (żywe zwierzęta + ich punkty spawnu, studnia, drzewa), oraz **prawdziwe przedmioty**: muszle nad morzem (wyrzucane przez fale), kamienie w górach — generowane przy generacji świata, bez respawnu, plus osobna pula przedmiotów odnawialnych blisko osady. Gracz zbiera i oddaje NPC-om w ramach questów. To wymagało czterech powiązanych rozszerzeń: generalizacji systemu interakcji (dziś twardo zakodowanego pod `NpcAgent`), zbudowania minimalnego inventory + world-item generation od zera, przebudowy modelu questa z płaskiego relay na wieloetapowy z różnymi typami celów, i contentu na nowych typach.

**Odrzucanie/wyrzucanie przedmiotów w świecie** — wspomniane przez użytkownika jako pomysł, świadomie odłożone na "następną sesję" w pierwszej wersji tego planu; ta sesja **jest** tą następną sesją, więc doszła jako Faza 6 (patrz niżej).

## Stan przed tym planem

- `findInteractionTarget()` w `createApp.ts` działał wyłącznie na `NpcAgent[]` (dystans ≤ `INTERACT_RANGE` 2.5m + `dot > INTERACT_MIN_DOT` 0.5, wygrywa najwyższy dot). Zero pojęcia o zwierzętach/studni/drzewach/itemach.
- `QuestManager.onInteract(npcName): QuestDialogOverride | null` — cała maszyna stanów keyed po nazwie NPC; `QuestDef` nie miał pojęcia "etapu" ani celu innego niż "porozmawiaj z X". `QUESTS` = jeden hardcoded quest (`relay-anna-piotr`, giver Anna → target Piotr).
- **Brak inventory/itemów w projekcie w ogóle** — świadomie pominięte w quest v1.
- NPC-e w osadzie: zawsze i deterministycznie obecni **Anna, Piotr, Kasia, Marek** (pierwsze 4 wpisy `NPC_NAMES`, `homeOffsets` ma zawsze 3 wpisy → `count` zawsze 4).
- Fauna: `AnimalSpawner.ts` (`PreySpawner`) to jedyna wcześniej istniejąca śledzona rejestracja punktów w świecie (2 spawnery: `cave`/deer, `thicket`/stag), z własną etykietą CSS2D.
- `SettlementLandmarks.well: Vector3` i `.trees: Vector3[]` (permanentnie śledzone pozycje drzew osady) istniały, ale `landmarks` nie było eksponowane przez `createSettlement()`.
- Wzorzec generacji per-chunk w workerze (`computeChunkVegetation`) już istniał i okazał się bezpośrednio reużywalny dla itemów.
- `SaveData.version: 1`, brak pól quest/inventory/collected-items.

## Decyzja 1 — generalizacja interakcji: `Interactable` jako discriminated union, cienki adapter na granicy

`NpcAgent`, `AnimalAgent`, gołe `Vector3` (well/trees), `PreySpawner` i nowy item-ref to pięć niekompatybilnych kształtów. Zamiast wspólnej klasy bazowej (inwazyjne, wymagałoby przepisania `NpcAgent`/`AnimalAgent`), zbudowano **cienki adapter**: `Interactable` — discriminated union tworzony *ad hoc* co klatkę z istniejących obiektów (`src/interaction/Interactable.ts`).

To domyka generalizację zaproponowaną w `gaze-highlight-labels.md` (tam: wydzielić z `findInteractionTarget` reużywalny helper dystans+dot działający na "dowolnej liście obiektów z pozycją") — wydzielony generyczny `pickInGaze<T extends {position}>` (`src/interaction/findInteractionTarget.ts`), żeby przyszły plan wizualnego highlightu mógł go reużyć bez przeróbek (CSS glow samo w sobie nie jest w zakresie tego planu).

**Zwierzęta — żywe, nie tylko spawn point**: `[E]` blisko żywego `AnimalAgent` w zasięgu daje **flavor line** (per `kind`, `src/fauna/animalDialogue.ts`) i może być **celem questa** (`spot_animal`) — zaliczanym samą interakcją, bez zmiany AI zwierzęcia (chase/flee nietknięte). Spawn pointy (`PreySpawner`) zostały **osobnym, dodatkowym** celem interakcji (`interact_spawner`) — oba tory współistnieją.

**Drzewa:** wyłącznie `landmarks.trees` osady (permanentne). Terenowe drzewa (`chunkVegetation.ts`) pozostają nieinteraktywne (efemeryczne, tracą tożsamość przy unload chunku).

## Decyzja 2 — itemy: world-generated per-chunk (bez respawnu) + osobna pula odnawialna blisko osady

Dwa niezależne źródła tego samego `ItemKind` (`'shell' | 'stone'`):

**A. World-generated, finite, bez respawnu** — generowane w workerze per-chunk (`src/terrain/chunkItems.ts`), analogicznie do `computeChunkVegetation`:
- Muszle: pas `oceanThreshold ≤ continentalness ≤ coastThreshold` (fale wyrzucają je na brzeg), ponad wodą, płasko.
- Kamienie: `mountainRidge ≥ 0.35` (niżej niż terenowy `mountainThreshold` — łapie podgórze), walkable.
- Rzadkie (`CANDIDATES_PER_CHUNK = 3`, ~30% keep chance) — mają być rzadkimi znajdźkami, nie zaśmieceniem terenu.
- **Stabilne id** (`cx:cz:localIndex`, nie losowe) — save trzyma tylko zbiór zebranych id (`collectedItemIds: Set<string>`), nie cały stan itemów; przy (re)generacji chunku main thread filtruje placementy, których id już zebrano.
- `chunkManager.collectItem(id)` / `chunkManager.getNearbyItems(pos, radius)` — nowe metody, mirror wzorca vegetation (instancjacja/dispose razem z chunkiem).
- **Zaakceptowana konsekwencja:** brak gwarancji, że dany typ itemu pojawi się blisko startu gracza — mogą wymagać eksploracji. Stąd punkt B.

**B. Odnawialna pula blisko osady** (`src/items/ItemSpawner.ts` + `createItemSpawners.ts`) — mały, śledzony rejestr na wzór `AnimalSpawner.ts`: 1-2 punkty blisko centrum osady (jeden `stone`, jeden `shell`), respawn 90-100s po zebraniu, własna etykieta CSS2D. Nie persystowany (jak `PreySpawner` dziś).

`ItemKind`/`ITEM_DEFS` (`src/items/items.ts`) i `Inventory` (`src/items/Inventory.ts`) są wspólne dla obu źródeł.

**C. Upuszczone przez gracza** (`src/items/createDroppedItems.ts`) — trzecie źródło, patrz Faza 6.

## Decyzja 3 — model questa: `QuestStage[]` z `QuestObjective` union

`QuestDef` przeszedł z płaskiego `{giverName, targetName, ...}` na `{giverName, offerLine, stages: QuestStage[], reportLine}`, gdzie `QuestObjective` to `talk_to_npc | interact_well | interact_tree | interact_spawner | spot_animal | gather_item`. `relay-anna-piotr` zmigrowany jako quest 1-etapowy — zachowanie w przeglądarce ma być identyczne (regression).

**Dispatch — dwie ścieżki:**
- `QuestManager.onInteract(npcName)` — jak dziś (giver: offer/accept/decline + `gather_item` rozwiązywany leniwie tu; target-branch: `npcName` pasuje do bieżącego `talk_to_npc` etapu aktywnego questa).
- Nowa `QuestManager.onInteractObjective(ref: ObjectiveRef)` — dla `interact_well`/`interact_tree`/`interact_spawner`/`spot_animal`.
- `gather_item` **nie ma** punktu interakcji w świecie — konsumowany przy rozmowie z giverem (`inventory.has/remove`).
- Dispatch "który `Interactable` → które wywołanie" żyje w `src/interaction/resolveInteraction.ts`, **nie** w `QuestManager` — `QuestManager` nadal nie wie nic o scenie/pozycjach.
- `QuestManager` dostaje `Inventory` przez konstruktor (DI).
- Nowa `spawnerMarker(spawnerType)` — analogiczna do `labelMarker`, dla etykiet spawnerów fauny.
- `list()` rozszerzony o `stageIndex`, `totalStages`, `currentObjective` (z live-countem dla `gather_item`).

## Decyzja 4 — persystencja: `SaveData` v1→v2→v3 z łańcuchową migracją

Questy stają się wieloetapowe (utrata postępu przy reload byłaby dotkliwsza niż w v1) i dochodzi inventory + zebrane itemy — **persystujemy**: quest progress (stan + `stageIndex`, exp, relacje), inventory, `collectedItemIds`. **Nie** persystujemy stanu odnawialnej puli (jak `PreySpawner` dziś).

Zamiast twardo podbić `version` i odrzucać stare save'y, zrobiono **migrację**: `isSaveDataV1`/`isSaveDataV2`/`isSaveDataV3` + `loadSaveData(value)` w `src/persistence/saveData.ts` — v1 dogenerowuje puste `quests`/`inventory`/`collectedItemIds`/`droppedItems`, v2 dogenerowuje puste `droppedItems`. `saveDb.ts` używa `loadSaveData` zamiast starego `isSaveData`.

Faza 6 (upuszczanie itemów, ta sama sesja) podbiła to jeszcze raz do **v3**: `droppedItems: {id, kind, x, z}[]` — w przeciwieństwie do `collectedItemIds` (tylko zbiór id, bo world-gen itemy są odtwarzalne z seeda), pozycje upuszczonych itemów **nie** są wyprowadzalne z seeda, więc cały rekord musi round-tripować przez save.

## Zakres — zaimplementowane

### Faza 1 — generalizacja interakcji
- `src/interaction/Interactable.ts`, `src/interaction/findInteractionTarget.ts` (`pickInGaze`), `src/interaction/resolveInteraction.ts`.
- `Settlement.landmarks` eksponowane (`src/settlement/createSettlement.ts`).
- `Fauna.getSpawners()`, `Fauna.setSpawnerMarker()`, `src/fauna/animalDialogue.ts`, `ANIMAL_LABELS`/`SPAWNER_LABELS` wyeksportowane.
- `createNpcDialog.setPrompt(name)` → `setPrompt(text)`.
- `createApp.ts`: `buildInteractables()` + `pickInGaze()` zastępują stary `findInteractionTarget`; `resolveInteraction()` w handlerze `[E]`.

### Faza 2 — itemy i inventory
- `src/items/items.ts`, `src/items/Inventory.ts`.
- `src/terrain/chunkItems.ts` (`computeChunkItems`) wpięty w `chunkHeightmap.worker.ts` / `chunkHeightmapProtocol.ts` / `chunkWorkerPool.ts`.
- `chunkManager.ts`: instancjacja/dispose item-mesh-y, `collectItem(id)`, `getNearbyItems(pos, radius)`, `ChunkManagerConfig.collectedItemIds`.
- `src/items/ItemSpawner.ts` + `src/items/createItemSpawners.ts`.
- `createHud.ts`: `setInventory(counts)`.

### Faza 3 — multi-stage questy
- `src/quests/quests.ts` przepisany (`QuestObjective`/`QuestStage`/`QuestDef`), 4 questy (patrz niżej).
- `src/quests/QuestManager.ts` przepisany: stage state machine, `onInteractObjective`, `spawnerMarker`, `Inventory` DI, `exportProgress()`/`exportRelations()`.
- `createQuestLog.ts`: wiersz questa pokazuje `Etap N/total` + opis bieżącego celu.

### Faza 4 — save/persystencja
- `src/persistence/saveData.ts` v1→v2 + migrator; `saveDb.ts` używa `loadSaveData`.
- `createApp.ts`: `Inventory`/`QuestManager`/`collectedItemIds` inicjalizowane z `initialSave`; `buildSaveData()` w wersji 2. `rebuildWorld(resetCollectedItems)` — reset tylko na "New Game" (nowy seed), nie na zwykły rebuild terenu.

### Faza 5 — content (4 questy w `QUESTS`)
1. `relay-anna-piotr` — zmigrowany 1:1 (regression).
2. `shells-dla-kasi` — 1 etap `gather_item shell×3`.
3. `woda-dla-marka` — 1 etap `interact_well`.
4. `zwiadowca` (giver Piotr, 3 etapy) — `interact_spawner cave` → `spot_animal stag` → `gather_item stone×2`.

### Faza 6 — upuszczanie itemów (ta sama sesja, po scaleniu Faz 1-5)

Jedyna rzecz świadomie odłożona w pierwszej wersji tego planu — dograna po tym, jak Fazy 1-5 wylądowały na branchu (`b5242cb`).

- **`[G]`** (nowy klawisz, edge-triggered jak `[E]`/`[L]`) — `src/input/Keyboard.ts`: `KeyState.drop` + `consumeDrop()`.
- **`src/items/createDroppedItems.ts`** (nowy) — trzeci rejestr itemów, `DroppedItem = {id, kind, x, z}`; `drop(kind,x,z)` / `collect(id)` / `nodes()` / `dispose()`. Bez respawnu, bez limitu liczby, mesh przez współdzielone `createItemMesh`.
- `Interactable`/`WorldItemRef.source` (`src/interaction/Interactable.ts`) rozszerzony o `'dropped'`.
- `createApp.ts`: `[G]` w bloku "nie pauza/dialog/questlog" — dla każdego `ItemKind` z niezerowym stanem w `Inventory` zdejmuje 1 sztukę i upuszcza ją przy graczu (offset na okręgu r=0.6, żeby kilka itemów naraz się nie nakładało); nowa funkcja `collectItem(ref, chunkManager, itemSpawners, droppedItems)` ujednolica pickup z trzech źródeł (`world`/`spawner`/`dropped`) zamiast inline'owego trójskładnikowego warunku; `buildInteractables()` dokłada pętlę po `droppedItems.nodes()`; `rebuildWorld()` przenosi istniejące dropy do przebudowanego świata (chyba że `resetCollectedItems` — wtedy czyści razem z `collectedItemIds`, jak "New Game").
- `createHud.ts` — hint dopisany o `G = upuść`.
- `SaveData` v2→v3 (Decyzja 4) — `droppedItems` w `buildSaveData()`/`initialSave`.

**Znaleziony i naprawiony w trakcie bug:** `droppedItems.nodes()` zwraca żywą referencję do wewnętrznej tablicy, a `dispose()` czyści ją w miejscu (`items.length = 0`) — naiwne `const carried = droppedItems.nodes(); droppedItems.dispose()` w `rebuildWorld()` zerowałoby `carried` razem z oryginałem. Naprawione kopiowaniem (`[...droppedItems.nodes()]`) przed `dispose()`.

## Poza zakresem

- **Zmiana AI zwierząt** (pacyfikacja/oswajanie/karmienie) — interakcja z żywym zwierzęciem jest czysto informacyjna + trigger questowy.
- **Wizualny glow/highlight na gaze** — osobny plan (`gaze-highlight-labels.md`); ten plan tylko przygotował wspólny `pickInGaze`.
- **Markery `!`/`?` na studni/drzewach/zwierzętach/itemach** — tylko NPC + spawnery fauny.
- **Sprawdzanie nachylenia terenu** przy world-gen kamieni ponad już istniejący `SLOPE_REJECT`.
- **Gwarancja pojawienia się itemu blisko startu** — world-gen itemy pojawiają się tam, gdzie biom pasuje; odnawialna pula blisko osady to świadomy fallback, nie pełne rozwiązanie.
- **Ikony/sprite'y itemów, UI drag&drop, stackowanie z limitem, crafting.**
- **Wybór konkretnego itemu do zrzucenia** — `[G]` zawsze upuszcza po 1 sztuce z każdego posiadanego rodzaju naraz, bez selektora.
- **Limit liczby jednocześnie leżących upuszczonych itemów w świecie.**
- **Rozgałęzienia dialogowe** poza istniejącym binarnym accept/decline.
- **Multi-settlement quest routing.**
- **Generator questów (LLM).**
- **Nowe nagrody** (waluta, itemy jako nagroda) — nagrodą pozostaje exp + relation + linia podziękowania.

## Szkic zmian (pliki)

```
src/interaction/Interactable.ts          # nowy: discriminated union Interactable
src/interaction/findInteractionTarget.ts # nowy: pickInGaze<T>
src/interaction/resolveInteraction.ts    # nowy: dispatch Interactable → QuestManager/dialog

src/items/items.ts                       # nowy: ItemKind, ITEM_DEFS, createItemMesh
src/items/Inventory.ts                   # nowy: klasa Inventory
src/items/ItemSpawner.ts                 # nowy: odnawialna pula blisko osady (mirror AnimalSpawner.ts)
src/items/createItemSpawners.ts          # nowy: placement + mesh lifecycle (mirror createFauna.ts)
src/items/createDroppedItems.ts          # nowy (Faza 6): trzeci rejestr itemów — player-dropped, bez respawnu

src/input/Keyboard.ts                    # + drop (KeyG, edge-triggered), consumeDrop() (Faza 6)

src/terrain/chunkItems.ts                # nowy: computeChunkItems (mirror chunkVegetation.ts), bez respawnu
src/terrain/chunkHeightmap.worker.ts     # + woła computeChunkItems obok computeChunkVegetation
src/terrain/chunkHeightmapProtocol.ts    # ChunkTileResult + items: ItemPlacement[]
src/terrain/chunkWorkerPool.ts           # + przekazuje items przez odpowiedź workera
src/terrain/chunkManager.ts              # + instancjacja/dispose item mesh-y, collectItem(id), getNearbyItems(),
                                          #   ChunkManagerConfig.collectedItemIds

src/quests/quests.ts                     # przepisany: QuestObjective/QuestStage/QuestDef, 4 questy
src/quests/QuestManager.ts               # przepisany: stage state machine, onInteractObjective, spawnerMarker,
                                          #   inventory DI, export/import progress dla save

src/settlement/createSettlement.ts       # + eksponuje landmarks w Settlement
src/fauna/AnimalAgent.ts                 # ANIMAL_LABELS wyeksportowane
src/fauna/createFauna.ts                 # + getSpawners(), setSpawnerMarker(type, marker), SPAWNER_LABELS export
src/fauna/animalDialogue.ts              # nowy: flavor lines per AnimalKind (mirror ai/dialogue.ts)

src/ui/createNpcDialog.ts                # setPrompt(name) → setPrompt(text)
src/ui/createQuestLog.ts                 # + render stageIndex/totalStages/currentObjective per wiersz
src/ui/createHud.ts                      # + setInventory(counts), nowy <span data-inventory>

src/persistence/saveData.ts              # SaveData v1→v2→v3: quests + inventory + collectedItemIds + droppedItems,
                                          #   isSaveDataV1/V2/V3, loadSaveData migrator (Faza 6: v3)
src/persistence/saveDb.ts                # readSave() używa loadSaveData zamiast isSaveData

src/app/createApp.ts                     # wiring: Inventory + QuestManager(inventory) + item spawnery/collectedItemIds,
                                          #   buildInteractables(), pickInGaze zamiast findInteractionTarget,
                                          #   resolveInteraction() w handlerze [E], hud.setInventory,
                                          #   spawner marker per-frame, buildSaveData/initialSave rozszerzone,
                                          #   [G] drop handler + collectItem() dispatch + droppedItems (Faza 6)

index.html                               # + CSS dla wiersza etapu w quest logu
```

## Done when

- [x] `relay-anna-piotr` zmigrowany na nowy kształt danych — zachowanie w kodzie niezmienione (regression w przeglądarce: `verification needed`)
- [x] `[E]` działa spójnie na: NPC, studnię, drzewo osady, żywe zwierzę (flavor), spawner fauny, world-gen item, item z odnawialnej puli — jeden generalny picker (`pickInGaze` + `buildInteractables`)
- [x] Zbieranie itemu (oba źródła): usuwa mesh, dodaje do `Inventory`, HUD aktualizuje liczbę; world-gen item nie wraca po reloadzie tego samego chunku (persisted `collectedItemIds`); item z puli blisko osady odradza się po czasie
- [x] Muszle world-gen spawnują się w pasie brzegowym, kamienie w rejonach z wysokim `mountainRidge` (kod gotowy — wizualna weryfikacja: `verification needed`)
- [x] `shells-dla-kasi`, `woda-dla-marka` — logika end-to-end (offer → reminder przy niepełnym stanie → complete → exp/relation)
- [x] `zwiadowca` (3 etapy: spawner → spot_animal → gather_item) — logika przechodzenia po kolei, quest log pokazuje `Etap N/3` + opis celu
- [x] Marker `?`/`!` na etykiecie spawnera fauny reaguje na aktywny quest
- [x] Save/load: quest progress (w tym `stageIndex`), inventory, `collectedItemIds`, `droppedItems` w `SaveData` v3; stare save'y v1/v2 migrują bez błędu
- [x] `[G]` upuszcza po 1 sztuce każdego posiadanego rodzaju przy graczu; `[E]` na upuszczonym itemie zbiera go z powrotem; dropy przetrwają save/reload i rebuild świata (nie New Game)
- [x] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`

## Do przetestowania (http://localhost:5577/)

1. **Regression relay-anna-piotr** — identyczne jak w quests-v1.md.
2. **Studnia bez questa** — `[E]` przy studni, flavor line, brak wpływu na quest log.
3. **Drzewo osady** — `[E]` przy dowolnym drzewie blisko wioski, flavor line.
4. **Żywe zwierzę** — podejdź do dowolnego zwierzęcia (np. jelenia), `[E]` w zasięgu — flavor line, zwierzę nie reaguje inaczej niż normalnie (nie atakuje/nie ucieka bardziej niż zwykle).
5. **Spawner fauny** — `[E]` przy etykiecie "jaskinia"/"zagajnik" — prompt + flavor line.
6. **World-gen muszle/kamienie** — eksploruj wybrzeże/góry z dala od osady, sprawdź czy pojawiają się małe zbieralne obiekty; zbierz, sprawdź HUD; wyjdź z chunku i wróć (streaming unload/reload) — zebrany item **nie wraca**.
7. **Odnawialna pula blisko osady** — znajdź punkt z etykietą blisko wioski, zbierz, poczekaj na respawn, sprawdź czy wraca.
8. **`shells-dla-kasi`** — reminder bez muszli → zbierz 3 → complete, muszle znikają z inventory.
9. **`woda-dla-marka`** — accept → `[E]` przy studni → progress line → powrót do Marka → report.
10. **`zwiadowca` (multi-stage)** — accept od Piotra → `[L]` pokazuje "Etap 1/3" → spawner cave → etap 2/3 → wypatrz jelenia (`[E]`) → etap 3/3 → zbierz 2 kamienie → wróć do Piotra → report.
11. **Quest log** — `[L]`, 4 questy, filtry działają, wiersz multi-stage pokazuje etap+opis.
12. **Save/load** — zbierz itemy, częściowo ukończ `zwiadowca`, zapisz, wczytaj (Continue) — stan (etap!, inventory, collected ids) identyczny.
13. **Stary save v1/v2** (jeśli dostępny sprzed tego planu/Fazy 6) — wczytanie nie crashuje, brakujące pola startują puste.
14. **Upuszczanie (`[G]`)** — zbierz muszlę/kamień, `[G]` — item ląduje przy graczu, HUD spada o 1; `[E]` na nim — wraca do inventory. Upuść oba rodzaje naraz — dwa osobne, nienachodzące na siebie obiekty.
15. **Upuszczanie + save/reload** — upuść coś, zapisz, wczytaj (Continue) — leży w tym samym miejscu.
16. **Upuszczanie + New Game** — dropy z poprzedniego świata nie pojawiają się w nowym.

## Następnie

- ~~Wizualny highlight na gaze~~ → zaimplementowany tą samą sesją, reużywając `pickInGaze`/`Interactable` z tego planu, patrz [gaze-highlight-labels.md](./2026-08-07--gaze-highlight-labels.md) (`verification needed`).
- Multi-settlement quest routing, gdy `multi-settlements.md` faktycznie wyląduje w kodzie.
- Więcej typów itemów (drewno ze stockpile, zioła z ogrodu) — ten sam wzorzec `ItemNode`/`Inventory` się skaluje.
