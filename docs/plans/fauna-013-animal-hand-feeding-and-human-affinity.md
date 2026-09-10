# Plan: Animal hand-feeding and human affinity

**Created:** 2026-09-04
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~fauna-010~~, ~~fauna-011~~, ~~fauna-017~~
**Domain:** `fauna`
**Subdomains:** `domestication`
**Tags:** `feeding` `interaction` `affinity`
**Roadmap:** -

## Cel

Dodać lekką relację zwierzę → konkretna osoba do istniejącego player → animal feeding, bez tworzenia drugiego systemu karmienia, potrzeb ani relacji.

Gameplay pozostaje:

```text
human ma kompatybilne jedzenie
→ animal może je przyjąć
→ udane karmienie zużywa dokładnie 1 item
→ ten sam shared hunger relief co inne źródła jedzenia
→ affinity rośnie tylko dla affinity-enabled animal
→ pies może traktować znaną osobę mniej jak obcego
```

Pierwszym pełnym konsumentem affinity jest pies. Koń, krowa i inne zwierzęta objęte `AnimalDef.diet.items` mają korzystać z tego samego hand-feeding flow bez automatycznego tworzenia affinity state.

## Aktualny punkt wyjścia po `fauna-017`

Generic player feeding już istnieje i nie wolno tworzyć go ponownie:

- `src/app/interactables.ts` używa istniejącej animal interaction i `feedItemKindFor(animal)` do promptu `Nakarm`;
- `src/app/actions/survivalActions.ts` ma `feedAnimal()`, które wybiera kompatybilny item i usuwa dokładnie jedną sztukę dopiero po sukcesie operacji domenowej;
- `AnimalAgent.feedByPlayer()` jest obecnym publicznym seamem, ale nadal zawiera starą bezpośrednią ścieżkę `diet → consumeFood()`;
- `src/fauna/animalForaging.ts` po `fauna-017` jest kanonicznym właścicielem wyboru źródeł jedzenia, live validation oraz atomic food/source relief dla autonomicznego żywienia;
- `src/fauna/AnimalLife.ts` pozostaje właścicielem hunger state i `consumeFood()`;
- `src/fauna/animalDefs.ts` pozostaje właścicielem species diet i capability-style konfiguracji;
- `src/fauna/dogGuard.ts` pozostaje czystym resolverem guard/bark behaviour;
- persistent livestock używa istniejącego `AnimalSaveState` + `snapshot()` / `hydrate()` przez `src/settlement/livestock.ts`.

Plan ma rozszerzyć te granice, a nie cofnąć refaktor `AnimalAgent`.

## 1. Jedna domenowa operacja hand-feeding

Zachować obecny interaction/raycast/UI pipeline.

`feedAnimal()` w `survivalActions.ts` pozostaje player adapterem odpowiedzialnym za:

```text
wybór carried diet item
→ wywołanie domenowej operacji animal
→ Inventory.remove(kind, 1) tylko po sukcesie
```

Nie może sam rozstrzygać hunger acceptance, nutritional relief ani affinity.

Obecne `feedByPlayer(itemKind)` należy ewoluować w cienki publiczny adapter operacji actor-aware zamiast rozbudowywać jego logikę. Nazwa może zostać zmieniona na bardziej neutralną (`tryHandFeed` lub równoważną), jeżeli poprawi kontrakt i call-sites.

## 2. Food rules pozostają wspólne z autonomicznym żywieniem

Hand-feeding musi używać:

- `AnimalDef.diet.items` z `animalDefs.ts`,
- istniejącej wartości relief dla konkretnego itemu,
- `AnimalLifeState` / `consumeFood()` z `AnimalLife.ts`.

Po `fauna-017` nie dodawać ponownie diet/food mutation logic do `AnimalAgent`.

W `animalForaging.ts` wydzielić/reuse małą czystą operację dla przyjęcia diet itemu przez animal, tak aby autonomous household feed i hand-feed opierały się na tym samym diet + hunger relief contract. Nie modelować ręcznego karmienia jako nowego równoległego needs systemu ani jako osobnego inventory source graph.

`SourceTarget.kind === 'feed'` nadal oznacza autonomiczne dojście do jedzenia z household storage; nie przeciążać tego targetu transient player interaction state.

## 3. Hunger acceptance

Zwierzę może przyjąć jedzenie tylko wtedy, gdy jest wystarczająco głodne.

Użyć jednego wspólnego kryterium opartego o `AnimalLifeState.hunger`; w pierwszej kolejności reuse `NEED_ELEVATED_THRESHOLD`, jeżeli nie ma powodu do osobnego progu.

```text
hungry enough + compatible item + live animal
→ accept

satiated / dead / incompatible
→ reject
→ item remains
→ no relief
→ no affinity
```

Nie dodawać dodatkowego cooldownu ani diminishing returns w V1.

Prompt w `interactables.ts` powinien używać tego samego read-only predicate co domenowa operacja, ale finalny commit musi rewalidować stan ponownie.

## 4. Feed success invariant

Zachować:

> Udane karmienie aplikuje efekt dokładnie raz i dopiero wtedy zużywa dokładnie jeden item. Nieudane/anulowane karmienie nie zużywa itemu i nie daje affinity.

Nie zmieniać istniejącej kolejności transakcji w `survivalActions.ts` na `remove first`.

## 5. Lifecycle boundary

Hand-feeding dotyczy tylko żywego, aktualnie dostępnego animal.

`AnimalAgent` pozostaje właściwym miejscem na rewalidację jego lifecycle (`isDead()` / corpse state), ponieważ `animalForaging.ts` nie jest właścicielem agent death lifecycle.

Nie tworzyć dodatkowego `feedable/dead` state obok istniejącego lifecycle.

## 6. Affinity capability i ownership

Affinity ma być stanem indywidualnego animal, ale tylko dla species, które realnie go konsumują.

Zgodnie z aktualną konwencją `AnimalDef`, capability powinna wynikać z obecności małego opcjonalnego configu w `animalDefs.ts`, zamiast rozrzucać kolejne `kind === 'dog'` w feeding code.

V1:

```text
dog → affinity enabled
other fed animals → hand-feeding działa, affinity state nie jest tworzony
```

Twardo zachować:

```text
ownerHouseId = ownership/contextual family membership
affinity     = indywidualna relacja do konkretnej osoby
```

Affinity nie zmienia ownership, protected household membership, guard priority ani combat loyalty.

## 7. Human identity

Affinity kluczować stabilnym identyfikatorem osoby, nigdy object reference ani transient indexem.

Nie wykonywać szerokiego actor-identity refactoru. Dla V1 wystarczy mały fauna-facing identyfikator z namespacem, np. stała identity gracza oraz przyszłe `npc:<stableNpcId>`.

Nie materializować affinity entries dla członków owning household tylko po to, aby reprezentować istniejącą familiarity wynikającą z `ownerHouseId` / NPC `homeId`.

## 8. Sparse affinity state

Nie tworzyć macierzy animals × humans ani globalnego relationship managera.

Affinity:

- istnieje tylko na affinity-enabled individual animal,
- wpis dla human powstaje dopiero przy rzeczywistym gain,
- wartości są bounded i deterministycznie aktualizowane,
- unrelated humans nie dostają pustych wpisów.

Nie używać `QuestManager` relations ani NPC relationship stores — mają inny ownership i semantykę.

## 9. Pies jako pierwszy behavioural consumer

`dogGuard.ts` pozostaje właścicielem interpretacji stranger/social barking.

Rozszerzyć istniejący `resolveDogBarkStimulus()` / jego candidate contract tak, aby przy stranger evaluation można było uwzględnić stable human id + interpreted familiarity.

Własny household nadal jest familiar z kontekstu `homeId === ownerHouseId`.

Dla osoby spoza household:

```text
affinity < trusted threshold
→ stranger stimulus jak obecnie

affinity >= trusted threshold
→ stranger relevance suppressed/reduced
```

Nie zmieniać `resolveDogGuardTarget()` ani wolf-defense priority.

Player musi wejść do istniejącego dog social perception jako kandydat bez tworzenia nowego world scan. Reuse player data już dostępne w `AnimalAgent.update()`/perception.

## 10. Persistence

Affinity psa musi round-tripować razem z istniejącym persistent livestock individual state.

Rozszerzyć `AnimalSaveState` o opcjonalną sparse reprezentację affinity i obsłużyć ją przez istniejące:

- `AnimalAgent.snapshot()`,
- `AnimalAgent.hydrate()`,
- `LivestockSaveRecord`,
- `src/persistence/saveData.ts` validation.

Pole musi być optional/backward-compatible.

Nie tworzyć `DogAffinitySaveData` i nie rozszerzać wild-fauna persistence. Wild animals nadal nie zyskują trwałej indywidualnej affinity tylko dlatego, że generic `AnimalSaveState` potrafi ją reprezentować.

## 11. Animacja i feedback

Karmienie ma korzystać z istniejącego animation mappingu, jeśli dany species posiada użyteczny eat/interact clip.

Brak dedykowanej animacji nie blokuje feature.

Nie hard-code'ować clip names w interaction/UI i nie tworzyć osobnego animation subsystemu.

Feedback ma pozostać lekki; bez affinity bar, relationship panel ani dużego feed-selection modalu.

## 12. NPC feeding boundary

NPC feeding job/schedule pozostaje poza scope.

Domenowa operacja ma jednak być actor-neutralna, aby przyszłe NPC action mogło wykonać:

```text
stable human id + item
→ ta sama compatibility/acceptance/relief operacja
→ ten sam affinity gain
```

bez kopiowania zasad player feeding.

## 13. Debugging

Jeżeli istniejący fauna inspector wymaga rozszerzenia, pokazać co najmniej:

- hunger i can-accept-food,
- affinity entries dla affinity-enabled animal,
- interpreted trusted/familiar dla wskazanego human,
- `ownerHouseId` obok affinity u psa.

Nie tworzyć osobnego relationship debug UI.

## Implementacja — preferowana kolejność

1. W `AnimalLife.ts` / `animalForaging.ts` dodać współdzielony read/commit contract acceptance + diet relief bez nowych needs.
2. Zmienić `AnimalAgent` hand-feed seam na lifecycle-aware, actor-aware cienki adapter.
3. Zachować transakcyjny `feedAnimal()` i zaktualizować prompt gating w `interactables.ts`.
4. Dodać capability/config affinity w `animalDefs.ts` i sparse per-agent state.
5. Podłączyć affinity gain wyłącznie po udanym feed commit.
6. Rozszerzyć `dogGuard.ts` stranger candidate/resolver oraz player candidate adapter w `AnimalAgent`.
7. Dodać snapshot/hydrate + save validation.
8. Rozszerzyć focused tests i debug info.

## Testy

Dodać/rozszerzyć focused tests dla:

- compatible food accepted przez shared diet contract,
- incompatible food rejected,
- satiated/dead animal rejected,
- successful feed consumes exactly one inventory item,
- failed feed consumes none,
- relief odpowiada temu samemu `AnimalDef.diet.items[kind]` co autonomous feeding,
- successful dog feed increments only feeding human affinity,
- non-affinity species nie alokuje/persistuje relationship state,
- affinity dla dwóch human ids jest niezależne,
- ownership pozostaje bez zmian,
- trusted outsider nie wywołuje normalnego stranger bark,
- guard target resolution pozostaje bez zmian,
- affinity round-tripuje przez livestock save/load,
- stary save bez affinity nadal przechodzi validation/hydration.

Preferować istniejące test suites: `animalForaging.test.ts`, `survivalActions`/feeding tests, `dogGuard.test.ts`, `AnimalAgent.test.ts` oraz focused persistence/livestock tests.

## Manual verification

W przeglądarce sprawdzić:

1. Głodny koń/krowa/pies przyjmuje kompatybilne jedzenie.
2. Niezgodne jedzenie nie jest konsumowane.
3. Najedzone lub martwe zwierzę nie może zostać nakarmione.
4. Sukces usuwa dokładnie 1 item i zmniejsza hunger zgodnie ze wspólnym diet relief.
5. Karmienie psa zwiększa affinity do gracza; karmienie innych zwierząt nie tworzy martwego affinity state.
6. Po osiągnięciu trusted threshold pies mniej/nie szczeka na gracza jako stranger.
7. Affinity nie zmienia owner household ani guard behaviour.
8. Save/load zachowuje affinity psa.

Browser verification wykonuje użytkownik, nie agent AI.

## Performance

Hand-feeding pozostaje event-driven i nie dodaje nowego update loop.

Affinity storage jest sparse. Nie skanować globalnie animals × humans i nie wykonywać affinity lookupów poza behaviour, które faktycznie ich potrzebują.

Dog stranger evaluation ma reuse obecny bounded perception/candidate path bez nowego per-frame world scan.

## Poza zakresem

- petting/głaskanie,
- dog commands i follow/stay,
- taming wild animals,
- ownership transfer/adoption,
- affinity-based guarding,
- combat loyalty,
- negative affinity/fear/grudges,
- animal personality,
- NPC caretaker jobs/schedules,
- breeding/production bonuses,
- affinity UI panel,
- naming/whistle commands.

## Dokumentacja / AI preflight

Dla nowych ważnych publicznych granic dodać JSDoc z `@domain fauna`.

Szczególnie jasno opisać:

```text
AnimalAgent = integration/lifecycle/public adapter
animalForaging = shared food/source selection + validation + relief rules
AnimalLife = hunger state/mutation
ownership ≠ affinity
familiarity = interpretation/context, not duplicate relationship state
```

Nie importować nowych canonical food helpers z compatibility re-exportów `AnimalAgent.ts`; nowe call-sites powinny preferować bezpośredni import z `animalForaging.ts` / `animalDefs.ts` / `AnimalLife.ts` zgodnie z `fauna-017`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**