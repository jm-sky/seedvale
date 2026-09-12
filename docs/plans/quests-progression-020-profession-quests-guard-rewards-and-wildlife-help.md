# Plan: Profession Quests, Guard Rewards & Wildlife Help

**Created:** 2026-09-12
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** fauna-022, fauna-023, quests-progression-019
**Domain:** `quests-progression`
**Subdomains:** `quests` `progression` `rewards` `relationships`
**Tags:** `hunter` `guard` `alpha-wolf` `renown` `loot` `wildlife`
**Roadmap:** `quests-and-reputation.md`

## Cel

Przebudować wybrane nagrody i dodać spójne profesyjne zadania dla Huntera oraz Strażnika tak, aby:

- nagrody wynikały z roli NPC i realnych działań gracza,
- miecz od Strażnika był nagrodą za znaczącą pomoc osadzie albo zabicie alpha wolf, a nie za banalne `woda-dla-marka`,
- Hunter prowadził gracza przez prostą progresję polowania: sarny → jelenie → pomoc zwierzynie w zagajniku,
- poroże było normalnym lootem fauny, nie questowym artefaktem,
- karmienie saren/jeleni używało istniejącego systemu attraction/diet i realnych zwierząt z `thicket`,
- jednorazowe zadanie wieczorne Strażnika korzystało z rzeczywistych świateł osady,
- questy profesyjne wiązały się z konkretnym NPC o odpowiedniej roli przez stabilne `NpcId`, bez hardkodowania imion.

Plan ma rozszerzać obecne `QuestDef` / `QuestManager`, settlement quest opportunities, fauna-owned loot/attraction, `ReputationManager`, `DayNightState` i istniejące world flags. Nie tworzyć osobnego profession-quest engine, hunter reputation ani guard reward managera.

## 1. Stan obecny i decyzje architektoniczne

### Quest runtime

Aktualny quest runtime już zapewnia:

- `QuestDef` / `QuestStage` / `QuestOutcome`,
- prerequisites: relation, prior quest outcome, settlement reputation, settlement renown,
- `gather_item` z atomowym validate → consume przy rozmowie z giverem,
- animal/world objectives,
- world-driven `SettlementQuestOpportunity` → materialization → zwykły `QuestDef`,
- stabilne `QuestNpcRef.npcId`,
- explicit rewards/consequences,
- persistence przez `QuestProgressEntry`.

Źródła prawdy:

- `src/quests/quests.ts`,
- `src/quests/QuestManager.ts`,
- `src/quests/opportunities/worldQuestMaterialization.ts`,
- `src/quests/opportunities/settlementQuestSelection.ts`,
- `src/app/createApp.ts`,
- `docs/state/quests.md`.

### Role-based givers

`opportunityNpcsFromSettlement()` już materializuje mieszkańców osady z rolą i stabilnym id. Profesyjne questy Huntera/Strażnika mają wybierać givera po `role`, a nie po `displayName`.

Nie dodawać kolejnego rejestru NPC ani name-based fallbacku.

### Alpha wolf

`fauna-022` jest zaimplementowane: alpha pozostaje `AnimalKind === 'wolf'`, posiada fauna-owned variant i większe `AnimalAgent.dangerSignificance`.

`quests-progression-019` jest zaimplementowane: player kill niebezpiecznego zwierzęcia przechodzi przez istniejący animal-deed reputation/renown resolver.

Nie dodawać `alpha_wolf` do `AnimalKind` i nie duplikować tabeli wariantów w questach.

### Animal harvest

`src/fauna/animalHarvest.ts::harvestAnimalIntoInventory()` jest wspólnym knife-harvest core dla gracza i Hunter NPC. Aktualnie tworzy species meat + opcjonalny `hide`.

Poroże rozszerza ten właśnie loot pipeline. Nie przyznawać `antler` z `QuestManager` i nie tworzyć osobnego corpse-loot path.

### Attraction / feeding

`fauna-023` dostarcza systemic dropped-food attraction oparty o `AnimalDef.diet`. Quest karmienia ma obserwować realne spożycie kompatybilnego jedzenia przez zwierzęta, zamiast wykonywać quest-only `feed()`.

### Guard sword legacy

`src/items/guardSword.ts::askGuardForSword()` obecnie dopuszcza prezent po `woda-dla-marka` lub przy relacji `>= 1`; `src/app/inventoryWiring.ts` używa persisted `worldFlags.guardSwordGifted`.

To historyczne powiązanie ma zostać usunięte. `woda-dla-marka` nie odblokowuje broni.

## 2. Hunter quest chain — dwa osobne questy, nie dwa stage jednego questa

Dwa questy są osobnymi `QuestDef`, ponieważ każdy ma własny terminal reward. Nie próbować implementować śród-stage item reward w jednym queście.

### 2.1 Hunter I — sarny i skóry

Gameplay:

```text
Hunter prosi o skóry ze zwykłego polowania
→ gracz poluje na sarny (`deer`)
→ harvestuje zwłoki normalnym nożem
→ przynosi 3 × hide
→ Hunter odbiera skóry
→ reward: 1 × short_bow
```

Konkrety V1:

- giver: deterministycznie wybrany dorosły NPC z `role === 'hunter'` w danej osadzie,
- wymaganie: **3 sarny / 3 skóry**,
- final hand-in: `gather_item hide ×3`, który konsumuje skóry,
- nagroda: `short_bow ×1`,
- mała dodatnia relacja z giverem,
- niewielka lokalna `competence`/renown, bez nagradzania courage za zwykłe polowanie.

### Potwierdzenie polowania

Samo `gather_item hide` nie dowodzi gatunku, bo `hide` jest generic lootem wielu zwierząt. Plan wymaga małego reusable quest progress seam dla **player-harvested species**, a nie trzech kolejnych `kill_target_animal`:

```ts
onAnimalHarvested({ animalKind, animalId, lootKinds })
```

Quest objective powinien móc policzyć np.:

```ts
{ type: 'harvest_animals', kind: 'deer', count: 3 }
```

Wymagania:

- event pochodzi z udanego player knife harvest, nie samej śmierci,
- NPC Hunter harvest nie progressuje questa gracza,
- licznik jest quest-owned i persistent,
- finalny etap nadal wymaga fizycznego `hide ×3` w inventory i je konsumuje,
- loot oraz corpse ownership pozostają w fauna/items.

Nie używać `kill_target_animal`, bo jego semantyka to jeden związany konkretny osobnik i aktywne wild binding może zostać `invalidated` po restore.

### 2.2 Hunter II — jelenie i poroża

Dostępność:

- wymaga successful outcome Hunter I,
- ten sam hunter giver, o ile NPC nadal żyje; stable `NpcId` jest identity.

Gameplay:

```text
Hunter prosi o poroża jeleni
→ gracz poluje na `stag`
→ harvestuje zwłoki
→ każde dorosłe stag ma 50% szansy na antler
→ gracz przynosi wymagane poroża
→ reward: 1 × hunting_bow
```

Konkrety V1:

- objective `harvest_animals` dla `stag`, aby quest wymagał realnego polowania,
- wymagany hand-in: **2 × antler**,
- `antler` drop chance: **50%** przy knife harvest dorosłego `stag`,
- reward: `hunting_bow ×1`,
- relacja/competence/renown wyższe niż Hunter I, ale nadal bez courage.

Nie ustalać z góry liczby jeleni do zabicia potrzebnej do zdobycia 2 poroży — 50% loot ma tworzyć naturalną zmienność. Objective polowania powinien wymagać minimum 2 harvested `stag`; finalny hand-in 2 × antler może naturalnie wymusić dalsze polowanie.

## 3. `antler` jako normalny item i fauna loot

Dodać `antler` do istniejącego item stack:

- `src/items/items.ts` — `ItemKind` + `ITEM_DEFS`,
- `src/items/itemCatalog.ts` — resource metadata/tradeability zgodna z obecnym katalogiem,
- `src/items/tradeCatalog.ts` — jedna authoritative wartość handlowa,
- odpowiednia dokumentacja item catalog, jeśli generator nie pokrywa wpisu automatycznie.

Loot integration:

- rozszerzyć `AnimalHarvestResult` tak, aby reprezentował dodatkowy loot bez specjalnego questowego callbacku,
- `harvestAnimalIntoInventory()` rozstrzyga normalny meat/hide + trophy loot,
- `antler` tylko dla dorosłego `stag`, nie `deer`, juvenile ani innych species,
- 50% roll ma korzystać z deterministycznego RNG/key convention istniejącego świata; nie używać nagiego `Math.random()` w harvest path,
- roll nie może być wykonywany ponownie przez samo ponowne wywołanie harvest — corpse nadal pozostaje one-shot harvested.

Implementation recon ma wskazać najlepszy istniejący stable key dla rollu (`worldSeed` + stable animal/spawn identity). Jeżeli dany wild identity nie jest stabilny przez save/load przed harvestem, nie rozszerzać persistence całej fauny tylko dla trophy; zachować determinism w ramach authoritative corpse lifetime i opisać granicę.

## 4. Hunter III — pomoc zwierzynie z zagajnika

Nie niszczyć `thicket`. Zagajnik jest habitatem/population source i pozostaje ownerem swojej fauny.

Gameplay:

```text
Hunter zauważa słabszą dostępność pożywienia przy zagajniku
→ wskazuje konkretny `thicket`
→ gracz zostawia kompatybilne roślinne jedzenie
→ realne deer/stag związane z tym habitatem podchodzą przez attraction
→ minimum N realnych zwierząt zjada pożywienie
→ quest gotowy do raportu
```

V1:

- target: konkretny stable `thicket` / spawner id,
- species: `deer` i `stag`,
- required successful feed count: **3** zwierzęta/consumption events,
- kompatybilne pokarmy V1: `apple`, `carrot`, `berries`,
- jedzenie jest normalnie konsumowane przez fauna attraction,
- quest nie teleportuje zwierząt i nie zwiększa hunger sztucznie,
- tylko zwierzę powiązane z target `thicket` progressuje objective,
- jedno zwierzę nie może nabijać całego celu przez wielokrotne zjedzenie; liczyć unikalne `animalId` w aktywnym objective albo jawnie udokumentowane unique-consumption semantics.

Rozszerzyć species diet dla `deer` / `stag` w `src/fauna/animalDefs.ts` i reuse `fauna-023` attraction. Nie tworzyć osobnego quest-specific movement/feeding path.

Nowy quest objective może być semantycznym odpowiednikiem:

```ts
{
  type: 'feed_habitat_animals'
  spawnerId: string
  kinds: readonly ['deer', 'stag']
  count: 3
}
```

Źródło progressu: callback/event z faktycznego zakończenia consumption w fauna attraction, nie z samego dropnięcia itemu.

## 5. Strażnik — prezent pochodni zamiast łatwego prezentu miecza

Usunąć stare zachowanie:

```text
woda-dla-marka complete OR relation >= 1
→ long_sword
```

Zastąpić je lekkim jednorazowym gestem Strażnika:

```text
friendly relation OR renown >= threshold
→ guard może podarować wooden_torch
```

Tuning V1:

- relation: `friendly` (obecny threshold `>= 3`), **lub**
- settlement renown: **>= 6**,
- prezent: **2 × wooden_torch**,
- jednorazowo dla home guard / konkretnego stable guard NPC,
- brak związku z `woda-dla-marka`.

Preferować istniejący dialogue topic/interaction seam, ale zmienić nazewnictwo modułu z sword-specific na semantykę guard gift/reward, jeżeli po zmianie `guardSword.ts` przestaje mieć sens.

Nie twórz specjalnego `TorchQuest` tylko po to, by dać prezent.

## 6. Strażnik — miecz jako uznanie zasług: dwie alternatywne drogi

Strażnik może przekazać `long_sword` **raz**, gdy gracz spełni pierwszy z dwóch warunków.

### A. Wysoka renoma osady

Warunek V1:

```text
home settlement renown >= 12
```

`12` odpowiada mniej więcej kilku zwykłym zakończonym questom przy obecnych rewardach rzędu 3–4 renown, ale nadal może zostać osiągnięte szybciej przez duże, znaczące world-event outcomes. To pożądane: warunek mierzy faktyczną renomę, nie licznik questów.

Strażnik oferuje w dialogu uznanie za pomoc osadzie i przekazuje miecz.

Nie dodawać licznika „ukończono 4 questy”. `ReputationManager.getRenown(settlementId)` jest authoritative.

### B. Zabicie alpha wolf przez gracza

Warunek:

- śmierć konkretnego alpha wolf musi być **player-caused**,
- rozpoznanie alpha bierze się z fauna-owned variant/danger context,
- normalny wilk nie kwalifikuje,
- NPC/predator/environment kill nie kwalifikuje.

Nie inferować tego później z samego `renown`, bo wtedy oba warunki stałyby się de facto jednym.

Dodać minimalny persistent fact w istniejącym save/world progression shape, np. semantycznie:

```ts
guardAlphaWolfDeedRecognized: boolean
```

lub lepiej stabilny record z `animalId`/deed id, jeżeli obecny player-kill integration już ma taką trwałą reprezentację. Nie dodawać nowego managera.

Fakt ustawiany jest w istniejącej player-animal-kill integration, obok animal-deed reputation resolution, tylko dla alpha kill. Fauna nie mutuje guard state.

### Jedno ostrze, druga droga = coins

Obie drogi są niezależnie claimable, ale `long_sword` fizycznie może zostać podarowany tylko raz.

Przykład:

```text
renown route claimed first
→ long_sword
→ później alpha route
→ coin equivalent
```

oraz odwrotnie.

Każda droga może zostać rozliczona dokładnie raz.

Coin fallback:

- nie hardkodować `50`,
- użyć istniejącego authoritative `tradeValue('long_sword')` / odpowiedniego pricing primitive z `src/items/tradeCatalog.ts`,
- fallback ma dawać pełną równowartość nagrody, nie merchant sell price (`sellPrice()` = ~50% trade value),
- jeżeli gracz już posiada miecz z innego źródła, ale Strażnik jeszcze swojego nie przekazał, reward route także powinien przejść na coin equivalent zamiast mintować drugi miecz.

Persistence musi rozróżniać co najmniej:

```text
sword/gift physically granted or substituted
renown recognition claimed
alpha recognition claimed
```

Nie wystarczy obecne pojedyncze `worldFlags.guardSwordGifted`, bo nie odróżnia dwóch claimable routes.

## 7. Strażnik — jednorazowe wieczorne zadanie świateł

Quest jest osobnym, lekkim zadaniem i **nie daje miecza**.

Gameplay:

```text
każdego dnia przed wieczorem Strażnik może poprosić o przygotowanie osady
→ quest jest widoczny tylko przez 1 godzinę czasu świata
→ okno wypada między ~17:00 a ~19:00
→ gracz zapala settlement torches + settlement campfire
→ raport do Strażnika
→ quest nigdy więcej nie jest oferowany przez tego NPC
```

### Okno dostępności

Nie wprowadzać real-time timerów.

`DayNightState.timeOfDay` jest authoritative (`hour / 24`), `elapsedDays` daje dzień świata.

Dla konkretnego guard NPC i dnia wyliczyć deterministyczne 1-godzinne okno:

```text
start ∈ [17:00, 18:00]
end = start + 1h
```

Start ma być stabilny dla `(worldSeed, npcId, floor(elapsedDays))`, tak aby nie zmieniał się po otwarciu dialogu/rebuildzie.

Quest może pojawić się ponownie kolejnego dnia, jeżeli nie został przyjęty/ukończony. Po przyjęciu nie znika wraz z końcem offer window; okno dotyczy tylko **oferty**, nie deadline completion.

Nie rozszerzać quest progress o deadline/timestamp tylko dla tego zadania.

### Availability contract

Aktualne `QuestAvailability` nie zna czasu. Dodać najmniejsze reusable prerequisite/availability predicate dla czasu świata, np.:

```ts
{ type: 'time_window', start: number, end: number }
```

Jeżeli daily deterministic start jest materializowany do konkretnego `QuestDef`, definicja nie może być zbudowana raz na boot i zamrozić dnia. Preferować injected current world-time lookup w availability evaluation albo lightweight dynamic offer predicate, zachowując `QuestManager` jako ownera lifecycle.

Nie wstrzykiwać całego `DayNightState` do quest definitions; wystarczy read-only callback zwracający `timeOfDay`/`elapsedDays`.

### Objective: światła osady

Settlement campfire już ma realny `VillageFire` state. Village torch posts/light state należy odczytać z istniejącego settlement props/light ownera.

Dodać world-state objective, np.:

```ts
{
  type: 'light_settlement_fires'
  settlementId: string
}
```

Completion = wszystkie wymagane settlement torch lights + settlement campfire są aktualnie zapalone.

Quest nie przechowuje kopii `lit` state i nie odpala świateł sam. `QuestManager` dostaje tylko read-only resolver/callback podobnie do innych world-state objectives.

V1 nie obejmuje player-built standing torches — tylko canonical settlement lights konkretnej osady.

Nagroda:

- mała relacja ze Strażnikiem,
- mała `benevolence`/`trust`,
- niewielka coin reward albo brak item reward; nie `long_sword`.

## 8. Dialog — quest-aware entry zamiast obowiązkowego „Może w czymś ci pomóc?”

Obecne `src/ui-vue/NpcDialogueMenu.vue` ma statyczny topic:

```text
Może w czymś ci pomóc?
```

Dopiero jego kliknięcie uruchamia `resolveNpcDialogueHelp()` i odsłania quest offer/report/action.

W tym planie poprawić warstwę wejściową tak, aby:

- `ready_to_report` pokazywał authored `reportPlayerLine` / semantyczny action label bez konieczności kliknięcia generic help,
- aktywny required talk action także mógł pojawić się bezpośrednio,
- offer może nadal używać naturalnego „Mogę jakoś pomóc?” jeżeli nie ma bardziej konkretnej authored linii,
- Vue nie branchuje po quest id/stage/objective; dostaje resolved action/label ze store/QuestManager seam,
- samo otwarcie dialogu nadal niczego nie progressuje.

Nie tworzyć drugiego dialogue engine.

## 9. Persistence / one-shot semantics

### Hunter chain

- quest outcomes w `QuestManager` wystarczają do sequential availability,
- `harvest_animals` count musi round-tripować w quest progress; rozszerzyć istniejący `QuestRuntimeProgress`/serialized progress minimalnie zamiast osobnego registry,
- active count nie może resetować się po save/load.

### Wildlife feeding

- unique fed animal ids są runtime identity; jeżeli objective aktywny przez save/load i ordinary wild identity nie jest stabilna, nie persistować stale IDs jako trwałej prawdy,
- preferować persisted numeric count + current-session dedupe set; po restore dedupe może zacząć od nowa tylko jeżeli nie pozwala przekroczyć persisted target przez powtórzenie wcześniej policzonych osobników. Jeżeli to niemożliwe bez stabilnego source-event id, implementation notes mają wskazać bezpieczny minimalny event identity contract.

### Guard rewards

Rozszerzyć istniejący persisted progression/worldFlags shape zamiast tworzyć nowy manager. Migracja starych save:

- `guardSwordGifted: true` mapuje na sword already granted,
- stare save nie mają claimed route flags → oba false,
- legacy well-quest completion samo w sobie nie tworzy nowego sword entitlement po migracji.

### Evening lights

Quest completion outcome jest one-shot per stable guard NPC. Nie dodawać osobnego `eveningLightsDone` world flag, jeżeli zwykły quest outcome już rozwiązuje lifetime gating.

## 10. Ownership

```text
fauna
→ owns animal species/variant, corpse harvest, diet, attraction, consumption

items
→ owns antler item definition/value/inventory representation

quests
→ owns player quest lifecycle + counters + profession chain + hand-in

settlement/world
→ owns torch/campfire lit state

world time
→ owns timeOfDay / elapsedDays

reputation
→ owns settlement renown/reputation

app composition
→ wires read-only lookups/events between owners
```

Quest code nie może:

- ustawiać animal hunger,
- spawnować antler bez harvest,
- ustawiać torch/campfire `lit`,
- mutować renown bez normalnego consequence path,
- rozpoznawać alpha przez nazwę/model/scale.

## 11. Relevant files / verified seams

Implementation notes przed kodowaniem mają ponownie sprawdzić aktualne symbole, ale plan bazuje na obecnym `main`:

### Quests / dialogue

- `src/quests/quests.ts` — objective/availability/reward/outcome contracts,
- `src/quests/QuestManager.ts` — lifecycle, item hand-in, objective progress, dialogue override,
- `src/quests/opportunities/worldQuestMaterialization.ts` — `OpportunityNpc`, role-bearing NPC list, materialization,
- `src/quests/opportunities/settlementQuestSelection.ts` — deterministic opportunity selection,
- `src/app/createApp.ts` — runtime quest composition + injected lookups,
- `src/ui-vue/NpcDialogueMenu.vue`,
- `src/ui-vue/store.ts` — quest/help dialogue presentation seam.

### Guard / progression

- `src/items/guardSword.ts` — legacy sword ask logic to replace/generalize,
- `src/app/inventoryWiring.ts` — current guard gift dialogue wiring,
- `src/reputation/ReputationManager.ts` — renown authority,
- `src/reputation/animalDeeds.ts` — player dangerous-animal social consequence,
- `src/items/tradeCatalog.ts` — authoritative item trade value,
- `src/persistence/saveData.ts`, `src/app/saveState.ts` — current `worldFlags.guardSwordGifted` persistence/migration.

### Fauna / items

- `src/fauna/AnimalAgent.ts` — variant/danger identity,
- `src/fauna/animalVariants.ts`,
- `src/fauna/animalHarvest.ts` — shared harvest core,
- `src/fauna/animalMeat.ts`,
- `src/fauna/animalDefs.ts` — diet authority,
- existing fauna-023 attraction/consumption implementation,
- `src/fauna/AnimalSpawner.ts` / `src/fauna/createFauna.ts` — `thicket` source binding,
- `src/items/items.ts`,
- `src/items/itemCatalog.ts`,
- `src/items/tradeCatalog.ts`.

### Settlement lights / time

- `src/settlement/VillageFire.ts`,
- `src/settlement/campfireProps.ts`,
- `src/settlement/props.ts`,
- existing village-torch/light owner discovered from those call-sites,
- `src/world/dayNight.ts` — `timeOfDay`, `elapsedDays`, `formatClock`.

## 12. Testy

Dodać targeted automated tests co najmniej dla:

### Hunter I

- tylko player harvest `deer` zwiększa `harvest_animals deer` count,
- śmierć bez harvest nie liczy,
- Hunter NPC harvest nie liczy,
- 3 deer + 3 hide → hand-in konsumuje dokładnie 3 hide,
- reward dokładnie 1 `short_bow`, exact-once,
- save/load zachowuje partial harvest count.

### Antler / Hunter II

- `antler` jest normalnym `ItemKind`,
- deer nigdy nie daje antler,
- adult stag ma 50% deterministic loot rule,
- juvenile stag nie daje antler,
- corpse harvest pozostaje one-shot,
- 2 antler są konsumowane przy report,
- reward dokładnie 1 `hunting_bow`,
- Hunter II niedostępny bez successful Hunter I outcome.

### Feeding

- deer/stag akceptują wybrane plant items, predator compatibility nie zmienia się,
- dropped compatible food wykorzystuje istniejący attraction path,
- tylko consumption przez animal z target thicket liczy,
- inne habitaty nie liczą,
- ten sam animal nie nabija wielokrotnie objective,
- quest nie teleportuje/nie karmi bez realnej konsumpcji.

### Guard torch gift

- well quest nie odblokowuje miecza,
- `friendly` relation OR renown >= 6 umożliwia jednorazowe `2 × wooden_torch`,
- prezent nie blokuje późniejszego sword recognition.

### Guard sword recognition

- renown 11 → brak route, 12 → route dostępna,
- player alpha kill → alpha route dostępna,
- normal wolf / NPC kill alpha → brak alpha route,
- pierwszy claimed route daje sword, jeśli gracz go nie ma,
- jeśli sword już dostał/ma, drugi route daje dokładnie `tradeValue(long_sword)` coins,
- każda route exact-once,
- save/load nie duplikuje sword ani coins,
- legacy `guardSwordGifted` migrates safely.

### Evening guard lights

- deterministic daily offer window trwa dokładnie 1 game hour i mieści się 17:00–19:00,
- ten sam seed/day/npc daje ten sam window,
- nieprzyjęty quest może pojawić się kolejnego dnia,
- przyjęty quest nie znika po końcu offer window,
- completion wymaga canonical settlement lights + campfire,
- player-built torch nie liczy,
- po successful lifetime outcome nie jest oferowany ponownie.

### Dialogue

- `ready_to_report` ma bezpośredni authored entry/action,
- generic help nie jest wymagany do report,
- otwarcie menu bez wyboru action nie progressuje questa,
- Vue nie zawiera quest-id-specific branchy.

## 13. Manual verification

Browser/manual verification wykonuje User:

1. Hunter I: upolować/harvestować 3 deer, oddać 3 skóry, dostać short bow.
2. Hunter II: polować na stag do zdobycia 2 poroży; potwierdzić losowy 50% loot i hunting bow reward.
3. Hunter wildlife help: zostawić odpowiednie jedzenie przy wskazanym thicket; realne deer/stag podchodzą, jedzą i progressują quest.
4. Guard gift: friendly/high-renown guard daje pochodnie, nie miecz.
5. Guard renown route: po wysokiej renomie guard oferuje sword recognition.
6. Guard alpha route: player zabija alpha wolf i otrzymuje recognition; normal wolf nie działa.
7. Spełnić obie sword routes w różnej kolejności — tylko pierwszy daje miecz, drugi równowartość w monetach.
8. Evening lights: znaleźć 1h offer window między 17–19, przyjąć quest, zapalić wszystkie settlement lights + campfire, oddać bez przechodzenia przez „Może w czymś ci pomóc?”.
9. Save/load w połowie Hunter harvest count oraz pomiędzy pierwszą i drugą guard recognition route.

AI nie wykonuje browser verification.

## 14. Non-goals

Plan nie obejmuje:

- przebudowy `wilcza-jama`,
- przenoszenia istniejącej `wilcza-jama` do Huntera,
- nowego systemu bossów,
- osobnego `alpha_wolf` kind,
- globalnej reputacji,
- handlu z dowolnym NPC (`settlements-npcs-033` pozostaje osobnym planem),
- pełnego loot-tier systemu / trophy quality,
- nowych modeli 3D dla poroża,
- polowania NPC na zlecenie gracza,
- deadline/failure timera dla wieczornego questa,
- player-built lights jako część quest objective,
- ogólnego generic timed-quest frameworka poza minimalnym world-time availability seam,
- nowego dialogue-tree engine.

## 15. Dokumentacja i implementation notes

Przed implementacją przygotować:

`docs/plans/implementation-notes/quests-progression-020-profession-quests-guard-rewards-and-wildlife-help-implementation-notes.md`

Notes mają zweryfikować przede wszystkim:

- dokładny fauna-023 consumption callback i możliwość identyfikacji source `thicket`,
- stable key dla 50% antler roll,
- obecny player-kill callback, z którego można zapisać alpha deed fact bez duplikowania animal-deed resolvera,
- dokładny owner village torch lit state,
- aktualny save migration/default path dla nowych guard reward flags,
- najwęższy sposób persistowania counted quest objectives.

Po implementacji zaktualizować `docs/state/quests.md`, a jeżeli zmienią się kontrakty domenowe także `docs/state/fauna.md` / `docs/state/persistence.md`.

Dla nowych ważnych publicznych resolverów/objective progress functions dodać JSDoc z `@domain quests-progression` lub `@domain fauna`, jeśli poprawia to preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
