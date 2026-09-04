# Plan: Domestic dogs and household guarding

**Created:** 2026-09-04
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** fauna-010
**Domain:** `fauna`
**Subdomains:** `domestication` `predation`
**Tags:** `dogs` `guarding` `vocalization` `feeding`
**Roadmap:** -

## Cel

Dodać psy jako pełnoprawne zwierzęta domowe należące do household i uczestniczące w istniejących systemach fauna: potrzebach, żywieniu, ownership, persistence, decyzjach i walce.

Pies ma zachowywać się przede wszystkim jak lokalne zwierzę gospodarstwa: przebywać w pobliżu domu, samodzielnie zaspokajać podstawowe potrzeby, reagować na istotne bodźce oraz bronić członków własnego household przed wilkami. W uzasadnionych sytuacjach może również pomóc pobliskiemu mieszkańcowi innego household.

Nie tworzyć osobnego `DogAgent`, `DogSystem`, `DogNeeds`, `DogCombatSystem` ani równoległego systemu karmienia. Rozszerzać istniejące mechanizmy tylko tam, gdzie pies ujawnia brak współdzielonej capability.

## Założenia po fauna-010

Plan zakłada ukończenie `fauna-010-species-metabolism-herbivore-diet-and-renewable-forage` i korzysta z dostarczonych tam mechanizmów:

- metabolizmu konfigurowanego per gatunek,
- deklaratywnej diety w `AnimalDef`,
- wspólnego source-action pipeline dla zdobywania i konsumowania pokarmu,
- household feeding korzystającego z `Household.items`.

Nie implementować ponownie tych mechanizmów dla psa.

## 1. Dog jako AnimalKind i warianty wizualne

Dodać `dog` do istniejącego modelu fauna.

Wykorzystać istniejące modele:

- `public/models/fauna/dog_husky.glb`,
- `public/models/fauna/dog_shiba.glb`.

Oba modele reprezentują ten sam gatunek i zachowanie, ale różne warianty wizualne. Wariant nie może tworzyć osobnego simulation kind ani wpływać na logikę AI.

Podczas implementacji sprawdzić rzeczywiste nazwy animation clips w obu GLB i podłączyć je do istniejącego semantycznego wyboru animacji. Wykorzystać dostępne animacje Quaternius dla locomotion, attack, death oraz bark/rest/sit/sleep, jeśli odpowiednie clips rzeczywiście występują. Nie zakładać nazw clipów przed inspekcją modeli.

## 2. Household ownership i home behaviour

Pies jest zwierzęciem należącym do household.

Wykorzystać istniejące ownership:

```text
dog
→ ownerHouseId
→ Household
→ members + home
```

Nie przechowywać osobnej listy NPC chronionych przez psa.

`ownerHouseId` pozostaje autorytatywnym źródłem:

- własności,
- domu psa,
- członków household,
- household resources.

Pies powinien korzystać z istniejącej ścieżki spawn/persistence dla domestic animals tam, gdzie jest to możliwe.

Poza sytuacjami zagrożenia normalne zachowanie psa powinno być lokalne względem domu:

```text
needs
→ idle/rest near home
→ short local wandering
→ observation / occasional contextual vocalization
```

Nie tworzyć osobnego systemu patrolowania.

## 3. Dieta bez predator hunting

Po `fauna-010` dieta nie może być wyprowadzana z `AnimalRole`.

Pies powinien móc jeść skonfigurowane meat items, ale nie może przez to automatycznie otrzymać predator hunting behaviour.

Docelowa semantyka:

```text
eats meat        = yes
hunts prey       = no
can fight        = yes
guards household = yes
```

Najpierw sprawdzić stan kodu po `fauna-010` i wykonać najmniejsze rozdzielenie konieczne, aby combat/guarding nie implikowało huntingu.

Nie przebudowywać szeroko `AnimalRole` ani wszystkich strategii fauna, jeśli pies tego nie wymaga.

## 4. Źródła jedzenia psa

Rozszerzyć deklaratywny system diet o źródła odpowiednie dla psa.

Pies może korzystać z odpowiednich meat items znajdujących się w zasobach własnego household oraz z bezpośredniego karmienia przez gracza.

Nie tworzyć dog-specific listy typu `DOG_FOOD = [...]`, jeżeli istniejące item metadata pozwalają określić zgodność semantycznie.

Sprawdzić, czy istniejące metadata typu `food.bait === 'meat'` są wystarczającym kontraktem. Jeśli `bait` jest zbyt wąską semantyką, rozszerzyć wspólną konfigurację żywności o jawne category/feed tags zamiast dodawać wyjątek tylko dla psa.

W tym planie pies:

- nie forage'uje jak herbivore,
- nie poluje automatycznie na żywe prey,
- nie szuka samodzielnie carcass jako normalnego źródła jedzenia.

Carcass/scavenging dla psów pozostaje poza zakresem.

## 5. Potrzeby i woda

Pies korzysta ze wspólnego `AnimalLifeState`:

- hunger,
- thirst,
- stamina.

Metabolizm pochodzi z konfiguracji gatunku wprowadzonej przez `fauna-010`.

Źródła wody pozostają zgodne ze wspólną regułą fauna:

```text
AnimalTrough
natural animal-accessible water
```

Pies nie korzysta ze studni. Nie implementować dog-specific zakazu studni — istniejący system animal water powinien zachować tę zasadę dla wszystkich zwierząt.

## 6. Player → animal feeding

Rozszerzyć istniejącą interakcję z `Interactable.kind === 'animal'` o ogólną możliwość karmienia zwierzęcia przez gracza.

Mechanizm powinien być reusable:

```text
player inventory
→ compatible food item
→ animal diet validation
→ interaction
→ item consumption
→ shared AnimalLife hunger relief
```

Nie implementować `feedDog()`.

Konsumpcja itemu powinna wykorzystywać istniejący `Inventory.remove()` lub jego aktualny odpowiednik po `fauna-010` i następować dopiero po poprawnie zakończonej interakcji.

Dopasować priorytet akcji do istniejących animal interactions (`attack`, `mount`, `milk`, `observe`) bez tworzenia drugiego systemu raycast/interactable.

Ręczne NPC → animal feeding nie jest wymagane w tym planie.

## 7. Kontekstowe szczekanie

Dodać szczekanie psa jako vocalization wynikającą z istotnego bodźca, a nie losowy spam audio.

Rozróżniać co najmniej trzy poziomy reakcji:

```text
unfamiliar/relevant presence → observe / bark
suspicious/threatening presence → alert bark
active household threat → guard / combat
```

Pies może reagować na:

- obcego człowieka w pobliżu domu,
- istotne zwierzę w pobliżu,
- wykryte zagrożenie,
- wycie wilka.

Nie szczekać mechanicznie na każdy obiekt w perception range.

Uwzględnić cooldown i novelty bodźca tak, aby kilka psów nie tworzyło samonapędzającej się kaskady szczekania.

Usłyszenie szczekania innego psa nie powinno samo w sobie wymuszać kolejnego szczekania.

Transient bark/stimulus state nie wymaga persistence.

## 8. Wolf howl jako bodziec symulacji

Wycie wilka powinno być bodźcem możliwym do odebrania przez psa niezależnie od kamery, gracza i WebAudio.

Wykorzystać lub minimalnie rozszerzyć istniejący mechanizm vocalization tak, aby fauna mogła otrzymać informację o źródle, rodzaju i pozycji istotnego dźwięku świata.

Przykładowy flow:

```text
wolf howls
→ world/fauna vocalization stimulus
→ nearby dog perception
→ relevance check
→ alert / bark / brief investigate
```

Samo usłyszenie wilka nie oznacza automatycznego rozpoczęcia walki.

Odległy wilk może wywołać jedynie alert lub krótkie zainteresowanie kierunkiem bodźca. Pies nie powinien biec przez osadę lub mapę do każdego wyjącego wilka.

Nie budować w tym planie kompletnego globalnego event bus dla wszystkich przyszłych vocalizations; wprowadzić najmniejszy reusable kontrakt potrzebny przez istniejące wolf howl i dog bark.

## 9. Threat perception dla guard behaviour

Pies powinien reagować przede wszystkim na rzeczywiste zagrożenie dla ludzi, a nie tylko na obecność `AnimalKind.wolf`.

Wykorzystać autorytatywny stan istniejącego wolf/NPC combat, w szczególności bieżący target atakującego zwierzęcia.

Udostępnić minimalną read-only informację potrzebną perception/decision logic do odpowiedzi na pytania:

- który animal jest agresorem,
- kogo aktualnie atakuje,
- gdzie znajduje się zagrożenie.

Nie rekonstruować "wolf attacks NPC" wyłącznie na podstawie odległości.

Nie duplikować target state należącego do atakującego zwierzęcia i nie przechowywać `protectedNpcIds` na psie.

## 10. Household guard priorities

Pies ocenia zagrożenia według relevance.

Podstawowy priorytet:

```text
1. wolf attacking own household member
2. wolf attacking nearby settlement inhabitant
3. relevant wolf close to home/household
4. distant/unrelated wolf
```

Semantycznie:

```text
protect household
>
protect nearby settlement inhabitants
>
chase unrelated distant wolf
```

Atak na członka własnego household otrzymuje najwyższy priorytet.

Atak na pobliskiego NPC z innego household może spowodować pomoc, ale ma niższy priorytet.

Sama obecność wilka nie musi oznaczać ataku.

## 11. Integracja z fauna decision/scoring

Guard behaviour zintegrować z istniejącym centralnym mechanizmem decyzji fauna.

Nie tworzyć osobnej dog update loop.

Dodać tylko potrzebne candidates/pressures do istniejącego arbitra, np. dla:

```text
protect household
protect nearby inhabitant
respond to relevant threat
normal needs
home idle/rest/wander
```

Potrzeby nadal uczestniczą w decyzjach.

Bezpośredni atak wilka na członka household powinien mieć wyższy priorytet niż normalne hunger/rest pressure, ale po ustaniu zagrożenia pies wraca do zwykłego arbitration.

## 12. Dog vs wolf combat

Nie tworzyć osobnego combat system.

Wykorzystać istniejący fauna combat:

```text
attack cooldown
stamina
attack animation
damage
takeDamage()
death
```

Dodać potrzebne wartości zdrowia i obrażeń psa w istniejącej konfiguracji combat.

Jeżeli istniejący `AnimalAgent.attack()` jest zbyt mocno związany z predator behaviour, wydzielić minimalną współdzieloną granicę umożliwiającą guard behaviour użycie tego samego mechanizmu.

Nie wprowadzać specjalnego matchup `dog ↔ wolf`, jeżeli aktualny model `damageFor()` tego nie wymaga.

## 13. Guard disengagement i powrót do domu

Pies nie może po wykryciu wilka ścigać go bez ograniczeń.

Guard behaviour powinien uwzględniać:

- odległość od własnego domu,
- odległość od chronionego NPC,
- aktualność zagrożenia,
- stan targetu,
- maksymalny sensowny chase distance/time.

Po ustaniu zagrożenia:

```text
combat/guard
→ alert decay
→ return toward household/home
→ normal needs/behaviour
```

Pies ma pozostać lokalnym obrońcą gospodarstwa, a nie settlement-wide police.

## 14. Persistence

Wykorzystać istniejącą persistence domestic animals i `ownerHouseId`.

Nie tworzyć `DogSaveData`.

Persistować tylko stan wynikający ze wspólnego modelu zwierzęcia.

Nie persistować bez wyraźnej potrzeby:

- bark cooldown,
- current heard stimulus,
- temporary alert,
- current guard target.

Po load pies rekonstruuje bieżącą sytuację z aktualnego world state.

## 15. Debugging / observability

Rozszerzyć istniejący fauna debug tooling tak, aby można było sprawdzić dla psa co najmniej:

- owner household,
- current behaviour/decision,
- current threat/guard target,
- protected NPC,
- hunger/thirst/stamina,
- ostatni istotny vocalization stimulus.

Nie tworzyć osobnego dog debug panelu, jeżeli dane mieszczą się w istniejącym fauna inspector/debug output.

## Performance

Nie wykonywać globalnego wyszukiwania wilków, NPC, household members ani vocalization stimuli dla każdego psa per frame.

Wykorzystać istniejące spatial/perception mechanisms i cadence fauna decisions.

Vocalization stimuli powinny być krótkotrwałe i przestrzennie ograniczone.

Guard scoring powinien działać w istniejącym decision cadence, nie w render loop.

Nie wprowadzać Web Workera wyłącznie dla psów.

## Testy

Dodać testy przede wszystkim dla deterministycznej logiki decyzji i wspólnych kontraktów:

- dog diet accepts configured meat,
- dog does not forage like herbivore,
- dog does not automatically hunt prey,
- own-household threat outranks foreign-household threat,
- nearby foreign NPC may be protected,
- distant unrelated wolf does not trigger long chase,
- wolf howl can create relevant alert/bark stimulus,
- bark cooldown/novelty prevents spam and dog-to-dog feedback loop,
- guard behaviour uses existing fauna combat,
- successful player feeding consumes exactly one compatible item and relieves hunger,
- interrupted/invalid feeding does not consume item,
- dog returns to normal/home behaviour after threat disappears.

## Manual verification

W przeglądarce sprawdzić co najmniej:

1. Husky i Shiba spawnują się jako warianty tego samego gatunku.
2. Oba modele poprawnie używają dostępnych locomotion/combat/vocalization/rest animations.
3. Głodny pies korzysta ze zgodnego z dietą jedzenia z własnego household.
4. Pies może pić z animal trough/naturalnego źródła, ale nie korzysta ze studni.
5. Gracz może nakarmić psa odpowiednim mięsem.
6. Pies nie poluje samoczynnie na chicken/sheep/deer tylko dlatego, że je mięso.
7. Pies zachowuje się lokalnie względem własnego domu, kiedy nie ma zagrożenia.
8. Pies może szczekać na istotnego obcego człowieka/zwierzę w pobliżu domu bez spamowania.
9. Wycie pobliskiego wilka może wywołać alert/szczekanie.
10. Samo wycie odległego wilka nie powoduje długiego pościgu.
11. Wilk atakujący członka household powoduje reakcję obronną psa.
12. Pies potrafi walczyć z wilkiem i może otrzymać obrażenia/zginąć.
13. Pies może pomóc pobliskiemu NPC z innego household.
14. Obrona własnego household ma priorytet nad pomocą obcemu NPC.
15. Po zakończeniu zagrożenia pies wraca w okolice domu i do normalnych potrzeb.
16. Kilka psów w osadzie nie tworzy nieskończonej kaskady szczekania.

## Poza zakresem

- breeding/reproduction i puppies,
- ageing/lifecycle,
- training/commands,
- follow-player companion mode,
- taming dzikich/bezpańskich psów,
- dog breeds jako różne simulation species,
- persistent animal memory,
- scent tracking,
- pack hierarchy,
- polowanie psa na prey,
- carcass/scavenging behaviour,
- rozbudowany patrol system,
- kennel system,
- ręczne NPC → animal feeding,
- pełna przebudowa `AnimalRole`,
- pełny generic threat/event framework dla wszystkich przyszłych actor types,
- pełny generic vocalization/event bus,
- LLM-driven animal behaviour.

Po implementacji zaktualizować dokumentację assets/fauna tak, aby oba modele psów były oznaczone jako rzeczywiście wired.

Dodać JSDoc z `@domain fauna` dla nowych ważnych publicznych granic odpowiedzialności, szczególnie jeśli powstaną współdzielone kontrakty perception/threat/vocalization wykorzystywane poza pojedynczym zachowaniem psa.

## Implementation status

Implemented against the post-fauna-010 diet/role contract, reusing existing mechanisms throughout — no `DogAgent`/`DogSystem`/`DogNeeds`/`DogCombatSystem`/`DogSaveData`, no second combat/food/water/interaction pipeline:

- `dog` added to `AnimalKind`/`ANIMAL_DEFS` (`src/fauna/AnimalAgent.ts`): `role: 'livestock'` (not `'predator'`, so no hunting; not `'prey'`, `fleeRange: 0` so no fleeing wolves either) + `DOG_DIET` (`raw_meat`/`deer_meat`/`wolf_meat`/`boar_meat`/`rabbit_meat`/`beef`, no `grass`, no `scavenging`). Local home wander/idle already came free from `prey-normal`'s existing home-anchored `wander()`/`pursueNeeds()` fallback — no new patrol/idle system.
- Household ownership/spawn/persistence reuse `settlement/livestock.ts` unchanged in shape: `LivestockKind`/`LIVESTOCK_URLS` extended for `dog` with two visual variants (`dog_husky.glb`/`dog_shiba.glb`, real GLB clip names verified — already match `AnimalAgent`'s existing semantic `findAction()` candidates, no animation-mapping change needed); `visualFor()` picks a variant deterministically per `animalId` (FNV-1a hash, not persisted). Independent per-house `DOG_OWNERSHIP_CHANCE` roll appended after every existing species roll, so no existing save's roll sequence shifts.
- Guard/combat: new pure `src/fauna/dogGuard.ts` (`resolveDogGuardTarget`/`resolveDogBarkStimulus`, unit-tested directly) encodes the full priority order (own household > nearby foreign household > nothing) and the three bark tiers; `AnimalAgent.ts` adapters map live wolves/NPCs into its narrow candidate shapes and reuse the existing `attack()`/`chaseNav` combat/movement seam unchanged. A new `faunaDecision.ts` rank (`dog-guard`, between `frenzy-beeline` and `predator-normal`) integrates guard priority into the existing central arbitration — no second decision loop. Disengagement is not a decay timer: the guard target is recomputed fresh every tick, so a dead/retargeted wolf or one that walked outside its tier's radius just stops being returned.
- Wolf howl → dog alert reuses the existing `onVocalize` hook's sim-state side (new `vocalizeAlertRemainingSec`/`recentVocalizeAlert`, decays like any other timer) instead of a new event bus; dog bark reuses the same hook/`playSpontaneousAnimalSound` presentation path (`ANIMAL_SOUND_URLS.dog` → `public/sounds/animal-dog-01.ogg`, in repo) gated by its own stimulus+cooldown, not the spontaneous-random mechanism cow/sheep/chicken/wolf use.
- Player feeding: new `feedAnimal()`/`FeedableAnimal` in `app/actions/survivalActions.ts`, wired into the existing `Interactable.kind === 'animal'` dispatch (`gameLoop.ts`) after mount/milk, and into `interactables.ts`'s existing prompt-label function via a precomputed resolver (same "stay inventory-agnostic" convention as `hasMilkContainer`). Reuses `selectDietFeedKind`/`Inventory.remove()` — generic for any `def.diet.items` species, not `feedDog()`.
- Debug: `AnimalAgentDebugInfo` gained `ownerHouseId`/`dogGuard`/`dogVocalizeStimulus`, populated in the existing `getDebugInfo()` — no separate dog debug panel.
- Not implemented (deliberately deferred, all listed in "Poza zakresem" or judged out of the §7 minimal-contract scope): a distinct "wolf merely nearby, not attacking, not howling" bark tier — only an active guard target, a recent wolf howl, or a nearby stranger NPC currently trigger a bark; a silently-present non-howling wolf does not. Add it later only if playtesting shows it's needed — the seam (`dogGuard.ts`) already supports a fourth tier cheaply.
- `npx tsc --noEmit`, `pnpm lint:fix` and the full `vitest` suite (2980 tests) pass. Not yet browser/manual verified in-game — see "Manual verification" above.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
