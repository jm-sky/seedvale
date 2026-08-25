# Plan: House Collision Geometry

**Created:** 2026-08-25
**Status:** `in progress` 🔄 — browser verification failed 2026-08-25 (wall still passable, see [implementation notes §13](./implementation-notes/settlements-001-house-collision-geometry-implementation-notes.md#13-browser-verification-result-2026-08-25--failed-not-fixed-yet))
**Priority:** high · **Effort:** M
**Depends on:** 111
**Domain:** `settlements`

## Cel

Naprawić kolizje składanych domów tak, aby collision geometry odpowiadała rzeczywistym ścianom, narożnikom i otworom drzwiowym.

Obecny problem nie jest błędnym offsetem drzwi. `HouseBuilder` reprezentuje każdy 2 m moduł ściany jako koło `radius = 0.95`, mimo że zweryfikowany moduł MegaKit ma footprint **2.00 × 0.41 m** w rzucie XZ. Dla gracza `radius = 0.35` daje to efektywną blokadę `1.30 m` od środka ściany.

Moduł z drzwiami jest całkowicie pomijany, a luka jest obecnie łatana przez:

- zamknięte drzwi jako circle `radius = 0.45`;
- dwa zawsze aktywne jamb circles `offset = 1.05`, `radius = 0.15`.

To tworzy duże, nachodzące na siebie koła widoczne przez `?debugColliders=1`, blokuje wnętrze domu i nie opisuje rzeczywistego otworu.

Celem nie jest kolejny patch offsetów, tylko **minimalne rozszerzenie istniejącego collision systemu o właściwy prostokątny collider dla ścian**.

## 1. Stan faktyczny i źródła prawdy

Przed implementacją Claude Code ma zweryfikować aktualny `main`; poniższe ustalenia wynikają z obecnego codebase i wcześniejszego audytu MegaKit.

### HouseBuilder

`src/settlement/houseBuilder.ts` obecnie:

- używa `HOUSE_WALL_COLLIDER_RADIUS = 0.95` dla ścian;
- pomija cały wall module zawierający opening;
- używa `HOUSE_DOOR_COLLIDER_RADIUS = 0.45` dla zamkniętego leaf;
- dodaje `HOUSE_DOOR_JAMB_OFFSET = 1.05` / `HOUSE_DOOR_JAMB_RADIUS = 0.15`;
- transformuje lokalne collidery do świata przez root assembly;
- korzysta z `openingLocalPose()` jako wspólnego źródła pozycji openingu.

`HOUSE_ASSEMBLY_SCALE = 1`.

### House geometry

Zweryfikowany `wall_plaster_straight` ma footprint **2.00 × 0.41 m**; wysokość 3.12 m nie ma znaczenia dla 2D collision.

`door_1_flat` ma native width **1.118 m**, ale jest to szerokość skrzydła, nie dowód, że dokładnie taka sama jest szerokość wycięcia w `wall_plaster_door_flat`. **Nie wolno bez ponownej weryfikacji traktować 1.118 m jako szerokości openingu.**

`door_1_flat` ma pivot na zawiasie; istniejący `DOOR_1_FLAT_HINGE_OFFSET_X = -0.51` jest poprawnym offsetem wizualnym i nie należy go zmieniać.

`doorframe_flat_wooddark` jest wizualną ramą openingu, nie źródłem collision geometry.

### Collision lifecycle

`src/settlement/createSettlement.ts` rejestruje house colliders razem z pozostałymi colliderami settlementu. Zmiana stanu drzwi powoduje ponowną rejestrację przez istniejący `doorColliderSignature`.

Ten lifecycle zachować. Nie tworzyć drugiego systemu rejestracji.

Fallback domu bez `HouseAssembly` nadal może używać istniejącego `footprintRadius` circle.

### Konsumenci Collider

Recon wykazał, że `Collider` nie jest używany wyłącznie przez playera:

- `src/world/collision.ts` — solver;
- `src/ai/NpcAgent.ts` — walkability / steering względem colliderów;
- `src/ai/npcColliderRim.ts` — inside/rim/escape/teleport helpers;
- `src/fauna/AnimalAgent.ts` — bezpośrednie circle checks;
- `src/debug/colliderDebugView.ts` — wizualizacja.

Nie oznacza to przebudowy tych systemów. Oznacza, że **geometria musi mieć wspólne helpery**, a istniejące konsumenty muszą zostać dostosowane tylko tam, gdzie bezpośrednio zakładają `radius`.

`ColliderRegistry` nie wymaga nowego spatial indexu: broad-phase może pozostać oparty o istniejący bucket/center query, o ile OBB zostanie poprawnie objęty przez query radius/bounds.

## 2. Decyzja geometryczna: 2D OBB

Dla ścian użyć prostokąta zorientowanego w płaszczyźnie XZ:

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

Nazwa i szczegóły typu mogą zostać dopasowane do istniejącego stylu kodu, ale nie wprowadzać physics engine ani kolejnego rodzaju prymitywu.

### Dlaczego OBB, a nie capsule

Domy mogą mieć dowolny `yaw`, więc AABB nie wystarcza. Capsule poprawiłby obecną sytuację, ale zaokrągla końce ściany i nie opisuje precyzyjnie krótkich fragmentów po obu stronach drzwi. OBB odpowiada naturalnie footprintowi modułu 2.00 × 0.41 m i można go obracać razem z domem.

## 3. Wspólna geometria collision

W `src/world/collision.ts` dodać mały zestaw współdzielonych helperów, zamiast implementować geometrię osobno w NPC/faunie:

- `colliderContainsPoint(...)`;
- najbliższy punkt / dystans do collidera;
- helper do wyznaczenia punktu na obwodzie/rimie w zadanym kierunku;
- `resolvePosition()` z dispatch dla circle/circle i circle/OBB;
- opcjonalnie helper konserwatywnego bounding radius, jeżeli istniejący kod NPC rescue/avoidance rzeczywiście go potrzebuje.

Nie kopiować matematyki OBB do `NpcAgent`, `AnimalAgent` ani `npcColliderRim`.

### Circle zachowuje dotychczasową semantykę

Circle collidery świata muszą działać tak jak obecnie.

`resolvePosition()` nadal:

- rozwiązuje jeden najgłębszy overlap;
- nie staje się iterative physics solverem;
- zachowuje obecne zachowanie circle/circle.

### Circle vs OBB

Dla encji reprezentowanej przez punkt + `entityRadius`:

1. obrócić punkt do lokalnego układu OBB;
2. znaleźć closest point prostokąta przez clamp;
3. dla punktu zewnętrznego użyć dystansu do closest point;
4. dla punktu wewnętrznego wypchnąć przez najbliższą krawędź;
5. wynik obrócić z powrotem do świata;
6. przypadki degeneracyjne muszą być deterministyczne i nie mogą generować NaN.

Testy solvera muszą obejmować środek, każdą stronę, narożnik, rotację i punkt wewnątrz OBB.

## 4. House wall colliders

### Normal wall

`buildHouseWallCollidersLocal()` ma generować jeden OBB dla zwykłego wall module:

```text
length = 2.00 m
thickness = 0.41 m
halfWidth = 1.00 m
halfDepth = 0.205 m
```

Center i rotation mają wynikać z istniejącego `wallLocalTransform()` / `WALL_YAW` / `wall.transform`, a nie z nowych offsetów.

Nie odczytywać AABB GLB podczas runtime. Zweryfikowane wymiary MegaKit są stałym kontraktem collision geometry.

### Door wall

Moduł `wall_plaster_door_flat` nie może być pomijany jako całość.

Najpierw podczas implementacji należy **zweryfikować rzeczywistą szerokość i położenie pre-cut openingu** w assetcie / audycie MegaKit. Szerokość skrzydła `door_1_flat = 1.118 m` nie może automatycznie pełnić roli tej wartości.

Po ustaleniu openingu moduł ma być podzielony na dwa OBB:

```text
wall piece | real opening | wall piece
```

Oba zachowują grubość `0.41 m` i yaw modułu. Ich długości i lokalne środki mają wynikać bezpośrednio z granic openingu.

**Nie używać `HOUSE_DOOR_JAMB_OFFSET` ani `HOUSE_DOOR_JAMB_RADIUS` do wyliczania tych fragmentów.**

### Windows

Wall z oknem pozostaje jednym pełnym OBB. Okno nie jest przejściem i nie wymaga osobnego collidera.

### Corners

Nie dodawać od razu collidera dla `def.corners`.

Po przejściu ścian na OBB zweryfikować, czy wall segments zamykają narożniki poprawnie dla wszystkich footprintów. `corner_exterior_wood` jest wizualnym słupkiem, nie należy automatycznie robić z niego physics mesh.

Jeżeli browser verification wykaże rzeczywistą lukę, dopiero wtedy dobrać najmniejszy odpowiedni collider narożnika i udokumentować konkretny przypadek.

## 5. Door collider

Zamknięte skrzydło drzwi ma być osobnym OBB. Jego szerokość i głębokość mają odpowiadać zweryfikowanej geometrii `door_1_flat`.

Dla obecnego assetu znane jest:

```text
leaf width  = 1.118 m
leaf depth  = 0.121 m
```

Pozycja musi pochodzić z istniejącego `openingLocalPose()` + istniejącego hinge offsetu. Nie tworzyć drugiego obliczenia pozycji drzwi.

Stan:

```text
closed → door OBB istnieje
open   → door OBB nie istnieje
```

Frame nie dostaje osobnego collidera.

## 6. Usunięcie workaroundu

Po przejściu house collision na OBB usunąć:

- `HOUSE_WALL_COLLIDER_RADIUS`;
- `HOUSE_DOOR_COLLIDER_RADIUS`;
- `HOUSE_DOOR_JAMB_OFFSET`;
- `HOUSE_DOOR_JAMB_RADIUS`;
- `buildHouseDoorJambCollidersLocal()`;
- testy i komentarze, które istnieją wyłącznie dla jamb-circle workaroundu.

Nie utrzymywać dwóch równoległych modeli kolizji dla domów.

## 7. Transform do świata

`transformHouseCollidersToWorld()` należy rozszerzyć tak, aby dla OBB:

- transformował center X/Z tak jak dziś;
- uwzględniał `HOUSE_ASSEMBLY_SCALE` dla half extents;
- dodawał yaw assembly do `rotationY`;
- pozostawiał istniejący circle transform bez zmiany semantyki.

Nie zmieniać ogólnego ownership colliderów ani lifecycle settlementu.

## 8. NPC / fauna — minimalna adaptacja

Nie przebudowywać AI movement.

Najpierw sprawdzić, czy każdy istniejący call-site może zostać oparty o nowe helpery `collision.ts`.

### `NpcAgent.ts`

Zastąpić bezpośrednie założenia `collider.radius` wspólną geometrią tylko w miejscach, gdzie collider jest traktowany jako przeszkoda:

- walkability;
- steering / obstacle intersection.

Zachować obecny model steeringu i fallbacków. OBB ma jedynie dostarczyć poprawny test/odległość.

### `npcColliderRim.ts`

Przepiąć:

- point-inside;
- rim point;
- escape radius / point;
- destination-on-rim;

na wspólne helpery collision.

Nie tworzyć osobnej geometrii NPC.

### `AnimalAgent.ts`

Dostosować tylko bezpośrednie circle assumptions, jeżeli dotyczą colliderów house/settlement. Zachować dotychczasowe zachowanie dla circle colliderów.

Jeżeli konkretny call-site okaże się nieużywany dla OBB house colliders, nie zmieniać go „na zapas”.

## 9. Broad phase / ColliderRegistry

Nie tworzyć drugiego spatial indexu.

Sprawdzić istniejące `collidersNear()` pod kątem OBB:

- jeśli query używa wyłącznie stałego promienia wokół środka, zapewnić, że największy house OBB może zostać znaleziony;
- preferować istniejący mechanizm i minimalną zmianę parametrów/helpera;
- nie przenosić OBB do osobnego registry.

## 10. Debug visualization

Rozszerzyć istniejący `?debugColliders=1`.

`src/debug/colliderDebugView.ts` ma pokazywać:

- circle jako circle/cylinder;
- OBB jako cienki prostokątny volume zgodny z `halfWidth`, `halfDepth`, `rotationY`.

Nie tworzyć nowego debug systemu.

Debug view musi umożliwić wizualne potwierdzenie:

- prostych ścian;
- narożników;
- światła drzwi;
- closed door;
- open door.

## 11. Testy

Wykorzystać istniejącą infrastrukturę testową. Nie tworzyć nowego frameworka.

### `collision.ts`

- circle/circle regression;
- circle/OBB front/back/left/right;
- OBB corner;
- OBB rotation;
- point inside OBB;
- degenerate case bez NaN;
- contains/distance/rim helper regression.

### `houseBuilder.test.ts`

Dla zwykłej ściany:

- dokładnie jeden OBB zamiast dużego circle;
- extents odpowiadają 2.00 × 0.41 m;
- yaw odpowiada wall placement.

Dla wall z drzwiami:

- cały 2 m module nie jest jednym colliderem;
- istnieją dwa wall OBB;
- opening nie ma wall collidera;
- closed door dodaje door OBB;
- open door nie dodaje door OBB;
- nie istnieją jamb circles.

### Real doorway regression

Zachować/rozszerzyć istniejący test walkable corridor, ale testować **rzeczywisty przejazd przez opening**, a nie tylko pojedynczy punkt:

```text
outside
  ↓
through door opening
  ↓
inside house
```

Dodatkowo:

- próba wejścia przez ścianę obok drzwi musi zostać zablokowana;
- zamknięte drzwi muszą blokować przejście;
- otwarte drzwi muszą pozwalać przejść;
- nie może istnieć boczna luka wynikająca z pominięcia całego wall module.

Sprawdzić co najmniej:

- `TEST_HOUSE_01`;
- 4×4;
- 6×4;
- 6×6;
- 8×6;
- drzwi na początku/środku/końcu wall sequence, jeśli takie warianty występują w aktualnych definitions.

### NPC / fauna regression

Tylko call-site'y zmienione przez OBB powinny dostać testy regresyjne. Nie rozszerzać test coverage mechanicznie na całe AI.

## 12. Browser verification

Po testach technicznych uruchomić aplikację i użyć `?debugColliders=1`.

Sprawdzić:

1. zwykłe ściany — cienkie prostokątne collidery zamiast dużych kół;
2. narożniki — brak dużych kolistych blokad i brak widocznych luk;
3. drzwi zamknięte — wall pieces + door OBB dokładnie zamykają opening;
4. drzwi otwarte — światło drzwi jest wolne;
5. player przechodzi przez środek openingu;
6. player nie przechodzi przez ścianę obok openingu;
7. player nie może przejść bokiem obok zamkniętych drzwi;
8. obrót domu nie zmienia poprawności colliderów;
9. NPC nadal omija ściany i nie dostaje NaN/stuck behaviour;
10. kilka footprintów domu działa tak samo.

Nie uznawać samych testów jednostkowych za dowód poprawności wizualnej Three.js.

## 13. Zakres zmian

### Oczekiwane pliki

Najprawdopodobniej:

```text
src/world/collision.ts
src/world/collision.test.ts          (jeśli istnieje / właściwy istniejący test)
src/settlement/houseBuilder.ts
src/settlement/houseBuilder.test.ts
src/ai/NpcAgent.ts                    (tylko bezpośrednie circle assumptions)
src/ai/npcColliderRim.ts
src/fauna/AnimalAgent.ts              (tylko jeśli recon potwierdzi potrzebę)
src/debug/colliderDebugView.ts
```

Nie zmieniać bez potrzeby:

```text
src/settlement/createSettlement.ts
src/world/colliderRegistry.ts
src/player/PlayerController.ts
src/settlement/props.ts
HouseDefinition ownership/lifecycle
```

Jeżeli implementacja wykaże, że któryś z oczekiwanych plików nie wymaga zmiany, nie modyfikować go tylko dlatego, że znajduje się na liście.

## 14. Poza zakresem

Nie robić:

- physics engine;
- mesh collision / collision z GLB runtime;
- 3D OBB z bibliotek Three.js;
- nowego spatial indexu;
- iterative multi-collider solvera;
- przebudowy pathfindingu;
- przebudowy NPC movement;
- osobnego systemu collision dla fauna;
- colliderów dla wszystkich wizualnych elementów domu;
- zmian `Place`, household, lodging lub ownership;
- ogólnego refaktoru `houseBuilder.ts` niezwiązanego z collision.

## 15. Weryfikacja techniczna

Uruchomić zgodnie z aktualnym `CLAUDE.md` i `package.json` właściwe testy/lint/typecheck/build. Nie zakładać nazw skryptów — sprawdzić je w repo przed wykonaniem.

Wyniki raportować osobno:

- implemented;
- technically verified;
- browser/manual verified.

## Definition of Done

- ściany domów nie są już reprezentowane jako `circle radius = 0.95`;
- wall OBB odpowiada rzeczywistemu footprintowi 2.00 × 0.41 m;
- door wall nie jest pomijany jako cały 2 m moduł;
- opening ma rzeczywistą przerwę w collision geometry;
- closed door blokuje opening jako osobny collider;
- open door nie blokuje openingu;
- jamb-circle workaround został usunięty;
- corner collision jest potwierdzone jako poprawne bez dodatkowego collidera albo ma minimalny, udokumentowany collider tylko jeśli testy wykażą potrzebę;
- istniejące circle colliders świata zachowują dotychczasowe zachowanie;
- NPC/fauna używają wspólnej geometrii bez duplikowania OBB math;
- debug overlay pokazuje rzeczywisty kształt colliderów;
- testy automatyczne przechodzą;
- browser verification potwierdza wejście do domu i brak przejścia przez ścianę;
- nie wprowadzono równoległego systemu kolizji ani niepotrzebnej architektury.

**Zrób git commit i push do main, rebase jeżeli trzeba**