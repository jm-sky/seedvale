# Implementation Notes: Player-owned animals and follow/stay behaviour

**Plan:** `fauna-020-player-owned-animals-and-follow-stay-behaviour.md`  
**Reviewed against:** current `main`, 2026-09-08

## Najważniejsza decyzja: ownership zmienia także lifecycle

Obecne livestock nie jest niezależnym world-level runtime population. `Settlement.livestock` trzyma live `AnimalAgent[]`, a `SettlementsManager` przy unloadzie robi capture i settlement usuwa/dispose'uje swoje agenty. To jest poprawne dla household livestock, ale nie dla konia gracza, który może odejść razem z graczem daleko od settlement.

Po transferze do gracza live agent **musi zostać odłączony od lifecycle źródłowego `Settlement`**, bez despawnu/recreate. Najmniejsze rozszerzenie obecnej architektury to pozostawić ownership/runtime collection w istniejącym `SettlementsManager` / livestock persistence boundary, ale trzymać player-owned live animals poza konkretnym `Settlement.livestock` i tickować je niezależnie od settlement streaming. Nie tworzyć nowego `HorseManager` ani drugiego fauna world systemu.

Transfer powinien atomowo:

1. znaleźć live persistent animal,
2. zmienić owner,
3. usunąć go z `Settlement.livestock` bez `dispose()`,
4. przejąć go do manager-owned player-animal collection,
5. zachować `animalId` i provenance potrzebne do persistence/reconciliation.

## Ownership model

`AnimalAgent.ownerHouseId` i `household` są dziś konstrukcyjne (`readonly` / `private readonly`). Samo dodanie `playerOwned` nie wystarczy.

Wprowadzić jedno authoritative ownership value, np. discriminated union w rodzaju:

```ts
type AnimalOwner =
  | { kind: 'household', id: string }
  | { kind: 'player' }
  | null
```

Nie używać `player.name` jako identity — to display/save configuration, nie stabilny entity id. Brak player entity id w aktualnym codebase nie powinien blokować V1; union można później rozszerzyć o identity dla multiplayer.

Jeżeli kompatybilność istniejących call sites wymaga `ownerHouseId`, utrzymać je co najwyżej jako **derived accessor**, nigdy jako drugi zapis ownership.

Przy transferze household → player trzeba również wyczyścić household association. Inaczej koń nadal będzie preferował `Household` trough/water reserve, a household/dog ownership logic może traktować go jak cudze livestock.

Istotne call sites do przejrzenia po zmianie contractu:

- `src/fauna/AnimalAgent.ts`
- `src/settlement/livestock.ts`
- `src/fauna/dogGuard.ts`
- `src/settlement/createSettlement.ts`

## Persistence: obecny restore contract trzeba świadomie zmienić

`LivestockSaveRecord` jest obecnie namespaced przez `settlementId`, a `spawnLivestock()` ufa deterministycznemu `kind` / `ownerHouseId` i hydratuje record tylko wtedy, gdy zgadza się on z recomputed spawn slotem. To celowo uniemożliwia dziś restore zmienionego ownership.

Player-owned animal powinien nadal zachować **origin settlement / deterministic slot provenance** w persistence, ponieważ tego potrzebuje reconciliation. `settlementId` w recordzie może nadal pełnić tę rolę; nie oznacza wtedy aktualnego ownera ani runtime container.

Restore kolejność dla deterministic livestock slotu powinna być logicznie:

```text
removed/tombstoned -> nie spawnuj
saved player-owned record -> odtwórz jako player-owned, nie jako settlement livestock
saved household record zgodny ze slotem -> normalny livestock restore
brak recordu -> deterministic fresh spawn
```

Nie walidować player-owned recordu przez equality z deterministycznym `ownerHouseId`, bo właśnie transfer legalnie tę wartość zmienił.

`createLivestockRegistry.capture(settlementId, animals)` obecnie zakłada collection należącą do settlement. Rozszerzenie registry powinno umieć snapshotować także odłączone player-owned animals, zachowując ich origin `settlementId`; nie wolno zgubić ich przy `snapshotLivestock()` tylko dlatego, że nie są już w `Settlement.livestock`.

Death/final removal player-owned animal musi zapisać tombstone pod tym samym origin namespace, aby source slot nie stworzył go ponownie.

Sprawdzić i rozszerzyć validator/migration path w `src/persistence/saveData.ts`; ownership/control fields muszą być walidowane jak pozostałe plain-data save fields. Nie zapisywać targetów/pathfindingu/runtime references.

## Follow / Stay: wpiąć w istniejący `AnimalAgent.update()`

Aktualny `AnimalAgent` ma:

- `home` + `wanderRadius`,
- existing target/steering/walkability/water traversal,
- hard gate `mounted`,
- fixed-priority fauna behaviour z threat/social overrides,
- hunger/thirst source pursuit,
- `driveMounted()` jako osobny movement driver podczas jazdy.

Nie dodawać osobnego AI controller.

Dodać mały persistent control state, np. `follow | stay`, tylko dla controllable player-owned animals. Domyślnie po pierwszym transferze: `follow`.

### Follow

Najbezpieczniej wpiąć follow jako normal-behaviour override **po hard gates i safety/needs, przed ordinary roaming**. Nie może wygrywać z dead/mounted, flee/threat ani skutecznym hunger/thirst pursuit.

Player position przekazać przez `AnimalUpdateContext` jako narrow plain-data input; `AnimalAgent` nie powinien trzymać referencji do `PlayerController`.

Użyć dwóch progów (hysteresis), np. `startFollowDistance > stopFollowDistance`, zamiast jednego threshold. Follow target powinien przechodzić przez istniejące steering/walkability/water traversal. Szybszy gait może używać już istniejącego `def.sprintSpeed` / stamina semantics; bez horse-specific speed constants.

### Stay

Przy komendzie `stay` ustawić lokalny anchor przez istniejący `home`/wander-origin contract. Nie robić dokładnego return-to-point FSM.

Po transferze do player ownership `home` nie może pozostać dawnym household home, bo `clampBounds()`/roaming będzie ciągnąć zwierzę z powrotem do gospodarstwa. Follow powinien aktualizować właściwy roaming context albo omijać home clamp dla aktywnego follow; `stay` powinno świadomie ustawić nowy local origin.

Zachować możliwość chwilowego odejścia od anchoru po wodę/jedzenie lub z powodu zagrożenia.

## Riding integration

`fauna-003` jest już wdrożone przez `src/app/actions/mountActions.ts` i `AnimalAgent.setMounted()/driveMounted()`.

Nie dodawać nowej mount reference. Existing riding restore używa `mountedAnimalId` i resolvera szukającego livestock w loaded settlements oraz global fauna. Po wydzieleniu player-owned collection **ten resolver musi uwzględniać nowe źródło**, inaczej save/load mounted player-owned horse przestanie się odnajdywać.

`AnimalAgent.update()` już specjalnie suppressuje autonomous AI przy `mounted`; Follow/Stay ma pozostać tylko zapisanym stanem i wznowić się po dismount.

## Lookup / public seam

Nie robić per-tick scan managera. Potrzebny jest mały stable lookup w istniejącym ownership boundary, najlepiej indeks `animalId -> player-owned live AnimalAgent` utrzymywany przy transfer/restore/removal.

Cross-domain API powinno być małe i nie przeciekać settlement internals, np. semantycznie:

```text
resolvePersistentAnimal(animalId)
transferAnimalOwnership(animalId, owner)
setOwnedAnimalControl(animalId, follow|stay)
```

Merchant/quest acquisition w kolejnych planach powinny wywoływać transfer seam, nie mutować `AnimalAgent` ani `LivestockRegistry` bezpośrednio.

## Interaction

Reuse obecnego animal interaction dispatch i `FlavorDialog` actions seam; nie budować nowego screen.

Pokazywać Follow/Stay tylko gdy target jest player-owned i controllable. Sam `domestic` / `mountable` / affinity nie daje prawa sterowania.

Interaction handler powinien wywoływać domain seam (`setOwnedAnimalControl`), nie ustawiać pola UI-side.

## Existing systems/files, które są realnie istotne

- `src/fauna/AnimalAgent.ts` — owner contract, `home`/wander, update priority, `mounted`, snapshot/hydrate.
- `src/settlement/livestock.ts` — deterministic IDs, merchant horse slot, livestock registry, capture/tombstones, restore validation.
- `src/settlement/SettlementsManager.ts` — settlement streaming lifetime, snapshotLivestock, natural owner dla detached persistent animals.
- `src/settlement/createSettlement.ts` — livestock update/removal and household injection.
- `src/app/actions/mountActions.ts` — authoritative riding state + animal resolver.
- `src/persistence/saveData.ts` — save validation/schema.
- `src/fauna/animalForaging.ts`, `AnimalLife.ts`, `animalRoaming.ts` — nie duplikować needs/food/water/roaming.
- `src/fauna/dogGuard.ts` — household ownership semantics zależne od `ownerHouseId`.
- `docs/plans/implementation-notes/fauna-003-horse-riding-implementation-notes.md` — aktualny riding implementation.

## Testy o najwyższej wartości

Poza testami z planu szczególnie zabezpieczyć:

- transfer **wyjmuje live agent z settlement lifecycle bez dispose/recreate**;
- unload source settlement nie usuwa player-owned live animal;
- save capture zawiera detached animal mimo braku w `Settlement.livestock`;
- load player-owned merchant horse nie przechodzi przez old `ownerHouseId === deterministic owner` gate;
- origin slot nie respawnuje duplikatu przy unload/reload ani full save/load;
- final removal zapisuje tombstone dla origin slotu;
- transfer clearing household association zmienia trough/household semantics;
- `stay` zmienia roaming origin zamiast ciągnąć konia do starego domu;
- mount resolver odnajduje detached player-owned animal po save/load.

## Implementacyjna kolejność

1. Rozszerzyć ownership + provenance/save record contract i testy registry/reconciliation.
2. Dodać detached player-owned lifetime w `SettlementsManager`; transfer ma przenosić **ten sam** `AnimalAgent`.
3. Dopiero potem Follow/Stay w `AnimalAgent` i persistence control state.
4. Na końcu interaction seam + riding resolver integration.

Nie wykonywać browser verification jako agent AI; użytkownik robi je manualnie zgodnie z planem.
