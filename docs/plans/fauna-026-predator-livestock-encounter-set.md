# Plan: Predator ↔ livestock encounter set

**Created:** 2026-09-12
**Status:** `verification needed` 🔍 (implemented 2026-09-12 — see implementation notes' "Deviation from plan" section for one corrected assumption)
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `fauna`
**Type:** `fix`
**Subdomains:** `predation` `domestication` `lifecycle`
**Tags:** `predators` `livestock` `encounters` `shepherd` `dogs` `streaming`
**Roadmap:** -
**Model:** Sonnet, Composer

## Cel

Naprawić potwierdzoną lukę w fauna simulation: dziki drapieżnik ma móc realnie wybrać household livestock jako prey, utrzymać pursuit, dogonić je, zaatakować i zabić przez istniejący `AnimalAgent` combat/predation flow.

Docelowy production flow:

```text
wild predator update
→ bounded caller-supplied livestock encounter candidates
→ existing wild-prey candidate resolution + livestock candidate resolution
→ one committed prey target
→ existing chase
→ existing AnimalAgent.attack()
→ existing target.takeDamage()
→ existing livestock collapse/onDeath/persistence
→ huntingPrey().ownerHouseId
→ shepherd / dog / quest-world consequence consumers
```

To jest naprawa composition seam, nie nowy predator system.

## Potwierdzony stan na `main`

Recon 2026-09-12 potwierdza finding C2 / G2 z Living World Audit także na aktualnym kodzie:

1. `src/fauna/createFauna.ts` przekazuje każdemu wild `AnimalAgent` wyłącznie `others: agents`, czyli wild pool.
2. `src/settlement/livestock.ts::tickSettlementLivestock()` przekazuje livestock wyłącznie `others: livestock` własnego settlement/detached ticka.
3. `src/fauna/AnimalAgent.ts::resolvePreyTarget()` korzysta z `nearest(others, 'prey', detectRange)`, więc nawet ręczne połączenie tablic nadal odrzuci `role: 'livestock'`.
4. `src/fauna/animalDefs.ts` świadomie rozdziela `AnimalRole = 'predator' | 'prey' | 'livestock'`; dog jest m.in. kontrprzykładem pokazującym, że dieta/combat nie oznacza hunting role.
5. `AnimalAgent.updatePredator()` → `attack()` → `target.takeDamage()` → death/corpse lifecycle już istnieje i nie wymaga drugiego combat systemu.
6. `AnimalAgent.huntingPrey()` już zwraca `{ animalId, ownerHouseId }`, ale `ownerHouseId` może być ustawione tylko dla livestock, którego wild predator obecnie nie może wybrać.
7. `app/gameLoop.ts` buduje `threateningAnimals` z `huntingPrey()` i przekazuje je do settlements/NPCs. `shepherdFlock.ts::senseOwnedFlockThreat()` jest więc poprawnym downstream consumerem, ale produkcyjnie nie dostaje dziś livestock prey commitment.
8. `dogGuard.ts::resolveDogGuardTarget()` widzi wyłącznie `wolf.npcTarget`; obecny dog guard broni ludzi, nie flocku, więc samo odblokowanie `huntingPrey().ownerHouseId` nie wystarczy dla psa.
9. `animalStray.ts::predatorPressureAt()` już modeluje realne ryzyko drapieżnika przy stray destination, ale dziś ryzyko to nie może przejść w predator → livestock kill.
10. Livestock death ma istniejący `onAnimalDeath(animalId)` lifecycle; predator kill ma przez niego przejść dokładnie tak samo jak inne źródła obrażeń.

Dziura jest przed chase/combat: **composition + huntability classification**.

## Architektura docelowa

### Jednoznaczne ownership

Nie zmieniać ownerów stanu:

```text
wild fauna
→ nadal owned przez Fauna / createFauna runtime pool
→ ordinary wild individuals nadal nie są livestock-persisted

household / player livestock
→ nadal AnimalAgent owned przez SettlementsManager/LivestockRegistry lifecycle
→ nadal per-individual persistence + tombstones
→ AnimalOwner nadal jest canonical ownership

encounter set
→ read-only, per-fauna-pass view pożyczający live AnimalAgent references
→ nie posiada stanu
→ nie persistuje się
→ nie tickuje livestock
```

`ownerHouseId` pozostaje derived compatibility accessor z `AnimalOwner`; nie tworzyć drugiej kopii ownership w encounter DTO.

### Nie łączyć `others`

Nie wrzucać livestock do `others: agents` i nie robić jednego globalnego poola.

`others` pozostaje lokalnym pool contractem używanym przez istniejące fauna behaviours. Nowy seam ma być jawny, np. semantycznie:

```ts
AnimalUpdateContext.huntableLivestock?: readonly AnimalAgent[]
```

oraz wymagany caller-level argument na `Fauna.update(...)`, aby production composition nie mogło przypadkiem go pominąć.

Dokładna nazwa może zostać dopasowana do aktualnego stylu kodu, ale semantyka musi pozostać narrow: **external live livestock candidates available to predator prey acquisition for this fauna pass**.

## 1. Composition root: skąd predator dostaje livestock candidates

Ownerem composition pozostaje `src/app/gameLoop.ts`, bo już tam spotykają się:

- `bundle.fauna.getAgents()`,
- `bundle.settlementsManager.getLoaded()`,
- `bundle.settlementsManager.getDetachedLivestock()`,
- `threateningAnimals`,
- `nearbyWolves`,
- `SettlementsManager.update(...)`,
- `Fauna.update(...)`.

Budować encounter candidates **po `SettlementsManager.update(...)` i przed `Fauna.update(...)`** z aktualnie materialized livestock:

```text
loaded settlements' Settlement.livestock
+ SettlementsManager.getDetachedLivestock()
→ alive role:'livestock' candidates
→ dedupe by animalId
→ Fauna.update(..., huntableLivestock)
```

Kolejność po settlement update jest ważna:

- świeżo stream-in livestock może wejść do aktualnego passa,
- właśnie stream-out settlement nie zostawia disposed referencji w nowo zbudowanej liście,
- detached list po własnym ticku jest już oczyszczona z disposed/removal entries.

Preferować mały pure/allocation-conscious helper na poziomie composition, np. `src/app/faunaEncounterComposition.ts`, zamiast rozbudowywać `gameLoop.ts` o kolejną dużą inline sekcję. Helper nie może stać się managerem ani właścicielem stanu.

## 2. Bounded spatial search i koszt CPU

Nie skanować `LivestockRegistry` ani wszystkich persisted records.

V1 operuje tylko na materialized candidates:

- livestock z aktualnie loaded settlements,
- detached live livestock,
- bez unloaded snapshots.

Exact encounter radius nadal należy do drapieżnika i używa istniejącego `AnimalDef.detectRange`.

Model kosztu:

```text
composition: O(L_local)
predator resolution: O(P_live × L_local)
```

`L_local` jest ograniczone przez settlement streaming/materialization i nie jest globalną populacją świata. Nie dodawać per-predator skanu wszystkich settlements ani persistence registry.

Jeżeli profiling po implementacji pokaże, że lokalny encounter set rośnie zbyt mocno, przyszłym rozszerzeniem może być istniejący spatial/chunk lookup. Nie budować nowego spatial index prewencyjnie w tym planie.

## 3. Huntability bez psucia taxonomy

Nie zmieniać żadnego livestock `AnimalDef.role` na `'prey'`.

W `AnimalAgent.resolvePreyTarget(...)` rozdzielić dwa źródła:

1. existing wild prey: `others` + `role === 'prey'`,
2. caller-classified livestock encounter candidates: wymagane `role === 'livestock'`, live, w `detectRange`.

To jest encounter capability, nie taxonomy migration.

V1 nie dodaje nowej species compatibility matrix. Obecny predator model już jest coarse-grained (`role:'predator'` poluje na dowolne `role:'prey'`); livestock extension ma zachować ten poziom ogólności zamiast przy okazji projektować osobne reguły wolf→sheep / fox→chicken / bear→cow.

Jeżeli później potrzebna będzie ekologiczna macierz prey size/species, powinna rozszerzyć jeden wspólny predation-compatibility contract, nie ten plan przez `kind === ...` branche.

## 4. Wybór między wild prey i livestock

Zachować istniejący committed-target model.

Resolver powinien:

1. utrzymać current prey, jeżeli nadal jest legalnym kandydatem, żyje i pozostaje w `detectRange`,
2. znaleźć nearest wild prey przez istniejący path,
3. znaleźć nearest livestock candidate przez nowy bounded path,
4. wybrać bliższy target,
5. przy równym dystansie użyć stabilnego deterministic tie-break (`animalId`) albo zachować już committed target.

Brak `Math.random()` w wyborze.

Gdy `huntableLivestock` jest puste, zachowanie wild predator → wild prey ma pozostać semantycznie takie jak dziś; nie robić szerokiej przebudowy `nearest()`.

## 5. Krytyczna rewalidacja committed external target

Dzisiejsze `preyTarget: AnimalAgent | null` zakłada, że target należy do tego samego runtime poola i nie znika przez obcy streaming lifecycle.

Po dodaniu cross-pool targetu to założenie przestaje być prawdziwe.

Przed ponownym użyciem committed targetu resolver musi potwierdzić, że target nadal znajduje się w aktualnym źródle kandydatów:

- wild prey → nadal obecny w `others`,
- livestock prey → nadal obecny w bieżącym `huntableLivestock` encounter set.

Jeżeli settlement stream-out/dispose usunął livestock, predator ma wyczyścić commitment i ponownie rozstrzygnąć prey; nie może chase/attack stale disposed reference.

Nie persistować `preyTarget` i nie dodawać cross-manager ownership targetu.

## 6. Chase, attack, damage i livestock death

Po resolved prey nie dodawać żadnego livestock-specific combat path.

Reuse dokładnie:

```text
updatePredator()
→ setIntent('chase')
→ stepNavRescue(...)
→ CONTACT_RANGE
→ attack(target)
→ target.takeDamage(...)
→ collapse()
→ existing onDeath
```

Nie wołać `LivestockRegistry` z predatora i nie mutować household bezpośrednio.

Livestock death/corpse pozostaje stanem tego samego `AnimalAgent`; przy późniejszym snapshot/capture jego istniejący persistence path ma zachować rezultat.

Ten plan nie rozszerza scavenging/carcass consumption o livestock corpse. Jeśli po wdrożeniu okaże się, że predator kill powinien także automatycznie wejść do existing carcass-foraging source set, zrobić osobny recon małego seamu — nie łączyć tego z samym encounter acquisition bez testów ledger/corpse ownership.

## 7. Ownership context i downstream signals

### `huntingPrey().ownerHouseId`

Nie zmieniać publicznego kontraktu. Po realnym livestock prey commitment obecne:

```ts
{ animalId, ownerHouseId: preyTarget.ownerHouseId }
```

zacznie nieść prawdziwy household context.

### Shepherd

`gameLoop.ts` już mapuje `huntingPrey()` do `ThreateningAnimalCandidate.preyAnimalId/preyOwnerHouseId`, a `senseOwnedFlockThreat()` już filtruje po own household.

Nie tworzyć nowego shepherd threat API.

Akceptowalny jest obecny one-frame composition lag: `threateningAnimals` jest budowane przed bieżącym `Fauna.update`, więc nowy prey commitment jest widoczny dla settlement/NPC passa od kolejnej klatki. To jest obecny contract, nie powód do reorder całego game loopa.

### Dog guard

Samo odblokowanie prey nie naprawi dog guard, bo `DogGuardWolfCandidate` niesie dziś tylko `npcTarget`.

Rozszerzyć istniejący `dogGuard.ts` contract tak, aby own-household tier rozpoznawał również wilka, którego `huntingPrey()` wskazuje livestock z `preyOwnerHouseId === dog.ownerHouseId`.

Guard target nadal jest wilkiem i walka nadal idzie przez `AnimalAgent.updateDogGuard()` → existing `attack(wolf)`.

Nie dodawać osobnego `FlockGuardSystem`. Assist dla obcego household pozostaje istniejącą NPC-assist semantyką; V1 musi co najmniej bronić własnego livestock.

### Quest/world consequences

Predator-caused livestock death ma używać istniejącego `onAnimalDeath(animalId)` i live/persisted animal state. Nie tworzyć `onPredatorKilledLivestock` eventu, jeśli existing death + source lookup wystarcza.

Lost-livestock/death outcomes mają dzięki temu obserwować realny dead/corpse state zamiast scripted consequence.

## 8. Detached i stray livestock

Encounter set ma obejmować `SettlementsManager.getDetachedLivestock()`.

Dziś detached path dotyczy przede wszystkim player-owned persistent animals; po rozwiązaniu osobnego H10/streaming gap może obejmować także household stray/led animals. Dlatego huntability nie może być zakodowane jako "tylko `Settlement.livestock`".

Reguła:

```text
materialized AnimalAgent
+ role === 'livestock'
+ alive
→ może być caller-supplied huntable candidate
```

Ownership nie decyduje, czy drapieżnik fizycznie może zaatakować. Ownership decyduje o downstream context:

- household owner → `ownerHouseId` dla shepherd/dog/quests,
- player owner → brak `ownerHouseId`, ale nadal realny target,
- future detached household stray → zachowuje household owner i signal.

Nie naprawiać w tym planie H10: obecny non-home stream-out może nadal zmaterializowane household stray schować do snapshotu zamiast utrzymać detached agent. Ten plan ma tylko poprawnie obsłużyć każdy livestock agent, który **jest** materialized.

## 9. Stream-in / stream-out i off-screen semantics

### Stream-in

Po zbudowaniu settlementu jego live livestock pojawia się w kolejnym encounter composition pass. Nie ma migration do wild pool.

### Stream-out

`SettlementsManager.update()` może capture/dispose settlement przed bieżącym `Fauna.update()`. Dlatego encounter set jest budowany później i committed external target jest membership-revalidated.

Jeżeli livestock zniknęło z detailed simulation, predator przerywa commitment bez zadawania "ostatniego" hitu disposed agentowi.

### Off-screen / hybrid

V1 nie dodaje aggregate off-screen predation i nie symuluje zabójstw na unloaded snapshots.

Semantyka ma jednak być off-screen-friendly:

- huntability jest czystą relacją między predator state, candidate state i spatial range,
- ownership jest plain state (`AnimalOwner`),
- outcome używa istniejącego damage/death lifecycle,
- kamera/player nie jest warunkiem huntability.

Streaming wybiera tylko fidelity/materialization. Przyszły coarse off-screen resolver może reuse'ować te same zasady bez konieczności łączenia persistence pools.

## 10. Brak double interaction

Guardrails:

- livestock pozostaje tickowane dokładnie raz przez settlement/detached lifecycle,
- `Fauna.update()` nie wywołuje `update()` na livestock candidate,
- livestock nie jest dopisywane do wild `agents`,
- livestock nie jest dopisywane do wild `others`,
- encounter set jest deduplikowany po `animalId`,
- predator damage idzie tylko przez istniejące `attack(target)`/`takeDamage()`,
- dog counterattack jest osobnym, istniejącym combat action guardującego psa, nie drugim predator hit path,
- persistence capture pozostaje tylko w `LivestockRegistry`,
- wild fauna persistence semantics pozostają bez zmian.

## 11. Pliki i symbole

### Zmiany wymagane

- `src/app/gameLoop.ts`
  - composition po `SettlementsManager.update()` i przed `Fauna.update()`,
  - przekazanie aktualnego encounter setu do `Fauna.update()`.
- `src/app/faunaEncounterComposition.ts` — nowy mały pure/bounded helper tylko jeśli dzięki temu production wiring i dedupe są testowalne bez rozbudowy `gameLoop.ts`.
- `src/fauna/createFauna.ts`
  - `Fauna.update` przyjmuje wymagany read-only livestock candidate set,
  - przekazuje go do wild `AnimalAgent.update()`; nie staje się jego ownerem.
- `src/fauna/AnimalAgent.ts`
  - `AnimalUpdateContext`,
  - `resolvePreyTarget`,
  - `updatePredator`,
  - current prey membership revalidation,
  - bez zmian w `attack()`/`takeDamage()` poza ewentualnym test-support/refactor koniecznym do nowego resolvera.
- `src/fauna/dogGuard.ts`
  - existing wolf candidate contract + own-household livestock-prey signal.

### Reuse / bez zmiany ownership

- `src/fauna/animalDefs.ts` — taxonomy pozostaje bez zmian.
- `src/fauna/animalOwnership.ts` — `AnimalOwner` / `deriveOwnerHouseId()` pozostają authority.
- `src/settlement/livestock.ts` — existing tick/death/persistence; nie tworzyć predator adaptera tutaj.
- `src/settlement/SettlementsManager.ts` — reuse `getLoaded()` + `getDetachedLivestock()`; nie dodawać globalnego animal registry.
- `src/fauna/shepherdFlock.ts` — existing `senseOwnedFlockThreat()` powinien zacząć działać z realnym signalem; zmiana tylko jeśli test ujawni rzeczywisty mismatch.
- `src/fauna/animalStray.ts` — `predatorPressureAt()` bez nowego parallel pressure.

## 12. Determinism

Zachować deterministic behaviour tam, gdzie obecny system już je ma:

- żadnego `Math.random()` w candidate selection,
- stable target commitment,
- exact range z `AnimalDef.detectRange`,
- tie-break niezależny od przypadkowej kolejności settlement stream-in, najlepiej po `animalId`,
- dedupe po stable `animalId`,
- brak zależności od camera facing / render visibility / label state.

## 13. Testy — obowiązkowo production composition, nie tylko ręczny shared array

### Composition

1. `faunaEncounterComposition` zbiera live livestock z loaded settlements.
2. Dodaje detached livestock.
3. Deduplikuje ten sam `animalId`.
4. Nie zwraca dead/non-livestock candidates.
5. Nie czyta persisted unloaded `LivestockRegistry` records.
6. `Fauna.update` ma wymagany candidate argument, żeby TypeScript wymuszał production wiring w `gameLoop.ts`.

### Predator resolution

7. Wild wolf z `others` zawierającym wyłącznie wild agents może wybrać sheep przekazaną osobno przez livestock encounter set.
8. Sheep nadal ma `role === 'livestock'`; test nie może zmieniać jej na `'prey'`.
9. Nearest wybór rozstrzyga poprawnie wild deer vs nearer/farther livestock.
10. Exact-distance tie jest deterministic.
11. Out-of-range livestock nie jest targetem.
12. Po usunięciu committed livestock z następnego encounter setu wolf natychmiast porzuca stale target i nie zadaje mu kolejnego damage.

### Real damage/death/downstream

13. Predator przez normalny update/chase/attack może obniżyć HP livestock i doprowadzić do death; nie wywoływać prywatnego `attack()` bezpośrednio jako jedynego dowodu.
14. Livestock `onAnimalDeath` fires exactly once po predator kill.
15. `huntingPrey()` dla committed household sheep zwraca jej realny `animalId` + `ownerHouseId`.
16. Output z tego commitmentu jest akceptowany przez `senseOwnedFlockThreat()` dla właściwego household, a ignorowany dla obcego.
17. Dog guard wybiera wilka polującego na livestock własnego household i przestaje go wybierać po death/retarget/disengage.
18. Persistence regression: snapshot/capture zabitego livestock zachowuje dead state; wild fauna nie trafia do livestock registry.

Najważniejszy regression test ma odwzorować **dwa osobne production pools**. Istniejący test z wolf+sheep ręcznie wrzuconymi do jednego `others` nie jest wystarczający i nie może być jedyną ochroną.

## 14. Edge cases

Uwzględnić:

- target umiera od innego źródła w trakcie chase,
- target stream-out między tickami,
- target przechodzi loaded ↔ detached lifecycle,
- ten sam `animalId` widoczny chwilowo z dwóch composition sources — dedupe,
- player-owned livestock ma brak `ownerHouseId`, ale nadal może zostać zaatakowane,
- household stray zachowuje `ownerHouseId`, jeżeli pozostaje materialized,
- dog jako `role:'livestock'` nie staje się predatorem; może jednak być fizycznym targetem i bronić household przez existing guard combat,
- predator ma równocześnie wild prey i livestock w range,
- predator jest exhausted / fire-avoiding / attacking human/NPC — existing higher-priority behaviour nadal wygrywa zgodnie z `AnimalAgent` decision pipeline,
- dead/corpse livestock nie jest live hunt targetem,
- save lub settlement capture po death nie resurrectuje livestock.

## 15. Powiązane plany

### `fauna-023-systemic-animal-attraction-food-blood-and-trap-lures.md`

Status: już zaimplementowany, `verification needed`.

Nie dodawać retroaktywnego production dependency. Przy dalszych zmianach/verification settlement-adjacent lure scenarios muszą reuse'ować ten encounter seam: attraction może doprowadzić predatora do gospodarstwa, a encounter set ma rozstrzygać realne prey bez lure-specific attack logic.

### `fauna-025-livestock-stray-return-and-recovery.md`

Status: już zaimplementowany, `verification needed`.

Brak twardej dependency implementacyjnej. Predator encounter staje się realnym źródłem threat/flee/death dla stray. Verification po `fauna-026` powinna objąć stray spotykające predatora. Osobny H10 livestock streaming-continuity gap pozostaje poza tym planem.

### `fauna-011-domestic-dogs-and-household-guarding.md`

Status: `verification needed`.

`fauna-026` rozszerza istniejący dog-guard signal o committed livestock prey. Manual verification dog guard powinna być powtórzona po tym planie dla wilka atakującego własny flock.

### `fauna-004-sheep-wool-and-shepherd.md`

Existing shepherd flock-defense consumer ma reuse'ować realny `huntingPrey().ownerHouseId`; nie tworzyć drugiej sheep-threat heurystyki. Verification shepherd defense powinna następować po `fauna-026`.

### `quests-progression-019-dangerous-animal-deeds-local-reputation.md`

Status: już zaimplementowany, `verification needed`.

Nie dodawać retroaktywnej dependency dla player-kill reputation. Przed przyszłym rozszerzeniem o settlement problem / predator pressure zrobić recon po `fauna-026` i konsumować realne prey/death state zamiast proximity-only narrative flag.

### Lost-livestock / quest consequences

Nie implementować tutaj quest authorship ani opportunity policy. Existing world lookup/death outcome ma obserwować realny livestock state. Jeżeli quest potrzebuje informacji "kto zabił", to jest osobny death-attribution contract, nie powód do nowego predator systemu.

## 16. Performance i hybrid simulation guardrails

- brak globalnego O(N²) po wszystkich animal records,
- brak per-NPC/per-dog skanowania całego świata,
- candidate composition raz na fauna pass,
- exact target scan tylko na bounded materialized set,
- bez workerów — koszt i zależność od live `AnimalAgent` combat state nie uzasadniają komunikacji workerowej,
- bez nowego managera encounter/predation,
- bez kamery jako source of truth,
- future off-screen resolver ma mieć możliwość reuse huntability/ownership semantics bez runtime mesh.

## 17. Non-goals

- pełny rework fauna AI,
- predator/prey species-size matrix,
- nowe pack hunting AI,
- off-screen livestock mortality simulation,
- H10 livestock streaming continuity fix,
- merge wild/livestock/rats pools,
- merge persistence registries,
- nowy combat system,
- carcass/scavenging rework,
- quest rewrite,
- zmiana `AnimalRole` taxonomy,
- browser verification wykonywana przez AI.

## 18. Kolejność implementacji

1. Dodać/testować bounded composition helper dla loaded + detached livestock.
2. Rozszerzyć wymagany `Fauna.update` contract i `AnimalUpdateContext`.
3. Rozszerzyć `resolvePreyTarget` o livestock candidates + deterministic cross-source selection.
4. Dodać membership revalidation committed external target przy stream/lifecycle zmianie.
5. Udowodnić chase→attack→damage→death na dwóch osobnych poolach.
6. Zweryfikować `huntingPrey().ownerHouseId` → `threateningAnimals` → shepherd.
7. Rozszerzyć existing dog guard o own-household livestock prey signal.
8. Dodać persistence/stream-out regression tests.
9. Zaktualizować `docs/state/fauna.md` po implementacji, jeśli publiczny runtime contract się zmieni.
10. Uruchomić targeted tests/typecheck/build zgodnie z repo; bez browser verification i bez `pnpm docs:sync`.

Dla nowego ważnego composition helpera / publicznego encounter contractu dodać JSDoc z `@domain fauna` (lub `@domain app` dla czystego composition helpera, jeśli code-map contract tego wymaga), aby preflight mógł go odnaleźć.

> **Zrób git commit i push do main, rebase jeżeli trzeba**