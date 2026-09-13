# Plan: Player Spatial Context and Cross-Space Target Isolation

**Created:** 2026-09-13  
**Status:** `planned` 📋  
**Type:** fix  
**Priority:** high · **Effort:** L  
**Depends on:** ~~world-terrain-019~~  
**Domain:** `world`  
**Subdomains:** `places` `simulation`  
**Tags:** `caves` `spatial-context` `interaction` `combat`  
**Roadmap:** -  
**Model:** Opus, Sonnet

## Cel

Usunąć przeciekanie lokalnych systemów Playera pomiędzy powierzchnią a Cave V2 przy tym samym lub bliskim `X/Z`.

Zaobserwowany przypadek:

```text
Player w cave
→ surface tree ma bliskie X/Z
→ interaction candidate
→ XZ-only gaze/range
→ prompt Interact
```

Recon potwierdził, że problem nie jest specyficzny dla trees. `Interactable`, `buildInteractables()`, `rankInGaze()` / `pickInGaze()` i część player-combat targetingu są nadal XZ-only, podczas gdy Cave V2 i `PlayerController` potrafią już rozróżnić surface od underground po XYZ.

Docelowo:

```text
world/entity state
→ authoritative spatial context
→ same-context filter
→ existing XZ range/gaze/combat ranking
→ prompt / target / action
```

## Invariants

- ten sam `X/Z` nie oznacza tej samej przestrzeni gameplayowej;
- surface target nie może być lokalnym targetem Playera w zamkniętej części cave i odwrotnie;
- filtr przestrzeni działa przed gaze/combat rankingiem;
- bez wyjątków `insideCave && targetIsTree`;
- bez osobnych filtrów per `Interactable.kind`;
- surface simulation działa nadal niezależnie od Player location;
- `rankInGaze()` może pozostać XZ-only po wcześniejszym same-context filter;
- `Caves.queryInterior()` nie jest membership resolverem — ma hysteresis i presentation/audio semantics;
- nie używać dystansu od cave entrance jako membership.

## Existing mechanisms to reuse

Cave V2 (`src/world/createCaves.ts`, `src/world/caves/`) już udostępnia:

- `queryGround(x,y,z)`;
- stateless `occupancyAt(x,y,z)` / `contains(...)`;
- `resolveHorizontal(...)`;
- hysteretic `queryInterior(...)`;
- cave-scoped `queryGroundIn(caveId,...)` / `resolveHorizontalIn(caveId,...)`;
- stabilne `caveId`.

`PlayerController.groundAt()` już używa realnego `Y`, bo ten sam X/Z może oznaczać hillside albo cave floor.

`player/worldWaterEligibility.ts` jest istniejącym precedentem current-space filtering: surface water nie przejmuje ruchu Playera pod rock ceiling.

`fauna/animalCaveHabitat.ts` już używa stabilnego `{ kind: 'cave', caveId }` i stateless cave-scoped contract.

## Scope

Plan obejmuje:

1. shared plain-data spatial context;
2. stateless Cave V2 resolver `XYZ -> spatial context`;
3. spatial context na `Interactable`;
4. centralny same-context filter przed gaze/cycle/prompt/action;
5. living combat i ranged target isolation;
6. projectile związany z contextem wystrzału;
7. zachowanie underground `Y` / cave context dla world-generated cave containers;
8. naprawę debug location teleportów `cave -> surface`;
9. testy regresyjne i dokumentację shared seam.

## Non-goals

Nie implementować tutaj:

- NPC cave traversal (`npc-027`);
- cave-aware rich deposits (`world-018`);
- nowego pathfindingu;
- przebudowy Cave V2;
- osobnych scenes/world instances;
- full 3D projectile physics;
- raycast-based interaction rewrite;
- zatrzymywania surface world;
- globalnej przebudowy collision registry;
- pełnego positional-audio audytu;
- pełnego AI/perception fixu;
- generic portal/interior frameworku.

Collision/audio/perception leaks ujawnione przez recon pozostają follow-upami.

## Stage A — Shared spatial context

Dodać neutralny, Three.js-free kontrakt, preferencyjnie:

```text
src/world/spatialContext.ts
```

Minimalny model:

```ts
type WorldSpatialContext =
  | { kind: 'surface' }
  | { kind: 'cave'; caveId: string }
```

Dodać pure equality/helper dla canonical surface value.

Nie persistować aktualnego Player context jako drugiego source of truth. Context wynika z authoritative world position/spatial semantics.

Dodać JSDoc z `@domain world` dla publicznego kontraktu/resolvera.

### Cave resolver

Rozszerzyć `Caves` o stateless query równoważne:

```text
spatialContextAt(x, y, z) -> surface | cave:<id>
```

Resolver ma:

- używać retained Cave V2 heightfield data;
- zwracać konkretne `caveId`;
- rozróżniać surface nad tunelem od cave pod nim przez `y`;
- traktować open-sky mouth zgodnie z istniejącą Cave V2 semantyką, bez proximity heuristics;
- być niezależny od presentation streaming i `queryInterior()` hysteresis;
- reuse istniejące query/indexy, bez drugiej spatial representation.

Performance: Player context policzyć raz per frame; nie robić pełnego world scan per candidate, jeżeli istniejący cave grid/source-owned caveId pozwala tego uniknąć.

## Stage B — Interaction isolation

Rozszerzyć `Interactable` o `spatialContext`.

Nie zmieniać istniejącego XZ gaze/range UX. Spatial availability jest wcześniejszym filtrem.

Context powinien pochodzić ze źródła targetu:

- surface-only sources → canonical `surface`;
- runtime entities z realnym XYZ → shared resolver, dopóki domena nie posiada explicit context;
- cave-authored content znający `caveId` → zachować tę tożsamość;
- przyszły `npc-027` ma podać ten sam contract bez zmian w interaction architecture.

`buildInteractables()` ma zwracać same-context targets albo zastosować jeden centralny filter bezpośrednio po zbudowaniu listy, przed:

```text
rankInGaze → pickInGaze → Tab cycle → prompt → inspect/action
```

Nie filtrować dopiero w `buildInteractionGazePrompt()`.

## Stage C — Cave world-generated containers

`WorldGeneratedContainerSpec` obsługuje explicit underground `y`, ale runtime entry traci tę informację przed interaction layer.

Naprawić przepływ:

```text
world-generated spec
→ runtime entry
→ Interactable
→ cave spatial context
```

Deterministic spec pozostaje authority. Nie persistować redundantnego Y/context tylko dla interaction.

Jeżeli source zna `caveId`, zachować explicit context; jeśli nie, zachować authoritative `y` i użyć shared resolvera.

Wymagane regresje:

- Player na surface nad cave chestem nie może go targetować;
- Player wewnątrz cave może go normalnie otworzyć.

## Stage D — Player combat isolation

### Living targets

`collectLivingCombatTargets()` ma odrzucać candidates z innego contextu przed:

- Tab living cycle;
- soft-lock;
- target resolution.

Używać tego samego `WorldSpatialContext`, bez osobnego combat registry.

### Melee

Melee candidates w `gameLoop.ts` są budowane z `interactables`. Potwierdzić, że po centralnym interaction filter nie istnieje bypass pozwalający trafić surface entity z cave.

### Ranged

`collectRangedAnimalCandidates()` ma uwzględniać spatial context.

Projectile zapamiętuje context w chwili fire. Hit resolution porównuje projectile context z candidate context przed istniejącym XZ swept-segment testem.

Zmiana Player contextu po wystrzale nie może przepiąć lecącej strzały do innej przestrzeni.

Preferować pozostawienie `combat/projectile.ts` jako pure geometry module; context filtering może zostać w callerze.

## Stage E — Debug teleport cave -> surface

Aktualny debug teleport przekazuje tylko `(x,z)`, a `PlayerController.setPosition(x,z)` wykonuje ground snap z poprzedniego Player `Y`.

Istniejące location teleports (`mountain`, `village`, `river`, cave entrance itd.) są semantycznie surface teleports.

Nadać im jawną semantykę:

```text
surface destination
→ waitForChunks
→ seed Player Y z authoritative surface terrain
→ ordinary ground snap
```

Preferować rozszerzenie istniejącego narrow teleport callback / `PlayerController.setPosition` o jawny Y seed/preferred Y, zamiast mutować `player.mesh.position.y` wewnątrz debug API.

Przyszły direct cave-interior teleport powinien być osobnym explicit XYZ/context API.

## Relevant files / symbols

Główny zakres:

```text
src/world/spatialContext.ts
src/world/createCaves.ts
src/interaction/Interactable.ts
src/app/interactables.ts
src/interaction/findInteractionTarget.ts
src/app/gameLoop.ts
src/player/playerCombat.ts
src/combat/projectile.ts
src/world/worldGeneratedContainers.ts
src/player/PlayerController.ts
src/app/createApp.ts
src/debug/npcDebugApi.ts
```

`findInteractionTarget.ts` powinien idealnie zachować obecną ranking semantics; fix ma być przed nim.

## Performance constraints

- Player context raz per frame;
- shared immutable surface value zamiast alokacji per target;
- surface-only sources bez cave lookup per object;
- bez Raycastera per candidate;
- bez nowych world-wide scans;
- bez zmian częstotliwości NPC/fauna/chunk simulation;
- filter O(local candidates).

## Related plans

### `npc-027-spatial-context-and-cave-traversal.md`

Po wdrożeniu tego planu ma reuse `WorldSpatialContext` zamiast definiować równoległy `surface | cave:<id>` contract. Ten plan nie implementuje NPC traversal.

### `world-018-cave-aware-rich-finite-resource-deposits.md`

Mineable targets mają reuse ten sam spatial context zamiast resource-local discriminatora.

### Cave treasure / quests

Cave-authored containers korzystają z shared target isolation. Quest code nie dodaje własnego cave proximity gate.

## Follow-ups poza scope

### Collision

`colliderActiveAtY()` filtruje tylko colliders z vertical extent; starsze surface colliders bez `minY/maxY` są aktywne na dowolnym Y. Osobno zreprodukować surface trees/buildings blocking underground i zaplanować wspólny fix, jeśli występuje.

### Fauna / NPC perception

Awareness/aggression częściowo używa XZ distance. Osobno sprawdzić surface predator/NPC reagujący przez cave roof; przy fixie reuse `WorldSpatialContext`.

### Positional audio

`WorldAudio.playAt()` jest 3D tylko gdy source poda `y`. Osobno sprawdzić surface/cave one-shot call-sites.

### Dropped items

`DroppedItem` jest XZ i placement używa surface `sampleHeight`. Cave drop wymaga osobnego cave-aware placement fixu; interaction filtering tego nie zastępuje.

## Tests

### Spatial contract

- surface nad tunnel → `surface`;
- cave floor pod tym samym XZ → `cave:<id>`;
- open-sky mouth nie staje się cave tylko przez proximity;
- różne `caveId` nie są tym samym contextem;
- kolejność stateless queries nie zmienia wyniku.

### Interaction

- cave Player + nearby-XZ surface tree → brak candidate/prompt;
- reprezentatywny surface pickup/building/NPC również odrzucony;
- surface Player + underground cave chest → brak targetu;
- cave Player + cave chest → działa;
- ordinary surface interactions bez regresji;
- Tab cycle nie zawiera other-context targets.

Nie testować osobno każdego `Interactable.kind`, jeżeli centralny filter i reprezentatywne source classes pokrywają contract.

### Combat

- cave Player nie soft-lockuje surface fauna/NPC;
- surface Player nie soft-lockuje cave resident;
- ranged candidates filtrują context;
- cave projectile nie trafia surface animal nad nim;
- projectile zachowuje fire context po późniejszej zmianie Player context;
- ordinary surface combat bez regresji.

### Debug teleport

- start z underground Y + surface destination → surface ground;
- cave entrance teleport nadal trafia na entrance/open-sky surface;
- location lookup/chunk preload bez regresji.

## Verification

AI agent uruchamia tylko automated checks, minimum:

```text
pnpm typecheck
relevant vitest suites: spatial context / interactables / combat / containers / debug teleport
```

AI nie wykonuje browser verification.

Manual browser verification — User:

1. wejść głęboko do cave pod surface trees/buildings/pickups — brak promptów;
2. stanąć pod surface NPC/fauna — brak Tab/soft-lock;
3. cave chest działa wewnątrz, nie działa z surface nad nim;
4. strzała z cave nie trafia surface animal przez strop;
5. z cave użyć kilku `seedvale.debug.teleportTo.*` — Player ląduje na surface;
6. normalnie wyjść przez mouth — surface targets wracają bez sticky cave context;
7. zwykłe surface interaction/combat pozostają bez zmian.

## Definition of Done

- jeden shared `WorldSpatialContext`;
- stateless Cave V2 context resolution z `caveId`;
- centralne same-context filtering przed gaze/cycle/prompt;
- brak surface tree promptu pod ziemią;
- brak cave chest targetu z surface;
- combat/ranged nie przecieka surface ↔ cave;
- projectile nie trafia cross-context targetu;
- debug surface teleport nie dziedziczy underground contextu;
- surface simulation nadal działa niezależnie od Player location;
- bez niepotrzebnej przebudowy `rankInGaze`/surface gameplay;
- relevant tests przechodzą;
- follow-up leaks pozostają poza scope.

> **Zrób git commit i push do main, rebase jeżeli trzeba**