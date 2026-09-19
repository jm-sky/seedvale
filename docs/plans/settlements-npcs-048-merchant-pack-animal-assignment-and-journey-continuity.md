# Plan: Merchant pack-animal assignment and journey continuity

**Created:** 2026-09-18
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** L
**Depends on:** settlements-npcs-047, settlements-npcs-038, fauna-007, fauna-020
**Domain:** `settlements-npcs`
**Type:** `feature`
**Roadmap:** `quests-travelling-merchant-journeys.md`
**Model:** Opus, Sonnet

## Goal

Travelling Merchant może przypisać realnego konia albo osła jako pack animal i zabrać go w pełną podróż:

```text
home
→ outbound
→ destination visit
→ return
→ home
```

Ten sam stable `animalId` ma przejść cały lifecycle bez duplikowania zwierzęcia, ownership ani cargo.

Pack animal:

- zwiększa transport capacity przez mechanizm z `settlements-npcs-047`;
- pozostaje realnym `AnimalAgent`;
- zachowuje health/needs/death/persistence;
- podąża za Merchantem podczas detailed simulation;
- jest logicznie przypisany podczas off-screen travel;
- materializuje się przy Merchantcie away from home;
- wraca do zwykłego household-livestock lifecycle po zakończeniu journey;
- może używać istniejącego `saddlebags` assetu jako presentation.

Cargo nadal należy wyłącznie do:

```text
NpcAuthoritativeState.transportCargo
```

---

## 1. Reuse existing foundations

### Travelling Merchant

`settlements-npcs-038` już implementuje:

```text
outbound
→ visiting
→ returning
```

oraz:

- `MerchantJourneyState`;
- `TransportOrder`;
- `NpcAuthoritativeState.transportCargo`;
- generic `NpcTravelContinuity`;
- home NPC suppression while away;
- `SettlementsManager.resolveTravellingVisitors()`;
- foreign visitor materialization;
- one-live-`NpcAgent` invariant;
- merchant-return flow.

Nie tworzyć drugiego merchant travel systemu.

### Persistent livestock

Istnieją:

- stable livestock `animalId`;
- `AnimalSaveState`;
- `LivestockRegistry`;
- household ownership przez `ownerHouseId`;
- `SettlementsManager.resolvePersistentAnimal(animalId)`;
- detached persistent livestock lifecycle;
- snapshot/hydrate health, needs, position i corpse state.

Current limitation:

```text
detachedLivestock
```

jest dziś używane przede wszystkim dla player-owned animals.

Ten plan uogólnia ten lifecycle na household-owned animal czasowo podróżujące z NPC.

Nie tworzyć:

```text
MerchantAnimalRegistry
PackAnimalRegistry
```

### Follow movement

Istnieje shared:

```text
src/shared/followHysteresis.ts
```

używany przez:

- player-owned animal Follow;
- temporary animal leading;
- NPC accompany.

Reuse. Nie implementować kolejnego follow/hysteresis algorytmu.

### Saddlebags

Istnieje:

```text
ItemKind = saddlebags
```

oraz Quaternius `Bags` GLB podpięty przez `ITEM_GLB_SPECS.saddlebags`.

Nie tworzyć nowego item kind.

---

## 2. Merchant journey relation

Rozszerzyć:

```ts
MerchantJourneyState
```

o:

```ts
packAnimalId?: string
```

Pole oznacza:

```text
this journey is currently accompanied by this persistent animal
```

Nie przechowuje:

- HP;
- position;
- hunger;
- thirst;
- capacity;
- cargo.

Te dane pozostają we własnych systemach.

---

## 3. Assignment happens once at journey start

Pack animal wybieramy przy rozpoczęciu journey.

Po assignment:

```text
packAnimalId = stable commitment for this journey
```

Nie:

- reselectować lepszego animal po streamingu;
- zamieniać osła na konia w destination;
- robić automatic failover;
- przypisywać replacement mid-journey.

Jeżeli assignment się nie uda:

```text
journey still starts
→ base transport capacity
```

---

## 4. Candidate eligibility

Candidate musi:

- być realnym persisted livestock;
- być alive;
- mieć `AnimalDef.pack`;
- należeć do właściwego household/home context Merchant;
- nie być player-owned;
- nie być stray/unavailable;
- nie być używany przez konfliktujący active relation;
- nie być przypisany do innej aktywnej travelling relation.

Nie spawnujemy pack animal na potrzeby journey.

---

## 5. Deterministic selection policy

V1:

```text
highest AnimalDef.pack.cargoCapacityKg
→ stable animalId tie-break
```

Przy config z `settlements-npcs-047`:

```text
horse  = 50 kg
donkey = 40 kg
```

Nie dodawać jeszcze:

- wealth tier preference;
- personality;
- training preference;
- RNG;
- journey-risk preference.

Resolver/predicate ma pozostać mały, aby późniejszy Merchant Wealth Tiers plan mógł ograniczyć eligible set bez przebudowy journey engine.

---

## 6. Effective capacity derives from current world truth

`packAnimalId` nie jest sam w sobie dowodem aktywnej capacity.

Resolver:

```text
packAnimalId
→ resolve persistent animal
→ alive + pack-capable + relation valid?
   → yes: pack capacity
   → no: baseline capacity
```

Reuse shared capacity resolver z `settlements-npcs-047`.

Nie persistować capacity w `MerchantJourneyState`.

Nie duplikować wartości z `AnimalDef.pack`.

---

## 7. Preserve assignment through phases

`packAnimalId` musi przechodzić przez:

```text
outbound
→ visiting
→ returning
```

Helpery takie jak:

```text
advanceMerchantJourneyToVisiting()
tryBeginMerchantReturn()
```

muszą zachować relation.

Nie resetować assignment po unload cargo.

---

## 8. Ownership remains unchanged

Pack assignment:

```text
relation != ownership
```

Nie zmieniać:

```text
ownerHouseId
AnimalOwner
```

Nie dodawać:

```ts
ownerNpcId
```

Origin settlement provenance pozostaje bez zmian.

---

## 9. Away suppression for livestock

Gdy pack animal rozpoczyna journey, home settlement nie może stworzyć drugiej kopii tego samego `animalId`.

Dodać semantic predicate analogiczny do Merchant NPC away suppression:

```text
animal assigned to active merchant journey
→ suppress normal home materialization
```

Nie usuwać animal record z `LivestockRegistry`.

---

## 10. Generalize detached persistent livestock

Current detached lifecycle nie może pozostać semantycznie równoważny `player-owned`.

Preferować jawny discriminator/reason, np.:

```ts
type DetachedLivestockReason =
  | 'player-owned'
  | 'travelling'
```

lub równie mały odpowiednik pasujący do current code.

Cel:

```text
persistent livestock individual
→ settlement-materialized
OR
→ detached/travelling-materialized
```

bez zmiany ownership.

Nie traktować travelling household animal jak player-owned.

---

## 11. One-live-animal invariant

Najważniejsza reguła:

```text
one animalId
→ at most one live AnimalAgent
```

Niezależnie od:

- home settlement loaded;
- destination settlement loaded;
- Merchant visitor materialized;
- streaming unload/reload;
- save/load.

Analogicznie do:

```text
one NpcId
→ one live travelling merchant agent
```

---

## 12. Detailed movement

Kiedy Merchant i animal są live:

```text
Merchant world position
→ actor-neutral temporary follow target
→ shared followHysteresis
→ normal AnimalAgent steering
```

Nie przekazywać `NpcAgent` objectu do fauna.

Do fauna trafia tylko plain target data, np.:

```ts
{ x, z }
```

Jeżeli potrzebny jest nowy input, ma być actor-neutral, nie player-specific.

Nie używać `playerControlPos` jako semantic hack.

---

## 13. Follow spacing

Pack animal nie celuje w dokładną pozycję Merchant.

Reuse `followHysteresis.ts`.

Użyć małego trailing band zgodnego z istniejącymi lead/follow semantics; exact values ustalić w implementation notes na podstawie current helperów.

Nie tworzyć formation/path systemu.

---

## 14. Animal autonomy remains authoritative

Pack animal pozostaje zwykłym `AnimalAgent`.

Priority:

```text
threat / flee / survival
→ urgent needs
→ merchant follow
→ normal wander
```

Nie wyłączać:

- hunger;
- thirst;
- stamina;
- predator reaction;
- fire/scare response;
- death.

Po zakończeniu stronger behaviour active relation może ponownie skierować animal za Merchantem.

Nie teleportować podczas zwykłego detailed movement.

---

## 15. Off-screen travel ownership

Off-screen spatial progress nadal należy wyłącznie do:

```text
Merchant NpcTravelContinuity
```

Nie tworzyć:

```text
AnimalTravelContinuity
animal ETA
packAnimalTravelTimer
```

Semantic rule:

```text
active merchant journey + packAnimalId
→ animal shares merchant's logical journey position
```

Merchant ETA jest jedynym ETA.

---

## 16. Off-screen animal state

Nie tworzyć osobnego off-screen animal simulation engine.

Preserve istniejący fauna-owned persistent state.

Jeśli current livestock/time-skip seam pozwala na bounded/lazy catch-up potrzeb, reuse go.

Nie dodawać per-frame off-screen tick tylko dla Merchant pack animal.

---

## 17. Destination materialization

Kiedy Merchant jest `visiting` i destination settlement jest loaded:

```text
resolveTravellingVisitors()
→ Merchant visitor

pack relation
→ same persistent animalId
→ travelling/detached AnimalAgent near Merchant
```

Nie:

- dodawać animal do destination household;
- zmieniać `ownerHouseId`;
- zmieniać origin settlement.

---

## 18. Visiting behaviour

Nie tworzyć osobnego MerchantPackAnimal visit AI.

Wystarczy:

```text
Merchant visitor/anchor
→ temporary follow target
→ normal fauna autonomy
```

Potrzeby/threat mogą przerywać follow.

Animal nie wykonuje destination livestock production/work semantics.

---

## 19. Return journey

Przy:

```text
visiting
→ returning
```

ten sam `packAnimalId` pozostaje przypisany.

Return używa Merchant generic travel jako spatial authority.

---

## 20. Home arrival

Po genuine Merchant return arrival:

1. zakończyć travelling pack relation;
2. przywrócić baseline `transportCargo` capacity;
3. odblokować normalną home livestock materialization;
4. zachować ten sam livestock record i `animalId`;
5. reconcile animal z home lifecycle bez duplikacji.

Nie zmieniać ownership.

---

## 21. Merchant death

Jeżeli Merchant umrze:

- travelling relation kończy się;
- living animal pozostaje w aktualnym miejscu/state;
- animal pozostaje household-owned;
- nie teleportować go automatycznie do domu;
- nie kasować go i nie respawnować replacement.

Późniejszy death/evidence plan może zdecydować, czy animal zostaje przy zwłokach, staje się stray albo wraca po czasie.

Ten plan nie rozstrzyga tego.

---

## 22. Pack-animal death

Jeżeli pack animal umrze:

- corpse lifecycle fauna wygrywa;
- relation staje się invalid;
- effective capacity wraca do baseline dla nowych additions;
- obecne `transportCargo` pozostaje owned przez Merchant;
- cargo może pozostać temporarily overweight;
- nie przypisywać replacement mid-journey;
- nie dropować automatycznie cargo.

Death/evidence plan rozszerzy konsekwencje później.

---

## 23. Saddlebags presentation

Reuse istniejącego:

```text
ItemKind: saddlebags
Quaternius Bags GLB
```

Nie tworzyć nowego item kind.

Saddlebags są tutaj **presentation integration**, nie źródłem truth dla journey relation ani capacity.

Jeżeli Merchant posiada `saddlebags` w `personalInventory`, active pack animal może pokazywać ten existing asset jako fitted visual.

Brak itemu nie blokuje poprawności journey w tym planie.

Journey Preparation / Resupply może później wymagać realnego wyposażenia przed wyjazdem.

---

## 24. Saddlebags ownership and visual rules

Nie tworzyć animal equipment inventory.

Saddlebags pozostają własnością Merchant `personalInventory`.

Presentation:

```text
active pack relation
+
Merchant owns saddlebags
→ show Bags GLB on animal
```

Visual:

- nie jest authoritative;
- nie zmienia capacity;
- znika, gdy relation nieaktywna albo itemu nie ma;
- nie wymaga skeletal attachment, physics ani UI;
- nie może tworzyć duplicate mesh po stream/rematerialization.

---

## 25. No cargo-content visualization

Nie renderować konkretnych goods wewnątrz juków.

Nie mapować item kinds na osobne worki/skrzynie.

Generic saddlebags wystarczą.

---

## 26. Assignment atomicity

Journey-start pack assignment powinno być atomiczne semantycznie:

```text
resolve candidate
→ validate current persistent state
→ set packAnimalId
→ mark travelling/detached presentation state
→ reconcile capacity
```

Nie pozostawiać stanów:

```text
pack capacity active but no valid relation
animal suppressed at home but journey has no packAnimalId
two live AnimalAgents for same id
```

Jeżeli assignment się nie uda:

```text
journey starts without pack animal
```

---

## 27. Wealth tiers compatibility

Nie implementować wealth tiers.

Assignment policy musi pozostać osobnym małym seamem, aby kolejny plan mógł zdecydować np.:

```text
poor → no animal / donkey
normal → horse/donkey
rich → later cart/wagon
```

Nie wbijać reguły "every travelling merchant always uses best available animal" głęboko w journey engine.

---

## 28. Likely implementation areas

### `src/settlement/merchantJourney.ts`

Dodać:

```ts
packAnimalId?: string
```

i zachować przez phase transitions.

### `src/settlement/SettlementsManager.ts`

Rozszerzyć istniejące:

- travelling visitor resolution;
- persistent animal lookup;
- detached livestock lifecycle;
- journey checkpoints/materialization.

Nie tworzyć nowego managera.

### `src/settlement/livestock.ts`

Uogólnić detached persistence poza player-owned animals.

Dodać tylko minimalny semantic reason/state potrzebny dla travelling household livestock.

### `src/shared/followHysteresis.ts`

Reuse; zmieniać tylko jeśli current helperowi brakuje minimalnej actor-neutral integracji.

### `src/fauna/AnimalAgent.ts`

Dodać narrow actor-neutral temporary follow-target input, jeśli current control seam nie może być reuse bez player semantics.

### saddlebags presentation

Reuse istniejący `saddlebags` model loader/asset i dodać lightweight animal attachment presentation.

---

## 29. Tests — assignment

- eligible horse assigned;
- eligible donkey assigned;
- both available → deterministic policy result;
- dead animal rejected;
- player-owned animal rejected;
- stray/unavailable/conflicting animal rejected;
- no candidate → journey still starts at baseline capacity;
- assignment happens once and is not reselected on checkpoint/stream.

---

## 30. Tests — capacity validity

- valid alive pack animal → configured pack capacity;
- missing/dead/non-pack-capable `packAnimalId` → baseline capacity;
- death does not delete existing cargo;
- no capacity value is persisted separately from config.

---

## 31. Tests — persistence and identity

Save/load during:

```text
outbound
visiting
returning
```

preserves:

- `packAnimalId`;
- original `ownerHouseId`;
- same livestock record;
- health/needs/corpse state;
- no duplicate `animalId`.

---

## 32. Tests — streaming

### Home + destination loaded

At most:

```text
1 Merchant NpcAgent
1 pack AnimalAgent
```

for stable ids.

### Home unload/reload while away

Animal does not respawn at home.

### Destination unload/reload

Same `animalId` returns as travelling animal.

### Return home

Travelling presentation disappears and normal home livestock lifecycle resumes.

---

## 33. Tests — follow

- animal follows Merchant through shared hysteresis;
- threat/urgent needs override follow;
- relation resumes afterward;
- no normal-movement teleport;
- no new global animal scan.

---

## 34. Tests — death

- animal death invalidates pack capacity;
- cargo remains owned once by `transportCargo`;
- no replacement mid-journey;
- Merchant death leaves living animal persistent at current logical location;
- dead animal never respawns at home.

---

## 35. Tests — saddlebags presentation

- existing `saddlebags` item/asset is reused;
- item is not consumed by visual attachment;
- active relation + owned saddlebags shows one attachment;
- missing item hides visual without invalidating journey;
- stream/rematerialize does not duplicate visual;
- relation clear removes visual;
- no animal inventory/equipment registry exists.

---

## 36. Explicit non-goals

Nie implementować:

- separate animal cargo inventory;
- animal equipment slots;
- player saddlebag inventory UI;
- manually equipping arbitrary player animals;
- detailed cargo visuals;
- animal encumbrance/stamina scaling by cargo weight;
- separate off-screen animal ETA;
- cart/wagon;
- merchant guards;
- wealth tiers;
- journey preparation/resupply;
- automatic animal spawn;
- automatic replacement after death;
- cargo dropping after animal death;
- Missing Merchant quest;
- route-risk consequences.

---

## 37. Definition of done

Plan jest wykonany, gdy:

- journey może wskazywać realne `packAnimalId`;
- assignment dzieje się raz przy starcie journey;
- animal zachowuje household ownership i origin provenance;
- effective capacity wynika z aktualnej valid/alive pack relation;
- ten sam `animalId` przechodzi home → outbound → visit → return → home;
- home settlement nie tworzy duplikatu while away;
- detached persistent lifecycle obsługuje travelling reason bez utożsamiania go z player ownership;
- detailed animal followuje Merchant przez shared `followHysteresis`;
- off-screen spatial authority pozostaje Merchant travel;
- destination materializuje ten sam persistent animal;
- normal fauna autonomy/needs/threat/death pozostają aktywne;
- Merchant death nie teleportuje animal automatycznie home;
- existing `saddlebags` item/GLB jest reuse wyłącznie jako presentation;
- brak saddlebags nie invaliduje journey/capacity w tym planie;
- nie powstaje animal cargo inventory;
- save/load i streaming zachowują identity i relation;
- genuine home return kończy relation i przywraca normalny livestock lifecycle.

Manualne/browser gameplay verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
