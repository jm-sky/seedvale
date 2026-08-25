# Plan: House Collision Geometry

**Created:** 2026-08-25
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** 111
**Domain:** `settlements`

| Domain | Covers |
|---|---|
| `ai` | AI-assisted dialogue, characterisation and related AI systems |
| `fauna` | Wildlife, predators/prey, herds, ecosystem simulation |
| `items-player` | Inventory, tools, player needs, world items |
| `npc` | NPC behaviour, needs, goals, traits, decisions and actions |
| `persistence` | SaveData, IndexedDB, persistence |
| `quests-progression` | Quests, relationships, EXP and progression |
| `settlements` | Settlements, buildings, population, resources and development |
| `settlements-npcs` | Settlements + NPCs, households, schedules, economy, dialogue |
| `tools` | Development/debugging tools and utilities |
| `ui-input` | UI, HUD, input and player interaction |
| `world` | World state, resources, places, time, weather and global systems |
| `world-terrain` | Terrain, chunks, ocean, environment and landmarks |

## Cel

Naprawić kolizje domów tak, aby reprezentowały rzeczywistą geometrię ścian i otworów drzwiowych zamiast dużych, nachodzących na siebie kół.

Obecny system domów używa `Collider = { x, z, radius }`. Każdy moduł ściany 2 m dostaje koło `radius = 0.95`, a pominięty moduł drzwi jest uzupełniany przez kołowy collider zamkniętych drzwi oraz dwa dodatkowe koła jambów. Daje to wizualnie duże pomarańczowe placki, zaokrąglone narożniki i nienaturalne obszary blokowania. Implementacja z 2026-08-25 naprawiła konkretną lukę przy zamkniętych drzwiach, ale zrobiła to jako kolejny patch do modelu kołowego.

Celem tego planu jest poprawa **modelu kolizji**, nie kolejny zestaw offsetów dla konkretnego domu.

## Stan faktyczny / źródła prawdy

- `src/world/collision.ts` — obecny prymityw kolizji to wyłącznie koło; `resolvePosition()` wypycha encję względem jednego najgłębszego overlapu.
- `src/settlement/houseBuilder.ts` — obecne collidery domów: koła ścian, koło zamkniętych drzwi i koła jambów.
- `src/assets/houseDefinitionExample.ts` — `HouseDefinition` jest źródłem geometrii modułowej domu; ściany mają moduł 2 m, a drzwi są przypisane do konkretnego `side + moduleIndex`.
- `docs/plans/implementation-notes/2026-08-14--111--house-construction-implementation-notes.md` — dokumentuje lukę przy drzwiach, poprawkę jambów oraz brak dedykowanych colliderów narożników.
- `docs/state/settlements.md` — domy są obecnie składane przez `HouseBuilder`; ownership colliderów pozostaje po stronie settlementu.

## Zakres

### 1. Rozszerzyć bazowy model colliderów o kapsułę / odcinek

Nie wprowadzać physics engine.

Rozszerzyć `src/world/collision.ts` z jednego prymitywu na mały, jawny zestaw:

```text
Collider
├── circle
└── capsule
```

Capsule oznacza odcinek w płaszczyźnie XZ + promień. Jest odpowiedni dla ściany: odcinek opisuje jej długość, a mały promień jej grubość.

Zachować obecne koła dla obiektów, dla których są właściwym przybliżeniem (np. drzewa, skały i istniejące obiekty świata).

Nie zmieniać publicznego zachowania obecnych colliderów kołowych poza koniecznymi zmianami typów / dispatchu.

### 2. Dodać poprawne rozwiązywanie kolizji encja–capsule

`resolvePosition()` powinno obsługiwać oba typy:

- circle vs circle — obecna logika;
- circle vs capsule — znaleźć najbliższy punkt na odcinku, sprawdzić odległość od tego punktu i wypchnąć encję poza `capsule.radius + entityRadius`.

Ważne przypadki:

- środek encji na odcinku;
- encja przy końcu odcinka;
- odległość praktycznie zerowa — deterministyczny fallback kierunku, bez dzielenia przez zero;
- capsule o zerowej długości powinien zachowywać się jak circle.

Nie implementować w tym planie iteracyjnego solvera wielu colliderów ani pełnego swept collision / continuous collision detection. Obecna semantyka „najgłębszy overlap wygrywa” pozostaje bez zmian, chyba że testy wykażą konieczność minimalnej korekty.

### 3. Zastąpić koła ścian geometrycznymi colliderami

W `houseBuilder.ts` odejść od `HOUSE_WALL_COLLIDER_RADIUS = 0.95` jako reprezentacji całego 2 m modułu.

Dla zwykłego modułu ściany utworzyć capsule:

- odcinek biegnie wzdłuż ściany;
- długość odpowiada rzeczywistemu modułowi / jego odcinkowi między narożnikami;
- promień odpowiada grubości ściany, a nie połowie jej długości;
- pozycja i orientacja wynikają z istniejącego `wallLocalTransform()`.

Nie wyliczać colliderów z AABB renderowanego GLB. Collision geometry ma być deterministyczna i wynikać z `HouseDefinition` + znanych wymiarów modułów.

### 4. Drzwi mają być rzeczywistą przerwą w ścianie

Nie stosować już schematu:

```text
skip whole wall module
+ door circle
+ two jamb circles
```

Dla modułu ściany z drzwiami:

```text
wall segment ──┐      ┌── wall segment
               │ DOOR │
wall segment ──┘      └── wall segment
```

Czyli collider ściany powinien zostać podzielony na dwa odcinki po bokach otworu drzwiowego.

Szerokość otworu ma być jawnie określona w kontrakcie / danych collision geometry, z wartością odpowiadającą rzeczywistemu assetowi `door_1_flat` / wycięciu `wall_plaster_door_flat` (obecnie znane ~1.118 m dla leaf). Nie używać kolejnego przypadkowego offsetu.

Jeżeli `HouseOpening` wymaga dodatkowego pola do opisania szerokości kolizji otworu, dodać je jako dane-only pole z sensowną nazwą, np. `collisionWidth` / `openingWidth`, zamiast tworzyć tabelę wyjątków w `houseBuilder.ts`.

### 5. Zamknięte drzwi

Zamknięte skrzydło drzwi powinno blokować światło otworu jako osobny capsule/odcinek odpowiadający szerokości leaf.

Otwarte drzwi:

- nie blokują przejścia przez otwór;
- nie wymagają przebudowy domu;
- nie tworzą/usuwają meshów;
- collider state jest tylko zmianą stanu runtime drzwi.

Pozycja collidera drzwi nadal musi pochodzić z `openingLocalPose()` — tak jak wizualny frame/leaf i interaction point.

### 6. Narożniki domu

Usunąć obecny przypadkowy stan, w którym `def.corners` nie mają własnej reprezentacji collision geometry.

Dla narożników użyć małych circle colliderów albo krótkich capsule, zależnie od rzeczywistego kształtu postu. Preferowany jest najprostszy prymityw, który poprawnie zamyka narożnik bez sztucznego rozszerzania ściany.

Collider narożnika powinien wynikać z istniejącego `cornerLocalPosition()` i jawnego wymiaru słupka, a nie z promienia sąsiedniego modułu ściany.

### 7. Usunąć obecny patch jambów

Po wdrożeniu segmentowej geometrii ścian usunąć jako zbędne:

- `HOUSE_DOOR_JAMB_OFFSET`;
- `HOUSE_DOOR_JAMB_RADIUS`;
- `buildHouseDoorJambCollidersLocal()`;
- związane z nimi testy i komentarze opisujące workaround.

Jamb może pozostać częścią **wizualnego** modelu drzwi. Nie powinien być sztucznym elementem collision solvera, jeżeli dwa segmenty ściany i ewentualny corner collider prawidłowo definiują granicę otworu.

### 8. Debug collider view

Rozszerzyć istniejący `?debugColliders=1`, a nie tworzyć nowego debug systemu.

`debug/colliderDebugView.ts` powinien wizualizować:

- circle jako circle/cylinder;
- capsule jako capsule/segment z promieniem;

tak, aby debug overlay pokazywał **rzeczywisty kształt collision geometry**, a nie maskował wszystko jako koło.

Wizualizacja ma umożliwić szybkie sprawdzenie:

- prostych ścian;
- narożników;
- światła drzwi;
- otwartych drzwi;
- zamkniętych drzwi.

### 9. Testy regresyjne

Rozszerzyć `src/settlement/houseBuilder.test.ts` i testy `src/world/collision.ts` / odpowiedni istniejący plik testowy.

Minimalny zestaw:

#### Collision primitive

- circle zachowuje dotychczasowe zachowanie;
- capsule blokuje encję tylko w swojej rzeczywistej szerokości;
- koniec capsule działa poprawnie;
- zerowa długość capsule nie powoduje NaN;
- brak overlapu nie zmienia pozycji.

#### House walls

- zwykły moduł ściany generuje capsule zamiast `radius = 0.95` circle;
- collider nie wystaje absurdalnie poza narożnik;
- narożnik ma własną, małą geometrię kolizji.

#### Door opening

Dla domu z drzwiami:

- nie ma collidera w środku otworu przy otwartych drzwiach;
- ściana po obu stronach otworu nadal blokuje;
- zamknięte drzwi blokują światło otworu;
- otwarte drzwi pozwalają przejść przez cały otwór;
- nie istnieje boczna „dziura” obok drzwi wynikająca ze skipowania całego modułu;
- szerokość przejścia jest zgodna z rzeczywistym otworem i promieniem gracza 0.35 m.

#### House variants

Sprawdzić co najmniej:

- `TEST_HOUSE_01`;
- `COTTAGE_4X4_A`;
- `COTTAGE_4X4_B`;
- `COTTAGE_6X4_A`;
- `HOUSE_6X6_A`;
- `HOUSE_8X6_A`.

Test ma pilnować także drzwi na różnych `moduleIndex`, a nie tylko jednego przypadku testowego.

### 10. Nie rozszerzać zakresu

W tym planie nie robić:

- nowego systemu physics;
- OBB / mesh collision dla wszystkich assetów świata;
- automatycznego generowania colliderów z GLB;
- collision meshów z geometrii Three.js;
- pełnego przebudowania `resolvePosition()` na wieloiteracyjny solver;
- zmian pathfindingu NPC;
- zmian `Place`, householdów, lodging ani ownership domów;
- zmian wizualnego assembly domów poza tym, co konieczne do poprawnej korelacji z openingami;
- ogólnego refaktoru `houseBuilder.ts`.

Jeżeli podczas implementacji wyjdą problemy wykraczające poza collision geometry, wpisać je do `docs/plans/LOOSE-ENDS.md` zamiast rozszerzać plan.

## Kolejność implementacji

1. Zaktualizować typ `Collider` i `resolvePosition()` o capsule.
2. Dodać czyste testy matematyczne dla circle/capsule.
3. Wprowadzić dane szerokości / geometrii otworu do `HouseDefinition`, jeśli potrzebne.
4. Przepisać `buildHouseWallCollidersLocal()` na segmenty ścian.
5. Dodać jawne collidery narożników.
6. Zastąpić door jamb workaround dwoma segmentami po bokach otworu.
7. Dodać capsule closed-door collider i przełączanie open/closed.
8. Usunąć stare jamb constants/functions/tests.
9. Rozszerzyć debug collider view o capsule.
10. Uruchomić testy techniczne.
11. Wykonać browser verification na kilku wariantach domu z `?debugColliders=1`.
12. Zaktualizować implementation notes i `docs/state/settlements.md`, jeżeli zmieni się opis ownership/shape kolizji.

## Kryteria akceptacji

Plan jest technicznie zakończony, gdy:

- zwykłe ściany nie są reprezentowane jako koła `r=0.95`;
- debug overlay pokazuje cienkie, wydłużone collidery odpowiadające ścianom;
- narożniki nie tworzą dużych okrągłych obszarów blokowania;
- drzwi znajdują się dokładnie w tym samym openingu co wizualny model;
- przy otwartych drzwiach można przejść środkiem i całym światłem otworu;
- przy zamkniętych drzwiach nie można przejść ani przez skrzydło, ani bokiem przez ścianę;
- nie ma sztucznych jamb circles;
- rozwiązanie działa dla różnych footprintów i pozycji drzwi;
- istniejące kołowe collidery świata nadal działają;
- testy automatyczne przechodzą;
- browser/manual verification potwierdza poprawność wizualną i gameplayową.

## Weryfikacja

Techniczna:

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run build
pnpm run test
```

Browser/manual:

1. Uruchomić `pnpm run dev`.
2. Otworzyć osadę z domami i `?debugColliders=1`.
3. Obejrzeć collidery z zewnątrz przy narożnikach i wszystkich ścianach.
4. Podejść do każdego typu drzwi.
5. Sprawdzić wejście przez środek otworu.
6. Sprawdzić próbę wejścia przez ścianę obok drzwi.
7. Otworzyć drzwi i powtórzyć przejście.
8. Sprawdzić co najmniej jeden dom 4×4, 6×4, 6×6 i 8×6.
9. Potwierdzić brak nowych wizualnych luk / blokad przy narożnikach.

Wynik należy rozdzielić na:

- implemented;
- technically verified;
- browser/manual verified.

**Zrób git commit i push do main, rebase jeżeli trzeba**