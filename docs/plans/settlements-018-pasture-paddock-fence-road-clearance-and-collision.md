# Plan: Pasture and paddock fence road clearance and collision

**Created:** 2026-09-17
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** S
**Depends on:** ~~settlements-009~~, ~~settlements-013~~, ~~settlements-015~~
**Domain:** `settlements`
**Type:** `fix`
**Roadmap:** -
**Model:** Sonnet, Composer

## Cel

Naprawić fizyczną i przestrzenną niespójność ogrodzeń satellite settlement areas:

- `VillagePlan.pasture` fence może przecinać lokalną drogę/ścieżkę;
- `VillagePlan.paddock` fence może przecinać lokalną drogę/ścieżkę;
- widoczne fence segments pasture/paddock nie mają colliderów;
- przez brak colliderów player, NPC i fauna mogą przechodzić przez widoczne ogrodzenie, a istniejący pathfinding nie traktuje go jako przeszkody.

Docelowy flow:

```text
VillagePlan fence segments
→ final PropPlacement[]
→ presentation + Collider[]
→ shared ColliderRegistry
→ player / NPC / fauna / navigation
```

Nie tworzyć osobnego systemu fence navigation ani fence obstacle registry.

## Stan obecny

### Pasture

`src/settlement/villagePasture.ts` planuje `VillagePastureFenceSegment[]`.

`layoutOnCandidate()` sprawdza położenie pasture, studni, trough i connection względem istniejących constraints. Jednak `segmentClear()` dla finalnych fence segments sprawdza:

- wodę / river footprint,
- planned plots,
- well,
- trough,
- connection gap,

ale nie sprawdza przecięcia segmentu z road/path corridor.

W efekcie poprawny pasture candidate może wygenerować długi fence segment przecinający drogę.

### Horse paddock

`src/settlement/villagePaddock.ts` również planuje `VillagePastureFenceSegment[]`.

Anchory paddocku są sprawdzane przez `pointHitsCorridor()`, ale finalne segmenty pierścienia ogrodzenia są walidowane tylko względem wody i planned plots. Segment fence może więc przeciąć corridor mimo poprawnego środka/entrance paddocku.

### Presentation

`src/settlement/props.ts` materializuje oba typy ogrodzeń przez istniejący pipeline:

```text
pastureFencePlacements(...)
paddockFencePlacements(...)
→ plantEntrancePalisade(...)
→ buildInstancedProps(...)
```

To są finalne plain-data placements odpowiadające widocznym segmentom.

### Collision

Plan `settlements-015` dodał poprawny wzorzec dla settlement palisade:

```text
final SettlementPalisadePlacement[]
→ plantEntrancePalisade()
→ settlementPalisadeColliders()
→ createSettlement()
→ ColliderRegistry
```

`createSettlement.ts` rejestruje collidery palisady razem z pozostałymi settlement colliders.

Pasture i paddock używają tego samego rodzaju rendered wall/fence placement, ale ich placements nie są obecnie przekazywane do collision projection.

## Zakres

### 1. Final fence segments nie mogą przecinać dróg/pathów

Rozszerzyć walidację pasture i paddock fence layout tak, aby każdy finalny fence segment respektował istniejące planned path/road corridors.

Sprawdzenie musi dotyczyć całego odcinka fence, a nie tylko:

- środka pasture/paddock,
- fence midpoint,
- endpointów.

Reuse istniejących segment/corridor geometry helpers. Nie implementować nowego równoległego modelu geometrii.

### 2. Użyć canonical local path data

Dla konfliktów z lokalnymi drogami/ścieżkami źródłem prawdy pozostaje `VillagePlan.paths` i istniejąca projekcja `pathPlansToCorridorData()`.

Nie rekonstruować lokalnych roads z meshów ani runtime road visuals.

Existing entrance corridors mogą pozostać placement constraintem tam, gdzie są potrzebne podczas budowania planu przed finalizacją paths, ale finalny fence layout nie może ignorować rzeczywistych planned path corridors.

Jeżeli kolejność planowania obecnie uniemożliwia wykorzystanie finalnych `VillagePlan.paths` podczas pasture/paddock candidate selection, zmienić minimalnie kolejność/kontrakt planowania tak, aby fence/path conflict był rozwiązany w planie, nie dopiero podczas presentation.

Nie usuwać ani przesuwać fence segments dopiero w `props.ts`.

## 3. Wspólna collision projection dla fence placements

Nie duplikować `settlementPalisadeColliders()` dla pasture i paddock trzema prawie identycznymi funkcjami.

Wyciągnąć/reuse mały wspólny placement → OBB collider projection, który przyjmuje finalne fence/palisade `PropPlacement[]` zgodne z renderowanym segmentem.

Invariant:

```text
1 finalny widoczny fence placement
↔
1 odpowiadający OBB collider
```

Collision musi używać dokładnie tych samych:

- `x`,
- `z`,
- `rotationY`,
- długości / half-width,
- half-depth

co istniejący settlement fence/palisade visual contract.

Nie odczytywać transformów z `InstancedMesh`.

## 4. Register pasture/paddock colliders w settlement lifecycle

`createSettlement.ts` pozostaje właścicielem lifecycle colliderów settlementu.

Rozszerzyć istniejący `registerSettlementColliders()` o collidery finalnych:

- settlement palisade placements,
- pasture fence placements,
- paddock fence placements.

Unload/dispose nadal korzysta z istniejącego `clearColliders(def.id)`; nie tworzyć osobnego lifecycle dla pasture/paddock.

## 5. NPC i fauna

Nie zmieniać:

- `NpcAgent` movement,
- `AnimalAgent` movement,
- `navigation/findPath()`,
- collision registry semantics.

NPC i fauna już wykorzystują collider-backed walkability. Po poprawnym zarejestrowaniu fence colliders istniejący movement/pathfinding powinien automatycznie omijać płoty i korzystać z zaplanowanych przerw/wejść.

## 6. Paddock entrance pozostaje funkcjonalny

Paddock ma zaplanowany entrance gap. Collision projection nie może tworzyć ciągłego collider ring niezależnego od faktycznych segmentów.

Tylko istniejące finalne `fenceSegments` generują collidery.

Invariant:

```text
planned fence gap
→ brak visual segment
→ brak collidera
→ player/NPC/fauna mogą przejść
```

## 7. Pasture fence pozostaje minimalnym markerem

Pasture z planu `settlements-009` nie staje się pełnym enclosure.

Zachować istniejący model:

- preferowane dwa segmenty,
- fallback jeden segment,
- czytelny gap/connection,
- brak obowiązku zamykania całego pasture.

Ten plan dodaje fizyczność i poprawne clearance, nie redesign pasture layout.

## 8. Performance

Fence colliders są statyczne i settlement-streamed.

Nie dodawać:

- per-frame fence scans,
- dynamicznego navmesh rebuild,
- osobnych spatial indexes,
- polling/reconciliation visual ↔ collision.

Projection `PropPlacement[] → Collider[]` ma odbywać się przy materializacji/rejestracji settlementu analogicznie do obecnej palisady.

## Testy

Dodać/rozszerzyć testy obejmujące co najmniej:

### Pasture placement

- fence segment przecinający road/path corridor jest odrzucany;
- planner wybiera alternatywny valid layout/candidate, jeżeli istnieje;
- fallback one-segment również respektuje corridor;
- determinism pozostaje zachowany.

### Paddock placement

- ring segment przecinający road/path corridor powoduje odrzucenie layout/candidate;
- entrance gap pozostaje bez segmentu;
- determinism pozostaje zachowany.

### Collision projection

- jeden finalny fence placement daje dokładnie jeden OBB collider;
- `x`, `z`, `rotationY` są kopiowane z canonical placement;
- collider dimensions odpowiadają visual fence contract;
- empty placements → empty colliders.

### Settlement integration

- pasture fence colliders trafiają do tego samego settlement collider registration;
- paddock fence colliders trafiają do tego samego registration;
- gap nie generuje synthetic collidera;
- brak pasture/paddock nie zmienia obecnego settlement collision flow.

## Verification

Automatycznie:

- targeted Vitest dla `villagePasture`, `villagePaddock`, fence/palisade collision i settlement integration;
- `pnpm typecheck` / repo-standard TypeScript verification;
- relevant existing settlement tests.

Manual browser verification wykonuje User:

1. Znaleźć settlement z pasture i sprawdzić, że żaden fence segment nie przecina local road/path.
2. Spróbować przejść graczem przez fence — ma blokować.
3. Przejść przez zaplanowany gap — ma być możliwe.
4. Obserwować livestock/NPC przy fence — nie powinny przechodzić przez segment ani wybierać trasy przez niego.
5. Powtórzyć dla horse paddock, szczególnie entrance gap.
6. Włączyć `?debugColliders=1` i potwierdzić OBB na każdym widocznym segmencie oraz brak collidera w gapie.

## Non-goals

Poza zakresem:

- pełny closed pasture enclosure,
- bramy otwierane/zamykane,
- dynamiczne fence damage/destruction,
- player-built fence changes,
- nowy navmesh,
- osobny animal fencing AI,
- zmiany ownership livestock/pasture,
- redesign horse paddock gameplay.

## JSDoc / preflight

Jeżeli zostanie wydzielony wspólny publiczny helper placement → fence collider, dodać krótki JSDoc opisujący invariant shared visual/collision geometry i oznaczyć `@domain settlements`.

Analogicznie udokumentować helper walidujący pełny fence segment względem planned corridors, jeśli stanie się wspólnym kontraktem pasture/paddock.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
