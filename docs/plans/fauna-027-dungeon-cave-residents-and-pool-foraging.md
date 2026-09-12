# Plan: Dungeon cave residents and pool foraging

**Created:** 2026-09-12
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~fauna-019~~, ~~fauna-022~~, ~~fauna-023~~, world-terrain-024, world-terrain-025
**Domain:** `fauna`
**Subdomains:** `habitat` `predation` `population`
**Tags:** `caves` `dungeon` `residents` `foraging` `fish`
**Roadmap:** -
**Model:** Opus, Sonnet

## Cel

Zamieszkać `dungeon` caves przez trwałe, autonomiczne zwierzęta korzystające z tych samych systemów fauna co pozostałe zwierzęta świata.

Dungeon residents mają:

- być zwykłymi `AnimalAgent`,
- posiadać realną cave jako habitat/home,
- być rozłożeni po dungeon chambers,
- istnieć niezależnie od gracza i questa,
- korzystać z istniejących potrzeb, walki, ruchu i lifecycle,
- móc zaspokajać pragnienie przy płytkim underground pool,
- móc korzystać z niewyczerpywalnego environmental fish source przy pool, jeżeli ich dieta dopuszcza ryby.

Nie tworzyć `DungeonAnimal`, `DungeonEnemy`, specjalnego dungeon AI/FSM, quest-owned animals, osobnego combat pipeline ani osobnej persistence tylko dla dungeonów.

Docelowy przepływ:

```text
dungeon cave
→ stable chambers
→ deterministic resident declarations
→ PersistentOccupantDecl
→ AnimalHabitatBinding
→ normal AnimalAgent

shallow underground pool
→ semantic cave water feature
├→ normal water target
└→ environmental fish food source
      ↓
 existing animal foraging
```

---

## 1. Existing systems są authority

Plan ma składać istniejące mechanizmy, a nie tworzyć system dungeon mobs.

Reuse:

- `fauna-019` — real cave habitat/navigation i persistent cave occupants,
- `fauna-022` — per-animal variants / exceptional dangerous animals,
- `fauna-023` — attraction, diet compatibility i istniejący foraging model,
- `world-terrain-024` — dungeon archetype i stable chamber semantics,
- `world-terrain-025` — shallow underground pool i cave environmental-water contract.

Nowy plan komponuje:

```text
species
+ persistent occupant
+ cave habitat
+ optional individual variant
+ normal needs / combat / foraging
```

---

## 2. Dungeon resident population

Każdy zaakceptowany dungeon otrzymuje deterministyczną initial resident population.

Reguła V1:

```text
eligible chambers = właściwe dungeon chambers
                    z wyłączeniem reserved initial-home chamber

resident count:
- minimum 1,
- dla każdej kolejnej eligible chamber: 75% deterministic chance,
- maksymalnie chamberCount - 1,
- maksymalnie 1 initial resident na chamber.
```

Nie interpretować tego jako stałego population cap jaskini. Jest to wyłącznie initial persistent resident declaration policy. Późniejsze population/reproduction systems zachowują własne reguły.

---

## 3. Entrance safety i jedna reserved chamber

Nie umieszczać initial home bezpośrednio przy cave entrance ani w entrance passage.

Dodatkowo jedna właściwa dungeon chamber pozostaje bez initial resident. Wybrać ją deterministycznie spośród legalnych chambers, preferując część bliższą wejściu, ale nie wymuszać zawsze pierwszej chamber.

Dzięki temu:

- wejście posiada realną safety zone,
- dungeon nie jest sekwencją arena-roomów,
- pierwsza większa chamber może czasem być zamieszkana,
- rozkład mieszkańców pozostaje mniej przewidywalny.

Reserved chamber dotyczy tylko initial home assignment. Zwierzęta mogą później normalnie przez nią przechodzić.

---

## 4. Stable resident identity

Każdy initial resident musi mieć stabilną tożsamość wynikającą co najmniej z:

```text
caveId
+ chamberNodeId
+ resident semantic slot
```

Np. `<caveId>:resident:<chamberNodeId>`.

Nie używać topology array index, runtime UUID jako world identity, kolejności streamowania ani przypadkowego iteration order.

Dla tego samego world seed i cave topology te same chambers są eligible, te same 75% rolle przechodzą, te same species/variants są wybierane i resident identities pozostają stabilne.

---

## 5. Persistent occupants

Initial residents korzystają z istniejącego fauna persistent occupant registry i `PersistentOccupantDecl` oraz istniejącego cave habitat binding.

Nie tworzyć dungeon-specific save records.

Śmierć residenta jest prawdziwą śmiercią persistent animal. Nie respawnować go automatycznie po opuszczeniu cave, odstreamowaniu, ponownym wejściu ani cooldownie.

---

## 6. Resident home placement

Każdy resident otrzymuje semantic chamber jako initial home area. Home point wyznaczać przez istniejący cave spatial authority (`CaveTopology` + `CaveHeightfieldRepresentation`), nie visual mesh raycasty.

Placement musi:

- znajdować się na walkable cave floor,
- posiadać clearance dla gatunku,
- nie blokować chamber entrance,
- być osiągalny z topology graph,
- nie wymagać specjalnego dungeon movement.

Płytki pool z `world-terrain-025` jest walkable/wadeable, ale initial home nie powinien być umieszczany w wodzie, jeżeli istnieje poprawny dry placement.

Jeżeli optional chamber nie posiada poprawnego placementu, deterministycznie próbować kolejny legal placement lub pominąć optional resident. Guaranteed resident musi mieć co najmniej jeden legal placement.

---

## 7. Species selection

V1 korzysta wyłącznie z istniejących `AnimalKind`. Nie dodawać `cave_bear`, `dungeon_wolf`, `dire_wolf` ani `boss_bear` jako nowych gatunków.

Initial dungeon species pool:

- `bear`,
- `wolf`.

Nie gwarantować bear w każdym dungeon.

Wymaganie V1:

- minimum jeden resident,
- minimum jeden predator/dangerous resident,
- deterministic weighted species selection,
- `bear` ma wysoką wagę,
- `wolf` ma niższą wagę i pełni fallback.

Konkretnych wag nie utrwalać w planie bez potrzeby; ustalić mały jawny tuning constant podczas implementacji. Intencja: bear ma być częsty, ale dungeon nie może być zawsze przewidywalnie „bear cave”.

Fish source nie może istnieć wyłącznie jako bear-specific mechanic. Każdy diet-compatible animal może być jego konsumentem.

---

## 8. Nie robić statycznych guardów

Resident nie jest przywiązany do swojej chamber jako encounter trigger.

Nie implementować `stayInRoomUntilPlayerAppears()`, `guardDoor()`, room aggro ani reset-to-spawn po walce.

Resident korzysta z normalnego behavior: potrzeby, roaming, cave traversal, combat, wyjścia z jaskini jeśli istniejący habitat system daje ku temu powód oraz powrót do home.

Dungeon jest habitatem, nie instancjonowaną areną.

---

## 9. Existing cave traversal

Reuse `fauna-019` i istniejący representation-neutral cave navigation contract.

Nie dodawać dungeon navmesha, room-to-room pathfindera, waypoint managera ani movement po render mesh.

Jeżeli większy dungeon ujawni realne ograniczenie `CaveTraversalDescriptor`, rozszerzyć istniejący contract minimalnie zamiast budować drugą route representation.

---

## 10. Shallow underground pool jako water target

`world-terrain-025` ma dostarczać płytki underground pool: mały, bezpieczny do brodzenia, bez potrzeby swimming/drowning logic. Fauna konsumuje semantic water feature przez wąski read-only world contract, nie przez water mesh/Three.js objects.

Pool staje się normalnym water destination dla cave residents:

```text
animal thirst
→ existing water-source selection
→ cave-local pool source
→ reachable shallow-water / shoreline target
→ existing drinking behavior
→ thirst relief
```

Nie tworzyć `drinkFromDungeonPool()`.

Jeżeli istniejący fauna water descriptor wymaga nowego source arm, dodać najmniejszy reusable wariant reprezentujący environmental/cave water.

Playerowe `unsafe` nie oznacza zakazu picia dla zwierząt; nie kopiować player contamination mechanics do fauna.

---

## 11. Pool traversal guardrail

V1 nie może wymagać animal swimming ani drowning handling.

Pool depth i basin geometry z `world-terrain-025` muszą mieścić się w safe wading envelope dla mieszkańców dungeon. Fauna może wejść do płytkiej wody lub użyć shoreline targetu zgodnie z istniejącym movement contractem.

Nie dodawać specjalnego avoidance tylko po to, aby zwierzę nie utonęło. Geometry/world contract powinien gwarantować, że ten pool nie tworzy takiego ryzyka.

---

## 12. Environmental fish source

Pool zapewnia niewyczerpywalne źródło ryb dla kompatybilnych zwierząt.

Nie reprezentować go jako nieskończone spawnujące się `fish` items.

Nie tworzyć dropped items, fish population simulation, depletion/regeneration ani player pickup.

Wprowadzić najmniejszy reusable environmental food-source contract potrzebny przez istniejący `animalForaging`, semantycznie np.:

```ts
type EnvironmentalAnimalFoodSource = {
  id: string
  kind: 'fish'
  x: number
  z: number
  // minimal spatial context wymagany przez istniejący ownership
}
```

Dokładny shape ustalić podczas implementation recon na podstawie aktualnego `animalForaging` i world/fauna contracts. Nie tworzyć ogólnego resource framework, jeśli jeden reusable source-target arm wystarcza.

---

## 13. Fish source identity i availability

Fish source jest environmental resource związanym z pool, nie z konkretnym gatunkiem.

Stable identity wywodzi się z pool/cave identity, np. `<poolId>:fish`.

Dla V1:

```text
available = true
capacity = infinite
depletion = none
respawn = none
```

„Infinite” oznacza brak symulacji ilości ryb, nie tworzenie kolejnych item entities.

---

## 14. Diet pozostaje authority

Nie dodawać wyjątków typu `if (animal.kind === 'bear' && insideDungeon)`.

Kompatybilność environmental fish source wynika z istniejącej species/diet authority.

```text
environment source: fish
→ existing diet compatibility
→ compatible?
   yes → valid food target
   no  → ignore
```

To pozwala przyszłym gatunkom korzystać z ryb bez dungeon-specific zmian.

Jeżeli current species contract nie reprezentuje fish compatibility w sposób możliwy do reuse przez environmental source, rozszerzyć istniejącą diet authority zamiast dodawać osobną cave-food listę.

---

## 15. Integracja z `animalForaging`

Environmental fish wchodzi w istniejący needs-driven source lifecycle:

```text
hunger
→ find compatible source
→ travel
→ consume duration
→ hunger relief
→ resume normal behavior
```

Nie budować osobnego fish-seeking FSM.

Jeżeli infinite environmental source nie wymaga mutual exclusion, nie dodawać ciężkiego claim systemu tylko po to, aby naśladować finite carcasses. Kilka zwierząt może korzystać z tego samego pool source, o ile spatial behavior pozostaje poprawne.

---

## 16. Consumption nie usuwa źródła

Po fish feeding:

- hunger spada przez istniejący needs mechanism,
- environmental source pozostaje dostępne,
- nie powstaje item,
- pool nie jest mutowany,
- world save nie przechowuje fish stock.

Preferować istniejące need thresholds/cooldowns, aby uniknąć natychmiastowego ponownego wyboru źródła. Nie dodawać fish-specific timera bez potrzeby.

---

## 17. Approach do fish source

Ponieważ pool jest płytki, feeding target może być przy shoreline albo w legalnym shallow-wading miejscu, zależnie od istniejącego movement contractu.

Nie implementować animal swimming, diving ani underwater hunting.

V1 abstrahuje łowienie/zjadanie ryb jako environmental feeding action po osiągnięciu poprawnego approach targetu.

---

## 18. Variant assignment

Dungeon residents mogą korzystać z istniejącego individual variant mechanism.

Nie gwarantować exceptional variant w każdym dungeon. Można wykonać mały deterministic roll na istniejący supported dangerous variant, jeśli species go obsługuje.

Nie tworzyć dungeon-only wariantu ani ręcznych stat boosts poza existing resolver. Jeśli obecnie tylko wolf ma production dangerous variant, tylko wolf uczestniczy w tym rollu.

---

## 19. Combat

Dungeon resident korzysta z istniejącego fauna combat.

Nie dodawać dungeon damage, room aggro, encounter HP, resetowania zdrowia przy unload ani specjalnych loot rules.

Niebezpieczeństwo wynika z:

```text
species
+ individual variant
+ liczby mieszkańców
+ topology jaskini
```

---

## 20. Lifecycle i streaming

Resident identity/state nie zależy od cave presentation streaming.

Po unload cave zwierzę nie jest traktowane jako pokonane, persistent state pozostaje zgodny z istniejącym fauna lifecycle, ponowne wejście nie tworzy kopii, a martwy resident nie respawnuje.

Nie utrzymywać kosztownej detailed cave movement simulation dla dalekiego dungeon tylko dlatego, że resident jest persistent. Reuse istniejący hybrid/off-screen fauna model.

---

## 21. World independence

Dungeon residents istnieją niezależnie od playera. Nie są tworzeni przy wejściu gracza, aktywacji questu, zobaczeniu chamber ani załadowaniu render mesh.

Declarations wynikają deterministycznie z world/cave state.

Przyszłe questy mogą odkrywać istniejących mieszkańców:

```text
world has dungeon
→ dungeon has dangerous residents
→ residents create danger/problem
→ quest discovers existing problem
```

Nie: `quest starts → spawn quest bear`.

---

## 22. Relationship z `quests-progression-008`

`quests-progression-008-treasure-map-bear-cave.md` powinien po tym planie móc korzystać z realnych dungeon/cave residents zamiast tworzyć własny encounter.

Ponieważ bear nie jest gwarantowany w każdym dungeon, quest wymagający konkretnego bear musi wybierać cave, która faktycznie posiada bear resident, albo opierać warunek na szerszej realnej world state. Nie wolno mu dospawniać niedźwiedzia tylko dla questa.

Quest integration pozostaje własnością planu questowego.

---

## 23. Performance

Dungeon caves są rzadkie, ale rozwiązanie musi skalować się do wielu regions.

Unikać:

- globalnego per-frame skanowania dungeon chambers,
- globalnego skanowania pools przez każde zwierzę,
- permanentnego aktywowania distant residents,
- osobnego ticka fish source,
- item entities reprezentujących infinite fish.

Needs lookup powinien korzystać z cave-local known sources, nie global world scan.

---

## 24. Testy automatyczne

### Population

Dla dungeon z wieloma chambers:

- minimum jeden resident,
- maksymalnie `chamberCount - 1`,
- jedna właściwa chamber jest reserved od initial home assignment,
- entrance safety zone nie otrzymuje home,
- kolejne eligible chambers używają deterministycznego 75% roll,
- ten sam seed daje tę samą obsadę.

### Identity

Sprawdzić stable resident IDs i brak zależności od topology array index / runtime ordering.

### Species

Sprawdzić:

- minimum jeden predator/dangerous resident,
- `bear` i `wolf` korzystają z istniejących `AnimalKind`,
- weighted selection jest deterministyczny,
- bear nie jest sztucznie gwarantowany w każdym dungeon,
- brak dungeon-only species branch.

### Habitat

Sprawdzić:

- resident ma real cave habitat,
- home znajduje się w przypisanej chamber,
- placement jest walkable,
- cave traversal korzysta z istniejącego contractu.

### Water

Przy thirst:

```text
cave resident
→ shallow underground pool
→ legal approach/wading target
→ drinking
→ thirst relief
```

Pool nie wymaga swimming ani drowning logic.

### Fish

Dla kompatybilnego animal:

```text
hungry
→ chooses environmental fish source
→ reaches legal approach
→ feeds
→ hunger decreases
→ source remains available
```

Dla niekompatybilnego gatunku fish source jest ignorowany.

### Infinite source

Po wielokrotnym consumption source nadal istnieje, nie powstają fish items, mutable stock ani respawn timer.

### Persistence

Sprawdzić brak duplikacji po unload/reload oraz brak respawnu martwego persistent residenta.

### Regression

Sprawdzić, że surface foraging, carcass consumption, dropped-food attraction oraz natural/adventure caves zachowują dotychczasowe zachowanie.

---

## 25. Manual browser verification

Browser verification wykonuje User.

Sprawdzić:

1. Guaranteed dungeon posiada mieszkańców.
2. Obsada jest deterministyczna, ale nie każdy dungeon musi posiadać bear.
3. Bear pojawia się często zgodnie z wysoką wagą, wolf pozostaje realnym wariantem/fallbackiem.
4. Zwierzęta znajdują się w różnych chambers, nie w jednym skupisku.
5. Entrance safety zone nie ma initial home.
6. Jedna właściwa chamber pozostaje bez initial resident, ale nie zawsze musi to być pierwsza chamber.
7. Zwierzęta nie zachowują się jak statyczne encounter mobs.
8. Resident porusza się po cave bez przecinania ścian i może przechodzić między chambers.
9. Spragnione zwierzę potrafi dojść do shallow underground pool i napić się.
10. Pool jest na tyle płytki, że normalne poruszanie nie wymaga swimming/drowning handling.
11. Diet-compatible resident potrafi skorzystać z pool fish source.
12. Fish source nie znika po jedzeniu i nie tworzy fizycznych fish items.
13. Resident reaguje na playera zgodnie ze zwykłym species behavior.
14. Zabity resident nie respawnuje po wyjściu i powrocie.
15. Reload/save nie duplikuje mieszkańców.
16. Optional exceptional variant korzysta z normalnego variant presentation/stats.
17. Dungeon bez obserwującego gracza nie wymaga permanentnej detailed simulation.
18. Natural/adventure caves zachowują się bez zmian.

AI nie wykonuje browser verification.

---

## 26. Dokumentacja

Po implementacji zaktualizować odpowiednie current-state docs i udokumentować faktycznie wdrożone:

- dungeon persistent fauna residents,
- initial population policy,
- cave habitat ownership,
- shallow underground pool jako cave-local water source,
- environmental infinite fish source,
- diet-driven compatibility,
- brak dungeon-specific AI/combat/persistence.

Nie dokumentować quest-specific behavior przed implementacją odpowiedniego planu questowego.

Ważne publiczne/architektoniczne funkcje i klasy opisać JSDoc tam, gdzie poprawia to preflight discovery; użyć `@domain fauna`.

---

## Non-goals

Poza zakresem:

- dungeon-specific enemy FSM,
- bosses jako osobny system,
- nowe dungeon-only `AnimalKind`,
- quest spawning,
- room encounter triggers,
- respawn po czasie,
- fish item spawning,
- fish population/depletion,
- player fishing,
- animal swimming/diving,
- drowning logic dla shallow dungeon pool,
- underwater combat,
- breeding rules dla dungeon population,
- nowe loot tables,
- osobny dungeon persistence model,
- player contamination logic,
- przebudowa całego animal foraging framework.

---

## Kryterium zakończenia

Plan jest wykonany, gdy dungeon cave:

- posiada deterministyczną initial resident population,
- posiada minimum jednego residenta i maksymalnie `chambers - 1`,
- używa reguły 75% dla dodatkowych eligible chambers,
- posiada entrance safety zone i jedną deterministycznie reserved chamber bez initial home,
- posiada co najmniej jednego predator/dangerous residenta,
- preferuje bear przez weighted species selection, ale go nie gwarantuje,
- używa istniejących persistent occupants i cave habitat/navigation,
- używa normalnych `AnimalAgent`, needs i combat,
- pozwala cave residents pić z płytkiego, wadeable underground pool,
- nie wymaga swimming/drowning logic,
- pozwala diet-compatible animals korzystać z niewyczerpywalnego environmental fish source,
- nie tworzy fish items ani fish population simulation,
- zachowuje resident state niezależnie od streamingu/playera,
- nie wprowadza równoległego dungeon AI, combat ani persistence systemu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**