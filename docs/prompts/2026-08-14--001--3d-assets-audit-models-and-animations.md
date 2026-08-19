# Seedvale — 3D Asset Capability & Architecture Audit

**Status:** `done` (2026-08-14)

## Cel

Wykonaj pełny audyt assetów 3D używanych i dostępnych dla projektu Seedvale.

Nie jest to zwykły przegląd modeli.

Chcemy ustalić:

1. jakie możliwości mają obecne modele,2. jakie możliwości dają nowo pobrane asset packi,
3. które assety są wystarczające,
4. które wymagają dodatkowych danych/runtime wrapperów,
5. które należy zastąpić,
6. czego nadal brakuje,
7. czy możemy oprzeć docelowy pipeline 3D Seedvale na spójnym ekosystemie Quaternius,
8. jakie konsekwencje ma to dla:
   - NPC,
   - playera,
   - zwierząt,
   - budynków,
   - physics,
   - collision,
   - animacji,
   - interakcji,
   - przyszłego pathfindingu,
   - proceduralnego świata.

### Ważne

**Nie implementuj zmian gameplayowych ani migracji.**

Ten task ma zakończyć się dokumentem audytu i rekomendacją.

Jeżeli znajdziesz problemy w kodzie, opisz je jako findings — nie naprawiaj ich.

---

# 1. Repozytorium

Repozytorium:

https://github.com/jm-sky/seedvale

Przed analizą zapoznaj się z:

- `CLAUDE.md`
- `docs/STATE.md`
- `docs/plans/README.md`
- `ROADMAP.md`
- dokumentem Vision projektu
- `docs/plans/`
- aktualnym systemem asset loading
- systemem GLTF/GLB
- systemem animacji
- systemem anchorów/socketów
- systemem NPC
- systemem animals/fauna
- systemem physics/collision
- planem `097` i jego implementation notes

W szczególności:

- `2026-08-13--097--physics-falling-collisions-jumping.md`
- `2026-08-13--097--physics-falling-collisions-jumping-implementation-notes.md`

Repozytorium jest source of truth.

Nie zakładaj, że dokumentacja opisuje dokładnie aktualny stan kodu.

---

# 2. Problem, który uruchomił audyt

Obecnie NPC mogą zostać zamknięci wewnątrz domów.

Powód może być związany z tym, że obecne modele budynków nie mają prawdziwie zdefiniowanych wejść/drzwi, podczas gdy physics/collision traktuje budynek jako przeszkodę.

Nie chcemy rozwiązywać tego poprzez przypadkowy workaround typu:

- NPC ignoruje collider domu,
- NPC może przechodzić przez ścianę,
- specjalny wyjątek w `NpcAgent`,
- teleportowanie NPC przez ścianę.

Najpierw chcemy wiedzieć, jakie informacje faktycznie znajdują się w assetach.

Dlatego szczególnie dokładnie przeanalizuj:

- drzwi,
- wejścia,
- pivoty,
- bones,
- node'y,
- animacje,
- sockety,
- możliwość stworzenia collision z otworem.

---

# 3. Nowo dostępne asset packi

Do projektu zostały pobrane dodatkowe asset packi Quaternius w katalogu `_temp/Models/Quaternius Models/` (lokalnie, gitignored):

- `Ultimate Nature Pack by Quaternius`
- `Universal Base Characters [Standard]`
- `Universal Animation Library [Standard]`
- `Farm Animals Animated by Quaternius`
- `Textured Stylized Trees - May 2020`
- `Medieval Weapons Pack by Quaternius`
- `Universal Animation Library 2 [Standard]`

Odnajdź ich rzeczywiste lokalizacje w repo/worktree.

Nie zakładaj, że nazwa katalogu odpowiada nazwie packa.

Nie zakładaj również, że wszystkie nowe packi powinny zostać użyte.

Celem jest ich obiektywna ocena.

---

# 4. Zasada audytu

Nie oceniaj assetów tylko na podstawie:

- nazwy pliku,
- nazwy packa,
- screenshotu,
- opisu autora.

Jeżeli to możliwe, analizuj rzeczywistą strukturę GLB/GLTF.

Sprawdzaj:

- scenes
- nodes
- meshes
- skins
- bones
- animations
- materials
- textures
- extras

Dla node sprawdź:

- name
- parent
- type
- position
- rotation
- scale

Dla bone:

- name
- parent
- hierarchy

Dla animation:

- clip name
- duration
- affected nodes/bones

Jeżeli istnieją:

- custom properties,
- extras,
- metadata,
- sockets,
- attachment points,

również je uwzględnij.

Nie zgaduj.

---

# 5. Buildings / Settlement

Przeanalizuj wszystkie istotne budynki.

W szczególności sprawdź:

- `hut_a`
- `hut_b`
- `hut_c`
- `hut_d`
- inne domy
- `storage`
- `market`
- `barracks`
- `temple`
- `towerhouse`
- `towncenter`
- `watchtower`
- `windmill`
- `port`
- `farm`
- `well`
- inne settlement structures.

## 5.1 Drzwi

Dla każdego budynku odpowiedz:

### Czy ma drzwi?

Kategorie:

- YES
- NO
- UNCLEAR

Jeżeli YES:

- ile?
- gdzie?
- jaki node?
- jaki mesh?
- jaki bone?
- jaki pivot?

Sprawdź nazwy podobne do:

- `Door`
- `DoorFrame`
- `DoorPivot`
- `Entrance`
- `Entry`
- `Gate`
- `Opening`

ale nie zakładaj tych nazw.

Podaj rzeczywiste nazwy.

## 5.2 Czy drzwi są faktycznie przechodnie?

Sprawdź:

1. Czy ściana ma rzeczywisty otwór?
2. Czy drzwi są tylko wizualnym meshem?
3. Czy drzwi są częścią jednego statycznego mesha?
4. Czy można przejść przez miejsce drzwi?
5. Czy można wyznaczyć entrance position?
6. Czy można wyznaczyć entrance direction?
7. Czy można wyznaczyć entrance width?

Zaklasyfikuj budynek:

### A — Gameplay-ready

Posiada:

- rzeczywisty otwór,
- drzwi,
- sensowny node/bone,
- pivot,
- możliwość animowania,
- jednoznaczne wejście.

### B — Geometry-ready

Posiada rzeczywisty otwór/entrance, ale np.:

- drzwi są statyczne,
- brak animacji,
- brak socketu.

### C — Static visual only

Drzwi wyglądają jak drzwi, ale:

- brak otworu,
- brak możliwości przejścia,
- są częścią statycznej geometrii.

### D — No door

Brak drzwi / brak jednoznacznego wejścia.

---

# 6. Door animations

Jeżeli budynek posiada drzwi:

Sprawdź wszystkie animation clips.

Szczególnie:

- open
- close
- opening
- closing
- idle
- locked
- unlock
- latch

Podaj:

- clip name
- duration
- affected node/bone

Jeżeli drzwi nie mają animacji, ale posiadają sensowny pivot:

oznacz:

`ANIMATABLE AT RUNTIME`

Jeżeli nie mają ani animacji, ani sensownego pivotu:

oznacz:

`NOT ANIMATABLE WITHOUT ASSET MODIFICATION`

---

# 7. Building sockets / anchors

Sprawdź, czy budynki posiadają:

- entrance socket,
- door socket,
- interaction point,
- interior point,
- exterior point,
- lamp socket,
- other useful anchors.

Nie zakładaj nazw.

Podaj rzeczywiste nazwy.

Sprawdź również istniejące Seedvale metadata/anchor definitions i oceń, czy są zgodne z assetami.

---

# 8. Player / NPC

Przeanalizuj wszystkie aktualnie używane modele:

- player/hero
- NPC
- warianty NPC
- modele męskie
- modele żeńskie
- inne humanoidy.

## 8.1 Skeleton

Dla każdego sprawdź:

- root
- hips/pelvis
- spine
- chest
- neck
- head
- shoulders
- arms
- hands
- legs
- feet

Podaj rzeczywiste bone names.

---

# 9. Humanoid sockets

Sprawdź możliwość wykorzystania:

- `hand.left`
- `hand.right`
- `head`
- `chest`
- `back`
- `hip`
- `foot.left`
- `foot.right`

Nie zakładaj tych nazw.

Podaj:

- actual node/bone
- possible semantic role

Obecny Seedvale anchor/socket system również należy porównać z rzeczywistą strukturą assetów.

---

# 10. Player/NPC animations

Wypisz wszystkie rzeczywiste animation clip names.

Następnie pogrupuj je funkcjonalnie.

## Locomotion

- idle
- walk
- run
- jog
- sprint
- strafe
- backward
- turning
- start
- stop

## Physics

- jump
- fall
- land
- stumble
- knockdown
- get up

## Daily life

- sit
- sleep
- wake
- eat
- drink
- talk
- gesture

## Work

- chop
- mine
- farm
- harvest
- fish
- dig
- build
- carry
- craft
- use tool

## Interaction

- pickup
- inspect
- use
- open
- close
- push
- pull

## Combat

- attack
- block
- dodge
- hit
- death

## Other

Wszystko istotne dla Seedvale.

Dla każdej kategorii:

- AVAILABLE
- PARTIALLY AVAILABLE
- MISSING

---

# 11. Universal Base Characters

To jeden z najważniejszych elementów nowego audytu.

Przeanalizuj:

`Universal Base Characters [Standard]`

Sprawdź:

- liczbę bazowych postaci,
- płeć,
- proporcje,
- sylwetki,
- twarze,
- włosy,
- modularność,
- skeleton,
- bone hierarchy,
- bone naming,
- attachment points,
- scale,
- orientation,
- compatibility z Universal Animation Library.

Porównaj z obecnymi modelami NPC/player.

Odpowiedz:

> Czy Universal Base Characters powinny stać się docelową bazą humanoidalnych postaci Seedvale?

Jeżeli tak:

- dlaczego,
- co zyskujemy,
- co tracimy,
- co trzeba zmigrować,
- czy obecne NPC można zachować,
- czy player powinien używać tego samego systemu.

Nie implementuj migracji.

---

# 12. Universal Animation Library 1 + 2

Przeanalizuj:

- `Universal Animation Library [Standard]`
- `Universal Animation Library 2 [Standard]`

Traktuj je jako potencjalny wspólny system animacji.

Wypisz rzeczywiste clip names.

Pogrupuj:

## Locomotion

- idle
- walk
- run
- sprint
- strafe
- backward
- turn
- start/stop

## Physics

- jump
- fall
- land
- stumble
- knockdown

## Daily life

- sit
- sleep
- wake
- eat
- drink
- talk
- gestures

## Work

- chop
- mine
- farm
- harvest
- fishing
- dig
- build
- carry
- craft

## Combat

- attack
- block
- dodge
- hit
- death

## Other

Wszystko istotne dla Seedvale.

Dla każdej kategorii:

- AVAILABLE
- PARTIALLY AVAILABLE
- MISSING

---

# 13. Animation retargeting

To jest bardzo ważne.

Sprawdź, czy:

`Universal Base Characters + Universal Animation Library`

rzeczywiście mogą działać razem.

Zweryfikuj:

- skeleton compatibility,
- bone naming,
- hierarchy,
- scale,
- root motion,
- orientation,
- animation rest pose,
- wymagania retargetingu.

Jeżeli wymagany jest preprocessing, opisz dokładnie jaki.

Oceń również zgodność z obecnym Three.js pipeline.

---

# 14. Czy Quaternius może być głównym ekosystemem?

Na podstawie audytu odpowiedz:

> Czy większość 3D asset pipeline Seedvale może być oparta na spójnym ekosystemie Quaternius?

Rozważ:

- Characters
- Animations
- Animals
- Nature
- Trees
- Weapons
- Props
- Buildings

Nie zakładaj odpowiedzi.

Uzasadnij ją technicznie.

---

# 15. Farm Animals Animated

Przeanalizuj:

`Farm Animals Animated by Quaternius`

Porównaj z obecnymi zwierzętami Seedvale.

W szczególności:

- chicken
- cow
- sheep
- horse
- donkey
- inne livestock.

Dla każdego:

- mesh
- skeleton
- bones
- animations
- clip names
- locomotion
- idle
- eat
- drink
- graze
- attack
- flee
- hit
- death
- sleep
- lay/sit
- jump
- other.

Porównaj:

`CURRENT vs NEW PACK`

Określ:

- KEEP CURRENT
- REPLACE
- MERGE
- SUPPLEMENT

---

# 16. Wild animals

Przeanalizuj również obecne zwierzęta dzikie:

- deer
- stag
- fox
- wolf
- inne.

Sprawdź, czy nowo dostępne packi zawierają lepsze odpowiedniki.

Jeżeli nie:

określ, czy obecne modele powinny zostać.

Nie proponuj przypadkowych assetów tylko po to, aby zwiększyć liczbę modeli.

---

# 17. Ultimate Nature Pack

Przeanalizuj:

`Ultimate Nature Pack by Quaternius`

Sprawdź:

- vegetation
- grass
- flowers
- plants
- bushes
- mushrooms
- rocks
- stones
- natural props
- inne elementy środowiska.

Porównaj z obecnym Seedvale.

Oceń:

- visual style,
- polycount,
- variety,
- materials,
- textures,
- scale,
- pivot,
- procedural placement,
- LOD,
- memory,
- rendering cost.

Szczególnie ważne:

> Czy pack nadaje się do dużego proceduralnego świata Seedvale?

---

# 18. Textured Stylized Trees

Przeanalizuj:

`Textured Stylized Trees - May 2020`

Sprawdź:

- gatunki drzew,
- warianty,
- polycount,
- materiały,
- tekstury,
- pivot,
- scale,
- LOD,
- collision,
- możliwość skalowania,
- możliwość proceduralnego rozmieszczania.

Porównaj z obecnymi drzewami Seedvale.

Odpowiedz:

> Czy powinny zastąpić obecne drzewa, czy być dodatkową biblioteką?

---

# 19. Medieval Weapons

Przeanalizuj:

`Medieval Weapons Pack by Quaternius`

Sprawdź:

- miecze,
- topory,
- łuki,
- włócznie,
- tarcze,
- inne bronie/tools.

Dla każdego:

- node structure,
- pivot,
- orientation,
- scale,
- grip point,
- possible attachment point.

Sprawdź użycie z:

- `hand.right`
- `hand.left`

oraz przyszłym:

- combat,
- professions,
- tools,
- NPC equipment,
- crafting.

---

# 20. Props / interactive objects

Przeanalizuj istniejące i nowe:

- doors
- gates
- well
- campfire
- torch
- lantern
- chest/storage
- furniture
- tools
- other interactive props.

Sprawdź:

- nodes
- pivot
- bones
- animations
- interaction points
- sockets
- orientation.

---

# 21. Cross-pack compatibility

To jedna z najważniejszych części audytu.

Zweryfikuj, czy:

- Universal Base Characters
- Universal Animation Library 1
- Universal Animation Library 2
- Medieval Weapons
- Farm Animals
- Ultimate Nature
- Trees

tworzą spójny pipeline.

Sprawdź:

- skeleton compatibility,
- naming,
- scale,
- orientation,
- coordinate system,
- animation retargeting,
- visual style,
- materials,
- texture style.

Nie zakładaj kompatybilności tylko dlatego, że assety mają tego samego autora.

---

# 22. Asset capability matrix

Przygotuj zbiorczą tabelę:

| Asset | Category | Mesh | Skeleton | Bones | Animations | Socket | Pivot | Interaction | Gameplay Ready |
|---|---|---|---|---|---|---|---|---|---|

Dla ważnych assetów dodatkowo:

| Asset | Current | New Candidate | Recommendation | Reason |
|---|---|---|---|---|

---

# 23. Buildings matrix

| Asset | Door | Opening | Door Node | Door Bone | Pivot | Open/Close | Entrance | Socket | Classification |
|---|---|---|---|---|---|---|---|---|---|

---

# 24. Character matrix

| Asset | Skeleton | Key Bones | Sockets | Locomotion | Physics | Daily Life | Work | Combat | Missing |
|---|---|---|---|---|---|---|---|---|---|

---

# 25. Animal matrix

| Animal | Skeleton | Idle | Walk | Run | Eat | Drink | Attack | Flee | Hit | Death | Missing |
|---|---|---|---|---|---|---|---|---|---|---|---|

---

# 26. Missing capabilities

Zidentyfikuj brakujące możliwości.

Podziel je na:

## Critical

Bez nich systemy Seedvale nie mogą działać poprawnie.

## Important

Potrzebne w najbliższej przyszłości.

## Nice to have

Nie blokują rozwoju.

Przykłady:

- Building entrance
- Door animation
- NPC sleep animation
- NPC work animations
- Animal eating
- Animal drinking
- Character hand socket
- Weapon grip

---

# 27. Replacement candidates

Jeżeli istnieją lepsze assety:

`CURRENT ASSET → PROBLEM → CANDIDATE → BENEFIT → COST / RISK → RECOMMENDATION`

Nie zakładaj, że nowszy asset zawsze jest lepszy.

---

# 28. Docelowa architektura assetów

Zaproponuj docelową strukturę:

Seedvale Asset Library

- Characters
  - Base
  - Hair
  - Faces
  - Outfits
  - Equipment
- Animations
  - Locomotion
  - Daily Life
  - Work
  - Combat
  - Physics
- Animals
  - Livestock
  - Wildlife
- Buildings
- Nature
- Trees
- Props
- Tools
- Weapons
- Effects

Wskaż, które elementy obecnie istnieją, które powinny zostać zastąpione i których brakuje.

---

# 29. NPC diversity

Osobno oceń, czy obecna biblioteka modeli wystarcza do stworzenia zróżnicowanej populacji NPC.

Nie chodzi o liczbę osobnych GLB.

Rozważ:

- Base Character
- Gender
- Body
- Age
- Hair
- Face
- Outfit
- Colors
- Profession
- Equipment

Odpowiedz:

> Czy możemy wygenerować dziesiątki/setki wystarczająco różnych NPC z modularnego systemu?

Jeżeli nie:

- czego brakuje,
- jakie assety należy dodać,
- czy Quaternius wystarczy,
- czy potrzebujemy dodatkowego źródła.

---

# 30. Player vs NPC

Oceń, czy player i NPC powinni docelowo używać:

`SAME CHARACTER SYSTEM`

czy:

`SEPARATE CHARACTER SYSTEMS`

Uzasadnij.

Preferowane rozwiązanie powinno minimalizować:

- duplicate skeletons,
- duplicate animation systems,
- duplicate socket systems,
- duplicate loaders.

---

# 31. Physics / Collision implications

Na podstawie assetów oceń wpływ na physics.

Szczególnie:

## Buildings

Czy możemy stworzyć:

`wall collision + door opening + entrance`

bez specjalnych wyjątków dla NPC?

## Characters

Czy możemy zdefiniować:

- hand
- head
- feet
- interaction points

na podstawie assetu?

## Animals

Czy różne rozmiary/sylwetki wymagają różnych collision shapes?

## Props

Czy pivot/orientation pozwala poprawnie tworzyć interakcje?

Nie implementuj.

Tylko oceń.

---

# 32. NPC navigation implications

Szczególnie dla budynków oceń:

`House → Entrance → Exterior point / Interior point`

Czy asset umożliwia wiarygodne określenie tych punktów?

Czy późniejszy pathfinding może traktować entrance jako portal?

Nie implementuj pathfindingu.

---

# 33. Findings

Każdy istotny problem opisz:

FINDING-001

Title:
Asset:
Problem:
Evidence:
Impact:
Recommendation:

Priorytet:

- CRITICAL
- HIGH
- MEDIUM
- LOW

---

# 34. Rekomendacja migracji

Jeżeli nowe assety są wyraźnie lepsze, zaproponuj kolejność migracji.

Uwzględnij zależności.

Nie zakładaj z góry kolejności.

---

# 35. Najważniejsze pytania końcowe

## Buildings

1. Czy każdy typ domu ma drzwi?
2. Czy drzwi są osobnym node/bone?
3. Czy mają pivot?
4. Czy mają animacje?
5. Czy istnieje rzeczywisty otwór?
6. Czy można określić entrance position?
7. Czy można określić entrance direction?
8. Czy można stworzyć collision z otworem?
9. Czy player i NPC mogą korzystać z tego samego entrance?

## Characters

10. Czy obecne modele NPC są wystarczające?
11. Czy Universal Base Characters są lepszą bazą?
12. Czy player i NPC powinni używać tego samego systemu?
13. Jakie kluczowe animacje mamy?
14. Jakich brakuje?
15. Jakie sockety mamy?
16. Jakich brakuje?

## Animals

17. Czy obecne zwierzęta są wystarczające?
18. Czy Farm Animals Animated powinny je zastąpić?
19. Jakich animacji brakuje?
20. Czy wildlife wymaga dodatkowych assetów?

## Ecosystem

21. Czy Quaternius może być głównym źródłem assetów Seedvale?
22. Co nadal wymaga zewnętrznych assetów?
23. Czy potrzebujemy więcej modeli NPC?
24. Jeśli tak — jakiego rodzaju?
25. Czy potrzebujemy dodatkowego asset packa?
26. Czy obecne assety powinny zostać zastąpione, czy tylko rozszerzone?

---

# 36. Decision

Na samym końcu przedstaw krótką decyzję:

RECOMMENDATION

Characters:
...

Animations:
...

Animals:
...

Buildings:
...

Nature:
...

Trees:
...

Weapons:
...

Additional sources needed:
...

Immediate next step:
...

---

# 37. Output

Utwórz:

`docs/plans/archive/2026-08-14--asset-audit-3d-models.md`

Dokument ma być samodzielnym artefaktem projektowym.

Nie modyfikuj gameplayu.

Nie implementuj migracji.

Nie dodawaj workaroundów.

Nie zmieniaj physics.

Nie zmieniaj NPC AI.

Nie dodawaj nowych dependency.

Najważniejsze jest uzyskanie rzetelnego obrazu możliwości obecnych i nowych assetów oraz decyzji, jaki powinien być docelowy 3D asset pipeline Seedvale.

## Definition of Done

Audit jest ukończony, jeżeli na podstawie dokumentu można bez zgadywania odpowiedzieć:

- jakie modele mamy,
- co potrafią,
- jakie mają node/bone/socket,
- jakie mają animacje,
- które drzwi są rzeczywiste,
- które drzwi są tylko wizualne,
- które modele można animować,
- jakie są możliwości NPC,
- jakie są możliwości zwierząt,
- jakie możliwości dają nowe packi Quaternius,
- co należy zachować,
- co zastąpić,
- czego brakuje,
- oraz jaki powinien być kolejny krok.
