# Plan: Player-owned animals and follow/stay behaviour

**Created:** 2026-09-08
**Status:** `implemented` ✅
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~fauna-003~~
**Domain:** `fauna`
**Subdomains:** `domestication` `behavior` `lifecycle`
**Tags:** `ownership` `follow` `stay` `horse` `persistence`
**Roadmap:** `horse-and-riding.md`

## Cel

Rozszerzyć istniejący persistent livestock model tak, aby konkretne zwierzę mogło zmienić właściciela z household na playera i dalej pozostać tym samym autonomicznym mieszkańcem świata.

Pierwszym pełnym konsumentem jest koń.

Docelowy flow:

```text
existing deterministic livestock AnimalAgent
→ household → player ownership transfer
→ same animalId + origin provenance
→ detached persistent lifecycle independent of source settlement streaming
→ Follow / Stay control
→ existing needs / foraging / roaming / threat / movement systems
→ existing riding system
```

Nie tworzyć `PlayerHorse`, `HorseManager`, player-animal AI controller, drugiego movement pipeline ani równoległego systemu persistence.

## Aktualny punkt wyjścia po fauna-017

Current `main` po `fauna-017` ma:

- `AnimalAgent` jako per-animal integration/state owner, ale wiele odpowiedzialności jest już wydzielonych do modułów,
- `AnimalLife.ts` jako plain physiology state + free functions,
- `animalForaging.ts` jako source selection/validation/relief,
- `animalRoaming.ts` jako trip/probe helpers,
- `faunaDecision.ts` jako czystą wysokopoziomową arbitrażę behaviour,
- `horse` i `donkey` jako mountable `AnimalKind`,
- deterministic per-instance livestock `animalId`,
- household ownership przez `ownerHouseId` + injected `Household`,
- per-individual livestock snapshot/hydrate,
- `createLivestockRegistry()` z persistence namespaced przez `settlementId`,
- settlement-owned live lifecycle: `Settlement.livestock` jest capture/dispose przy stream-out,
- riding przez `mountActions.ts`, `AnimalAgent.setMounted()` / `driveMounted()` i `SaveData.player.mountedAnimalId`,
- brak player ownership i brak detached player-owned animal lifetime.

Najważniejsza konsekwencja refaktoru: ten plan ma rozszerzyć nowe modułowe boundaries. `AnimalAgent` może nadal przechowywać authoritative per-animal ownership/control state i delegować ruch, ale nie wolno przenosić do niego z powrotem foraging, roaming ani nowej rozbudowanej Follow/Stay policy.

## 1. Authoritative ownership model

Dzisiejsze `ownerHouseId?: string` oraz konstrukcyjny `household?: Household | null` zakładają household-owned livestock. Rozszerzyć model o jedno authoritative ownership value, np. semantycznie:

```ts
type AnimalOwner =
  | { kind: 'household', houseId: string }
  | { kind: 'player' }
  | null
```

Dokładna nazwa może być inna, ale wymagania są stałe:

- nie dodawać równoległych `playerOwned` + `ownerHouseId` + `ownerType`,
- `ownerHouseId` może pozostać wyłącznie jako derived compatibility accessor, jeśli istniejące call-sites tego wymagają,
- player owner nie powinien używać display name jako identity,
- model nie powinien utrudniać późniejszego rozszerzenia identity pod multiplayer,
- ownership pozostaje niezależne od affinity/familiarity.

`Household` runtime reference nie jest ownership source of truth. Po transferze do playera musi zostać odłączona od animal context, aby household trough/dog/yard semantics nie traktowały zwierzęcia jak nadal należącego do gospodarstwa.

## 2. Jedna domenowa operacja ownership transfer

W existing fauna/livestock boundary dodać jedną operację transferu konkretnego persistent animal.

Invariant:

```text
resolve live persistent animal
→ validate transfer
→ mutate authoritative ownership exactly once
→ keep same AnimalAgent + animalId
→ detach from source Settlement.livestock without dispose()
→ retain deterministic origin provenance
→ mark persistence/reconciliation state dirty
```

Nie despawnować starego agenta i nie tworzyć nowego.

To jest przyszły publiczny seam dla merchant purchase i quest reward. Te systemy nie powinny mutować `AnimalAgent`, `Settlement.livestock` ani registry bezpośrednio.

## 3. Detached player-owned lifecycle

Player-owned animal nie może pozostać własnością runtime collection źródłowego settlementu, bo `SettlementsManager` capture/dispose'uje settlement livestock przy unloadzie.

Najmniejsze rozszerzenie istniejącej architektury:

- source `Settlement` przestaje posiadać live agenta po transferze,
- `SettlementsManager` / jego istniejący livestock persistence boundary przejmuje detached persistent live animal,
- detached animal jest tickowany także wtedy, gdy source settlement jest unloaded,
- transfer przenosi tę samą instancję bez `dispose()`/recreate,
- nie powstaje globalny `HorseManager` ani drugi fauna manager.

Player-owned collection powinna mieć stable lookup po `animalId`, aktualizowany na transfer/restore/removal, zamiast per-tick skanowania wszystkich settlementów.

## 4. Origin provenance i deterministic reconciliation

Ownership i origin to dwa różne fakty:

```text
origin = settlement + deterministic spawn slot, potrzebny do reconstruction/tombstone
owner  = household/player/unowned, zmienny gameplay state
```

`LivestockSaveRecord.settlementId` może nadal pełnić rolę origin namespace, ale nie może być interpretowany jako current runtime container albo current owner.

Dla deterministic slotu restore/reconciliation powinno rozróżniać:

```text
removed/tombstoned
→ nie spawnuj

saved player-owned record
→ restore jako detached player-owned animal
→ source settlement nie tworzy household duplicate

saved household record zgodny ze slotem
→ normal settlement livestock restore

brak recordu
→ deterministic fresh spawn
```

Player-owned recordu nie wolno odrzucać tylko dlatego, że current ownership nie zgadza się z deterministic `ownerHouseId` slotu.

## 5. Snapshot / hydrate / save validation

Rozszerzyć authoritative plain-data persistence o:

- ownership,
- Follow/Stay control state,
- ewentualny Stay anchor, jeśli zostanie potrzebny,
- origin provenance tylko tam, gdzie nie wynika jednoznacznie z registry namespace/slot.

Zachować istniejące snapshot semantics dla position/yaw, health, `AnimalLifeState`, production i corpse state.

Nie persistować:

- live `Household` reference,
- player/controller references,
- pathfinding/navigation state,
- source targets,
- transient behaviour decisions.

`saveData.ts` musi walidować nowe plain-data fields. Save/load ma zachować ten sam `animalId`.

## 6. Follow / Stay state po fauna-017

Follow/Stay jest per-animal control state należącym do fauna domain, nie do UI i nie do riding systemu.

Preferować mały focused moduł z plain type + pure helpers, np. `src/fauna/ownedAnimalControl.ts`, zamiast dokładać kolejną dużą sekcję policy do `AnimalAgent.ts`.

`AnimalAgent` może przechowywać authoritative control state i udostępniać cienkie metody/delegaty, analogicznie do kierunku `AnimalLife`/`animalCorpse`, ale moduł powinien posiadać reguły typu:

- czy Follow jest aktywne,
- hysteresis start/stop distance,
- Stay anchor semantics,
- wybór control movement target/fallback.

Nie umieszczać Follow/Stay w `AnimalLife.ts` ani `animalForaging.ts` — to nie fizjologia ani source targeting.

Domyślny state po pierwszym transferze do playera: `follow`.

## 7. Behaviour integration

`faunaDecision.ts` pozostaje wysokopoziomową arbitrażą threat/social/combat vs normal behaviour. Nie dodawać tam `follow` jako konkurenta dla `player-flee`, `fire-avoid`, `dog-guard` itd., chyba że recon implementacyjny wykaże konieczność zmiany globalnej priority semantics.

Dla player-owned herbivore/mount najbardziej naturalny seam jest wewnątrz normal behaviour fallback:

```text
high-level gates/decision
→ normal prey/predator branch
→ immediate threat/safety response
→ pursueNeeds() using existing animalForaging
→ owned control movement (Follow / Stay)
→ ordinary roam/wander fallback
```

Follow/Stay nie może przejąć:

- dead/mounted gates,
- flee/threat response,
- skutecznego hunger/thirst pursuit,
- water traversal/collision/walkability,
- physiology tick.

Nie tworzyć nowego unified pressure system tylko dla ownership control.

## 8. Follow

`Follow` ma używać istniejącego locomotion/steering/walkability/water traversal pipeline.

Wymagania:

- player position przekazywać jako narrow plain-data tick input; bez referencji do `PlayerController`,
- dwa progi hysteresis: `startFollowDistance > stopFollowDistance`,
- po wejściu w Follow movement utrzymać commitment do stop threshold zamiast oscylować co tick,
- szybszy movement może korzystać z istniejącego species speed/stamina, bez horse-specific alternatywnego movement,
- zwykły follow nie teleportuje i nie attachuje transformu do playera,
- lost-horse recovery/whistle pozostaje osobnym przyszłym feature.

## 9. Stay

`Stay` wyłącza follow-player, ale nie zamraża agenta.

Reuse `AnimalAgent` home/wander semantics oraz `animalRoaming` helpers zamiast tworzyć exact return-to-point FSM.

Przy przejściu do `Stay` ustawić lokalny anchor/origin. W tym stanie animal nadal może:

- szukać jedzenia,
- szukać wody,
- flee/reagować na hazard,
- walczyć, jeśli species behaviour tego wymaga,
- lokalnie roamować.

Po zakończeniu needs/threat behaviour wraca do lokalnego Stay roaming context, nie do starego household home.

## 10. Household → player transfer cleanup

Transfer musi jednocześnie odłączyć household-specific runtime semantics:

- household water/trough preference,
- owner-home roaming anchor,
- dog/guard ownership assumptions zależne od `ownerHouseId`,
- source `Settlement.livestock` lifecycle.

Nie modyfikować `animalForaging.ts` specjalnym `playerHorse` branchem. Jeżeli player-owned animal ma stracić household trough priority, zmienić injected foraging context/owner-derived accessor, nie wspólny scoring dla wszystkich zwierząt.

## 11. Riding integration

`fauna-003` pozostaje authority dla riding.

```text
mounted
→ player drives movement through existing mount pipeline
→ autonomous Follow/Stay movement suspended

dismount
→ same AnimalAgent
→ same ownership
→ previous Follow/Stay state resumes
```

Nie dodawać drugiego mount reference.

Obecny resolver w `createApp.ts` szuka mounta w loaded `Settlement.livestock` i global fauna. Po dodaniu detached collection musi używać publicznego persistent-animal resolvera, inaczej restored player-owned mount nie zostanie odnaleziony.

## 12. Interaction seam

Reuse istniejącego contextual animal interaction / dialog actions flow.

UI ma tylko wysłać komendę:

```text
Follow ↔ Stay
```

Domenowy handler waliduje, czy target jest player-owned i controllable. `domestic`, `mountable`, affinity albo sama bliskość gracza nie dają prawa do sterowania cudzym livestock.

Nie tworzyć management screen w tym planie.

## 13. Death / final removal

Ownership nie zmienia `AnimalLife` ani corpse lifecycle.

Player-owned animal może umrzeć i zostać finalnie usunięty jak inne livestock. Removal musi:

- usunąć detached live agent/index entry,
- zapisać tombstone w jego origin namespace,
- uniemożliwić source deterministic slotowi respawn duplikatu.

Nie tworzyć horse-specific resurrection guards.

## Cross-domain contract

Po ukończeniu planu inne domeny powinny potrzebować tylko małego publicznego API semantycznie w rodzaju:

```text
resolvePersistentAnimal(animalId)
transferAnimalOwnership(animalId, owner)
setOwnedAnimalControl(animalId, follow | stay)
```

Merchant/quest/player-care plans korzystają z tych seamów bez znajomości settlement internals.

## Implementation order

1. Ownership type + origin/reconciliation contract + unit tests.
2. Rozszerzenie `LivestockSaveRecord` / registry / save validation tak, aby player-owned record był legalnym deterministic restore state.
3. Detached live-animal ownership w `SettlementsManager`, transfer tej samej instancji i stable lookup.
4. Shared ticking/removal path dla detached livestock bez duplikowania fauna update policy.
5. Focused Follow/Stay state/helper module oraz `AnimalAgent` thin integration w normal-behaviour fallback.
6. Interaction command seam.
7. Mount resolver/restore integration.
8. Regression tests dla household livestock, streaming, persistence i deterministic reconstruction.

## Konkretne pliki / seams do implementacji

Główne:

- `src/fauna/AnimalAgent.ts` — authoritative per-animal owner/control fields, thin delegates, update-context integration; nie przenosić z powrotem policy z wydzielonych modułów.
- `src/fauna/faunaDecision.ts` — zachować high-level arbitration; zmieniać tylko jeśli naprawdę potrzebne do wpięcia control fallback.
- `src/fauna/AnimalLife.ts` — bez ownership/control logic; regression boundary dla potrzeb/staminy.
- `src/fauna/animalForaging.ts` — bez player-specific foraging branch; reuse source pursuit.
- `src/fauna/animalRoaming.ts` — reuse probe/trip/home-adjacent semantics dla Stay.
- `src/fauna/ownedAnimalControl.ts` — preferowany nowy mały moduł plain state/pure control helpers, jeśli implementacja potwierdzi tę nazwę/shape.
- `src/settlement/livestock.ts` — `LivestockSaveRecord`, `LivestockPersistence`, `LivestockRegistry`, `createLivestockRegistry()`, deterministic spawn/hydrate reconciliation, livestock tick helpers.
- `src/settlement/SettlementsManager.ts` — detached player-owned live collection/index, streaming lifetime, save capture/restore.
- `src/settlement/createSettlement.ts` — current settlement livestock update/removal + household context wiring; nie przejmować player-owned lifetime.
- `src/app/createApp.ts` — mount resolver oraz narrow player-position/control wiring.
- `src/app/actions/mountActions.ts` — istniejący riding authority; minimalne integration only.
- `src/persistence/saveData.ts` — validation nowych plain-data fields.
- `src/fauna/dogGuard.ts` — regression dla household-derived ownership semantics.

## Test seams

Dodać/rozszerzyć przede wszystkim unit/integration tests dla:

- ownership discriminated state i derived household accessor,
- household → player transfer zachowuje ten sam `AnimalAgent` i `animalId`,
- transfer wyjmuje live agent z `Settlement.livestock` bez `dispose()`/recreate,
- source settlement unload nie usuwa detached player-owned animal,
- save snapshot obejmuje detached animal mimo braku w settlement collection,
- hydrate player-owned recordu nie wymaga equality z deterministic household owner,
- source deterministic slot nie tworzy duplicate po stream-out/in ani full save/load,
- final removal zapisuje tombstone dla origin slotu,
- household association/trough semantics są wyczyszczone po transferze,
- `Follow`/`Stay` round-trip przez snapshot/hydrate/save validator,
- Follow hysteresis i fallback priority względem needs/threat,
- Stay anchor korzysta z roaming semantics i nie ciągnie do starego household home,
- mounted gate suppressuje autonomous control movement,
- dismount przywraca zapisany Follow/Stay state,
- mount resolver znajduje detached player-owned animal,
- existing household livestock/dogs/riding nie zmieniają zachowania bez transferu.

Preferować pure tests dla ownership/control/reconciliation helpers oraz istniejące `livestock.test.ts` / fauna tests zamiast testów wymagających pełnego Three.js runtime tam, gdzie nie jest to konieczne.

## Manual verification

Browser verification wykonuje użytkownik po implementacji. Agent AI jej nie wykonuje.

Sprawdzić manualnie co najmniej:

1. Existing horse/donkey nadal działa jako mount.
2. Household horse po transferze pozostaje tą samą instancją/id.
3. Source settlement może unloadować się bez zniknięcia owned horse.
4. Follow podąża z hysteresis i nie oscyluje.
5. Stay zatrzymuje follow, ale nie potrzeby/threat response.
6. Dismount przywraca wcześniejszy control state.
7. Save/load zachowuje ownership/control/position/life.
8. Settlement reload nie tworzy duplicate source horse.
9. Death/final removal nie powoduje respawnu deterministic slotu.

## Non-goals

Poza zakresem:

- zakup konia,
- quest dający konia,
- player-built trough,
- stajnia,
- selling/stealing animals,
- horse inventory/equipment/saddle,
- breeding,
- affinity-driven obedience,
- taming wild horses,
- whistle/summon/lost-horse teleport,
- multiple-animal management UI,
- mounted combat changes.

## Guardrails

- Nie cofać `fauna-017`.
- Nie robić `AnimalAgent` ponownie monolitem.
- Nie tworzyć `HorseManager`, player-animal AI controller ani player-only physiology/movement.
- Nie zmieniać shared foraging/roaming/life semantics tylko dla horse ownership.
- Zachować stable `animalId`, deterministic provenance i jedno źródło prawdy ownership.
- Nie uruchamiać `pnpm docs:sync`; synchronizacja dokumentacji odbywa się automatycznie przez GitHub workflow.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
