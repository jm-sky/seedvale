# Plan: Quest v3 — domknięcie lifecycle, identity i world problems

**Status:** `verification needed` 🔍 (playtest 2026-08-18 deferred — still needs browser check of wolf/sheep/predator/save-load)
**Created:** 2026-08-14
**Priority:** 🔴 `high`
**Effort:** L
**Depends:** ~~093~~

## Cel

Domknąć otwarte problemy zostawione przez plan 093 (Etapy D–G), które zaimplementowały questy `zagubiona-owca`, `grozny-wilk`, `drewno-na-naprawe`, `wilcza-jama` bez weryfikacji w przeglądarce i ze świadomie odłożonymi lukami:

1. wyróżnienie konkretnego „Groźnego wilka” (wizualnie i gameplayowo),
2. weryfikacja `ownerHouseId` — zmiana tylko jeśli audyt wykaże konkretny use case,
3. weryfikacja „Drewna na naprawę” (`gather_item`/`branch`),
4. generyczny sygnał śmierci zwierzęcia (dziś tylko zabicie przez gracza dociera do questów) i poprawna obsługa śmierci targetu „Zagubionej owcy”,
5. generyczny lifecycle questa: `failed` / `invalidated` obok istniejących `not_offered`/`offered`/`active`/`ready_to_report`/`complete`,
6. stabilne `landmarkId` dla proceduralnych landmarków (`monolith`/`stoneCircle`/`smallRuins`/`cemetery`) — tylko pole identity, bez rejestru/lookupu (brak dziś jakiegokolwiek konsumenta).

Rozszerza istniejące systemy: `QuestManager`, `AnimalAgent`, `chunkEnvironment.ts`. Nie tworzy równoległych systemów (special animals, quest corpses, landmark quest generator, reason-code framework, pełnej persystencji fauny, nowego ownership systemu).

## Stan potwierdzony w kodzie (audyt, nie założenia)

- `QuestState` (`quests.ts:6-11`): `not_offered | offered | active | ready_to_report | complete`. Brak `failed`/`invalidated`. Wszystkie przejścia idą przez jeden punkt — `QuestManager.setQuestState()` (`QuestManager.ts:155-158`) — dobry seam do rozszerzenia.
- Podwójne wydanie nagrody jest dziś wykluczone strukturalnie: `completeQuest()` osiągalne tylko z `ready_to_report` (`handleGiverInteract`, linia 327-328), nie przez osobną flagę.
- Bindowanie `questId → animalId` dzieje się przy accept/advance przez `bindAnimalTargetIfNeeded()` (`QuestManager.ts:254-266`) z wstrzykniętym `AnimalTargetResolver` (`createApp.ts` ~385-395). Mapa `animalTargets` (linia 105) **nigdy nie jest zapisywana w save**.
- Sygnał śmierci **nie jest generyczny**: tylko `gameLoop.ts:536-546` (melee gracza) ręcznie porównuje `isDead()` przed/po i woła `questManager.onInteractObjective({ type: 'animal_died', animalId })`. Zabicie przez predatora (`AnimalAgent.ts:1150`) nigdy nie sygnalizuje questów — potwierdzona luka.
- `AnimalAgent.takeDamage()` (`AnimalAgent.ts:736-745`) jest jedynym punktem wejścia dla wszystkich źródeł obrażeń i już woła `private collapse()` przy śmierci — właściwy punkt na generyczny hook.
- `animalId`: livestock jest seedowane/deterministyczne (`livestock.ts:195`, stabilne między spawnami tej samej osady); dzika fauna używa **niesekwencjonowanego licznika** (`createFauna.ts` ~350/361) — stabilnego tylko w ramach jednej sesji, nie po `rebuildWorldBundle()`/reload.
- Zwłoki nie są osobną encją — to ten sam `AnimalAgent`, w pełni zachowujący identity, wystawiany jako `Interactable{kind:'corpse', animal}` (`app/interactables.ts`). Lingerują `CORPSE_LINGER_SECONDS = 60` (`AnimalAgent.ts:42`), potem dispose bez śladu.
- `ownerHouseId` (`AnimalAgent.ts:493`, ustawiane tylko w `livestock.ts:191,208`) ma **zero konsumentów** poza miejscem ustawienia (potwierdzone grepem). Żaden quest dziś nie potrzebuje bindowania per-household.
- `drewno-na-naprawe` (`quests.ts:191-203`) jest już w pełni zaimplementowane przez zwykły `gather_item: { kind: 'branch', count: 5 }` — brak luki.
- Landmarki: `EnvironmentPlacement` (`chunkEnvironment.ts:22-36`) nie ma id. Placement jest **w pełni deterministyczny** — seedowany PRNG (`createSeededRandom`, `parseSeed.ts:2-11`) po `params.seed ^ hashChunk(cx, cz, salt)` per kind; potwierdzone zero `Math.random`/`Date.now`/UUID na tej ścieżce. Dziś maks. jeden roll na kind na chunk.
- `SaveQuests`/`QuestProgressEntry` (`saveData.ts`) niosą tylko `id/state/stageIndex` — brak pola bindowania zwierzęcia, i brak switcha migracji wersji do aktualizacji (rozszerzenie `QuestState` jest czysto addytywne).

## Implementacja

### 1. Lifecycle: `failed` / `invalidated`

- `quests.ts`: rozszerzyć `QuestState` o `'failed' | 'invalidated'`. Dodać opcjonalne `QuestStage.failLine?: string`.
- `QuestManager.ts`: dodać `private failQuest(def): string` analogiczne do `completeQuest` — ustawia `failed`, czyści `animalTargets.delete(def.id)`, zwraca `stage.failLine ?? fallback`. `invalidated` nie potrzebuje osobnej metody — ustawiane raz, przy konstrukcji/restore (patrz punkt 8).
- Reward-guard bez zmian: `completeQuest` pozostaje nieosiągalne z `failed`/`invalidated` (żaden nie przechodzi przez `ready_to_report`).
- **Wymagana zmiana UI (nie opcjonalna)**: `src/ui-vue/screens/QuestLogScreen.vue`'s `STATE_LABEL` to wyczerpujący `Record<QuestState,string>` — bez dodania etykiet dla `failed`/`invalidated` **`tsc` się wywali**. Zaktualizować też `matchesFilter()` tak, żeby `failed`/`invalidated` trafiały do filtra „Zakończone", nie „W trakcie".
- `labelMarker()`/`spawnerMarker()` bez zmian — dopasowują tylko żywe stany.

### 2. Generyczny sygnał śmierci zwierzęcia

Uzupełnienie, nie zastąpienie istniejącej ścieżki melee w `gameLoop.ts` (zostaje bez zmian — jej SFX/toast działa poprawnie); nowy hook domyka tylko lukę zabójstw przez predatora. Guard `s.state !== 'active'` w `onInteractObjective` sprawia, że podwójny dispatch dla tego samego questa jest no-opem.

- `AnimalAgent.ts`: dodać końcowy opcjonalny parametr konstruktora `onDeath?: (animalId: string) => void` (po `ownerHouseId`). Wywołać `this.onDeath?.(this.animalId)` jako pierwszą linię `collapse()` (~linia 749) — wspólny punkt dla zabójstw przez gracza i predatora. `AnimalAgent` pozostaje quest-agnostic.
- Przeciągnąć callback przez `createFauna.ts:362`, `livestock.ts:196`, ich callerów (`createSettlement.ts`, `SettlementsManager.ts`), `worldBundle.ts` (`buildFauna`/`buildSettlementsManager`, oba call site'y `createWorldBundle`/`rebuildWorldBundle`) i `createApp.ts`.
- `createApp.ts`: `bundle` powstaje przed `questManager` — użyć mutowalnej zmiennej pośredniej przypisywanej po utworzeniu `questManager` (analogicznie do istniejącego wzorca `resolveAnimalTarget`, który czyta `bundle`, nie destrukturyzuje).
- Zrobić jako osobny, izolowany krok przed punktami 3–6. Zregrepować `new AnimalAgent(` tuż przed implementacją.

### 3. Failure wiring dla „Zagubionej owcy"

- `QuestManager.onInteractObjective()`: dodać branch przed generycznym `objectiveMatchesRef` — gdy `ref.type === 'animal_died'`, stage to `find_animal`, a `boundAnimalId === ref.animalId`, wołać `failQuest(def)` zamiast advance. `kill_target_animal` zostaje bez zmian (animal_died → advance).
- Śmierć poza zasięgiem gracza jest cicha — brak plumbing toastów w kod fauny/AI; zmiana stanu jest widoczna przy najbliższym otwarciu quest logu lub rozmowie z dawcą (spójne z istniejącym `isDirty()`/`clearDirty()`).

### 4. Trait „Groźny wilk"

Trait aplikowany **przy bindowaniu**, nie przy spawnie — wykorzystuje istniejący seam `AnimalTargetResolver`, bez nowego spawnera, dotyczy tylko jednego skonkretnego wilka.

- Potwierdzone: wilki ładują się z GLB (`createFauna.ts:182`), więc fallback capsule/`MeshStandardMaterial` nie ma zastosowania. Tinting materiału jest wykonalny przez istniejący `tintPropMaterials(root, hex)` (`settlement/props.ts:168`), już reużywany poza swoim modułem (`resourceDeposits.ts:156`) — **przed implementacją zweryfikować, czy materiały `wolf.glb` mają ustawialny `.color`** (np. przez asset browser); jeśli nie, fallback: sama skala + wyróżniający tekst etykiety.
- `AnimalAgent.ts`: `private dangerous = false` + `markDangerous(): void` (idempotentne) — podbija `health.maxHp`/`currentHp`, `mesh.scale.multiplyScalar(...)`, tintuje materiał przez `tintPropMaterials` gdy nie capsule, zmienia tekst etykiety.
- `AnimalAgent.ts` (~linia 975): pomnożyć wychodzące obrażenia przez mnożnik bramkowany `dangerous` w miejscu wywołania — bez zmian w `faunaCombat.ts`.
- **Poprawka przy okazji**: `createFauna.ts`'s `disposeAgent()` dziś pomija `disposeObject3D` dla klonów GLB (założenie o współdzielonym cache); `disposeObject3D` robi granularne per-mesh sprawdzenie `sharedGpu`, więc jest to bezpieczne nawet dla klonów (potwierdzony wzorzec w `resourceDeposits.ts:221`). Ponieważ `markDangerous()` klonuje/odspaja materiały, poluzować tę bramkę, żeby faktycznie były zwalniane przy despawnie.
- `quests.ts`: dodać `dangerous?: boolean` do wariantu `kill_target_animal`; ustawić `true` tylko dla `grozny-wilk`.
- `QuestManager.ts`: dodać wstrzyknięty `applyDangerousTrait: (animalId: string) => void = () => {}` (dopisany po `resolveAnimalTarget`, żeby istniejące pozycyjne wywołanie testowe zostało ważne przez default). W `bindAnimalTargetIfNeeded`, po udanym bindzie, wołać go gdy `objective.type === 'kill_target_animal' && objective.dangerous`.
- `createApp.ts`: podłączyć `applyDangerousTrait` do closure skanującego `bundle.fauna.getAgents()` po id i wołającego `.markDangerous()` (wilki są tylko dziką fauną, bez potrzeby skanowania livestock).

### 5. Audyt `ownerHouseId` — oczekiwany wynik: bez zmian

Potwierdzić w trakcie implementacji, że żadna nowa potrzeba konsumenta nie pojawiła się (np. z prac nad `grozny-wilk`/`find_animal`). Jeśli nie — zostawić bez zmian.

### 6. Audyt „Drewno na naprawę" — oczekiwany wynik: bez zmian

Już poprawnie zaimplementowane przez istniejący `gather_item`/`branch`/inventory flow. Potwierdzić brak rozbieżności tekstu questa z UX zbierania gałęzi podczas weryfikacji w przeglądarce.

### 7. Stabilne `landmarkId` (tylko pole identity, bez rejestru)

- `chunkEnvironment.ts`: czysta funkcja `deriveLandmarkId(seed, cx, cz, kind, ordinal)` obok `hashChunk` (worker-safe, bez referencji THREE/DOM).
- Dodać `id: string` do `EnvironmentPlacement`, wypełniane tylko w 4 miejscach push dla landmarków (monolith/stoneCircle/smallRuins/cemetery, ~linie 300/324/348/372) — pozostałe kinds dekoracyjne bez zmian. `ordinal` zawsze `0` dziś (maks. jeden roll na kind na chunk) — literalne `0` z komentarzem o przyszłej wielokrotności.
- Brak potrzeby persystencji w save — id w pełni wyprowadzone z `(seed, cx, cz, kind, ordinal)`, regeneruje się identycznie przy każdym reload chunku.
- Bez rejestru/lookup Map, bez discovery flag, bez wiązania z questami — poza zakresem (decyzja użytkownika). Accessor lookupu (np. `chunkManager.getLoadedEnvironmentPlacements()`) można dodać później, gdy pojawi się realny konsument.

### 8. Persystencja bindowania animal target

Brak zmian schematu `saveData.ts`/`saveDb.ts` — `animalTargets` nigdy nie jest serializowane, zawsze odtwarzane z `SaveQuests.progress`.

- `livestock.ts`: eksport `LIVESTOCK_KINDS: ReadonlySet<AnimalKind>` z istniejącej mapy URL livestock.
- Pętla restore w konstruktorze `QuestManager`: dla każdego przywracanego `active` questa ze stage `kill_target_animal`/`find_animal`, sprawdzić `LIVESTOCK_KINDS.has(objective.kind)`:
  - **kind livestock** (np. sheep): bezpieczne rebindowanie przez `bindAnimalTargetIfNeeded` (animalId deterministyczne).
  - **kind dzikiej fauny** (np. wolf): ustawić `invalidated` zamiast `active` — stan dead/alive dzikiej fauny nie jest w ogóle persystowany, więc naiwny rebind mógłby po cichu podmienić target na innego osobnika.
- Oba dotknięte questy to pojedynczy-stage, relation-building side questy — `invalidated` `grozny-wilk` po reloadzie w trakcie questa jest akceptowalnym, transparentnym skutkiem.

## Kluczowe pliki

`src/quests/quests.ts`, `src/quests/QuestManager.ts`, `src/fauna/AnimalAgent.ts`, `src/fauna/createFauna.ts`, `src/settlement/livestock.ts`, `src/settlement/createSettlement.ts`, `src/settlement/SettlementsManager.ts`, `src/app/worldBundle.ts`, `src/app/createApp.ts`, `src/ui-vue/screens/QuestLogScreen.vue`, `src/terrain/chunkEnvironment.ts`, `src/settlement/props.ts` (reużycie `tintPropMaterials`, bez zmian).

## Czego nie implementować

Osobny model 3D groźnego wilka, `DangerousWolfManager`/`SpecialAnimalManager`, quest-corpse-system, Quest Problem Generator, pełny system `visit_landmark`/`interact_landmark`, landmark discovery UI, nowy Household ownership system, rozbudowany reason-code framework, pełna persystencja fauny.

## Weryfikacja

**Techniczna:**
```
npx tsc --noEmit
npm run lint
npm run build
npm run test
```
Testy: `active → failed`, `active → invalidated`, brak nagrody w obu, save/load zachowuje nowe stany, `find_animal` + `animal_died` → `failed` vs `kill_target_animal` + `animal_died` → advance, wild-fauna quest → `invalidated` po restore, livestock quest → rebind po restore, determinizm `landmarkId`.

**Przeglądarka/manualna** (dev server, poprosić usera o wykonanie):

1. Groźny wilk — relacja `trusted` z Anną, accept, znalezienie wizualnie wyróżnionego wilka, potwierdzenie różnicy HP/damage, zabicie, potwierdzenie że śmierć innego wilka nie kończy questa, turn-in.
2. Zagubiona owca — sukces: accept, znalezienie targetu, interact, turn-in.
3. Zagubiona owca — failure: accept, śmierć targetu, potwierdzenie `failed`, odnalezienie zwłok jako właściwego zwierzęcia, brak crasha po zniknięciu zwłok, brak możliwości turn-in.
4. Save/load: aktywny animal-bound quest przed i po śmierci; potwierdzenie rebind dla livestock i `invalidated` dla dzikiej fauny.
5. Landmark: znalezienie, opuszczenie chunku, powrót, potwierdzenie stabilnego id (tymczasowy console.log lub istniejący debug overlay).

Implementation notes muszą jasno rozdzielić: zaimplementowane / zweryfikowane technicznie / zweryfikowane w przeglądarce.
