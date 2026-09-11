# Plan: Cave Heightfield Production Migration

**Created:** 2026-09-11  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** XL  
**Depends on:** ~~world-terrain-018~~  
**Domain:** `world-terrain`  
**Type:** `feature`  
**Subdomains:** `terrain` `rendering` `landmarks`  
**Tags:** `caves` `heightfield` `migration` `collision` `camera` `streaming`  
**Roadmap:** -

## 1. Cel

Zastąpić produkcyjną reprezentację Cave V2 opartą o lokalny 3D SDF sprawdzoną reprezentacją heightfield opartą o:

```text
floorY(x,z)
ceilingY(x,z)
gap = ceilingY - floorY
```

bez przebudowy działających systemów cave od zera.

Plan ma przenieść rozwiązanie zweryfikowane w `world-terrain-018` z izolowanego debug harnessu do produkcyjnego świata i uczynić je nowym źródłem prawdy dla spatial representation caves.

Docelowo:

```text
seed + world context + cave identity
        ↓
CaveTopology
        ↓
CaveHeightfieldRepresentation
        ↓
├─ presentation mesh
├─ gameplay spatial queries
├─ collision / camera queries
└─ downstream cave contracts
```

Heightfield zastępuje SDF jako produkcyjny spatial representation.

SDF nie pozostaje drugim równoległym produkcyjnym systemem.

## 2. Relacja do poprzednich planów

### `world-terrain-007`

V1 dostarczył podstawową cave infrastructure i pierwszą produkcyjną integrację, ale jego geometry/runtime model został zastąpiony przez Cave V2.

`world-terrain-007` jest zamknięty (`done`) jako historyczny/superseded. Nie wznawiać V1.

### `world-terrain-008`

Cave V2 dostarczył kluczową produkcyjną infrastrukturę:

- world-scale cave siting,
- deterministic cave identity,
- `CaveTopology`,
- terrain-aware placement,
- `WorldBundle` lifecycle,
- cave streaming,
- gameplay ground/query ownership,
- collision,
- third-person camera integration,
- entrance integration,
- performance/lifecycle mechanisms.

Te elementy należy zachować.

SDF było produkcyjną reprezentacją V2. Nie kontynuować SDF jako docelowej reprezentacji tylko dlatego, że był wybrany podczas wcześniejszego representation spike.

`world-terrain-008` jest zamknięty (`done`) jako zakończony etap Cave V2/SDF. Oryginalnego B5 SDF cleanup nie realizować w 008 — usunięcie production SDF path należy do tego planu. Production SDF code pozostaje, dopóki ten plan go nie zastąpi.

### `world-terrain-018`

Heightfield spike jest zamknięty (`done`). Wykazał, że dla aktualnych wymagań caves można użyć znacznie tańszej reprezentacji 2.5D:

```text
one floorY + one ceilingY per (x,z)
```

z naturalnymi tunnel profiles, rounded side walls, irregular chambers, shelf jako elevated floor region, real terrain opening, deterministic noise i lightweight traversal/collision queries.

Ten plan jest produkcyjną migracją wyniku spike'a, a nie kolejnym eksperymentem.

## 3. Kluczowa decyzja architektoniczna

Nowym produkcyjnym spatial representation caves jest heightfield:

```text
CaveTopology
    ↓
CaveHeightfieldRepresentation
```

Reprezentacja posiada co najmniej:

```text
bounds
grid / sampling metadata
floorY
ceilingY
surface relation where needed
containment / gap information
```

Render mesh, collision proxy i gameplay queries są pochodne tej reprezentacji. Mesh nie jest źródłem prawdy.

Nie tworzyć:

- drugiego cave managera,
- osobnego cave collision engine,
- quest-specific cave representation,
- fauna-specific cave geometry,
- production SDF fallback path utrzymywanego równolegle.

## 4. Świadome ograniczenia Cave V3

Heightfield reprezentuje pojedynczy pionowy interval na `(x,z)`:

```text
floorY(x,z)
...
ceilingY(x,z)
```

Obsługiwane:

- tunnels,
- bends,
- widenings,
- chambers,
- side-by-side różne poziomy floor,
- shelves / ledges będące częścią podłogi,
- slopes,
- steep banks,
- ceiling dips,
- nieregularne chamber boundaries.

Nieobsługiwane bez rozszerzenia modelu:

- stacked tunnels w tym samym `(x,z)`,
- dwa niezależne floor intervals w jednej kolumnie,
- vertical shafts wymagające wielointerwałowej geometrii,
- genuine undercut/overhang wymagający pustej przestrzeni pod bryłą.

`overhang` może być reprezentowany tylko jako approximation kompatybilne z jednym floor/ceiling interval.

Nie wprowadzać w tym planie hybrid SDF/voxel system tylko po to, aby ominąć te ograniczenia.

## 5. Reuse istniejącego `CaveTopology`

Nie przebudowywać topology podczas migracji reprezentacji.

`CaveTopology` pozostaje representation-neutral i nadal posiada:

- stable cave identity,
- entrance,
- nodes,
- segments / centerlines,
- target width,
- target height,
- elevation/descent,
- chamber/widening/constriction semantics,
- shelf/overhang metadata,
- bounds/intention potrzebne do generation.

Geometryczne parametry topology nie mogą zostać zdublowane w heightfield config.

Przykładowo:

- passage length wynika z centerline,
- width wynika z topology,
- height wynika z topology,
- descent wynika z topology.

Heightfield config posiada wyłącznie parametry sposobu reprezentacji, np. grid resolution, profile/rim shaping i deterministic detail noise.

## 6. Strategia realizacji — niezależne milestone'y

Plan jest celowo podzielony tak, aby kolejne etapy mogły być wykonywane przez różne modele/agentów bez ponownego pełnego reconu.

```text
A — Production representation extraction
    ↓ STOP / review
B — Production presentation + terrain entrance
    ↓ STOP / User browser verification
C — Shared spatial contract + semantic interior locations
    ↓ STOP / architecture review
D — Production consumers migration + lifecycle
    ↓ STOP / User browser verification
E — SDF cleanup + docs + downstream dependency handoff
```

Agent realizujący dany milestone NIE powinien automatycznie rozpoczynać kolejnego.

Każdy milestone ma kończyć się działającym, spójnym stanem repo oraz zapisanym handoffem dla następnego etapu.

## 7. Recon budget

Każdy milestone zaczyna się od focused recon:

1. `CLAUDE.md`,
2. `docs/STATE.md`,
3. ten plan,
4. implementation notes tego planu,
5. pliki i symbole wskazane przez poprzedni milestone.

Nie wykonywać repo-wide recon bez konkretnej niepewności architektonicznej.

Current code jest source of truth. Jeżeli aktualny kod przeczy planowi, udokumentować rozbieżność i dostosować wykonanie do obecnej architektury zamiast wymuszać nieaktualny opis.

## 8. Milestone A — Production heightfield representation

Wydzielić produkcyjny `CaveHeightfieldRepresentation` z rozwiązania sprawdzonego w debug harnessie.

Production implementation ma zachować sprawdzone właściwości:

- deterministic fixed-grid sampling,
- centerline resampling,
- continuous passage width interpolation,
- rounded wall/rim profile,
- complementary floor/ceiling construction,
- deterministic chamber lobes,
- floor detail noise,
- ceiling detail noise,
- macro shape noise,
- mouth attenuation,
- minimum usable clearance,
- shelf jako lokalnie podniesiona podłoga.

Production representation nie może zależeć od debug scene, player, Three.js scene state, save runtime, current camera ani streaming order.

Powinna być testowalna jako czysta spatial data representation.

### Milestone A stop condition

- production representation istnieje poza debug namespace,
- korzysta z `CaveTopology`,
- nie przełącza jeszcze production presentation/gameplay consumers,
- targeted representation tests przechodzą,
- implementation notes opisują ownership, pliki i publiczne kontrakty dla Milestone B.

## 9. Grid resolution i performance

Aktualne `cellSize` ze spike'a nie jest stałym kontraktem architektonicznym.

Preferować jakość, jeśli koszt pozostaje niewielki względem SDF.

Koszt gridu XZ skaluje się w przybliżeniu:

```text
1 / cellSize²
```

Nie budować osobnego benchmark frameworka dla wyboru resolution.

Rozróżniać:

### Generation cost

- representation build,
- mesh build,
- memory,
- influence count,
- grid size.

### Runtime/FPS cost

- triangles/vertices,
- draw calls,
- collision/query cost,
- material cost,
- per-frame processing.

Nie zużywać całego odzyskanego względem SDF budżetu. Zachować headroom dla większych caves, richer topology, props, lighting, fauna/NPC, simulation i przyszłego multiplayer/off-screen simulation.

## 10. Milestone B — Production presentation mesh

Zastąpić produkcyjny SDF extraction heightfield-derived mesh.

Mesh musi wynikać bezpośrednio z authoritative `floorY` i `ceilingY`.

Wymagania:

- poprawny winding floor,
- poprawny winding ceiling,
- smooth normals tam, gdzie właściwe,
- floor i ceiling zbieżne na cave boundary,
- brak osobnych pionowych boundary walls,
- brak cracks/seams pomiędzy komórkami,
- deterministic geometry,
- reasonable vertex sharing,
- disposable/lazy runtime geometry.

Nie kopiować debug mesh code bezrefleksyjnie — wydzielić właściwy production ownership.

## 11. Milestone B — Entrance i terrain seam

Przenieść production-ready wariant realnego cave mouth.

Entrance powinno zapewniać:

- rzeczywisty opening w terrain,
- brak surface sheet nad portalem,
- sensowny contour,
- płynne połączenie surface → cave floor,
- poprawny `openSky`,
- brak cave ceiling bezpośrednio nad mouth,
- brak dużych visible gaps/seams,
- brak invisible blockers.

Production terrain integration nie może polegać wyłącznie na coarse whole-quad removal, jeżeli powoduje to widoczne artefakty.

Preferować rozwiązanie lokalne i tanie.

Istniejące cave rock assets mogą pozostać jako presentation framing, ale nie mogą być wymagane dla poprawności entrance ani blokować centralnego corridor.

### Milestone B stop condition

- production cave może być wyrenderowana z heightfield,
- real production terrain posiada poprawne wejście,
- representation nadal pozostaje authoritative,
- SDF może jeszcze istnieć dla gameplay queries do czasu Milestone D,
- targeted technical checks przechodzą,
- User wykonuje manual browser verification wyglądu, entrance i terrain seam,
- następny milestone nie startuje automatycznie.

## 12. Milestone C — Shared cave spatial contract

Heightfield ma zostać źródłem prawdy nie tylko dla renderingu, ale też dla downstream systems.

Production caves powinny udostępnić stabilny representation-neutral contract pozwalający innym systemom korzystać z caves bez wiedzy o meshu ani debug implementation.

Wymagane informacje/API powinny obejmować co najmniej:

```text
stable caveId
entrance world position
cave bounds
contains / queryInterior
sampleFloor
sampleCeiling
clearance / occupancy
surface ↔ cave transition information
```

API powinno być wystarczające dla Player movement, camera, collision, fauna, NPC traversal, quest target selection, item/treasure placement i cave-aware resources.

Nie wystawiać raw mesh geometry jako gameplay contract.

## 13. Milestone C — Semantic interior locations

Downstream systems potrzebują stabilnych miejsc wewnątrz cave.

Nie chcemy, aby fauna losowała `x/z` w bounds, quest analizował mesh, item placement kopiował coordinates ani każdy system osobno szukał walkable floor.

Milestone C ma zaprojektować i dostarczyć najmniejszy representation-neutral mechanizm uzyskania odpowiednich miejsc wewnątrz cave.

Nie przesądzać z góry, że musi to być jeden konkretny `interiorAnchors` API. Po focused recon wybrać najmniejsze spójne rozwiązanie, np. wykorzystanie semantycznych topology nodes zwalidowanych/projektowanych na heightfield albo mały shared query contract.

Mechanizm musi umożliwiać co najmniej use cases:

```text
caveId → suitable fauna home location
caveId → suitable chamber/deep-interior placement
caveId → suitable quest/item/resource placement
```

Wynik musi:

- wynikać z topology/heightfield,
- być stabilny z seeda,
- respektować floor/ceiling clearance,
- nie zależeć od aktywnego presentation mesh,
- nie być serializowany, jeśli jest w pełni deterministyczny.

Nie tworzyć osobnych systemów lokalizacji dla fauna i quests.

### Milestone C stop condition

- shared spatial contract ma jasno określony ownership,
- semantic interior location mechanism jest representation-neutral,
- downstream consumers nie muszą analizować mesh,
- nie przełączono jeszcze wszystkich produkcyjnych consumerów tylko po to, aby zakończyć ten etap,
- targeted architecture/contract tests przechodzą,
- implementation notes dokumentują dokładny handoff do Milestone D.

## 14. Milestone D — Gameplay queries migration

Przełączyć authoritative cave gameplay queries z SDF/column-index implementation na heightfield/shared cave spatial contract.

Dotyczy co najmniej:

- cave floor resolution,
- cave ceiling resolution,
- containment,
- occupancy,
- cave/surface ground selection,
- camera spatial queries.

Zachować istniejące poprawki Cave V2 dotyczące sytuacji, w której outdoor surface znajduje się wiele metrów nad graczem.

Samo `(x,z)` nie może powodować teleportowania/snapowania gracza na surface.

Gameplay queries muszą działać niezależnie od tego, czy presentation mesh jest aktualnie aktywny.

## 15. Milestone D — Collision i third-person camera

Reuse istniejącego collision ownership.

Nie tworzyć `HeightfieldCollisionManager` ani `CavePhysicsWorld`.

Collision proxy powinien wynikać z authoritative heightfield representation/shared spatial contract.

Zachować kompatybilność z istniejącym `ColliderRegistry`, vertical filtering, owner lifecycle i player movement.

Camera:

- nie może wychodzić przez ceiling,
- nie może pokazywać surface grass przez geometry escape,
- nie może przechodzić przez wall/rim,
- powinna korzystać ze wspólnego spatial source of truth.

Nie budować cave-specific drugiego camera controllera.

## 16. Milestone D — Streaming i lifecycle

Reuse istniejącego Cave V2 lifecycle:

```text
WorldBundle
→ cave definitions/topology
→ activation/deactivation
→ lazy presentation
→ dispose
```

Heightfield migration nie powinna tworzyć nowego streaming subsystem.

Zachować:

- deterministic identity,
- activation/deactivation,
- hysteresis,
- lazy mesh creation,
- disposal,
- world rebuild correctness.

Jeżeli authoritative heightfield data jest potrzebna przez gameplay/fauna poza aktywnym render distance, representation ownership musi to wspierać bez wymagania aktywnego mesha.

Dopuszczalna jest separacja:

```text
cheap spatial representation
vs
lazy presentation mesh
```

jeśli current architecture i koszt tego wymagają.

Nie przenosić generowania do Web Workera mechanicznie. Worker jest uzasadniony tylko, jeśli koszt i niezależność pracy uzasadniają communication overhead.

### Milestone D stop condition

- production player/camera/collision korzystają z heightfield/shared spatial contract,
- gameplay nie wymaga SDF jako authoritative source,
- streaming/rebuild/disposal pozostają poprawne,
- technical checks przechodzą,
- User wykonuje manual browser verification movement/collision/camera/streaming,
- następny milestone nie startuje automatycznie.

## 17. Milestone E — Production SDF cleanup

Po przełączeniu production queries/presentation/collision na heightfield:

- usunąć SDF z produkcyjnego cave ownership,
- usunąć transitional SDF adapters,
- usunąć dead code zależny wyłącznie od starej reprezentacji,
- zweryfikować czy `CaveVolume` nadal posiada realnego consumera.

Nie usuwać wartościowych historycznych/reference narzędzi tylko dlatego, że przestały być produkcyjne.

SDF może pozostać w debug comparison harness, design documentation lub benchmark/reference tooling, jeżeli nadal daje wartość.

Nie utrzymywać jednak dwóch produkcyjnych spatial representations.

## 18. Downstream contracts / unblockers

Ten plan ma zakończyć okres, w którym inne systemy są blokowane przez niestabilny cave representation.

Po zakończeniu `world-terrain-019` downstream plany powinny konsumować production cave contracts bez wiedzy o SDF/heightfield internals.

### Fauna

`fauna-019-real-cave-habitats-and-animal-home-navigation.md` powinien zostać przepięty na `world-terrain-019`.

Potrzebuje stable cave identity, interior home location, floor/containment queries, entrance oraz transition semantics między interior i surface.

Fauna nie może analizować cave mesh ani tworzyć własnego cave navigation representation.

### Quests

`quests-progression-008-treasure-map-bear-cave.md` powinien konsumować stable cave identity/world location oraz representation-neutral interior placement contract.

Quest nie może tworzyć quest-specific cave, duplikować cave coordinates, spawnować własnej cave geometry ani utrzymywać własnego cave state.

### Loot / items

Pierwszy cave treasure może zostać zrealizowany przez istniejący quest/container system.

Ten plan nie tworzy generic cave loot manager.

Powinien jednak dostarczyć deterministic placement contract umożliwiający umieszczenie treasure casket, world items i późniejszych resource nodes w realnym walkable cave interior.

### NPC

`npc-027-spatial-context-and-cave-traversal.md` powinien również zależeć od stabilnego cave spatial API zamiast od konkretnej reprezentacji.

## 19. Relacja do fauna / loot / quests

Ten plan NIE implementuje bezpośrednio:

- cave fauna behaviour,
- bear AI,
- persistent animal occupants,
- treasure quest,
- quest rewards,
- generic procedural cave loot.

Jest jednak wymaganym foundation dla tych systemów.

Naturalny downstream ciąg:

```text
world-terrain-019
        ↓
fauna-019
        ↓
quests-progression-008
```

`fauna-018` pozostaje odpowiedzialne za persistent habitat occupants i może być realizowane niezależnie tam, gdzie jego kontrakt nie wymaga finished cave traversal.

## 20. Persistence

Nie serializować danych całkowicie pochodnych z:

```text
world seed + stable cave identity
```

Nie zapisywać heightfield grid, `floorY`/`ceilingY` arrays, mesh, colliders, streaming state ani deterministic interior locations.

Persistence caves powinna obejmować wyłącznie niederywowalny gameplay state, jeśli istnieje lub zostanie dodany przez inne systemy, np. discovery state, loot/container state, persistent fauna state i quest progression.

Te stany pozostają własnością odpowiednich systemów.

## 21. Non-goals

Nie implementować w tym planie:

- richer procedural topology,
- 2–3 room generation expansion,
- large cave networks,
- loops,
- multiple entrances,
- multi-level same-XZ caves,
- true volumetric overhangs,
- vertical shafts,
- cave fauna behaviour,
- cave-specific NPC AI,
- generic cave loot generation,
- quests,
- cave water,
- procedural stalactites/stalagmites system,
- advanced cave lighting,
- broad material/shader redesign,
- global voxel terrain,
- full navmesh system,
- multiplayer synchronization.

## 22. Performance guardrails

Nie optymalizować bezmyślnie kosztem jakości.

Jednocześnie nie traktować heightfield headroom jako darmowego budżetu na dowolną liczbę nowych efektów.

Preferować:

- one-time deterministic generation,
- compact typed spatial data,
- lazy presentation,
- low per-frame query cost,
- minimal draw calls,
- brak per-frame geometry rebuilds,
- brak mesh scanning przez downstream systems.

Każde większe zwiększenie geometry complexity powinno mieć konkretną korzyść wizualną/gameplayową.

## 23. Milestone handoff contract

Po KAŻDYM milestone:

1. zakończyć wyłącznie jego scope;
2. uruchomić relevant targeted tests oraz repo-standard technical checks wymagane przez dotknięty zakres;
3. zaktualizować `docs/plans/implementation-notes/world-terrain-019-cave-heightfield-production-migration-implementation-notes.md` o:
   - faktycznie zaimplementowany zakres,
   - ważne pliki i symbole,
   - ownership i lifecycle,
   - podjęte decyzje architektoniczne,
   - odchylenia od planu,
   - ryzyka/otwarte kwestie dla następnego milestone,
   - minimalny focused recon potrzebny następnemu agentowi;
4. dodać JSDoc do ważnych nowych shared/public architectural APIs tam, gdzie pomaga to późniejszemu preflight discovery; użyć `@domain world-terrain` tam, gdzie właściwe;
5. zrobić git commit i push do `main`, rebase jeżeli trzeba;
6. NIE rozpoczynać następnego milestone.

Celem handoffu jest umożliwienie użycia innego, potencjalnie tańszego modelu dla następnego etapu bez ponownego szerokiego reconu.

## 24. Automated verification

Dodać/zaktualizować targeted tests dla production contracts.

Co najmniej:

### Representation

- deterministic output dla samego cave identity/topology,
- `floorY <= ceilingY`,
- required core clearance,
- passage/chamber dimensions pozostają zgodne z topology,
- shelf podnosi floor zamiast tworzyć floating geometry.

### Entrance

- real open mouth,
- surface/cave transition continuity,
- open-sky semantics,
- brak oczywistego geometry mismatch na granicy, jeśli da się to sprawdzić prostym invariantem.

### Gameplay API

- floor/ceiling sampling,
- containment,
- surface/cave ground selection,
- deterministic semantic interior locations,
- locations znajdują się w walkable interior.

### Lifecycle

- rebuild nie zostawia starego runtime,
- activation/deactivation nie zmienia cave identity/spatial result,
- presentation disposal nie usuwa authoritative cave metadata potrzebnego przez gameplay.

### Regression

- existing player/camera/collision cave tests,
- terrain integration tests,
- world rebuild tests.

Nie tworzyć dużej nowej infrastruktury benchmarkowej.

## 25. Manual verification

Manual browser verification wykonuje User.

Nie wymagać manual browser verification po każdym milestone.

### Po Milestone B

Zweryfikować przede wszystkim:

- wygląd wejścia na realnym world terrain,
- brak dużych holes/seams,
- surface → cave floor continuity,
- cave geometry/chamber quality,
- poprawność wejścia również bez presentation rock framing.

### Po Milestone D

Zweryfikować przede wszystkim:

- movement,
- cave/surface ground selection,
- collision,
- third-person camera,
- streaming/activation/deactivation,
- ponowne wejście,
- world rebuild,
- akceptowalny FPS w normalnej scenie świata.

Milestone A i C nie wymagają osobnego browser pass, jeśli ich zakres jest pokryty technical verification.

Milestone E wymaga ponownego browser regression tylko wtedy, gdy cleanup dotknie runtime behaviour.

## 26. Dokumentacja i zamknięcie poprzednich planów

`world-terrain-007`, `world-terrain-008` i `world-terrain-018` są już `done`. Downstream cave plans, które wymagają finalnego production cave spatial contract, zależą od tego planu (`world-terrain-019`), nie od zamkniętego 008.

Po successful production migration tego planu:

- zaktualizować `docs/STATE.md` tak, aby heightfield był current production spatial representation;
- usunąć leftover opisy SDF jako production source of truth;
- nie zostawiać równoległego „SDF or heightfield” contractu dla downstream systems.

Nie zmieniać zależności mechanicznie bez sprawdzenia faktycznej potrzeby danego planu.

## 27. Definition of Done

Plan jest zakończony, gdy:

- production caves używają heightfield jako authoritative spatial representation;
- SDF nie jest już production ownerem;
- production presentation pochodzi z heightfield;
- gameplay floor/ceiling/containment queries pochodzą z heightfield/shared cave spatial contract;
- collision/camera korzystają z nowego spatial contract;
- terrain entrance działa z nowym representation;
- streaming/lifecycle pozostają poprawne;
- istnieje shared stable cave API dla downstream systems;
- istnieje representation-neutral deterministic interior location/placement contract;
- `fauna-019` i quest/cave consumers nie potrzebują wiedzy o cave mesh/SDF;
- technical checks przechodzą;
- User wykona wymagane manual browser verification passes;
- V1/V2/spike documentation zostaje uporządkowana.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
