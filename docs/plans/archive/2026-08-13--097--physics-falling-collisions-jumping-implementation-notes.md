# Implementation Notes: 097 — Physics: falling, collisions, jumping

## Cel dokumentu

Ten dokument jest uzupełnieniem planu:

`docs/plans/2026-08-13--097--physics-falling-collisions-jumping.md`

Ma pomóc Claude Code przeprowadzić implementację bez ponownego analizowania całego repozytorium i bez tworzenia równoległych mechanizmów.

---

## 1. Najważniejsze zalecenie

**Nie wprowadzaj biblioteki fizyki (Rapier/Cannon/Ammo).**

Zakres Seedvale nie wymaga obecnie pełnego rigid-body physics. Potrzebujemy:

- gravity dla dropped items,
- gravity / vertical movement gracza,
- ground detection,
- kolizji postaci z prostymi przeszkodami,
- ograniczenia ruchu wewnątrz przyszłych `CaveVolume`,
- prostego jump.

Własny, deterministyczny collision layer oparty o proste prymitywy jest wystarczający.

Nie implementować:

- rigid bodies,
- impulse solver,
- restitution,
- friction solver,
- stacking,
- ragdolls,
- dynamicznych fizycznych propsów.

---

# 2. Kolejność implementacji

Implementować dokładnie w tej kolejności:

### Faza 2.1 — falling dropped items

Najpierw wyłącznie:

`DroppedItems → falling state → gravity → terrain landing`

Nie zaczynać jeszcze collision systemu.

### Faza 2.2 — collision foundation

Najpierw stworzyć **ogólny, mały collision/query layer**, a dopiero potem podłączać go do:

1. Player
2. NPC
3. Fauna
4. przyszłych CaveVolume

Nie tworzyć osobnego `playerCollision.ts`, `npcCollision.ts`, `caveCollision.ts` z własną logiką.

### Faza 2.3 — jumping

Dopiero po działającym vertical movement + collision.

---

# 3. Faza 2.1 — DroppedItems

Aktualny kod jest bardzo prosty:

`src/items/createDroppedItems.ts`

`DroppedItem` obecnie zawiera:

- `id`
- `kind`
- `x`
- `z`

Mesh jest ustawiany przez:

`placeOnGround(mesh, item.x, item.z, sampleHeight)`

To oznacza, że nie należy przebudowywać całego systemu itemów.

## Zalecana implementacja — zaimplementowane 2026-08-13

Publiczny `DroppedItem` pozostał rekordem pozycji spoczynkowej (`{ id, kind, x, z }`) —
schema save'a (v10) się nie zmieniła.

Runtime ma osobny stan lotu, lokalny do `createDroppedItems.ts`:

```ts
const falling = new Map<string, { vy: number }>()
```

- Stałe modułowe: `DROP_SPAWN_HEIGHT = 0.9` (dłoń/pas), `GRAVITY = 20` (celowo mocniejsza
  niż 9.81 — krótki, czytelny spadek zamiast realistycznego wolnego opadania).
- `drop()`: tworzy `DroppedItem` jak dotąd, wywołuje `spawnMesh(item, DROP_SPAWN_HEIGHT)`
  (nowy opcjonalny `yOffset` na `spawnMesh`, przekazywany dalej do `placeOnGround`'s istniejącego
  `yOffset`), potem `falling.set(item.id, { vy: 0 })`.
- `tick(dt)`: dla każdego wpisu w `falling` — `vy -= GRAVITY*dt`, kandydat
  `mesh.position.y + vy*dt`; jeśli `<= sampleHeight(x,z)` → przypina do gruntu i usuwa z `falling`
  (wraca do dzisiejszego stanu „stoi”, koszt 0); inaczej ustawia `mesh.position.y` na kandydata.
  Early-return gdy `falling.size === 0`.
- `collect()` i `dispose()` też czyszczą wpis z `falling` (usunięty/zebrany w locie item nie może
  zostać osieroconym wpisem w mapie).
- Wywoływane z `gameLoop.ts` obok `bundle.itemSpawners.update(...)`:
  `bundle.droppedItems.tick(dt)`.

**Save/load (rozstrzygnięcie otwartego pytania z planu §6/2.1):** **bez zmiany schematu.**
`x`/`z` nie zmieniają się w locie (brak `vx`/`vz` w v1 — patrz plan pytanie 7), więc zapisany
rekord jest identyczny w locie i po lądowaniu. Item złapany w zapisie w połowie spadku po
wczytaniu po prostu ląduje od razu na `sampleHeight(x,z)` — pominięty fragment lotu trwa
< 0.3 s i < 1 m, niezauważalne (dokładnie ta opcja, którą plan zostawił otwartą jako
akceptowalną). Nie dodano `SaveDataV11`.

**Status:** faza 2.1 zaimplementowana i zweryfikowana technicznie (`tsc`, `lint`, `build`,
`test` — wszystkie przechodzą). Manualna weryfikacja w przeglądarce (widoczny spadek po `G`,
poprawny pickup, save/reload w locie) czeka na usera — patrz plan, sekcja „Weryfikacja”, punkt 1.

---

# 4. Faza 2.2 — Kolizje (zaimplementowane 2026-08-13)

## 4.1 Jeden wspólny moduł: `src/world/collision.ts`

Nowy, samodzielny moduł (bez zależności od `ChunkManager`/domenowych typów) —
dokładnie ten "mały collision/query layer" z sekcji 2 tego dokumentu:

- `Collider = { x, z, radius }` — jedyny prymityw (okrąg).
- `resolvePosition(x, z, entityRadius, colliders)` — czysta funkcja: znajduje
  collider z **największą penetracją** i wypycha punkt na zewnątrz wzdłuż wektora
  środek→punkt. Nie rozwiązuje jednoczesnego nakładania się dwóch corliderów
  (np. róg między dwiema skałami) — celowe uproszczenie v1 zgodne z planem.
- `createColliderRegistry(cellSize)` — grid bucketów `cellSize` × `cellSize`
  (przekazywany `config.chunkSize`), z API `setColliders(ownerKey, colliders)` /
  `clearColliders(ownerKey)` / `query(x, z)` (sąsiedztwo 3×3 bucketów). `ownerKey`
  to albo klucz terenowego chunka, albo id osady/studni — jeden rejestr obsługuje
  oba źródła bez dwóch równoległych struktur.
- Pokryte testami jednostkowymi (`collision.test.ts`), zgodnie z konwencją repo
  (logika czysta → Vitest).

## 4.2 `ChunkManager` jako właściciel rejestru

`chunkManager.ts` tworzy jeden `colliderRegistry` i:

- w `ensureLoaded()` — zaraz po ustaleniu `tile`, przed `buildAndAttachMesh` —
  buduje listę providerów z `tile.environment` (tabela `ENVIRONMENT_COLLISION_RADIUS`
  per `EnvironmentKind`, pomnożona przez `placement.scale`) i `tile.vegetation`
  (tylko `kind === 'tree'`, promień płaski `TREE_COLLISION_RADIUS` — `VegetationPlacement
  .scale` jest udokumentowane jako "unused" dla drzew), i woła
  `colliderRegistry.setColliders(chunkKey, colliders)`.
- w `unload()` — `colliderRegistry.clearColliders(record.key)`.
- eksponuje na `ChunkManager`: `collidersNear(x, z)` (odczyt), `registerColliders`
  /`clearColliders` (zapis dla źródeł spoza chunków terenu — osady).

**Promienie środowiska** (`ENVIRONMENT_COLLISION_RADIUS`, ręczne estymaty z
geometrii `create*` w `props.ts`, nie zmierzone): `largeRock` 0.9, `rockCluster`
0.5, `fallenLog` 0.4, `campfire` 0.5, `monolith` 0.4. **`stoneCircle` i
`smallRuins` celowo 0** (bez kolizji w v1) — obie to landmarki, których prawdziwy
kształt (pierścień z wnętrzem do przejścia / narożnik L-kształtnych murów) jeden
okrąg by źle przybliżył (zablokowałby właśnie to miejsce, po którym gracz ma
móc chodzić). Drzewa: `TREE_COLLISION_RADIUS = 0.4` (promień pnia), **tylko
gdy `resolved.visual === 'living'`** — sadzonka/pień po ścięciu nie kolidują.

**Świeżość colliderów drzew:** drzewa mają runtime lifecycle (ścięcie →
`refreshTreeVisual` zamienia mesh na pieniek; odrost → z powrotem na żywe), więc
collider zbudowany raz przy generacji chunka by się zdezaktualizował (ścięte
drzewo dalej blokowałoby przejście przez pieniek). Naprawione przez
`rebuildColliders(record)` — funkcję przeliczającą **cały** zestaw colliderów
chunka (środowisko + aktualny stan lifecycle każdego drzewa z `record.treeIds`)
i zastępującą go w rejestrze — wołaną raz na końcu `ensureLoaded` (po
zbudowaniu wszystkich sekcji tile'a) **i** za każdym razem z `refreshTreeVisual`.
Tani (dane, nie GLB) — chunk ma najwyżej kilkadziesiąt drzew.

## 4.3 Studnia i domy — `createSettlement.ts` rejestruje własne colidery

Osady **nie są częścią `ChunkManager`** (budowane bezpośrednio do `scene` przez
`buildSettlementProps`, ładowane/wyładowywane niezależnie przez
`SettlementsManager`) — rejestrują więc swoje statyczne collidery pod
`ownerKey = def.id` przez `chunkManager.registerColliders`/`clearColliders`,
przekazane w dół łańcuchem `worldBundle.ts` → `createSettlementsManager` →
`createSettlement`:

- **Studnia:** `WELL_COLLISION_RADIUS = 1.0` — dokładnie ta sama stała co
  wcześniej w `ai/NpcAgent.ts` (baza ~0.85 promienia mesha + bufor), tylko
  przeniesiona do `createSettlement.ts` (jedyne miejsce, które zna pozycję
  studni) i teraz rejestrowana jako zwykły `Collider`, nie osobny mechanizm.
- **Domy:** nowe pole `HouseCatalogEntry.footprintRadius` (jak `groundYOffset`
  — ręcznie dobrana wartość per katalogowy model, nie liczona z GLB bbox w
  runtime) — `hut_d` 2.0, `hut_a` 2.2, `hut_b` 2.2, `hut_c` 1.6, `towerhouse`
  1.8, `fallback` 1.5. `landmarks.houses[i].houseId` już niósł identyfikator
  katalogowy (issue 018), więc kolidery domów to `houseCatalogById(houseId)
  .footprintRadius` przy pozycji z `landmarks.houses`.
- Rejestracja w `Settlement.dispose()` przez `clearColliders(def.id)` — symetrycznie
  do `registerColliders` przy budowie, więc streaming osad in/out
  (`SettlementsManager`'s `unload`/`ensureLoaded`) nie zostawia sierocych
  colliderów ani nie duplikuje ich przy ponownym załadowaniu.

## 4.4 Trzej ruchomi konsumenci — dwa różne wzorce integracji, jeden wspólny rejestr

Plan (sekcja 2.2) zakładał, że każdy z trzech konsumentów dziś liczy deltę i
przypisuje `position.x/z` wprost, więc `resolvePosition` wejdzie jako krok
pośredni po delcie. Weryfikacja kodu (2026-08-13) pokazała, że to prawda tylko
dla gracza — NPC i fauna miały już własny, bardziej rozbudowany mechanizm
(`isWalkable(x, z)` bramkujący ruch + oś-po-osi sliding w `steerTo`/
`steerToward`, żeby NPC/zwierzę nie utykało w przeszkodzie). Dodanie
`resolvePosition` jako **drugiego, równoległego** mechanizmu obok istniejącego
`isWalkable` byłoby dokładnie tym, czego plan każe unikać ("brak dwóch
równoległych mechanizmów kolizji") — więc:

- **Gracz** (`PlayerController.update()`): wzorzec z planu, dosłownie.
  `mesh.position.x/z += wish` zastąpione: policz kandydata, przepuść przez
  `resolvePosition(candidateX, candidateZ, PLAYER_COLLISION_RADIUS,
  this.collidersNear(candidateX, candidateZ))`, przypisz wynik.
  `PLAYER_COLLISION_RADIUS = 0.35` (promień capsule fallbacku — GLB gracza nie
  ma osobno zmierzonego kształtu kolizyjnego, więc jeden przybliżony promień
  służy obu). `collidersNear` dochodzi do `PlayerController` przez nowy
  parametr `create()`/`setGround()` (`ColliderSource`, nowy eksportowany alias
  typu obok `HeightSampler`), źródłem jest zawsze `chunkManager.collidersNear`.
- **NPC** (`ai/NpcAgent.ts`) i **fauna** (`fauna/AnimalAgent.ts`): istniejący
  `isWalkable`/(`resolveSteerTarget` tylko NPC) **uogólnione**, nie zastąpione —
  źródłem danych jest teraz `this.collidersNear(x, z)` (zapytanie do
  rejestru) zamiast twardo wpisanej pozycji studni:
  - `NpcAgent.isWalkable`: pętla po `collidersNear(x, z)`; dla każdego collidera
    w zasięgu sprawdza (jak dawniej tylko dla studni) czy `pendingAction
    .destination` jest w promieniu `collider.radius + NPC_COLLIDER_APPROACH_BUFFER`
    (0.4, dawne `WELL_APPROACH_ALLOW - WELL_COLLISION_RADIUS`) — jeśli tak,
    końcowe podejście może wejść w zewnętrzny pierścień, ale nigdy głębiej niż
    `NPC_COLLIDER_CORE_FRACTION` (0.55, dawne magic number) promienia.
  - `NpcAgent.resolveSteerTarget`: ta sama pętla, ta sama matematyka odchylenia
    segmentu do stycznej na obrzeżu collidera (`rim = radius * 1.2`) co dawniej
    tylko dla studni — teraz działa dla pierwszego napotkanego collidera z
    `collidersNear(mesh.position)`. Rozwiązuje tylko jeden blokujący collider na
    wywołanie (spójne z uproszczeniem `isWalkable`/`resolvePosition` — "najbliższa
    przeszkoda", nie pełny multi-obstacle routing).
  - `AnimalAgent.isWalkable`: prostszy przypadek — bez `pendingAction`/wyjątków
    podejścia (zwierzęta nie mają kolejek typu "serving stand"), więc czysty
    test punkt-w-okręgu po `collidersNear(x, z)`.
  - Efekt uboczny zgodny z kryterium akceptacji: NPC i zwierzęta omijają teraz
    też drzewa/skały/domy, nie tylko studnię — wcześniej `WELL_COLLISION_RADIUS`
    było jedyną kolizją w całym ruchu NPC/fauny.
- `collidersNear` dochodzi do obu przez łańcuch konstruktorów/fabryk (jak
  `sampleHeight`/`waterLevel` już wcześniej): `NpcAgent.create`/
  `createCapsuleFallback` → `createSettlement.ts`; `AnimalAgent`'s konstruktor
  → `spawnLivestock` (settlement-owned) i `createFauna.ts`'s `spawnAgent`
  (dzika fauna) → `worldBundle.ts`'s `buildFauna`/`buildSettlementsManager`,
  oba źródłowo z `chunkManager.collidersNear`.

**`WELL_COLLISION_RADIUS` usunięty z `ai/NpcAgent.ts`** (kryterium akceptacji
planu) — konstanta i jej użycia przeniesione do `createSettlement.ts` jako
zwykły wpis w rejestrze; `NpcAgent.ts` już nie wie nic o studni per se, tylko
o generycznych counter-collision (`NPC_COLLIDER_APPROACH_BUFFER`/
`NPC_COLLIDER_CORE_FRACTION`).

## 4.5 Co zostało poza zakresem (celowo)

- Wnętrze `CaveVolume` — jak w planie, osobne zadanie (research 009 §11.4).
  Rejestr colliderów jest gotowy na statyczne ściany jaskini jako kolejny
  `ownerKey`, ale nic w tej fazie ich nie tworzy.
- `stoneCircle`/`smallRuins` bez kolizji (patrz §4.2) — świadomy wybór, nie
  przeoczenie; do rozważenia gdy/jeśli te landmarki dostaną kształt lepszy niż
  pojedynczy okrąg.
- Multi-obstacle resolution (róg między dwoma colliderami, `resolvePosition`
  rozwiązuje tylko najgłębszą penetrację) — zgodnie z planem, nie blocker v1.
- `PLAYER_COLLISION_RADIUS`/promienie domów/studni/propów to ręczne estymaty,
  nie pomiary z geometrii GLB — do dostrojenia na podstawie manualnego
  playtestu (patrz plan, kryteria akceptacji fazy 2.2).

## 4.6 Bugfix (2026-08-14): NPC uwięzieni w domach

Manualny playtest po 2.2 pokazał regresję: `NpcAgent.home` = pozycja domu = środek
jego własnego collidera (`house.position` w `createSettlement.ts`), więc każdy NPC
spawnuje się w odległości 0 od collidera własnego domu. `isWalkable` nie miał
wyjątku „już jestem w środku" — sprawdzał tylko odległość kandydata/`pendingAction
.destination` od collidera, więc fazy bez `pendingAction` (`wander`, `goSleep`)
blokowały każdy krok NPC wychodzącego z domu.

**Szybka łatka** (`NpcAgent.ts:1322`, `isWalkable`): dodany wyjątek — jeśli
aktualna pozycja NPC (`this.mesh.position`) jest już wewnątrz danego collidera,
ten collider go nie blokuje (wolne wyjście w dowolnym kierunku, bo okrąg nie ma
modelowanych drzwi). Blokowanie normalnie wznawia się, gdy NPC opuści promień.
Generyczne (nie tylko domy), symetryczne z filozofią `resolvePosition` gracza
(nigdy nie więzi, tylko blokuje wejście z zewnątrz).

**Poza zakresem tej łatki (świadomie):** prawdziwe metadane drzwi/pozycji wejścia,
kolizja domu jako coś innego niż pojedynczy okrąg, analogiczny fix dla
`AnimalAgent.ts` (nie zgłoszony jako problem). Właściwy fix „u korzeni" — osobny
przyszły research/plan.

---

# 5. Faza 2.3 — Skok (zaimplementowane 2026-08-13)

## 5.1 Stan pionowy w `PlayerController`

Nowe pola: `verticalVelocity` (m/s, +up), `grounded`, `jumpRequested` (edge-triggered
intencja skoku, ustawiana przez `jump()`, konsumowana i czyszczona na początku
`updateVerticalMotion`). Stałe: `GRAVITY = 20` (ta sama wartość co spadające itemy w
`createDroppedItems.ts` — krótki, czytelny łuk zamiast realistycznego 9.81),
`JUMP_SPEED = sqrt(2 * GRAVITY * 0.6)` (apex ~0.6 m).

`snapToGround()` (dawna, jedyna implementacja) zostaje jako wariant **teleportu** —
używana tylko w konstruktorze, `setPosition()` i `setGround()` (rebuild terenu). Oprócz
ustawienia `mesh.position.y` zeruje teraz też `verticalVelocity`/`jumpRequested` i
wymusza `grounded = true`, żeby teleport nigdy nie zostawiał gracza z resztkową
prędkością pionową sprzed skoku.

Nowa `updateVerticalMotion(dt)` zastępuje wywołanie `snapToGround()` w `update()`
(wołana co klatkę, niezależnie od tego czy gracz się porusza poziomo — grawitacja
działa też w bezruchu, np. przy zejściu z krawędzi). Gałąź underwater jest bez zmian
(dawny `snapToGround`'s swim-case) i **blokuje skok/grawitację** — `MAX_SWIM_DEPTH`
zostaje jedynym mechanizmem pionowym w wodzie (potwierdzone pytanie planu: brak skoku
w wodzie w v1). Na lądzie: jeśli `grounded && jumpRequested` → `vy = JUMP_SPEED`,
`grounded = false`; zawsze `vy -= GRAVITY*dt`; kandydat `y = position.y + vy*dt`; jeśli
`<= groundY` → przypina do gruntu, `vy = 0`, `grounded = true`, inaczej `grounded =
false` i `y` zostaje kandydatem.

`jump()` (publiczna metoda) jest no-opem poza `pose === 'stand'` — crouch/lie
(camp-rest) i skok się więc wzajemnie wykluczają bez dodatkowej logiki w
`gameLoop.ts`.

## 5.2 Input — `Space`, edge-triggered, wzorzec `consumeDrop`

`input/Keyboard.ts`: nowy klawisz `Space → jump` w `KEY_MAP`, dodany do
`EDGE_TRIGGERED`, z `consumeJump()` symetrycznym do `consumeInteract`/`consumeDrop`.

`gameLoop.ts`: `keyboard.consumeJump()` jest konsumowany w dwóch miejscach — w gałęzi
`modal !== null` (zrzucany bez akcji, tak jak `consumeDrop()` tuż obok — `activeModal`
obejmuje też `busy`/`restCamp`, więc to samo miejsce chroni przed „skokiem" tuż po
wybudzeniu z obozu/zajętości) i w głównej gałęzi świata (`if (keyboard.consumeJump())
player.jump()`, obok `consumeMinimap`/przed `consumeDrop`). Nie trzeba osobno czyścić
`keyboard.state.jump` w blokach `timeSkip`/`restCamp`/`busy`, które dziś zerują ruch —
te stany już wchodzą do `modal !== null` przez `activeModal`.

## 5.3 Animacja — bez klipu, reużyty trik `modelRoot.rotation.x`

Zgodnie z §4 pyt. 5 (żaden model postaci nie ma klipu skoku): `updateVerticalMotion`
ustawia `modelRoot.rotation.x` na lekkie przechylenie proporcjonalne do
`verticalVelocity` (`JUMP_TILT_FACTOR = 0.05`, `JUMP_TILT_MAX = 0.25` rad), zerowane
przy lądowaniu. Nie koliduje z `crouch()`/`lieDown()`, bo te uruchamiają się tylko
poza `pose === 'stand'`, a pionowa fizyka działa tylko w `pose === 'stand'`.

## 5.4 Kamera, pływanie, strome zbocza

Bez zmian poza samą integracją Y — `syncCamera()` już czytał `mesh.position.y` co
klatkę, więc łuk skoku przechodzi przez kamerę bez dodatkowej pracy (do potwierdzenia
manualnie — brak szarpania, patrz kryteria akceptacji). Pływanie i strome zbocza —
jak przewidziano w planie, brak zmian w tej fazie.

## 5.5 Dźwięk

`S17` (`docs/assets/SOUNDS.md`) zostaje `needed` — brak SFX skoku/lądowania w v1,
zgodnie z planem (niekrytyczne, może wejść później).
