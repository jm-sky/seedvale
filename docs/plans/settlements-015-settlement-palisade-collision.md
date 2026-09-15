# Plan: Settlement palisade collision

**Created:** 2026-09-15
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** S
**Model:** Sonnet, Composer
**Depends on:** none
**Domain:** `settlements`
**Type:** `fix`
**Roadmap:** -

## Cel

Naprawić brak fizycznej kolizji palisady osady tak, aby widoczne segmenty palisady były rzeczywistą przeszkodą dla:

- gracza,
- NPC,
- dzikiej fauny,
- livestock i innych `AnimalAgent`.

Nie dodawać palisade-specific movement logic. Palisada ma wejść do istniejącego `ColliderRegistry`, z którego obecne systemy ruchu już korzystają.

```text
settlement palisade placement
→ shared Collider[]
→ ColliderRegistry
→ player / NPC / fauna movement
```

## Stan obecny

`src/settlement/settlementPalisade.ts::plantEntrancePalisade()` tworzy finalne placementy segmentów i materializuje je przez `buildInstancedProps()`, ale nie tworzy colliderów.

`src/settlement/props.ts::buildSettlementProps()` wywołuje tę logikę jako część presentation layer.

`src/settlement/createSettlement.ts` ma już właściwy lifecycle colliderów osady:

```ts
registerColliders(def.id, [...])
```

oraz przy unload/dispose:

```ts
clearColliders(def.id)
```

Obecnie do registry trafiają m.in. studnie, domy i statyczne propsy osady, ale nie palisada.

W efekcie widoczna bariera jest ignorowana przez wspólny system kolizji.

## Zakres

Dodać collision projection dla finalnych segmentów palisady osady i włączyć ją do istniejącej rejestracji colliderów settlementu.

Nie zmieniać architektury movement ani pathfindingu.

## Canonical geometry

Renderer nie może być źródłem prawdy dla collision.

Źródłem prawdy mają być plain-data finalne placementy segmentów palisady:

```text
pure/final palisade placement data
        ↓
canonical PalisadePlacement[]
       ↙                  ↘
presentation             collision
InstancedMesh            Collider[]
```

Invariant:

```text
Każdy finalny widoczny segment palisady ma dokładnie jeden collider.
Każdy collider palisady ma odpowiadający mu finalny segment.
```

Nie odczytywać transformów z `InstancedMesh` i nie rekonstruować colliderów osobno z settlement center/radius/entrance angle.

### Obecna implementacja

Jeżeli `plantEntrancePalisade()` nadal lokalnie buduje `placements`, wydzielić lub zwrócić te same finalne plain-data placements tak, aby presentation i collision konsumowały dokładnie ten sam wynik.

Zmiana ma pozostać kompatybilna z późniejszym `settlements-010`, który planuje przebudować palisadę do czystszego placement resolvera. Ten fix nie może jednak być od niego zależny ani czekać na jego implementację.

Po przyszłej zmianie generatora kontrakt pozostaje ten sam:

```text
final PalisadePlacement[]
├─ render
└─ collision
```

## Collider segmentu

Dla każdego finalnego segmentu użyć istniejącego `obb` z `src/world/collision.ts`.

Docelowy kształt:

```ts
{
  type: 'obb',
  x,
  z,
  halfWidth,
  halfDepth,
  rotationY,
}
```

Orientacja musi pochodzić bezpośrednio z finalnego placementu segmentu.

Nie używać szerokich `circle` colliderów dla ścian.

Długość collidera powinna odpowiadać settlement wall geometry (`WALL_HALF_LENGTH` lub jednoznaczny canonical constant obok niej). Grubość powinna być mała i oparta o rzeczywisty footprint ściany, nie arbitralny duży radius.

Nie reuse'ować bezrefleksyjnie wymiarów player-built palisade, jeżeli settlement wall ma inną geometrię.

## Gate, drogi i pominięte segmenty

Collider istnieje wyłącznie dla finalnego segmentu, który rzeczywiście przeszedł placement constraints.

Nie tworzyć ciągłego collidera całego perimeteru.

```text
visible gap
→ no collider
```

Dotyczy to:

- gate,
- road/path corridor rejection,
- coastal rejection,
- każdego innego segmentu pominiętego przez istniejącą logikę placement.

Brama musi pozostać fizycznie przechodnia.

## Ownership i lifecycle

Collision lifecycle pozostaje własnością settlement runtime.

Palisada nie rejestruje colliderów samodzielnie.

Preferowany przepływ:

```text
buildSettlementProps / palisade placement
→ final PalisadePlacement[]
→ settlementPalisadeColliders(...)
→ createSettlement()
→ registerColliders(def.id, [
     wells,
     houses,
     settlement props,
     palisade
   ])
```

Przy unload:

```text
Settlement.dispose()
→ clearColliders(def.id)
```

Wszystkie segmenty palisady mają należeć do tego samego owner key `def.id` co pozostałe collidery osady.

Nie rejestrować osobnego owner key per segment.

## Existing mechanisms to reuse

### Settlement palisade

- `src/settlement/settlementPalisade.ts`
  - `plantEntrancePalisade()`
  - `WALL_HALF_LENGTH`
  - istniejące gate/corridor/coastal constraints
  - finalne `PropPlacement[]`

### Settlement props/runtime

- `src/settlement/props.ts::buildSettlementProps()`
- `src/settlement/createSettlement.ts`
  - `registerColliders(def.id, ...)`
  - `clearColliders(def.id)`
  - `settlementHouseColliders(...)`
- `src/settlement/settlementPropColliders.ts`

Nie wciskać palisady do `settlementPropColliders()` automatycznie, jeśli jej orientowane segmenty mają czytelniejszy focused helper.

### Shared collision

Reuse bez nowego systemu:

- `src/world/collision.ts`
- `src/terrain/chunkManager.ts` / `ColliderRegistry`
- `src/player/PlayerController.ts`
- `src/ai/NpcAgent.ts`
- `src/fauna/AnimalAgent.ts`

Player, NPC i fauna już korzystają ze wspólnego collider source. Po poprawnej rejestracji palisady nie powinny wymagać palisade-specific zmian.

## Sugerowany helper

Preferować mały pure projection helper, np.:

```ts
settlementPalisadeColliders(
  placements: readonly PalisadePlacement[],
): Collider[]
```

Lokalizacja zależy od finalnego kształtu kodu:

- `src/settlement/settlementPalisade.ts`, jeśli helper pozostaje mały,
- albo `src/settlement/settlementPalisadeColliders.ts`, jeśli oddzielenie upraszcza ownership.

Helper:

- nie zna `Scene`,
- nie zna `ColliderRegistry`,
- nie zna player/NPC/fauna,
- nie wykonuje query świata,
- nie posiada mutable state.

## Player / NPC / fauna

### Player

Nie zmieniać `PlayerController`.

Player już używa `collidersNear` i `resolvePosition`.

### NPC

Nie dodawać specjalnego avoidance dla palisady w `NpcAgent`.

Istniejący collider source, repath i stuck watchdog pozostają bez zmian.

### Fauna

Nie dodawać palisade-specific zachowania do `AnimalAgent`.

Fauna ma zostać zablokowana przez ten sam shared collider contract.

Poza zakresem są:

- szukanie bramy przez specjalną strategię,
- skakanie przez płot,
- niszczenie palisady,
- siege behaviour.

## Streaming

Settlement load:

```text
settlement loaded
→ final palisade placements
→ Collider[]
→ registerColliders(def.id, ...)
```

Settlement unload:

```text
Settlement.dispose()
→ clearColliders(def.id)
```

Ponowne stream-in tej samej osady musi odbudować ten sam zestaw colliderów bez duplikacji i bez orphaned colliderów.

## Determinizm

Collision geometry jest czystą projekcją deterministic palisade placement data.

Nie dodawać:

- runtime RNG,
- zależności od pozycji gracza,
- zależności od streaming order,
- per-frame recomputation.

## Wydajność

Palisada jest statyczna w lifetime załadowanej osady.

Collidery utworzyć raz podczas settlement load.

Nie dodawać:

- per-frame collider rebuild,
- per-agent palisade scans,
- mesh-based collision,
- raycastów przeciw `InstancedMesh`,
- osobnego spatial indexu.

Reuse istniejący `ColliderRegistry`.

## Testy automatyczne

Dodać pure test projection helpera:

1. jeden finalny placement daje dokładnie jeden `obb`,
2. `x`, `z` i `rotationY` odpowiadają placementowi,
3. wymiary collidera odpowiadają fizycznemu segmentowi,
4. wiele placementów daje dokładnie tyle samo colliderów,
5. brak placementu w gate/corridor gap oznacza brak collidera,
6. coastal/skipped segment nie generuje collidera,
7. ten sam input daje identyczny wynik.

Dodać test integracyjny settlement collision lifecycle:

1. finalne palisade placements trafiają do listy przekazanej do `registerColliders(def.id, ...)`,
2. collider count palisady odpowiada finalnemu placement count,
3. `dispose()` nadal usuwa cały settlement collider owner przez `clearColliders(def.id)`.

Jeżeli istniejące testy `settlements-010` później zmienią generator placementów, rozszerzyć je o invariant:

```text
final palisade placement count === palisade collider count
```

bez tworzenia drugiego fixture generatora.

## Pliki prawdopodobnie objęte zmianą

- `src/settlement/settlementPalisade.ts`
- `src/settlement/props.ts`
- `src/settlement/createSettlement.ts`
- testy settlement palisade/collision

Opcjonalnie:

- `src/settlement/settlementPalisadeColliders.ts`

Nie powinny wymagać zmian gameplayowych:

- `src/player/PlayerController.ts`
- `src/ai/NpcAgent.ts`
- `src/fauna/AnimalAgent.ts`
- `src/world/collision.ts`

## JSDoc / preflight

Jeżeli zostanie dodany nowy publiczny typ placementu lub helper projection, udokumentować jego ownership i invariant JSDoc.

Dla ważnych publicznych symboli użyć:

```text
@domain settlements
```

Dokumentacja powinna jasno wskazywać, że final palisade placement data są wspólnym źródłem presentation i collision.

## Poza zakresem

- player-built palisade — ma własny collider lifecycle,
- przebudowa settlement perimeteru,
- `closed` settlement character,
- dynamiczne bramy,
- destruction/damage palisady,
- persistence settlement palisade,
- climbing/jumping,
- siege AI,
- pathfinding redesign,
- fauna gate-search strategy,
- pełna physics simulation.

## Weryfikacja przez użytkownika

Po implementacji sprawdzić w browserze:

1. gracz idący prostopadle w segment zatrzymuje się przed palisadą,
2. gracz może przejść przez prawdziwą bramę,
3. wilk lub inne zwierzę nie przechodzi przez segment,
4. NPC nie przechodzi przez segment,
5. NPC/fauna nadal mogą korzystać z realnych przerw/wejść,
6. coastal/skipped fragment nie ma niewidzialnej bariery,
7. po oddaleniu się poza unload radius i powrocie collision nadal działa,
8. nie pojawiają się zdublowane ani orphaned collidery.

Browser verification wykonuje użytkownik, nie AI.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
