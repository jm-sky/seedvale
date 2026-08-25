# Plan: House Collision Geometry

**Created:** 2026-08-25
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** 111, 097
**Domain:** `settlements`
**Tags:** `world`, `npc`, `fauna`

## 1. Cel

Naprawić kolizje składanych domów tak, aby odpowiadały rzeczywistej geometrii ścian i otworów drzwiowych.

Obecny problem nie jest pojedynczym błędnym offsetem drzwi. `HouseBuilder` reprezentuje każdy 2 m moduł ściany jako koło `radius = 0.95`, mimo że audyt MegaKit potwierdza rzeczywistą geometrię modułu jako **2.00 × 3.12 × 0.41 m**. Dla gracza o promieniu `0.35 m` daje to efektywną strefę blokowania o promieniu `1.30 m` wokół środka modułu, czyli ogromnie większą niż grubość ściany.

Dodatkowo moduł z drzwiami jest całkowicie pomijany, a brak ściany jest obecnie uzupełniany przez:

- zamknięte drzwi jako koło `radius = 0.45`;
- dwa zawsze aktywne koła jambów `offset = 1.05`, `radius = 0.15`.

To jest workaround na ograniczenie bazowego collision primitive, a nie reprezentacja domu.

### Zweryfikowany skutek

Dla domu 4×4 z drzwiami na przednim module 0 ścieżka przez środek drzwi może być blokowana już **wewnątrz domu przez boczny wall-circle**. Przykładowo środek gracza przechodzący z drzwi w głąb domu znajduje się w odległości mniejszej niż `0.95 + 0.35` od środka sąsiedniego bocznego modułu ściany. Dlatego „drzwi są w dobrym miejscu” nie wystarcza — obecna geometria ścian fizycznie zamyka wnętrze.

Jednocześnie pominięcie całego modułu drzwiowego tworzy sztuczne obszary bez kolizji przy ścianie. Debug `?debugColliders=1` słusznie pokazuje te koliste plamy, ponieważ overlay renderuje dokładnie te same collidery, które są używane przez ruch.

## 2. Zweryfikowany stan obecnego kodu

### 2.1 Bazowy collision system

`src/world/collision.ts` ma obecnie jeden prymityw:

```ts
export type Collider = {
  x: number
  z: number
  radius: number
}
```

`resolvePosition()`:

- sprawdza circle-vs-circle;
- wybiera jeden najgłębszy overlap;
- wypycha punkt poza collider;
- nie iteruje drugiego collidera po rozwiązaniu pierwszego.

To zachowanie należy zachować. Plan nie buduje physics engine ani nowego solvera wielociałowego.

`ColliderRegistry` indeksuje collidery po środku w gridzie 3×3 sąsiednich bucketów. Przy wymiarach domowych ~2 m i istniejącym rozmiarze chunka nie wymaga to osobnego systemu indeksowania dla OBB.

### 2.2 HouseBuilder

`src/settlement/houseBuilder.ts` obecnie posiada:

- `HOUSE_WALL_COLLIDER_RADIUS = 0.95`;
- `HOUSE_DOOR_COLLIDER_RADIUS = 0.45`;
- `HOUSE_DOOR_JAMB_OFFSET = 1.05`;
- `HOUSE_DOOR_JAMB_RADIUS = 0.15`;
- `buildHouseWallCollidersLocal()` — koła ścian, pomijające moduły drzwi;
- `buildHouseDoorJambCollidersLocal()` — workaround jambów;
- `buildHouseDoorCollidersLocal()` — koło zamkniętego skrzydła;
- `transformHouseCollidersToWorld()` — transform środka + promienia;
- `buildAssemblyCollidersWorld()` — korzysta z transformu root assembly.

`openingLocalPose()` jest już wspólnym źródłem pozycji wizualnego openingu, drzwi, zamkniętego door collidera i interaction points. Tego kontraktu nie należy rozbijać.

`HOUSE_ASSEMBLY_SCALE = 1`, a `buildAssemblyCollidersWorld()` bierze pozycję i yaw bezpośrednio z `assembly.root`, więc pozycja/yaw domu nie jest obecnie głównym problemem.

### 2.3 Settlement lifecycle

`src/settlement/createSettlement.ts` rejestruje jeden zestaw colliderów osady pod `def.id`:

```text
well
+ house colliders
+ settlement prop colliders
```

Zmiana stanu drzwi powoduje ponowną rejestrację całego zestawu przez istniejący `doorColliderSignature`.

Tego lifecycle nie zmieniać.

Fallback dla domu bez poprawnie zbudowanego `HouseAssembly` nadal używa `house.footprintRadius` jako jednego koła i powinien pozostać.

### 2.4 NPC / fauna używające Collider

Zmiana `Collider` nie może zakończyć się wyłącznie na playerze.

`src/ai/NpcAgent.ts` bezpośrednio zakłada obecnie circle geometry w:

- `isWalkable()`;
- `resolveSteerTarget()` — obliczanie przecięcia odcinka ruchu z kołem i punktu omijania.

`src/fauna/AnimalAgent.ts` również bezpośrednio sprawdza `Math.hypot(...) < collider.radius`.

`src/ai/npcColliderRim.ts` zakłada circle geometry w:

- `pointInsideCollider()`;
- `rimPointFacing()`;
- `localEscapeRadii()`;
- `destinationOnColliderRim()`;
- `pickEmergencyTeleportPoint()`.

To są rzeczywiste konsumenty wspólnego typu i muszą zostać uwzględnione w planie.

## 3. Decyzja geometryczna: OBB, nie capsule

Dla ścian domów użyć **2D OBB w płaszczyźnie XZ**:

```text
Collider
├── circle   — istniejące props / drzewa / studnie itd.
└── obb      — prostokąt w XZ + rotationY
```

### Dlaczego OBB

Audyt MegaKit potwierdza, że rodzina `wall_*` ma wspólny prostokątny footprint **2.00 × 0.41 m** w X/Z. Domy mogą być obracane, więc potrzebny jest oriented rectangle, nie tylko AABB.

Capsule byłby lepszy niż obecne koło, ale nadal byłby przybliżeniem z zaokrąglonymi końcami. Co ważniejsze, przy otworze drzwiowym pozostałe fragmenty modułu mają tylko około `0.441 m` szerokości wzdłuż ściany (`(2.0 - 1.118) / 2`), więc capsule o promieniu odpowiadającym grubości ściany nie odwzorowałby tych bocznych fragmentów poprawnie.

OBB pozwala odwzorować dokładnie:

```text
normal wall
┌────────────────────────┐
│                        │  2.00 × 0.41 m
└────────────────────────┘

wall with door
┌──────┐              ┌──────┐
│      │    1.118 m   │      │
└──────┘              └──────┘
```

Nie dodawać capsule tylko dlatego, że jest prostsza matematycznie.

## 4. Nowy wspólny Collider contract

Rozszerzyć `src/world/collision.ts` do jawnego discriminated union:

```ts
export type Collider =
  | {
      type: 'circle'
      x: number
      z: number
      radius: number
    }
  | {
      type: 'obb'
      x: number
      z: number
      halfWidth: number
      halfDepth: number
      rotationY: number
    }
```

Nie wprowadzać trzeciego prymitywu w tym planie.

### Wspólne helpery

W `collision.ts` umieścić czyste helpery, aby NPC/fauna/debug nie implementowały własnej geometrii:

- `colliderContainsPoint(x, z, collider)`;
- `colliderBoundingRadius(collider)` — circle: `radius`; OBB: `Math.hypot(halfWidth, halfDepth)`; używane wyłącznie tam, gdzie istniejący NPC rescue/approach potrzebuje konserwatywnego promienia nawigacyjnego;
- helper najbliższego punktu / odległości potrzebny przez `resolvePosition()` i NPC avoidance;
- helper wyznaczający punkt/rim dla danego kierunku, potrzebny przez `npcColliderRim` i `NpcAgent`.

Nazwy i dokładny podział helperów mogą zostać dobrane zgodnie z istniejącym stylem `collision.ts`, ale **jedna implementacja geometrii ma być współdzielona**.

Nie kopiować wzorów circle/OBB do `NpcAgent`, `AnimalAgent` i `npcColliderRim` osobno.

## 5. Circle collision — zachować semantykę

Istniejące circle collidery świata muszą zachować dotychczasowe zachowanie.

`resolvePosition()` powinien dispatchować:

```text
circle vs circle
circle vs OBB
```

### Circle vs OBB

Dla punktu gracza/NPC o promieniu `entityRadius`:

1. przekształcić punkt do lokalnego układu OBB przez `-rotationY`;
2. znaleźć closest point na prostokącie przez clamp do `[-halfWidth, halfWidth]` / `[-halfDepth, halfDepth]`;
3. jeżeli punkt jest na zewnątrz — overlap = `entityRadius - distanceToRect`;
4. jeżeli punkt jest wewnątrz — wybrać najbliższą ścianę prostokąta i wypchnąć przez tę ścianę o `entityRadius + penetrationToFace`;
5. przekształcić wynik z powrotem do świata;
6. przy przypadku degeneracyjnym wybrać deterministycznie +localX, analogicznie do obecnego fallbacku circle.

Zachować istniejącą zasadę: **rozwiązywany jest jeden najgłębszy overlap**, bez wprowadzania nowego iterative solvera.

Dodać testy dla:

- punktu na zewnątrz OBB;
- overlapu od strony front/back;
- overlapu od strony left/right;
- punktu wewnątrz OBB;
- narożnika OBB;
- rotacji OBB;
- degeneracyjnego przypadku.

## 6. House wall geometry

### 6.1 Normal wall

`buildHouseWallCollidersLocal()` ma generować OBB dla każdego wall module bez drzwi.

Stałe wynikające z audytu MegaKit:

- module length: `2.00 m` (`HOUSE_MODULE_M`);
- wall thickness: `0.41 m`;
- OBB: `halfWidth = 1.0`, `halfDepth = 0.205`;
- center: istniejący `wallLocalTransform()`;
- rotation: istniejący `WALL_YAW[side]` + ewentualny jawny `wall.transform.rotationY`.

Nie pobierać AABB z GLB podczas runtime tylko po to, aby zbudować collider. Wymiary są częścią zweryfikowanego kontraktu MegaKit.

### 6.2 Door wall

Moduł ściany z drzwiami **nie jest pomijany jako całość**.

Zamiast tego zostaje podzielony na dwa OBB:

```text
left wall piece | 1.118 m opening | right wall piece
```

Dla v1 użyć zweryfikowanej szerokości `door_1_flat = 1.118 m`, która jest już obecnym kontraktem testu walkable doorway corridor i odpowiada szerokości rzeczywistego leaf.

Wyliczenie:

```text
module = 2.000 m
opening = 1.118 m
remaining = 0.882 m
side piece width = 0.441 m
side piece halfWidth = 0.2205 m
center offset from module center = 0.7795 m
wall halfDepth = 0.205 m
```

Oba OBB muszą mieć ten sam wall yaw co moduł i być przesunięte wzdłuż jego lokalnej osi X.

Nie używać `HOUSE_DOOR_JAMB_OFFSET` jako geometrii kolizji.

### 6.3 Windows

Wall module z oknem pozostaje **pełnym OBB**. Okno nie jest przejściem.

Nie dodawać specjalnego „window collider”.

### 6.4 Corners

Nie dodawać osobnych circle colliderów dla `def.corners`.

Po przejściu ścian na OBB sąsiednie wall segments dochodzą do footprint extrema i same zamykają narożniki. To jest bardziej zgodne z rzeczywistą ścianą niż obecny przypadkowy brak/pośrednie pokrycie przez duże wall circles.

Nie używać geometrii `corner_exterior_wood` jako osobnego physics mesh.

## 7. Door collider

`buildHouseDoorCollidersLocal()` ma generować OBB tylko dla **zamkniętych** drzwi.

Dane v1:

- center: istniejące `openingLocalPose()`;
- width along wall: `1.118 m`;
- depth: `0.121 m` z audytu `door_1_flat`;
- `halfWidth = 0.559`;
- `halfDepth = 0.0605`;
- rotation: matching wall yaw.

Stan:

```text
open   → brak door OBB
closed → jeden door OBB
```

Nie dodawać jambów jako colliderów.

`openingLocalPose()` nadal pozostaje jedynym źródłem pozycji openingu. Nie przeliczać osobno pozycji drzwi dla kolizji.

Istniejący `HouseDoor` może nadal natychmiast zmieniać stan kolizji po `setOpen()`; wizualna animacja zawiasu pozostaje bez zmian.

## 8. Usunięcie obecnego workaroundu

Po wdrożeniu OBB usunąć:

- `HOUSE_WALL_COLLIDER_RADIUS`;
- `HOUSE_DOOR_COLLIDER_RADIUS`;
- `HOUSE_DOOR_JAMB_OFFSET`;
- `HOUSE_DOOR_JAMB_RADIUS`;
- `buildHouseDoorJambCollidersLocal()`;
- testy zabezpieczające wyłącznie te koła;
- komentarze opisujące jamby jako sposób domykania 2 m doorway module.

Nie pozostawiać równolegle starego circle pipeline'u dla domów.

## 9. World transform OBB

Rozszerzyć `transformHouseCollidersToWorld()` tak, aby:

- transformował center X/Z jak dziś;
- skalował `halfWidth` / `halfDepth` przez `HOUSE_ASSEMBLY_SCALE`;
- dodawał house yaw do `rotationY` OBB;
- dla circle zachowywał dotychczasową transformację promienia.

`buildAssemblyCollidersWorld()` nadal bierze transform z `assembly.root`.

Dodać regresję dla domu z niezerowym yaw oraz syntetycznego `wall.transform.rotationY`, żeby wizualny wall i collider nie mogły się rozjechać przy przyszłym wariancie.

## 10. NPC collision compatibility

### 10.1 `AnimalAgent`

Zastąpić bezpośrednie:

```ts
Math.hypot(x - collider.x, z - collider.z) < collider.radius
```

przez wspólny `colliderContainsPoint()`.

Nie zmieniać systemu pathfindingu ani zachowania zwierząt poza obsługą nowego shape type.

### 10.2 `NpcAgent.isWalkable()`

Zastąpić circle-only containment przez `colliderContainsPoint()`.

Istniejąca semantyka „NPC już stoi wewnątrz collidera → może próbować wyjść” musi zostać zachowana.

Istniejące `NPC_COLLIDER_APPROACH_BUFFER` / `NPC_COLLIDER_CORE_FRACTION` nie powinny zostać automatycznie usunięte tylko dlatego, że domy zmieniają kształt. Jeżeli potrzebują shape-aware helpera, użyć wspólnego `colliderBoundingRadius()` i zachować dotychczasową konserwatywną semantykę nawigacyjną.

Nie robić w tym planie nowego NPC pathfindera.

### 10.3 `NpcAgent.resolveSteerTarget()`

To jest ważny konsument, ponieważ obecny kod:

- testuje przecięcie odcinka ruchu z circle;
- wylicza punkt unikania przez `collider.radius`.

Zastąpić circle-only matematykę wspólnym helperem shape-aware.

Wymagania:

- circle zachowuje obecny wynik możliwie 1:1;
- OBB może być przecięty przez odcinek ruchu i musi wtedy wygenerować deterministyczny punkt unikania poza OBB;
- brak pathfindingu wieloetapowego;
- nadal korzystać z istniejącego 3-tier movement fallback (`full → X-only → Z-only`);
- punkt unikania ma być na zewnętrznej stronie OBB z istniejącym marginesem, a nie w środku ściany.

Jeżeli potrzebny jest helper typu `segmentIntersectsCollider()` / `closestPointOnCollider()`, umieścić go w `world/collision.ts`, nie w `NpcAgent.ts`.

## 11. NPC rim / rescue

`src/ai/npcColliderRim.ts` musi być shape-aware, ale pozostać czystym helperem bez Three.js.

Zastąpić circle-only:

- `pointInsideCollider()` → wspólny `colliderContainsPoint()`;
- `rimPointFacing()` → wspólny shape-aware rim point;
- `localEscapeRadii()` → używać `colliderBoundingRadius()` tylko jako konserwatywnego promienia escape, jeśli dokładny OBB extent nie jest potrzebny;
- `destinationOnColliderRim()` → dla OBB snapować do prawdziwego brzegu OBB + `COLLIDER_RIM_MARGIN`;
- `pickEmergencyTeleportPoint()` → bez zmiany kontraktu.

Zachować istniejące gwarancje planu 108:

- cel w obcym colliderze nie staje się środkiem przeszkody;
- NPC już wewnątrz może wyjść;
- rescue nie wybiera punktu wewnątrz collidera;
- emergency teleport nie wraca na środek domu.

Ważne: po przejściu domu z dysku footprintu na ściany OBB **środek domu przestaje być wewnątrz house wall colliders**. To jest celowa zmiana zachowania — NPC ma móc rzeczywiście wejść do domu przez drzwi, zamiast traktować cały dom jako pełny zakazany dysk.

## 12. Debug collider view

Rozszerzyć istniejący `src/debug/colliderDebugView.ts`.

Obecny jeden `InstancedMesh` z cylindrem nie potrafi pokazać OBB.

Użyć dwóch istniejących-style instanced debug meshes:

```text
circle → cylinder
obb    → thin box / rectangular prism
```

Oba nadal:

- mają ten sam pomarańczowy debug material;
- są tylko wizualizacją;
- czytają live `collidersNear()`;
- nie modyfikują registry;
- są aktualizowane raz na frame tylko gdy debug overlay jest aktywny.

Debug view musi wyraźnie pokazać, że ściana jest cienkim prostokątem, a nie kołem.

Nie tworzyć osobnego debug systemu.

## 13. HouseBuilder tests

Rozszerzyć `src/settlement/houseBuilder.test.ts`.

Usunąć testy zależne od jamb circles i zastąpić je testami geometrii.

### Minimalny zestaw

1. Normalny wall module tworzy jeden OBB `2.0 × 0.41`.
2. Door wall module tworzy dwa OBB zamiast skipowania całego modułu.
3. Door opening ma dokładnie `1.118 m` clear width.
4. Window wall nadal ma pełny OBB.
5. Closed door tworzy jeden door OBB.
6. Open door nie tworzy door OBB.
7. Door OBB jest zakotwiczony przez `openingLocalPose()`.
8. Wall/door OBB rotation odpowiada side + house yaw.
9. `wall.transform.rotationY` nie rozjeżdża collidera.
10. Wszystkie obecne village definitions (`4×4`, `6×4`, `6×6`, `8×6`) generują poprawne collidery.
11. `TEST_HOUSE_01` i `TEST_HOUSE_02` pozostają poprawne.
12. `buildAssemblyCollidersWorld()` respektuje root transform.
13. Fallback house collider w `createSettlement.ts` pozostaje kołem.

### Regresja właściwego problemu

Dodać test oparty na `resolvePosition()` dla rzeczywistego domu:

- gracz `radius = 0.35`;
- drzwi otwarte;
- start przed frontem;
- przejście przez środek drzwi do wnętrza;
- wynik nie jest wypychany przez sąsiednią boczną ścianę.

Dodać także odwrotny test:

- próba wejścia przez pełną ścianę poza openingiem musi zostać zablokowana.

To jest ważniejsze niż test „liczba colliderów = X”.

## 14. Collision tests

Rozszerzyć `src/world/collision.test.ts` o:

- circle regression — wszystkie obecne testy pozostają;
- OBB outside / inside / edge / corner;
- OBB rotated;
- circle-vs-OBB with entity radius;
- deterministic degenerate fallback;
- helper `colliderContainsPoint()` dla circle + OBB;
- `colliderBoundingRadius()`;
- segment/closest-point helper, jeżeli zostanie dodany do wspólnego modułu.

Testy mają pozostać czystą matematyką bez Three.js runtime.

## 15. NPC / fauna tests

`src/ai/npcColliderRim.test.ts` rozszerzyć o OBB:

- inside/outside;
- rim facing from front/back/side;
- rescue escape from inside;
- emergency teleport never returns an OBB interior point.

Nie trzeba tworzyć ciężkich testów `NpcAgent`/`AnimalAgent`, jeżeli wspólne helpery geometrii są pokryte czystymi testami. Wystarczy upewnić się technicznie, że ich shape-aware call sites kompilują i istniejące testy nadal przechodzą.

## 16. Settlement integration

`src/settlement/createSettlement.ts` pozostaje właścicielem rejestracji colliderów.

Nie zmieniać:

- `registerColliders(def.id, ...)`;
- `clearColliders(def.id)`;
- `doorColliderSignature`;
- momentu rejestracji po `buildSettlementProps()`;
- house/household/Place ownership;
- `landmarks.houses` / `landmarks.homes`.

Zmiana ma być wyłącznie w shape danych zwracanych przez `buildHouseCollidersWorld()`.

## 17. `HouseDefinition` / state docs

Nie dodawać nowego parallelnego formatu domu.

Na tym etapie nie ma potrzeby dodawania `collision` do `HouseDefinition`, ponieważ v1 używa zweryfikowanych wspólnych wymiarów MegaKit wall family i jednego door contract (`door_1_flat`).

Jeżeli podczas implementacji okaże się, że któryś obecny wall asset ma inną collision geometrię mimo wspólnego audytowanego footprintu, **nie dodawać wyjątku w builderze bez weryfikacji**. Wtedy dopiero rozszerzyć `HouseWallPlacement` / `HouseOpening` o jawne data-only collision metadata i opisać to w implementation notes.

Po implementacji zaktualizować:

- `docs/state/settlements.md` — domy używają geometrycznych wall/door colliders, nie pełnych circle disks;
- `docs/plans/implementation-notes/2026-08-14--111--house-construction-implementation-notes.md` — dodać wpis o rozwiązaniu obecnego pre-existing collider bug i usunięciu jamb workaround;
- `docs/plans/README.md` — status planu po implementacji/verification.

Nie zmieniać dokumentacji przed implementacją poza samym planem.

## 18. Poza zakresem

Nie robić:

- Rapier/Cannon/Ammo ani innego physics engine;
- mesh collision / BVH dla domów;
- automatycznego generowania colliderów z GLB vertices;
- capsule jako kolejnego shape type;
- OBB dla wszystkich propsów świata — tylko wspólny primitive support + domy jako pierwszy konsument;
- pełnego navmeshu/pathfindingu NPC;
- przebudowy `PlayerController`;
- zmian door animation;
- zmian lodging/sleep/household systems;
- zmian house assembly/renderingu poza debug overlay;
- ogólnego refaktoru `ColliderRegistry`;
- multiplayer/networking.

## 19. Kolejność implementacji

1. Zmienić `Collider` na circle/OBB union i dodać wspólne geometry helpers.
2. Rozszerzyć `resolvePosition()` o circle-vs-OBB.
3. Dodać testy matematyczne collision systemu.
4. Przepisać house wall colliders z circles na OBB.
5. Podzielić door wall module na dwa wall OBB z realnym openingiem `1.118 m`.
6. Zastąpić closed-door circle przez door OBB i usunąć jamb workaround.
7. Rozszerzyć world transform OBB.
8. Zaktualizować `NpcAgent`, `AnimalAgent` i `npcColliderRim` na wspólne shape helpers.
9. Zaktualizować `NpcAgent.resolveSteerTarget()` na shape-aware obstacle check.
10. Rozszerzyć debug collider overlay o OBB.
11. Zaktualizować `houseBuilder.test.ts`, `npcColliderRim.test.ts` i collision tests.
12. Uruchomić `tsc`, lint, build, test.
13. Wykonać browser verification z `?debugColliders=1`.
14. Dopiero po browser verification zaktualizować implementation notes/state i oznaczyć plan zgodnie z rzeczywistym stanem.

## 20. Browser verification

Zgodnie z `CLAUDE.md` nie uruchamiać headless browsera jako substytutu manualnej weryfikacji. Po technicznych checkach poprosić użytkownika o test na działającym `pnpm run dev`.

### Scenariusz A — collider shape

Uruchomić:

```text
?debugColliders=1
```

Sprawdzić:

- ściany są cienkimi prostokątami;
- nie ma dużych pomarańczowych kół wokół ścian;
- narożniki są domknięte przez ściany;
- opening drzwi jest widoczną przerwą dokładnie w miejscu drzwi;
- closed door ma własny prostokątny collider;
- open door usuwa tylko collider skrzydła;
- okna nie tworzą przejścia.

### Scenariusz B — wejście do domu

Dla co najmniej:

- `COTTAGE_4X4_A`;
- `COTTAGE_6X4_A`;
- `HOUSE_6X6_A`;
- `HOUSE_8X6_A`.

Sprawdzić:

1. podejście prosto do drzwi;
2. otwarcie drzwi;
3. wejście przez środek otworu;
4. przejście co najmniej ~1 m do wnętrza;
5. brak wypychania przez boczną ścianę;
6. wyjście tą samą drogą;
7. zamknięcie drzwi;
8. próba przejścia przez ścianę obok drzwi — ma być zablokowana;
9. próba obejścia domu przez narożnik — ma być zablokowana.

### Scenariusz C — NPC

Obserwować NPC w osadzie:

- NPC może wejść do domu przez opening, jeśli jego cel jest wewnątrz;
- NPC nie przechodzi przez ścianę;
- NPC nie zostaje uwięziony w ścianie;
- rescue/watchdog nie teleportuje NPC do środka domu jako efekt uboczny nowego shape type.

### Scenariusz D — fauna

Sprawdzić co najmniej livestock przy domu:

- nie przechodzi przez ścianę;
- może przebywać wewnątrz domu, jeśli jego istniejący cel/ruch tak prowadzi;
- brak nowych blokad w normalnym ruchu.

## 21. Kryteria akceptacji

Plan jest zakończony dopiero gdy:

- wall colliders nie są circle `r=0.95`;
- wall collision odpowiada ~2.00 × 0.41 m;
- door wall nie jest pomijany jako cały 2 m moduł;
- opening ma jeden jawny, testowany clear width `1.118 m`;
- closed door blokuje opening jako OBB;
- open door pozwala wejść;
- jamb circles nie istnieją;
- player nie może przejść przez ścianę;
- player może przejść przez drzwi i wejść do wnętrza;
- circle colliders świata nadal zachowują dotychczasowe zachowanie;
- NPC i fauna rozumieją nowy shape type bez osobnych systemów geometrii;
- NPC rim/rescue zachowuje gwarancje planu 108;
- debug overlay pokazuje rzeczywisty kształt circle/OBB;
- testy automatyczne przechodzą;
- browser/manual verification potwierdza co najmniej cztery warianty domów;
- dokumentacja opisuje nowy stan zamiast starego workaroundu.

## 22. Weryfikacja techniczna

Uruchomić:

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run build
pnpm run test
```

Nie oznaczać browser verification jako wykonanej na podstawie powyższych komend.

Wynik końcowy raportować osobno:

- `implemented`;
- `technically verified`;
- `browser/manual verified`.

**Zrób git commit i push do main, rebase jeżeli trzeba**
