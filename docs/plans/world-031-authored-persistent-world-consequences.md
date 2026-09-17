# Plan: Authored Persistent World Consequences

**Created:** 2026-09-17
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `world`
**Type:** `infrastructure`
**Subdomains:** `places` `events` `simulation`
**Tags:** `quests` `persistent-world` `authored-content` `persistence`
**Roadmap:** `quests-professions-and-world-consequences.md`
**Model:** Opus, Sonnet

## Cel

Dodać najmniejszy wspólny foundation dla trwałych, authored zmian świata odblokowywanych przez quest outcome albo inny jednoznaczny world-domain fact:

```text
quest outcome / world-domain fact
→ activate authored consequence id
→ persistent world-owned activation exists
→ właściwy domain materializuje zmianę, kiedy może
→ normalne world/settlement systems używają własnego obiektu/stanu
```

Foundation nie jest właścicielem outpostu, farmy, ruin, NPC, construction progress ani inventory. Jego jedynym authoritative stanem jest odpowiedź na pytanie:

> Czy predefined authored consequence `X` została trwale aktywowana w tym save?

Pierwsze przewidywane consumery:

- wolf den → nowy outpost;
- abandoned farm → inhabited/restored farm;
- ruin → road stop;
- inne małe authored miejsca/infrastruktura powstające już po rozpoczęciu gry.

## Decyzja architektoniczna

### 1. Potrzebny jest mały world-owned activation registry

Aktualne mechanizmy nie mają właściciela o właściwej semantyce:

- `QuestManager` owns `QuestProgressEntry`, outcome i player↔NPC relations — nie world objects;
- `SaveWorldFlags` jest zbiorem konkretnych story/gameplay flag, nie domain API dla materializacji świata;
- `SettlementStructureStateRegistry` przechowuje condition/repair **istniejących** struktur settlementu keyed po `VillageBuildingPlan.id`; nie odpowiada za tworzenie nowych struktur/miejsc;
- `settlementPlanCache` i persistent `settlement-definitions` cache są deterministic/disposable worldgen, nie gameplay persistence;
- `settlement/places.ts::Place` jest lekkim settlement-local targetem dla home/work/social, nie globalnym world-place registry;
- `WorldLocationCatalog` opisuje deterministycznie rekonstruowane miejsca z worldgenu i knowledge/navigation; nie jest runtime mutation store.

Wprowadzić więc jeden mały owner, np. `AuthoredWorldConsequenceRegistry`, żyjący w `WorldBundle`.

Registry przechowuje wyłącznie sparse set aktywnych stable IDs. Nie przechowuje payloadów opisujących świat.

### 2. Definicje są authored i statyczne

W `src/world/` dodać mały kontrakt definicji, np. `AuthoredWorldConsequenceDefinition` + katalog przekazywany przy composition/build.

Definicja musi mieć co najmniej:

```ts
id: AuthoredWorldConsequenceId
```

Może zawierać tylko metadata potrzebne do walidacji/routingu do właściwego domain ownera. Nie umieszczać w niej arbitrary runtime JSON, NPC positions, HP, inventory, building progress, schedules ani quest scripting.

Production consequence IDs mają pochodzić z predefined definitions w kodzie. `activate()` nie może tworzyć dowolnej nowej definicji z runtime payloadu.

Foundation nie musi dodawać konkretnego outpostu/farmy/road-stopu; pierwsze production definitions mogą wejść z planami content/domain, które konsumują ten mechanizm. Testy foundation mogą używać fixture definitions.

### 3. Stable identity

`AuthoredWorldConsequenceId` jest semantycznym, niezmiennym identyfikatorem authored contentu, np. przyszłe:

```text
outpost:forest-road-01
farm:abandoned-east-01
road-stop:old-ruins-01
```

ID nie może zależeć od:

- runtime creation order;
- czasu (`Date.now()`);
- stream-in order;
- mesh/index identity;
- aktualnego quest stage index;
- display name.

Jeżeli materializowany domain object potrzebuje własnych child IDs, jego owner wyprowadza je deterministycznie z consequence ID / swojej authored definition. Registry nie generuje child IDs.

### 4. Authoritative ownership

Podział ownership jest jednoznaczny:

```text
QuestManager / world-domain condition
  owns trigger fact / quest outcome
               │
               ▼
AuthoredWorldConsequenceRegistry (WorldBundle)
  owns: consequence X activated?
               │ read-only activation query
               ▼
settlement/world domain materializer
  owns: concrete place/structure/object state
               │
               ▼
normal systems
```

Quest outcome może być przyczyną aktywacji i pozostaje normalnie zapisany w `SaveData.quests`, ale nie jest source of truth dla istnienia consequence. Nie rekonstruować registry przez skanowanie zakończonych questów przy każdym loadzie.

Powód: ten sam mechanizm ma wspierać także world-domain triggers, consequence ma przeżyć zmiany/wycofanie questa, a domain state nie może zależeć od aktywnego quest definition.

### 5. Brak wspólnego lifecycle `locked → construction → active`

Foundation nie wprowadza generic lifecycle.

- `locked` = brak ID w activation registry;
- po `activate(id)` consequence istnieje jako persistent fact;
- jeżeli konkretny consumer ma `construction → active`, jego stan należy do jego domain object/registry, np. tak jak `PlayerWellRecord.stage/workProgress` należy do wella, a nie do work contractu.

To zapobiega kopiowaniu building progress do world consequence state i pozwala farmie/road-stopowi mieć inny lifecycle niż outpost.

## Istniejące mechanizmy do reuse

### WorldBundle save/rebuild boundary

`src/app/worldBundle.ts` jest właściwym lifetime ownerem registry.

Wzorzec jest już używany przez persisted world/settlement state:

```text
initial save snapshot
→ createWorldBundle(... initial state ...)
→ live domain owner
→ buildSaveData() reads owner snapshot

WorldBundle rebuild:
live owner snapshot
→ dispose/rebuild
→ same constructor input
```

Registry musi wejść dokładnie w ten sam boundary. Nie tworzyć osobnego hydration pass po zbudowaniu świata.

### Persistence

`src/persistence/saveData.ts` pozostaje serialization contract, nie runtime ownerem.

Dodać sparse save field dla aktywnych IDs, np.:

```ts
authoredWorldConsequences: string[]
```

lub równoważny nazwany save type, jeśli implementacja poprawia walidację/czytelność. Zapis zawiera tylko aktywację, nie definition payload.

Zmiana canonical `SaveData` wymaga normalnego schema-version bump + kolejnej fail-closed migration defaultującej pole do pustego zbioru/listy, aktualizacji validatora i fixtures/tests. Nie hardcodować w planie przyszłego numeru wersji — przy implementacji użyć wtedy aktualnego `CURRENT_SAVE_VERSION`.

`src/app/saveState.ts::buildSaveData()` ma pobierać snapshot bezpośrednio z registry.

### Persistent player-built world objects

`createPlayerWells()` i podobne systemy pokazują właściwy reconstruction pattern:

```text
plain domain record
→ creator(initial records)
→ materialized mesh/collider
→ nodes()/snapshot
→ save/rebuild
```

Nie kopiować ich runtime-generated ID (`Date.now()` itp.). Authored consequence ma semantic stable ID.

### Settlement structures

`VillagePlan` / `VillageBuildingPlan.id` + `SettlementStructureStateRegistry` pokazują właściwe rozdzielenie:

```text
deterministic immutable definition
+
sparse mutable authoritative state keyed by stable id
```

Nie dopisywać runtime consequence do `VillagePlan` ani `settlementPlanCache`.

Jeżeli późniejszy consumer tworzy settlement-owned strukturę, ma ona wejść do właściwego settlement/domain state z własnym stable structure id i dalej korzystać z istniejących condition/repair/workplace/inventory mechanizmów tam, gdzie pasują.

### Authored resident injection

Lost Treasure Chronicles elder/archaeologist/specialist pokazują deterministic authored injection do generation-time `SettlementDef`: host selection jest stabilny, rodzina ma authored stable ID, a następnie staje się zwykłym residentem przed staffing/VillagePlan.

Ten mechanizm jest dobrym precedentem dla **stable authored identity**, ale nie może być bezpośrednio użyty do runtime consequence activation: `settlementPlanCache` nie może stać się save-aware i mutable. Runtime consequence musi zostać nałożona przez domain materialization seam po stronie runtime settlement/world ownera.

### Quest outcomes/effects

`QuestManager` już:

- persystuje `resolvedOutcomeId` w `QuestProgressEntry`;
- aplikuje terminal outcome exactly once;
- ma `QuestStageEffect` używany także przez terminal `QuestOutcome.effects`;
- dispatchuje efekty przez injected lifecycle/domain hooks zamiast importować world systems bezpośrednio.

Rozszerzyć ten istniejący effect seam o jeden narrow effect/hook aktywujący predefined consequence ID. Nie dodawać quest-local world-state mapy ani nowego scripting layer.

### Wolf den

`Fauna.isWolfDenCleared()` i spawn-point lifecycle są world/fauna facts; quest jedynie obserwuje stable `WOLF_DEN_ID`. To jest właściwy kierunek zależności.

Przyszłe `wolf den → outpost` ma użyć właściwego terminalnego/world fact jako triggera `activate(consequenceId)`, ale stan denu nie jest kopiowany do consequence registry, a world-031 nie zmienia fauna lifecycle.

### `Place` i `WorldLocation`

- `settlement/places.ts::Place` może później reprezentować workplace/social/home wewnątrz aktywnego outpostu, ale nie jest ownerem consequence.
- `WorldLocation` może być później projekcją aktywnego miejsca do discovery/map/navigation, jeżeli konkretny plan tego potrzebuje. Foundation nie mutuje `WorldLocationCatalog` i nie zapisuje tam activation state.

## Publiczny kontrakt foundation

Minimalne API registry:

```ts
isActive(id): boolean
activate(id): boolean
snapshot(): readonly AuthoredWorldConsequenceId[]
```

Semantyka:

- `activate(id)` waliduje, że ID ma predefined definition;
- pierwsza aktywacja dodaje ID i zwraca `true`;
- kolejna aktywacja tego samego ID jest no-op i zwraca `false`;
- `isActive()` jest read-only seam dla domain consumers;
- `snapshot()` zwraca stabilnie uporządkowane/deterministyczne plain data do save/rebuild.

Jeżeli implementation potrzebuje `getDefinition(id)` do routingu/materializacji, metoda pozostaje read-only i zwraca statyczną definition, nie mutable state.

Nie expose'ować mutowalnego `Set` ani registry internals.

## Materialization flow

Activation i physical materialization są rozdzielone:

```text
activate("outpost:forest-road-01")
→ registry zapisuje trwały fact natychmiast
→ target settlement/chunk może być unloaded
→ niczego nie force-loadujemy
→ przy późniejszym normalnym stream-in/build domain owner pyta isActive(id)
→ materializuje własny authored object ze stable object id
→ kolejne rebuild/stream-in rekonstruują ten sam obiekt, nie drugi egzemplarz
```

Foundation ma zapewnić read-only activation dependency na composition seams potrzebne przyszłym consumerom. Nie ma aktywnie skanować świata ani trzymać mesh refs.

Dla settlement consumerów właściwy seam to `WorldBundle` → `createSettlementsManager()` → normalny settlement creation/stream-in path. Nie mutować `SettlementDef` cache. Plan `settlements-npcs-044` może rozszerzyć ten seam o konkretny outpost/construction materializer.

Dla world-global/chunk consumerów analogicznie registry jest dependency world ownera, a konkretny plan wybiera jego istniejący materialization seam. world-031 nie tworzy generic materializer registry/dispatcher tylko po to, aby obsłużyć hipotetyczne domeny.

## Idempotency

Idempotency musi istnieć na dwóch poziomach:

1. **activation** — `activate(id)` jest set-like i nie tworzy drugiego wpisu;
2. **domain materialization** — concrete object ma stable ID derived z authored definition/consequence ID i jego owner musi traktować ponowny stream-in/rebuild jako reconstruction tego samego obiektu.

Quest completion, save/load, config rebuild i settlement unload/load nie mogą zwiększać liczby obiektów.

Nie używać mesh presence jako guardu. Mesh może zostać zniszczony podczas unload i poprawnie powstać ponownie.

## Save/load i rebuild

Implementacja musi przejść cały istniejący lifecycle:

```text
new game
→ empty consequence registry

activation
→ registry contains stable id

save
→ buildSaveData() snapshots active ids

continue
→ migration/validation
→ createWorldBundle(initial consequence ids)
→ registry reconstructed before dependent domain materialization

WorldBundle rebuild
→ snapshot current registry
→ new bundle receives same snapshot

settlement unload/load
→ registry remains alive
→ streamed settlement reads same activation fact when recreated
```

Nie używać persistent worldgen cache do tego stanu. Cache może zostać usunięty bez utraty consequence.

## Quest integration

Dodać do istniejącego `QuestStageEffect`/terminal outcome effect mały efekt w rodzaju:

```ts
{ type: 'activate_world_consequence', consequenceId }
```

Dokładna nazwa może zostać dostosowana do aktualnego naming w `quests.ts`, ale semantyka jest jedna.

`QuestManager` dispatchuje go przez injected callback/hook. Nie importuje registry ani `WorldBundle` bezpośrednio.

Efekt może być authored na terminal outcome, a jeśli przyszły content potrzebuje activation na stage action, ten sam obecny effect machinery może go wykonać; foundation nie tworzy osobnego quest-only API.

`validateQuestDefinitions()` powinien odrzucać nieznane authored consequence IDs przez injected/precomposed definition knowledge albo walidację composition-level — nie pozwalać typo stringowi tworzyć martwego persistent factu.

## Read API dla innych systemów

Rozróżnić dwa odczyty:

- `consequences.isActive(id)` — tylko fakt authored progression;
- concrete domain lookup — fizyczny obiekt i jego pełny stan.

Po materializacji NPC AI, transport, merchant, economy itd. powinny preferować normalny domain object/place API. Nie powinny czytać consequence registry zamiast istniejącego settlement/world ownera, jeśli potrzebują pozycji, inventory, staffingu czy condition.

## Zakres implementacji

### Dodać

- mały authored consequence definition contract + registry w `src/world/`;
- stable-ID validation i idempotent `activate`;
- `WorldBundle` ownership i initial/rebuild snapshot wiring;
- `SaveData` field + migration + validation + save assembly/restore;
- read-only activation seam dla composition/domain consumers;
- narrow `QuestStageEffect` / injected hook dla activation;
- focused tests aktywacji, persistence, rebuild wiring i quest exact-once dispatch;
- JSDoc dla publicznych/architektonicznych typów/funkcji z `@domain world` tam, gdzie pomaga preflight.

### Nie dodawać

- konkretnego outpostu/farmy/road-stopu;
- outpost NPC/staffing/schedules;
- construction work/progress/material costs;
- merchant/transport integration;
- farm simulation/livestock;
- bridge construction;
- nowych questów/contentu;
- generic event engine/DSL;
- generic materializer/plugin registry;
- mutable settlement worldgen definitions;
- arbitrary runtime consequence payloadów.

## Exact existing seams do zmiany/reuse

Główne:

```text
src/world/                         # nowy small registry/definition contract
src/app/worldBundle.ts             # WorldBundle lifetime + rebuild carry
src/app/saveState.ts               # buildSaveData snapshot
src/persistence/saveData.ts        # SaveData + migration + validation
src/quests/quests.ts               # existing QuestStageEffect + definition validation
src/quests/QuestManager.ts         # existing effect dispatch, injected activation hook
src/app/createApp.ts               # composition: QuestManager hook → live bundle registry
```

Do reuse/validation, bez przejmowania ownership:

```text
src/settlement/SettlementsManager.ts
src/settlement/settlementPlanCache.ts
src/settlement/settlementGenerator.ts
src/settlement/lostTreasureChroniclesElderResident.ts
src/settlement/structureStateRegistry.ts
src/settlement/villagePlan.ts
src/settlement/places.ts
src/world/playerWell.ts
src/world/createPlayerWells.ts
src/world/worldGeneratedContainers.ts
src/world/locations/worldLocationTypes.ts
src/world/locations/worldLocationCatalog.ts
src/fauna/createFauna.ts
src/fauna/AnimalSpawner.ts
```

## Walidacja kontraktu na przyszłych use cases

### Wolf den → outpost

- fauna/world fact: den resolved/cleared/destroyed zgodnie z przyszłym content planem;
- quest/world trigger: `activate("outpost:forest-road-01")`;
- registry persists activation nawet gdy target settlement/region jest unloaded;
- outpost plan materializuje concrete settlement/world structures i owns construction/staffing;
- repeated quest resolution/reload nie tworzy drugiego outpostu.

### Abandoned farm → inhabited farm

- site/quest resolution aktywuje predefined farm consequence;
- consequence registry nie przechowuje residents/livestock/stock;
- farm domain materializer tworzy/odtwarza swoje stable objects;
- późniejsze household/livestock systems przejmują normalny stan.

### Ruin → road stop

- resolved ruin aktywuje predefined road-stop consequence;
- activation może nastąpić, gdy miejsce jest poza loaded chunks;
- physical stop pojawia się przy późniejszym normalnym materialization;
- merchant/transport korzystają później z normalnego place/endpoint/domain API, nie z quest state.

Wszystkie trzy scenariusze mieszczą się w jednym kontrakcie bez wspólnego construction lifecycle i bez universal transformation graphu.

## Testy

Co najmniej:

1. registry przyjmuje tylko predefined ID;
2. `activate(id)` jest idempotentne;
3. snapshot jest deterministic i round-tripuje;
4. migration starszego save daje pustą aktywację bez zmiany starego świata;
5. SaveData validation akceptuje poprawne IDs/shape i odrzuca malformed data;
6. `buildSaveData()` zapisuje live registry snapshot;
7. initial load rekonstruuje registry przed consumer materialization;
8. `rebuildWorldBundle()` zachowuje activation;
9. settlement stream-out/in nie usuwa activation;
10. quest terminal outcome dispatchuje activation exactly once nawet przy ponownych interaction/reload paths;
11. aktywacja unloaded targetu nie wymusza jego loadu;
12. fixture materializer ze stable object id nie duplikuje obiektu przy ponownej materializacji.

Nie uruchamiać browser verification dla samego planu/implementacji foundation; automated verification zgodnie z obecnym test setupem. Nie uruchamiać `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
