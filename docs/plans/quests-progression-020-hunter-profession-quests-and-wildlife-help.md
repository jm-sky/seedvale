# Plan: Hunter Profession Quests & Wildlife Help

**Created:** 2026-09-12
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~fauna-023~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `progression` `rewards` `relationships`
**Tags:** `hunter` `harvest` `antler` `wildlife` `thicket` `attraction`
**Roadmap:** `quests-and-reputation.md`
**Model:** Opus, Sonnet

## Cel

Dodać spójną profesyjną progresję Huntera opartą na realnych systemach fauny:

- Hunter I: polowanie na `deer` i oddanie skór → `short_bow`,
- Hunter II: polowanie na `stag` i oddanie poroży → `hunting_bow`,
- Hunter III: pomoc zwierzynie przy konkretnym `thicket` przez rzeczywiste dropped-food attraction i consumption,
- `antler` jako normalny fauna-owned loot i zwykły item, nie questowy artefakt,
- progress polowania liczony z realnego player harvest, nie z samego posiadania generic `hide`,
- giver związany ze stable `NpcId` i rolą `hunter`, bez hardkodowania imienia.

Plan rozszerza obecne `QuestDef` / `QuestManager`, settlement quest opportunities, fauna harvest, `AnimalDef.diet`, fauna-023 attraction oraz zwykły item/inventory stack. Nie tworzyć osobnego profession-quest engine, Hunter reputation, quest-owned loot ani quest-specific animal movement/feeding.

> Guard rewards i evening settlement duty zostały wydzielone do `quests-progression-021-guard-rewards-and-evening-settlement-duty.md` i nie należą już do scope 020.

## 1. Zweryfikowany stan i decyzje architektoniczne

### Quest runtime

Aktualny quest runtime zapewnia już:

- `QuestDef` / `QuestStage` / `QuestOutcome`,
- prerequisites, w tym prior quest outcome,
- `gather_item` z validate → consume przy hand-in,
- animal/world objectives,
- world-driven `SettlementQuestOpportunity` → zwykły `QuestDef`,
- stable `QuestNpcRef.npcId`,
- explicit rewards/consequences,
- persistence przez `QuestProgressEntry`,
- multiple quest contexts per NPC w jednym generic dialogue contract.

Źródła prawdy:

- `src/quests/quests.ts`,
- `src/quests/QuestManager.ts`,
- `src/quests/opportunities/worldQuestMaterialization.ts`,
- `src/quests/opportunities/settlementQuestSelection.ts`,
- `src/app/createApp.ts`,
- `docs/state/quests.md`.

### Role-based giver

`opportunityNpcsFromSettlement()` udostępnia mieszkańców z rolą i stable NPC id. Hunter chain ma deterministycznie wybrać dorosłego NPC z `role === 'hunter'` w danej eligible settlement i związać wszystkie trzy questy z tym samym `NpcId`.

Nie dodawać kolejnego rejestru NPC ani name-based fallbacku.

### Animal harvest

`src/fauna/animalHarvest.ts::harvestAnimalIntoInventory()` jest wspólnym knife-harvest core używanym przez gracza i Hunter NPC. Loot pozostaje własnością fauna/items.

Quest potrzebuje player-only reporting seam po udanym harvest, a nie callbacku wewnątrz shared harvest core, żeby NPC Hunter nie progressował questa gracza.

### Attraction / feeding

`fauna-023` dostarcza systemic dropped-food attraction oparty o `AnimalDef.diet` i rzeczywiste atomowe consumption world itemu. Hunter III ma obserwować skuteczne consumption, a nie samo upuszczenie jedzenia ani quest-only `feed()`.

## 2. Hunter I — sarny i skóry

Gameplay:

```text
Hunter prosi o skóry ze zwykłego polowania
→ gracz poluje na deer
→ harvestuje zwłoki normalnym nożem
→ przynosi 3 × hide
→ Hunter odbiera skóry
→ reward: 1 × short_bow
```

V1:

- giver: deterministycznie wybrany adult `role === 'hunter'`, stable `NpcId`,
- objective: player harvest **3 × `deer`**,
- final hand-in: `gather_item hide ×3`, które konsumuje skóry,
- reward: `short_bow ×1`,
- mała dodatnia relacja z giverem,
- niewielka lokalna `competence` / renown,
- bez courage za zwykłe polowanie.

Samo `gather_item hide` nie dowodzi species, bo `hide` jest generic lootem. Dlatego dodać reusable counted objective semantycznie:

```ts
{ type: 'harvest_animals', kind: 'deer', count: 3 }
```

oraz player-only reporting seam, np.:

```ts
onAnimalHarvested({ animalKind, animalId, lootKinds })
```

Wymagania:

- event powstaje dopiero po udanym player knife harvest,
- samo zabicie nie progressuje,
- NPC harvest nie progressuje,
- licznik jest quest-owned i persistent,
- stage advance resetuje stage-local count,
- final hand-in nadal wymaga fizycznego `hide ×3`.

Nie używać `kill_target_animal`: jego semantyka dotyczy jednego konkretnego bound animal i ma inne restore/invalidation rules.

## 3. Hunter II — jelenie i poroża

Dostępność:

- wymaga successful outcome Hunter I,
- rekonstruuje się z tym samym stable Hunter `NpcId`.

Gameplay:

```text
Hunter prosi o poroża jeleni
→ gracz poluje na stag
→ harvestuje zwłoki
→ dorosły stag ma 50% szansy na antler
→ gracz przynosi 2 × antler
→ reward: 1 × hunting_bow
```

V1:

- `harvest_animals stag ×2` jako minimalny dowód realnego polowania,
- hand-in: `antler ×2`,
- `antler` drop chance: **50%** przy knife harvest dorosłego `stag`,
- reward: `hunting_bow ×1`,
- relacja / competence / renown wyższe niż w Hunter I,
- bez courage.

Nie ustalać liczby stag potrzebnych do zdobycia dwóch poroży. 50% loot ma tworzyć naturalną zmienność; finalny hand-in może wymusić dalsze polowanie ponad minimum objective.

## 4. `antler` jako normalny item i fauna loot

Dodać `antler` do zwykłego item stack:

- `src/items/items.ts` — `ItemKind` + `ITEM_DEFS`,
- `src/items/itemCatalog.ts` — normalne resource/trade metadata,
- `src/items/tradeCatalog.ts` — jedna authoritative wartość handlowa.

Nie hand-maintainować generated docs/indexów poza istniejącym docs workflow.

Loot integration:

- rozszerzyć `AnimalHarvestResult` w generalny sposób (`lootKinds` / extras lub równoważny contract), a nie questowy `antlerDropped`,
- `harvestAnimalIntoInventory()` rozstrzyga normalny meat/hide + trophy loot,
- `antler` tylko dla dorosłego `stag`, nie `deer`, juvenile ani innych species,
- nie używać nagiego `Math.random()` w harvest path,
- trophy roll korzysta z deterministic seeded convention dostępnego w fauna/app seam,
- corpse harvest pozostaje one-shot; ponowne wywołanie nie może rerollować trophy.

Ordinary wild individual identity nie jest gwarantowane przez full rebuild/save restore. Nie rozszerzać per-individual wild-fauna persistence tylko dla poroża. Determinism ma obowiązywać dla authoritative corpse lifetime; pre-harvest rebuild może odtworzyć innego ordinary wild individual zgodnie z istniejącymi granicami persistence.

## 5. Hunter III — pomoc zwierzynie z zagajnika

Dostępność:

- wymaga successful outcome Hunter II,
- ten sam Hunter giver,
- targetem jest konkretny stable `thicket` / spawner id.

Gameplay:

```text
Hunter wskazuje gorszą dostępność pożywienia przy konkretnym thicket
→ gracz zostawia kompatybilne roślinne jedzenie
→ realne deer/stag podchodzą przez fauna attraction
→ jedzenie zostaje rzeczywiście skonsumowane
→ 3 kwalifikujące się zwierzęta / consumption contributions
→ raport do Huntera
```

V1:

- species: `deer`, `stag`,
- allowed food: `apple`, `carrot`, `berries`,
- required count: **3**,
- tylko animals z target `spawnPointId` kwalifikują się,
- progress następuje dopiero po udanym atomowym consumption i food relief,
- quest nie teleportuje zwierząt,
- quest nie zmienia hunger sztucznie,
- jedzenie jest normalnie usuwane z world item ownership przez fauna-023 path.

Rozszerzyć `AnimalDef.diet` dla deer/stag zamiast dodawać quest-only whitelist do movement/consumption.

Nowy objective może być semantycznie:

```ts
{
  type: 'feed_habitat_animals'
  spawnerId: string
  kinds: readonly ['deer', 'stag']
  count: 3
}
```

Successful-consumption report powinien zawierać co najmniej:

```ts
{
  animalId: string
  animalKind: AnimalKind
  spawnPointId?: string
  itemKind: ItemKind
}
```

### Dedupe i persistence

W jednym runtime ta sama `animalId` może wnieść maksymalnie jeden contribution do aktywnego objective, żeby jedno zwierzę nie zjadło trzech itemów i nie ukończyło zadania samo.

Persistować **count**, nie runtime `Set<animalId>`. Ordinary wild `animalId` nie jest stabilnym identity przez pełny restore, więc po save/load nie udawać dokładnego lifetime dedupe. Nie rozszerzać wild-fauna persistence tylko dla tego questa; ta granica V1 ma być jawnie opisana w implementation notes i tests.

## 6. Quest materialization i dialogue

Hunter content ma używać istniejącego settlement opportunity/materialization flow i stable NPC identity.

Wymagania:

- quest ids muszą być stabilne dla settlement + giver/context,
- Hunter II i III mają używać prior `quest_outcome` prerequisite,
- wszystkie trzy questy rekonstruują tego samego givera,
- kilka quest contexts tego samego Huntera korzysta z istniejącego multiple-context dialogue path,
- `ready_to_report` nie może być zasłonięte przez reminder innego questa,
- Vue nie interpretuje quest id/stage/objective,
- samo otwarcie dialogu niczego nie progressuje.

Nie dodawać Hunter-specific dialogue managera ani primary-quest selection.

## 7. Persistence

### Counted harvest objectives

Rozszerzyć istniejący quest progress o minimalny stage-local counted progress zamiast osobnego registry:

- start stage → `0`,
- matching player harvest → increment capped at target,
- stage advance → reset/clear,
- save/load → exact count round-trip,
- legacy save bez pola → `0`.

### Hunter chain

Sequential availability opierać na istniejących terminal quest outcomes; nie dodawać `hunterQuestStep` world flagu.

### Hunter III

Persistować count objective. Runtime dedupe set jest tylko zabezpieczeniem jednego runtime i nie jest nowym źródłem identity fauny.

## 8. Ownership

```text
fauna
→ owns species, corpse harvest, diet, attraction, consumption, trophy roll

items / inventory
→ owns hide, antler, bows and physical hand-in/rewards

quests
→ owns Hunter quest lifecycle and counted objective progress
→ observes successful player harvest / fauna consumption

settlement / NPC data
→ owns profession role and stable NpcId

app composition
→ wires player-only harvest and successful-consumption reports into QuestManager
```

Nie duplikować state pomiędzy tymi systemami.

## 9. Non-goals

Nie implementować w tym planie:

- Guard rewards / evening duty — to `quests-progression-021`,
- generic profession framework dla wszystkich zawodów,
- nowych hunting AI dla Hunter NPC,
- persistent ordinary wild individual identity,
- trophy crafting,
- nowych bows poza istniejącymi `short_bow` / `hunting_bow`,
- quest-specific animal spawn/teleport,
- nowego habitat managera.

## 10. Testy automatyczne

Dodać coverage co najmniej dla:

- NPC Hunter harvest nie incrementuje player `harvest_animals`,
- player harvest właściwego species incrementuje dokładnie raz,
- złe species nie progressuje,
- save/load przywraca counted harvest progress,
- stage advance resetuje stage-local progress,
- Hunter I hand-in konsumuje dokładnie `hide ×3`,
- Hunter II nie jest dostępny bez successful Hunter I,
- adult stag może dostać deterministic 50% antler roll,
- juvenile stag nigdy nie daje antler,
- drugi harvest tego samego corpse nie rerolluje ani nie duplikuje loot,
- Hunter II hand-in konsumuje `antler ×2`,
- Hunter III nie jest dostępny bez successful Hunter II,
- feed progress następuje dopiero po successful atomic consumption,
- wrong `spawnPointId`, species lub item nie progressuje,
- jeden animal nie daje więcej niż jednego contribution w jednym runtime,
- istniejący fauna-023 attraction nadal działa bez aktywnego questa,
- trzy quest contexts jednego Huntera korzystają z generic multi-context dialogue bez first-match regresji.

## 11. Manual verification

Użytkownik weryfikuje w przeglądarce:

1. Hunter I: upolować i harvestować 3 deer, oddać 3 hide, otrzymać `short_bow`.
2. Hunter II: potwierdzić unlock dopiero po I; polować na stag do zdobycia 2 antler; oddać je i otrzymać `hunting_bow`.
3. Potwierdzić, że antler pochodzi ze zwykłego harvest loot, także poza aktywnym hand-in momentem.
4. Hunter III: przy target thicket zostawić apple/carrot/berries; realne deer/stag mają podejść przez attraction i zjeść food.
5. Jedno zwierzę nie powinno nabić całego celu trzema kolejnymi porcjami w jednym runtime.
6. Zwierzę z innego spawnera nie powinno progressować questa.
7. Save/load w trakcie counted objectives zachowuje dotychczasowy count.

## 12. Implementation notes i dokumentacja

Implementation notes:

`docs/plans/implementation-notes/quests-progression-020-hunter-profession-quests-and-wildlife-help-implementation-notes.md`

Przed implementacją ponownie sprawdzić current `main` przede wszystkim dla:

- `QuestManager` counted-progress shape,
- player harvest caller,
- final fauna-023 successful-consumption seam,
- current `AnimalDef.diet` i thicket provenance,
- multiple quest contexts per NPC.

Po implementacji zaktualizować `docs/state/quests.md` oraz fauna/items state docs tylko tam, gdzie rzeczywiście zmieniły się publiczne kontrakty.

Ważne nowe publiczne/architektoniczne funkcje i typy dla counted objectives, harvest reporting, trophy resolution i consumption reporting powinny mieć zwięzłe JSDoc z odpowiednim `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
