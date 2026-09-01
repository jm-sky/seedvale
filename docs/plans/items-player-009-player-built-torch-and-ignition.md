# Plan: Player-Built Torch and Ignition

**Created:** 2026-09-01
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** `world-008`
**Domain:** `items-player`

## Cel

Dodać pierwszą funkcjonalną budowlę tworzoną przez gracza: stojącą pochodnię.

Stojąca pochodnia jest większym obiektem świata i jest odrębna od istniejącego `wooden_torch`, który jest przenośnym itemem używanym przez gracza.

Docelowy flow:

```
construction materials
    ↓
player building placement
    ↓
standing torch
    ↓
unlit
    ↓
Ignite
    ↓
lit + fire/light
```

Plan jest pierwszym rzeczywistym konsumentem fundamentu player-created world objects z `world-008`.

Nie jest to implementacja pełnego construction systemu.

## Potwierdzony stan istniejący

W aktualnym codebase istnieją:

- `wooden_torch` jako przenośny item/tool,
- `fire_starting` jako istniejąca capability,
- istniejący placement preview,
- `evaluateGroundPlacement()` jako istniejąca walidacja ground placement,
- istniejące mechanizmy player-created world objects,
- istniejący fire system,
- istniejący runtime lighting,
- `WorldBundle` jako world lifetime/rebuild boundary,
- authoritative world state oddzielony od Three.js runtime objects,
- istniejący save v1.

Wykorzystać te mechanizmy zamiast tworzyć równoległe systemy.

## Rozdzielenie portable item i standing torch

Istniejący:

```
wooden_torch
```

pozostaje przenośnym itemem.

Stojąca pochodnia jest osobnym player-created world object i posiada własny:

- model,
- rozmiar,
- placement,
- construction requirements,
- persistent state,
- fire/light runtime representation.

Nie zmieniać `wooden_torch` tak, aby reprezentował stojącą pochodnię.

## Receptura

Pierwsza działająca receptura stojącej pochodni jest ustalona:

```
wooden pole × 1
+
wooden_torch × 1
→ standing torch
```

`wooden_torch` jest więc jednocześnie przenośnym itemem oraz możliwym komponentem konstrukcji, ale nadal nie jest samą stojącą pochodnią.

Budowa musi korzystać z istniejącego mechanizmu sprawdzania i zużywania wymaganych itemów/materialów.

Kolejność musi gwarantować, że odrzucony lub nieudany placement nie zużywa materiałów.

Nie dodawać w tym planie nowych materiałów typu linen/cloth.

> **Implementation note (post-implementation):** w aktualnym codebase nie istnieje item `wooden_pole` — `ItemKind` w `src/items/items.ts` go nie zawiera. Kryteria ukończenia tego planu wprost zabraniają dodawania nowego materiału wyłącznie na potrzeby tej receptury. Zaimplementowana receptura używa więc `beam` ("belka" — solidna belka ze ściętego drzewa, istniejący materiał konstrukcyjny) jako odpowiednika "wooden pole". Zob. `src/world/standingTorch.ts`'s `STANDING_TORCH_MATERIAL_REQUIREMENTS`.

### Przyszłe alternatywne receptury

Architektura nie powinna blokować późniejszego dodania alternatywnej receptury, np. z materiałem włóknistym:

```
wooden pole
+
future cloth/linen component
→ standing torch
```

Nie implementować tej alternatywy w tym planie i nie tworzyć placeholderowego itemu wyłącznie na jej potrzeby.

## Zakres

### 1. Player building placement

Dodać stojącą pochodnię jako player-built world object.

Wykorzystać infrastrukturę z `world-008` oraz istniejący placement preview.

Flow:

```
select standing torch
→ placement preview
→ validate
→ verify materials
→ confirm
→ consume materials
→ create standing torch
```

Pochodnia:

- może stać bezpośrednio na ziemi,
- nie wymaga ściany,
- nie wymaga płotu,
- nie wymaga budynku,
- nie wymaga anchor point,
- nie używa modularnego wall/fence snapping.

Wykorzystać `evaluateGroundPlacement()` i istniejące reguły terrain/collision validation.

Nie tworzyć torch-specific placement system.

### 2. Construction requirements

Wykorzystać istniejący mechanizm item/resource requirements i consumption.

Wymagania:

- `wooden pole × 1`,
- `wooden_torch × 1`.

Placement powinien:

1. zweryfikować lokalizację,
2. zweryfikować dostępność materiałów,
3. utworzyć world object,
4. zużyć materiały w sposób bezpieczny dla failure cases.

Jeżeli istniejący mechanizm realizuje tę transakcję inaczej, wykorzystać jego wzorzec zamiast tworzyć nowy.

### 3. Persistent torch state

Po utworzeniu stojąca pochodnia rozpoczyna jako:

```
unlit
```

Stan zapalenia należy do authoritative world state.

Minimalny persistent state musi umożliwiać odtworzenie:

- identity,
- position,
- rotation,
- lit/unlit state.

Three.js mesh, flame, light i inne runtime objects nie są persistent state.

### 4. Ignition

Dodać możliwość zapalenia stojącej pochodni przy użyciu istniejącego `fire_starting`.

`fire_starting` jest warunkiem wykonania akcji zapalenia zgodnie z istniejącym capability/action system.

Wykorzystać istniejący interaction/action mechanism.

Flow:

```
unlit standing torch
    ↓
Ignite
    ↓
fire_starting
    ↓
lit standing torch
```

Nie tworzyć:

- `TorchIgnitionSystem`,
- osobnego torch interaction system.

Nie definiować w tym planie nowego sposobu uzyskiwania capability `fire_starting`.

### 5. Fire and lighting

Po udanym zapaleniu:

```
lit = true
```

Runtime representation powinna wykorzystać istniejące mechanizmy fire i lighting.

Zapalona pochodnia powinna posiadać:

- odpowiedni flame/fire visual,
- aktywne światło,
- właściwy runtime lifecycle.

Nie tworzyć osobnego torch lighting system.

Persistent state nie przechowuje `THREE.Light`, particle systems ani innych runtime-only resources.

### 6. Runtime lifecycle

Zmiana stanu:

```
unlit → lit
```

musi aktualizować runtime representation.

Wielokrotne wykonanie `Ignite` na już zapalonej pochodni nie może tworzyć kolejnych flame/light resources.

Cleanup musi poprawnie zwalniać runtime resources.

Nie dodawać unconditional per-frame update iterującego po wszystkich pochodniach.

Preferowany model:

```
state change
    ↓
create/update/remove runtime fire/light
```

### 7. WorldBundle lifecycle

Stojąca pochodnia musi być zgodna z istniejącym lifecycle `WorldBundle`.

W szczególności:

- authoritative state nie może być własnością Three.js object,
- identity/state musi przetrwać world rebuild,
- runtime representation musi być możliwa do odtworzenia,
- cleanup nie może pozostawiać osieroconych runtime resources.

Nie tworzyć `TorchManager`.

### 8. Persistence

Wykorzystać istniejący save v1.

Wymagane zachowanie:

```
save unlit → load unlit
save lit   → load lit
```

Po restore:

```
unlit → brak aktywnego fire/light runtime
lit   → fire/light runtime restored
```

Nie tworzyć osobnego save format ani nowego systemu wersjonowania persistence.

## Architektura

### Portable item ≠ standing world object

```
wooden_torch
    = portable inventory/hand item

standing torch
    = persistent player-built world object
```

### Building placement ≠ ignition

```
building placement
    → creates world object

fire_starting
    → changes torch state
```

### Authoritative state ≠ runtime representation

```
persistent torch state
        ↓
mesh + flame + light
```

### Brak torch-specific managerów

Nie tworzyć:

- `TorchManager`,
- `TorchPlacementSystem`,
- `TorchLightingSystem`,
- `TorchIgnitionSystem`.

Wykorzystać istniejące mechanizmy.

## Non-goals

Plan nie obejmuje:

- extinguishing,
- torch fuel,
- burn duration,
- wall-mounted torches,
- fence-mounted torches,
- hand-held torch lighting,
- automatic lighting,
- fire propagation,
- NPC interaction,
- flax cultivation,
- linen/cloth production,
- nowych materiałów włóknistych,
- alternatywnej receptury z linen/cloth,
- nowego recipe framework,
- palisad,
- ogrodów/pól,
- domów,
- pełnego construction progress/work system.

Istniejący `wooden_torch` jako portable item nie jest przebudowywany na standing torch.

## Kryteria ukończenia

- stojąca pochodnia jest osobnym world object od portable `wooden_torch`,
- receptura wymaga `wooden pole × 1` i `wooden_torch × 1`,
- gracz może umieścić ją bezpośrednio na ziemi,
- placement nie wymaga wall/fence/building anchor,
- placement korzysta z istniejącego placement infrastructure,
- placement korzysta z istniejącej ground validation,
- brak materiałów uniemożliwia placement,
- odrzucony placement nie zużywa materiałów,
- udany placement zużywa wymagane materiały,
- nowa pochodnia jest `unlit`,
- `lit/unlit` jest authoritative world state,
- `Ignite` korzysta z `fire_starting`,
- interaction korzysta z istniejącego action/interaction system,
- po zapaleniu pojawia się istniejący fire/light runtime,
- wielokrotne `Ignite` nie tworzy duplikatów runtime resources,
- `save unlit → load unlit`,
- `save lit → load lit`,
- WorldBundle rebuild może odtworzyć runtime representation,
- cleanup nie pozostawia runtime resources,
- nie powstał torch-specific manager,
- nie powstał drugi placement system,
- nie powstał drugi fire/light system,
- nie dodano nowego materiału wyłącznie dla tego planu,
- nie dodano unconditional per-frame update dla wszystkich pochodni.

## Weryfikacja

Automatycznie:

```
pnpm exec tsc --noEmit
pnpm run lint
pnpm run test
pnpm run build
```

W razie istnienia aktualnych komend preflight/CI użyć ich zgodnie z `CLAUDE.md`.

Manualnie:

1. wybrać budowę stojącej pochodni,
2. rozpocząć placement,
3. ustawić ją bezpośrednio na ziemi,
4. sprawdzić walidację nieprawidłowej lokalizacji,
5. sprawdzić zachowanie przy braku wymaganych materiałów,
6. potwierdzić placement,
7. sprawdzić zużycie `wooden pole` i `wooden_torch`,
8. potwierdzić stan `unlit`,
9. użyć `Ignite`,
10. potwierdzić flame/fire i światło,
11. potwierdzić brak ponownej akcji `Ignite`,
12. zapisać świat w stanie `unlit` i wykonać reload,
13. zapisać świat w stanie `lit` i wykonać reload,
14. potwierdzić poprawne odtworzenie runtime fire/light.

Nie testować usuwania pochodni, jeżeli istniejący system nie udostępnia normalnej operacji usuwania placed objects.

## JSDoc

Podczas implementacji dodać JSDoc dla ważnych publicznych/architektonicznych funkcji i klas wprowadzonych lub istotnie zmienionych przez ten plan, gdy jest potrzebny do preflight/discovery.

Warto użyć:

```
@domain items-player
```

## Dokumentacja

Jeżeli implementacja zmieni rzeczywisty stan opisany w `docs/STATE.md`, zaktualizować odpowiednią sekcję.

Po implementacji sprawdzić, czy roadmapa player construction nadal dokładnie opisuje kolejne etapy.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
