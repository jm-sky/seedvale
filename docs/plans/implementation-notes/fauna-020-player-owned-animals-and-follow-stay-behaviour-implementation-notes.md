# Implementation Notes: Player-owned animals and follow/stay behaviour

**Plan:** `fauna-020-player-owned-animals-and-follow-stay-behaviour.md`  
**Reviewed against:** `main` after `fauna-017`, 2026-09-09  
**Recon baseline:** code at/around `6a347398795b7e83398565276d27b08e4c27f494` before these documentation edits

## Recon conclusion

Koncepcja planu pozostaje właściwa:

- ownership transfer ma zachować tę samą persistent jednostkę,
- player-owned animal musi odłączyć się od lifecycle źródłowego settlementu,
- Follow/Stay powinno być fauna-owned control state,
- riding ma nadal używać istniejącego mount systemu,
- deterministic livestock provenance musi blokować duplicate reconstruction.

Największa zmiana po `fauna-017`: stare notes zbyt mocno wskazywały `AnimalAgent.update()` jako miejsce implementacji Follow/Stay. Po refaktorze `AnimalAgent` jest nadal state/integration ownerem, ale behaviour policy została częściowo rozbita. Nowy feature powinien respektować ten podział.

## 1. Aktualny podział odpowiedzialności po fauna-017

### `src/fauna/AnimalAgent.ts`

Aktualnie nadal posiada per-animal authoritative/runtime state oraz integruje moduły. Istotne publiczne typy/seams:

- `AnimalAgentDeps`
- `AnimalUpdateContext`
- `AnimalSaveState`
- `AnimalAgent`
- `setMounted()` / `driveMounted()`
- `snapshot()` / `hydrate()`

W konstrukcji nadal istnieją:

```ts
ownerHouseId?: string
household?: Household | null
```

A w agencie:

```ts
readonly ownerHouseId?: string
private readonly household?: Household | null
```

To jest obecnie household-only contract i jest konstrukcyjnie niemutowalne, więc transfer ownership nie może być poprawnie zrealizowany przez samo dodanie `playerOwned: boolean`.

### `src/fauna/AnimalLife.ts`

Jest już wyraźnym ownership boundary dla fizjologii:

- `AnimalLifeState`
- `createAnimalLifeState()`
- `tickAnimalLife()`
- `consumeFood()`
- `drinkWater()`
- `NEED_ELEVATED_THRESHOLD`
- stamina/hunger/thirst tuning

Nie dodawać tu ownership ani Follow/Stay. Player ownership zmienia control/social context, nie physiology.

### `src/fauna/animalForaging.ts`

Posiada source-selection/action helpers:

- `findFoodTarget()`
- `findForageTarget()`
- `findGrassPatchTarget()`
- `findTroughTarget()`
- `findWaterTarget()`
- `isSourceTargetValid()`
- `applySourceRelief()`

Nie tworzyć player-horse foraging path. Transfer powinien zmienić owner/household context przekazywany do istniejącego pipeline, a nie jego ogólne zasady.

### `src/fauna/animalRoaming.ts`

Posiada już roaming/trip helpers:

- `AnimalTrip`
- `findWaterTripDestination()`
- `probeBestPointNear()`
- `tripDayBucket()`

`AnimalAgent` nadal posiada `home`, `wanderRadius`, `trip`, `wanderTimer` i sterowanie locomotion. Stay powinno reuse'ować ten model lokalnego originu; nie tworzyć exact-return FSM.

### `src/fauna/faunaDecision.ts`

To jest czysta wysokopoziomowa arbitraż behaviour, nie cały animal AI.

`FaunaBehaviourKind` obejmuje m.in.:

```text
player attack/ignore/flee
npc attack/ignore/flee
fire avoid
frenzy beeline
dog guard
predator-normal
prey-normal
```

`dead` / `mounted` pozostają gate'ami przed tą arbitrażem; `rabid` także jest osobnym gate'em.

Normalne potrzeby/foraging/roaming nie są osobnymi `FaunaBehaviourKind`. `predator-normal` i `prey-normal` wchodzą dalej w istniejący normal branch (`pursueNeeds()` / roam fallback).

**Wniosek:** Follow/Stay nie powinno być automatycznie dopisywane do `FAUNA_BEHAVIOUR_PRIORITY`. Najmniejszy właściwy seam to normal-behaviour fallback po threat/safety i po skutecznym `pursueNeeds()`, przed ordinary wander/roam.

## 2. Ownership model: zmienić contract, nie dokładać boolean

Rekomendowany authoritative shape semantycznie:

```ts
export type AnimalOwner =
  | { kind: 'household', houseId: string }
  | { kind: 'player' }
  | null
```

Dokładna nazwa nie jest istotna. Ważne invariants:

- jedno zapisane źródło prawdy,
- `ownerHouseId` najwyżej jako derived compatibility accessor,
- brak osobnego `playerOwned`, jeśli owner union już niesie ten fakt,
- live `Household` reference nie jest persistence ani identity,
- `AnimalOwner` nie używa `player.name`,
- późniejsze multiplayer identity da się rozszerzyć bez przebudowy modelu.

### Call-sites wymagające recon przy implementacji

- `src/fauna/AnimalAgent.ts`
- `src/settlement/livestock.ts`
- `src/settlement/createSettlement.ts`
- `src/fauna/dogGuard.ts`
- inne `ownerHouseId` readers znalezione przez compiler/code search

Nie zakładać, że każdy reader `ownerHouseId` powinien zostać przekonwertowany na ogólny owner object. Część logicznie potrzebuje właśnie derived `houseId | null`.

## 3. Household runtime reference musi stać się odłączalne

Obecne `private readonly household?: Household | null` jest używane jako runtime context dla household-owned livestock, m.in. do trough/water semantics.

Po household → player transfer:

```text
owner = player
household context = null
home/roam origin = no longer source house
```

Nie wolno pozostawić starego `Household` reference, bo animal może nadal preferować gospodarstwo mimo formalnej zmiany ownera.

Najmniejsza opcja to zastąpić konstrukcyjny readonly household context mutowalnym, owner-derived runtime contextem albo cienkim resolverem. Nie persistować samego obiektu `Household`.

## 4. Current livestock persistence/reconstruction

`src/settlement/livestock.ts` definiuje:

```ts
export type LivestockSaveRecord = AnimalSaveState & {
  settlementId: string
  animalId: string
  kind: AnimalKind
  ownerHouseId?: string
}
```

oraz:

- `LivestockPersistence`
- `LivestockRegistry`
- `createLivestockRegistry()`
- `capture(settlementId, animals)`
- `markRemoved(settlementId, animalId)`
- `getSaved(settlementId)`
- `getRemoved(settlementId)`
- `serialize()`

`livestockToSaveRecord()` bierze `ownerHouseId` bezpośrednio z live agenta.

Registry jest namespaced przez `settlementId`, a tombstone key ma formę:

```text
${settlementId}:${animalId}
```

To jest dobry existing provenance boundary. `settlementId` po transferze powinno oznaczać origin namespace, nie current owner/runtime container.

## 5. Current deterministic hydrate gate

Deterministic livestock spawn tworzy oczekiwany slot (`kind`, `ownerHouseId`, `animalId`) i hydratuje saved record tylko kiedy saved identity jest zgodne z recomputed household slotem.

To jest prawidłowe dla obecnego household-only systemu, ale legalny transfer zmieni ownership. W implementacji reconciliation musi rozróżnić:

```text
record absent
record household-owned
record player-owned
record tombstoned
```

Player-owned saved record musi wygrać nad fresh deterministic reconstruction tego samego origin slotu.

Nie wolno robić:

```ts
if (record.ownerHouseId !== deterministicOwnerHouseId) ignoreRecord()
```

bez wcześniejszego sprawdzenia, że record jest nadal household-owned.

## 6. Detached lifecycle: `SettlementsManager` jest właściwym boundary

Obecny `SettlementsManager.unload()` robi m.in.:

```text
livestock.capture(id, entry.settlement.livestock)
→ settlement dispose/unload
```

A komentarze registry w `livestock.ts` wprost zakładają, że dziś `AnimalAgent` nie przeżywa settlement unloadu.

Player-owned animal łamie tę konkretną dotychczasową regułę, więc trzeba rozszerzyć ten sam boundary zamiast budować nowy system.

### Rekomendowany runtime shape

W `SettlementsManager` dodać manager-owned detached collection + id index, semantycznie:

```text
detachedPersistentAnimals
playerOwnedById
```

Nazwy do ustalenia przy implementacji.

Wymagania:

- collection zawiera tylko persistent livestock, które nie należą już do live settlement collection,
- transfer przenosi tę samą instancję,
- source settlement unload nie dispose'uje jej,
- manager tickuje ją niezależnie od source settlement stream state,
- save capture obejmuje ją pod origin `settlementId`,
- final removal usuwa runtime entry i tombstonuje origin slot.

Nie tworzyć `HorseManager`.

## 7. Transfer operation musi być atomowa

Publiczny seam powinien istnieć powyżej raw `Settlement.livestock`/registry mutations.

Semantycznie:

```text
transferAnimalOwnership(animalId, owner)
```

Household → player flow:

1. resolve live persistent animal,
2. resolve origin settlement/slot provenance,
3. validate current owner / target owner,
4. zmień authoritative owner,
5. clear household runtime context,
6. reset/adapt old household home/roam context,
7. remove from `Settlement.livestock` bez `dispose()`,
8. insert do detached manager collection + id index,
9. initialize control state `follow`,
10. ensure registry/save path serializes now-player-owned state.

Jeżeli dowolny etap nie może być wykonany, nie zostawiać half-transferred state.

## 8. Follow/Stay module placement

Po `fauna-017` preferowany jest mały nowy moduł, np.:

```text
src/fauna/ownedAnimalControl.ts
```

Nie jako AI controller object, tylko plain types + pure helpers, zgodnie z kierunkiem refaktoru.

Przykładowe odpowiedzialności:

```ts
type OwnedAnimalControlMode = 'follow' | 'stay'

type OwnedAnimalControlState = {
  mode: OwnedAnimalControlMode
  stayAnchor?: { x: number, z: number }
  following?: boolean // tylko jeśli potrzebne do persisted/runtime hysteresis
}
```

`following` prawdopodobnie nie musi być persistowane — można je odtworzyć z mode/distance po loadzie. Nie zapisywać więcej runtime state niż konieczne.

Pure helper może zwracać coś w rodzaju:

```text
none
follow-target
stay-origin
```

Na tej podstawie `AnimalAgent` używa istniejącego steering/movement.

### Dlaczego nie `AnimalLife.ts`

Bo Follow/Stay nie jest fizjologią.

### Dlaczego nie `animalForaging.ts`

Bo Follow/Stay nie wybiera food/water source.

### Dlaczego nie `animalRoaming.ts` w całości

`animalRoaming.ts` jest obecnie neutralnym helperem trip/probe. Stay może go reuse'ować, ale ownership/control policy nie powinna zmieniać generic roaming helpers w player-owned system.

### Dlaczego nie duża sekcja w `AnimalAgent.ts`

`AnimalAgent` powinien pozostać integration ownerem. Może:

- przechowywać plain owner/control state,
- przekazywać narrow inputs,
- wywołać helper,
- użyć istniejącego steer/walkability.

Nie powinien ponownie absorbować policy wydzielonej przez `fauna-017`.

## 9. Follow integration point

Aktualna normalna sekwencja zachowania jest semantycznie:

```text
high-level decision
→ predator-normal / prey-normal
→ local threat/prey/pest/lure handling
→ pursueNeeds()
→ wander()/normal fallback
```

Follow powinno wejść **po skutecznym needs handling, przed ordinary roaming fallback**.

Nie dodawać Follow jako globalnego decision rank powyżej fire/flee/guard/combat.

### Tick context

`AnimalUpdateContext` może dostać narrow player-owned control input, np. player world position. Nie przekazywać `PlayerController` ani app objectu.

Detached manager tick path powinien dostać te same fauna-world inputs co normal livestock. Nie duplikować połowy `Settlement.update()` ręcznie w `SettlementsManager`.

Przy implementacji rozważyć wydzielenie/reuse istniejącego `tickSettlementLivestock()`-style helpera z `livestock.ts`, jeśli obecny call-site ma już wszystkie potrzebne world inputs. Celem jest wspólny update adapter dla settlement-owned i detached livestock, nie drugi behaviour path.

### Hysteresis

Użyć dwóch progów:

```text
startFollowDistance > stopFollowDistance
```

Stan commitment może być runtime-only. Testować czystą funkcję decyzji zamiast odległości rozrzuconych po `AnimalAgent`.

## 10. Stay integration point

`AnimalAgent` ma już:

- `home: THREE.Vector3`
- `wanderRadius`
- `wanderTimer`
- `trip`

Po transferze stary household home nie może dalej przyciągać konia.

Przy `Stay`:

```text
stayAnchor = current legal animal position
home/roaming context = anchor-compatible
follow disabled
needs/threat may temporarily move animal away
normal fallback remains local to stay anchor
```

Nie wymagać dokładnego powrotu do punktu co frame.

## 11. Riding integration po detached lifecycle

`src/app/actions/mountActions.ts` nadal jest poprawnym authority dla riding.

`AnimalAgent.mounted` suppressuje autonomous AI, a `driveMounted()` steruje movement podczas jazdy. Nie zmieniać tego modelu.

Problem po transferze leży w resolverze.

W `src/app/createApp.ts` obecny `resolveMountAnimal()` robi:

```ts
for (const settlement of bundle.settlementsManager.getLoaded()) {
  const found = settlement.livestock.find((a) => a.animalId === animalId)
  if (found) return found
}
return bundle.fauna.getAgents().find((a) => a.animalId === animalId) ?? null
```

Detached player-owned livestock nie będzie w żadnym z tych dwóch miejsc.

Po planie resolver powinien używać publicznego persistent-animal lookup z `SettlementsManager`/livestock boundary. Wtedy deferred `mountedAnimalId` restore nadal działa bez nowego mount persistence contract.

## 12. Snapshot/hydrate contract

`AnimalSaveState` obecnie persistuje:

- x/z/yaw,
- health,
- `life.hunger/thirst/stamina`,
- production,
- corpse state.

Ownership/control można dodać albo bezpośrednio do `AnimalSaveState`, albo do `LivestockSaveRecord` jeśli są wyłącznie persistent-livestock concerns.

Preferencja po recon:

- generic `AnimalSaveState` zostawić dla state, które rzeczywiście należy do per-animal agent snapshotu,
- livestock-specific provenance (`settlementId`, deterministic slot identity) zostawić w `LivestockSaveRecord`,
- ownership/control state może być w `AnimalSaveState` tylko jeśli `AnimalAgent.snapshot()/hydrate()` ma być authoritative round-trip owner/control ownerem; w przeciwnym razie w recordzie, ale nie duplikować obu.

Najważniejsze: jedna serializacja authoritative owner/control value, nie derived fields.

## 13. `saveData.ts`

Validator obecnie sprawdza m.in. `ownerHouseId` jako opcjonalny string.

Po zmianie:

- walidować discriminated owner shape,
- walidować control mode,
- walidować stay anchor tylko gdy format go przewiduje,
- zachować backward-compatible acceptance starych saves zgodnie z aktualnym save policy projektu,
- nie walidować runtime refs/path targets.

Implementer powinien sprawdzić aktualny `SaveData` version/migration convention przed wyborem exact compatibility path.

## 14. Interaction seam

Reuse istniejącego animal interaction dispatch/`FlavorDialog` actions.

UI nie mutuje state. Wywołuje domain operation:

```text
setOwnedAnimalControl(animalId, 'follow' | 'stay')
```

Domain operation sprawdza:

- animal exists,
- current owner = player,
- animal is controllable/live,
- requested transition is legal.

Nie uzależniać prawa do komendy od `def.mount`, `domestic` czy affinity samych w sobie.

## 15. High-value tests and exact seams

### `src/settlement/livestock.test.ts`

Rozszerzyć o:

- player-owned record survives registry serialize/restore,
- origin settlement namespace survives ownership change,
- deterministic household slot does not overwrite player-owned saved record,
- tombstone wins over player-owned record/fresh deterministic spawn,
- existing household record validation remains unchanged.

### `src/fauna/ownedAnimalControl.test.ts` — nowy, jeśli powstaje helper module

Pure tests:

- transfer initializes `follow`,
- follow starts only beyond start threshold,
- continues until stop threshold,
- no threshold oscillation,
- stay returns local fallback semantics,
- control helper returns no autonomous movement while mounted/dead jeśli gate jest częścią helper contractu; jeśli gate pozostaje wyżej w `AnimalAgent`, testować go tam zamiast duplikować.

### `AnimalAgent` existing tests / narrow new test

Testować tylko integration seams:

- needs wins before control movement,
- threat/flee wins before control movement,
- Follow uses existing steer/walkability,
- Stay does not freeze physiology,
- mounted gate suspends control movement,
- snapshot/hydrate round-trip control state jeśli state należy do agent snapshotu.

### `SettlementsManager` tests

Najwyższy ROI:

- transfer detaches same object identity,
- source unload does not dispose detached agent,
- detached agent remains ticked,
- snapshot includes detached animal under origin settlement,
- final removal removes index + tombstones origin,
- source reload does not create duplicate.

### riding/app seam

- `resolveMountAnimal`/nowy public lookup znajduje detached animal,
- deferred `mountedAnimalId` restore działa po loadzie player-owned mounta.

## 16. Recommended implementation order

### Step 1 — ownership + save shape

Zmienić authoritative owner contract i record/validator types bez Follow behaviour.

Cel: compiler ujawnia wszystkie household ownership call-sites.

### Step 2 — registry reconciliation

Nauczyć `LivestockRegistry`/spawn hydrate legalnego player-owned saved recordu oraz origin tombstone semantics.

Najpierw testy deterministic reconstruction.

### Step 3 — detached runtime lifetime

Dodać manager-owned detached collection/index i atomowy transfer z `Settlement.livestock` bez dispose.

Dodać shared tick/removal/capture integration.

### Step 4 — control state module

Dodać `OwnedAnimalControlState` + pure Follow/Stay helpers i persistence round-trip.

### Step 5 — `AnimalAgent` thin integration

Dopiąć control fallback po needs, przed roam, przekazując tylko narrow player position/context.

Nie modyfikować `AnimalLife`/`animalForaging` semantics.

### Step 6 — interaction + riding resolver

Dodać contextual command i przestawić `resolveMountAnimal` na persistent-animal lookup.

### Step 7 — regression

Sprawdzić household livestock, dog guard/ownerHouse semantics, mounts, save/load i settlement streaming unit/integration tests.

## 17. Files expected to change during implementation

Prawdopodobne:

```text
src/fauna/AnimalAgent.ts
src/fauna/ownedAnimalControl.ts                 # new, preferred focused helper
src/fauna/ownedAnimalControl.test.ts            # new
src/settlement/livestock.ts
src/settlement/livestock.test.ts
src/settlement/SettlementsManager.ts
src/settlement/createSettlement.ts              # only if shared tick/context wiring requires it
src/app/createApp.ts
src/app/actions/... animal interaction handler
src/persistence/saveData.ts
```

Regression/read-only unless compiler proves contract changes are needed:

```text
src/fauna/AnimalLife.ts
src/fauna/animalForaging.ts
src/fauna/animalRoaming.ts
src/fauna/faunaDecision.ts
src/fauna/dogGuard.ts
src/app/actions/mountActions.ts
```

Nie wpisywać zmian do tych modułów tylko dlatego, że są związane z fauną. `fauna-017` celowo rozdzielił odpowiedzialności.

## 18. Guardrails from recon

- Nie cofać `fauna-017`.
- Nie robić z `AnimalAgent` ponownie głównego właściciela całej Follow/Stay policy.
- Nie dodawać player-specific branch do `AnimalLife` ani `animalForaging`.
- Nie dodawać Follow do `FAUNA_BEHAVIOUR_PRIORITY` bez realnej potrzeby semantycznej.
- Nie tworzyć `HorseManager`, player-animal AI controller ani second fauna collection poza istniejącym `SettlementsManager` persistent-livestock boundary.
- Nie recreate'ować agenta przy transferze.
- Nie tracić origin settlement/slot provenance.
- Nie pozostawiać `Household` runtime reference po transferze do playera.
- Nie robić per-frame global scan player-owned animals; utrzymać id index przy lifecycle transitions.
- Nie uruchamiać browser verification jako AI.
- Nie uruchamiać `pnpm docs:sync`; robi to GitHub workflow.

## Manual verification

Po implementacji wykonuje użytkownik zgodnie z planem; recon/docs update nie wykonuje browser verification.
