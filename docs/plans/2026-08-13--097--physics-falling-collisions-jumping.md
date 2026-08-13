# Plan: Fizyka — opadanie przedmiotów, kolizje, skok

**Status:** `in progress` 🔄 — faza 2.1 zaimplementowana (2026-08-13), technicznie zweryfikowana; 2.2/2.3 nie rozpoczęte.
**Created:** 2026-08-13
**Priority:** 🟡 medium · **Effort:** XL (trzy fazy: 2.1 `S`, 2.2 `L`, 2.3 `M`) · **Depends on:** —
**Źródło:** rozmowa 2026-08-13 przy researchu [009 — jaskinie podziemne](../research/2026-08-13--009--underground-caves.md); potrzeba `clampToVolume` w jaskini to ten sam brakujący fundament co kolizje w świecie.

> **Kolejność:** research 009 §11.4 rekomenduje, żeby **ten plan szedł przed jaskiniami**. Jaskinie są pierwszym poważnym konsumentem kolizji; jeśli powstaną wcześniej, dostaną tymczasowy własny `clampToVolume`, który potem trzeba będzie usunąć.

> Zakres i decyzje zamknięte 2026-08-13 (sekcja 4). Fazy, kryteria akceptacji, dotknięte pliki i assety — sekcja 6.

---

## 1. Stan faktyczny (✅ zweryfikowane w kodzie, 2026-08-13)

- **Zero biblioteki fizycznej** — brak `cannon` / `rapier` / `ammo` w `package.json` i w `src/`.
- **Przedmioty nie spadają** — upuszczony item jest od razu przyklejany do gruntu: `placeOnGround(mesh, item.x, item.z, sampleHeight)` (`src/items/createDroppedItems.ts:41`).
- **Gracz nie ma grawitacji ani skoku** — ruch czysto kinematyczny (`mesh.position.x/z += wish`), Y co klatkę z `snapToGround()` → `sampleHeight(x,z)`, z opadaniem do `sampleFloor` w wodzie (`src/player/PlayerController.ts:316-348, 405-417`, `MAX_SWIM_DEPTH`).
- **Zero kolizji ze ścianami/propsami w całym repo.** Jedyne istniejące „przeszkody” to koła w logice AI: `WELL_COLLISION_RADIUS` (`src/ai/NpcAgent.ts:82-85, 1207-1250`) i `isWithinVillageRadius` (`src/fauna/AnimalAgent.ts:132-138`). Raycaster w `src/settlement/props.ts:536-558` służy tylko do montażu propsów na ścianie, nie do kolizji runtime.
- **NPC i zwierzęta** też stawiają Y wyłącznie z `sampleHeight` — cokolwiek zrobimy z grawitacją gracza, dotyczy na razie tylko gracza.
- **Sampler wysokości jest wymienialny** — `setGround()` podmienia `sampleHeight` / `sampleFloor` / `waterLevel` (`PlayerController.ts:98-107, 226-235`). To jest seam, przez który wchodzi zarówno jaskinia, jak i ewentualne „stoję na obiekcie, nie na terenie”.

**Wniosek:** blockerem nie jest integrator ruchu (to kilkanaście linii), tylko **brak jakiejkolwiek geometrii kolizyjnej w świecie** — nie ma z czym kolidować.

---

## 2. Zakres — trzy warstwy, świadomie rozdzielone

Warstwy są niezależne i rosną w koszcie. Można zrobić 2.1 bez 2.2, i 2.3 bez pełnego 2.2.

### 2.1 Opadanie przedmiotów (tanie, lokalne)

Przedmiot upuszczony/wyrzucony leci po łuku i ląduje na terenie.

- Stan per drop: `vy` (+ opcjonalnie `vx/vz` przy wyrzuceniu), integracja `vy -= g*dt`, koniec gdy `y <= sampleHeight(x,z)`.
- Zamknięte w `src/items/createDroppedItems.ts` — reszta świata się nie zmienia.
- Tylko spadające itemy są tickowane; wylądowane wracają do dzisiejszego stanu „przyklejone”, więc koszt stały ≈ 0.
- Bez odbić, bez toczenia, bez stosów w v1.
- **Koszt:** CPU pomijalny (kilkanaście–kilkadziesiąt obiektów × jedno `sampleHeight`), GPU zero.

### 2.2 Kolizje (drogie, architektoniczne)

Największa część, i to ona decyduje o rozmiarze planu.

- Świat nie ma dziś ciał kolizyjnych. Trzeba zdecydować, **skąd** się biorą: analityczne prymitywy przypisane do propsów (cylinder/AABB/kapsuła per drzewo, skała, budynek), czy geometria.
- Rekomendacja wstępna (spójna z researchem 009): **analityczne prymitywy z danych, które i tak już mamy** (pozycja + promień propa), a nie raycast o mesh. Rozwiązanie w stylu „najbliższy prymityw wygrywa, wypchnij pozycję” skaluje się i nie wymaga physics engine ani BVH.
- Potrzebny indeks przestrzenny (grid per chunk), inaczej kolizja staje się O(n) po wszystkich propsach.
- Otwarte, czy dotyczy tylko gracza, czy też NPC/zwierząt (dziś przechodzą przez wszystko i nikomu to nie przeszkadza).
- **Powiązanie:** `clampToVolume` z researchu 009 (jaskinie) to szczególny przypadek tej samej abstrakcji — nie budować dwóch niezależnych mechanizmów.

### 2.3 Skok

- Wymaga stanu pionowego gracza (`vy`, `grounded`) i przejścia `snapToGround` z „ustaw Y” na „ustaw Y, chyba że jesteś w powietrzu”.
- Dotyka: animacji (brak klipu skoku?), kamery, pływania (`MAX_SWIM_DEPTH`), dźwięku kroków/lądowania, wchodzenia na strome zbocza.
- Bez 2.2 skok nie daje pełnej wartości (nie ma na co wskakiwać poza teren), ale jest samodzielnie grywalny.

---

## 3. Koszt wydajnościowy (wstępna ocena, 🟡)

| Warstwa | CPU | GPU | Uwaga |
|---|---|---|---|
| 2.1 opadanie | pomijalny | zero | tickowane tylko obiekty w locie |
| 2.2 kolizje | zależy od indeksu przestrzennego | zero | bez grida per chunk — realne ryzyko; z gridem — tanie |
| 2.3 skok | pomijalny | zero | jeden dodatkowy stan na gracza |
| pełny silnik fizyki (Rapier/Cannon) | udźwignąłby setki ciał | zero | ~0.5 MB wasm + nowy model świata; **nie jest to problem wydajności, tylko architektury** |

Zgodnie z [performance-and-workers.md](../architecture/performance-and-workers.md): to jest praca wymagająca rozdzielczości klatkowej, więc **nie** kandyduje do workera.

---

## 4. Do ustalenia w następnej sesji ❓

1. Czy 2.1 wchodzi osobno i od razu (mały, niezależny zysk), czy całość idzie jednym planem?

> -> Najpierw 2.1

2. Skąd biorą się ciała kolizyjne propsów — z katalogu (ręczny promień per model), czy liczone z bounding boxa GLB przy ładowaniu?

> -> Nie wiem, jak lepiej? Liczone i potem zapisane w kodzie per model?

3. Czy kolizje dotyczą NPC/zwierząt, czy tylko gracza?

> -> Gracz, NPC i zwierzęta

4. Czy wchodzimy w bibliotekę fizyki, czy zostajemy przy własnych prymitywach? (Rekomendacja wstępna: własne — patrz 2.2.)

> -> Mżemy zrobić sami, jeżeli nie skończy się ciągłymi błędami i poprawkami.

5. Czy skok ma mieć animację i czy istnieje klip w rigu gracza.

> -> Byłoby miło. Jeżeli nie ma animacji, to zmienimy model gracza.

> -> ✅ zweryfikowane w kodzie (2026-08-13): **żaden klip skoku nie istnieje** — ani w `Adventurer.glb` (gracz), ani w żadnym z pozostałych 8 modeli w `public/models/characters/` (wszystkie to ta sama paczka Quaternius Ultimate Modular Men, identyczny zestaw 24 klipów: `Idle, Idle_Neutral, Walk, Run, Run_Back, Run_Left, Run_Right, Roll, Interact, Wave, Death, HitRecieve, HitRecieve_2, Punch_Left, Punch_Right, Kick_Left, Kick_Right, Sword_Slash, Idle_Sword, Gun_Shoot, Idle_Gun, Idle_Gun_Pointing, Idle_Gun_Shoot, Run_Shoot`). Zmiana modelu gracza **nie rozwiąże tego w obrębie obecnej biblioteki postaci** — trzeba by sprowadzić inny pakiet/rig, co jest osobnym, większym zadaniem (nowy szkielet ≠ nowy plik GLB w tym samym rigu). **Rekomendacja: v1 skoku bez dedykowanego klipu** — reużyć istniejący trik proceduralny (patrz `CROUCH_ROTATION_X`/`CROUCH_Y_OFFSET` w `PlayerController.ts` — przysiad przez `rotation.x`/`position.y` na `modelRoot`, bez klipu) do krótkiego przysiadu przed odbiciem i/lub przechylenia w locie, zamiast blokować fazę 2.3 na nowym assecie. Wymiana rigu zostaje osobnym, przyszłym tematem, jeśli okaże się warta kosztu.

6. ~~Jak to spina się z `CaveVolume` / `clampToVolume` z researchu 009~~ → **rozstrzygnięte 2026-08-13**: wspólna abstrakcja, ten plan idzie pierwszy. Ściany jaskini to statyczne ciała w tym systemie; graf jaskini zostaje wyłącznie jako źródło mesha, sitingu i navmeshu dla zwierzęcia (research 009 §11.4). Konsekwencja dla 2.2: kolizja musi obsłużyć **wnętrze** (wypchnięcie do środka objętości), nie tylko **omijanie** propsów z zewnątrz.

7. Czy fizyka ma dotyczyć rzucania przedmiotami (nowa mechanika) czy tylko upuszczania (istniejąca).

> -> Na razie tylko upuszczanie.


## 5. Poza zakresem (na teraz)

Odbicia, toczenie, stosy przedmiotów, ragdolle, niszczenie obiektów, fizyka wody/pływalności, pojazdy.

## 6. Fazy, kryteria, pliki, assety

Kolejność fazy = kolejność implementacji (potwierdzone pytanie 1: 2.1 osobno i pierwsze). 2.2 zależy tylko od 2.1 tematycznie, nie technicznie — może iść niezależnie, ale idzie po 2.1 bo 2.1 jest tani i daje szybki zysk. 2.3 zależy funkcjonalnie od 2.2 (skok bez kolizji jest grywalny, ale nie ma na co wskakiwać — patrz §2.3).

### Faza 2.1 — Opadanie przedmiotów (Effort: S)

**Status:** `verification needed` 🔍 — zaimplementowane 2026-08-13, techniczne checki
zielone; manualna weryfikacja w przeglądarce (patrz sekcja „Weryfikacja”, punkt 1) czeka na usera.

**Zakres doprecyzowany:** dziś `drop()` (`createDroppedItems.ts:53-57`) zawsze stawia item bezpośrednio na `sampleHeight(x,z)` — nie ma osobnej mechaniki „rzutu” (potwierdzone pytanie 7: tylko upuszczanie). Oba wywołania (`gameLoop.ts:513`, `createApp.ts:291,544`, `digAction.ts:49`) liczą x/z wokół gracza i nie przekazują wysokości. „Opadanie” w tym planie = item startuje na wysokości dłoni/pasa gracza i **spada pionowo** (grawitacja, `vy` startowe = 0, bez `vx/vz` — brak celowania/rzutu), zamiast dzisiejszego teleportu na grunt. To spójne z odpowiedzią 7 i nie wymaga nowego inputu ani UI.

- Rozszerzyć `DroppedItem` o `y: number` i opcjonalny stan lotu (np. osobna mapa `falling: Map<string, { vy: number }>` w `createDroppedItems.ts`, nie w publicznym typie — public `DroppedItem` zostaje pozycją spoczynkową, żeby save/schema się nie zmieniły).
- `drop()`: startowe `y = sampleHeight(x,z) + DROP_SPAWN_HEIGHT` (stała, ~0.9m — wysokość dłoni), `vy = 0`, dodać do `falling`.
- Nowa metoda `tick(dt)` (wołana z `gameLoop.ts` obok innych `bundle.*.update`): dla każdego lecącego itemu `vy -= GRAVITY*dt; y += vy*dt`; gdy `y <= sampleHeight(x,z)` → `y = sampleHeight(x,z)`, usunąć z `falling` (wraca do stanu „stoi”, koszt 0 jak dziś).
- `placeOnGround` (`props.ts:175-189`) już ma `yOffset` — `spawnMesh` może go użyć raz przy starcie (`yOffset = DROP_SPAWN_HEIGHT`); podczas lotu `tick()` ustawia `mesh.position.y` bezpośrednio (nie przez `placeOnGround` ponownie), bo Y w locie jest sterowane fizyką, nie offsetem od gruntu.
- Save/load (`persistence/saveData.ts` / `saveDb.ts`): sprawdzić `createApp.ts:451` (`droppedItems.nodes()` do zapisu). Item złapany w locie w momencie zapisu powinien po wczytaniu **wznowić spadanie** z zapisanej wysokości, nie teleportować się — więc `y` (i opcjonalnie `vy`) muszą wejść do zapisywanego rekordu, nie tylko `x/z`. Do ustalenia przy implementacji: czy `vy` warto zapisywać, czy przy load wystarczy `vy = 0` (niezauważalna różnica przy locie <1s).

**Kryteria akceptacji:**
- Upuszczenie (`G`) itemu: widać krótki spadek łukiem/pionowo zamiast natychmiastowego pojawienia się na ziemi.
- Item po wylądowaniu zachowuje się identycznie jak dziś (pickup, brak dodatkowego ticka, brak regresji w `interactables.ts`).
- Save→reload podczas lotu nie gubi itemu ani nie zostawia go zawieszonego w powietrzu.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` przechodzą.

**Dotknięte pliki:** `src/items/createDroppedItems.ts`, `src/settlement/props.ts` (`placeOnGround`), `src/app/gameLoop.ts` (nowy tick), `src/persistence/saveData.ts` (+ ewentualnie `saveDb.ts` jeśli schema/migracja).

---

### Faza 2.2 — Kolizje (Effort: L, największa część planu)

**Decyzje zamknięte:** kolizje obejmują gracza, NPC i zwierzęta (pytanie 3); ciała kolizyjne liczone raz i zapisywane per model, nie liczone w locie z bounding boxa GLB (pytanie 2, doprecyzowanie poniżej); własne prymitywy, nie biblioteka fizyki (pytanie 4).

**Skąd biorą się ciała kolizyjne (odpowiedź na pytanie 2):** repo już ma dokładnie takie dane, jakich potrzeba — nie trzeba liczyć bounding boxa GLB w runtime. Trzy istniejące źródła placementu propsów już niosą `x, z, kind/scale`:
- `EnvironmentPlacement` (`terrain/chunkEnvironment.ts:21-34`) — `largeRock`, `rockCluster`, `fallenLog`, `campfire`, `monolith`, `stoneCircle`, `smallRuins`.
- `VegetationPlacement` (`terrain/chunkVegetation.ts:19-34`) — drzewa/krzaki/kaktusy/trzcina (`kind`, `speciesIndex`, `scale`).
- Budynki osad — `HouseCatalogEntry` (`settlement/houseCatalog.ts:25`) ma już per-model metadane (`groundYOffset`, `hasWalls`, `lampStyle`); potrzebuje nowego pola `footprintRadius` (promień kolizyjny, jeden liczbowy parametr per katalogowy model — ręcznie dobrany/zmierzony raz, tak jak `groundYOffset` już jest).
- Studnia ma już ad hoc promień (`WELL_COLLISION_RADIUS` w `ai/NpcAgent.ts:82`) — **migrować do nowego systemu, nie duplikować**; dziś to jedyna "kolizja" w całym repo i żyje w NPC-specyficznym pliku.

Rekomendacja: tabela `Record<EnvironmentKind | VegetationKind, number>` (promień bazowy per `kind`) w nowym module, przemnażana przez `.scale` z placementu przy budowie collidera — bez zmiany istniejących typów `EnvironmentPlacement`/`VegetationPlacement`. Nie każdy `kind` musi kolidować w v1 (np. krzaki/trzcina raczej nie — do ustalenia przy implementacji które `kind` dostają promień >0).

**Indeks przestrzenny:** `chunkManager.ts` ma już `Map<string, ChunkRecord>` keyowaną `chunkKey(coord)` (`chunkManager.ts:355`). Doczepić listę colliderów do rekordu chunku przy jego budowie (razem z `EnvironmentPlacement`/`VegetationPlacement`, które i tak już tam powstają) zamiast osobnego grida. Zapytanie kolizyjne = własny chunk + sąsiedzi (promień entity jest zawsze dużo mniejszy niż rozmiar chunku, więc 3×3 sąsiedztwo wystarcza).

**Prymityw i rozwiązywanie:** okrąg (x, z, promień) na start — najprostszy, wystarcza dla drzew/skał/studni/kloców; budynki jako okrąg opisany (nie AABB) w v1, dokładniejszy kształt to możliwe dociągnięcie później, nie blocker. Nowy moduł, np. `src/world/collision.ts`, eksportuje `resolvePosition(x, z, entityRadius, chunkManager) → { x, z }`: znajduje najgłębszą penetrację wśród colliderów w promieniu zapytania, wypycha pozycję na zewnątrz wzdłuż wektora środek-środek (styl „najbliższy prymityw wygrywa”, zgodnie z §2.2 rekomendacją wstępną).

**Integracja z trzema ruchomymi konsumentami** (każdy dziś liczy `wish`/deltę i przypisuje `position.x/z` bezpośrednio — kolizja wchodzi jako krok pośredni, po delcie, przed przypisaniem):
- Gracz: `PlayerController.update()` (`player/PlayerController.ts:335-341`) — `this.mesh.position.x/z += this.wish.x/z` staje się „policz kandydata, przepuść przez `resolvePosition`, przypisz wynik”.
- NPC: `ai/NpcAgent.ts` — ruch do celu (grep `mesh.position.set`/`+=` w pliku); dziś przechodzi przez wszystko poza `WELL_COLLISION_RADIUS`.
- Zwierzę: `fauna/AnimalAgent.ts` — analogicznie.

To jest praca wymagająca rozdzielczości klatkowej (ruch co klatkę) — zgodnie z [performance-and-workers.md](../architecture/performance-and-workers.md) zostaje na głównym wątku, **nie** kandyduje do workera; ryzyko wydajnościowe jest w liczbie sprawdzanych colliderów, nie w miejscu wykonania — stąd indeks per-chunk jest właściwym zabezpieczeniem, nie worker.

**Poza zakresem 2.2:** wnętrze `CaveVolume` (wypychanie do środka objętości, patrz pytanie 6/§11.4 researchu 009) — ten plan buduje wspólną abstrakcję (`resolvePosition` + rejestr colliderów), żeby jaskinie mogły dorzucić statyczne ściany jako colliderów tego samego typu w swoim planie, ale sam plan jaskiń zostaje osobnym zadaniem.

**Kryteria akceptacji:**
- Gracz nie przechodzi przez drzewo/skałę/dom/studnię — zatrzymuje się lub ślizga wzdłuż przeszkody, bez drgań/utykania w miejscu.
- NPC i zwierzęta też nie przechodzą przez te same przeszkody (osobna weryfikacja w przeglądarce — obserwacja wioski/lasu przez chwilę).
- Brak zauważalnego spadku FPS przy przejściu przez gęsty las/wioskę (indeks per-chunk działa — jeśli scenariusz „O(n) po wszystkich propsach" faktycznie by wystąpił, byłoby to widoczne tu).
- `WELL_COLLISION_RADIUS` usunięty z `NpcAgent.ts`, zastąpiony wpisem w nowym rejestrze — brak dwóch równoległych mechanizmów kolizji.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` przechodzą.

**Dotknięte pliki:** nowy `src/world/collision.ts` (lub podobna lokalizacja), `src/terrain/chunkManager.ts` (rejestr colliderów per chunk), `src/terrain/chunkEnvironment.ts`, `src/terrain/chunkVegetation.ts`, `src/settlement/houseCatalog.ts` (+`props.ts` jeśli promień liczony przy tworzeniu propa), `src/player/PlayerController.ts`, `src/ai/NpcAgent.ts`, `src/fauna/AnimalAgent.ts`.

---

### Faza 2.3 — Skok (Effort: M)

Wymaga stanu pionowego gracza i zmiany `snapToGround` z bezwarunkowego przypisania na integrację, gdy gracz jest w powietrzu.

- `PlayerController`: nowe pola `verticalVelocity` (`vy`), `grounded`. Stałe `GRAVITY`, `JUMP_SPEED` (dobrane z docelowej wysokości skoku, np. `JUMP_SPEED = sqrt(2 * GRAVITY * targetHeight)`, `targetHeight ≈ 0.5–0.7m`).
- `input/Keyboard.ts`: nowy edge-triggered klawisz `jump` (Spacja — wolna, brak konfliktu w `KEY_MAP`), analogicznie do `drop`/`interact` (`consumeJump()`).
- `snapToGround()` (`PlayerController.ts:405-417`) rozdziela się na dwa przypadki:
  - Pozycja docelowa pod wodą (`groundY <= waterLevel`, dzisiejsza gałąź `MAX_SWIM_DEPTH`) — bez zmian, gracz nie skacze w wodzie/z wody w v1 (jawnie zerować `vy`/`grounded=true`, żeby nie było skoku „z rozpędu” po wyjściu z wody).
  - Na lądzie: jeśli `grounded` i wciśnięto `jump` → `vy = JUMP_SPEED`, `grounded = false`. Co klatkę: `vy -= GRAVITY*dt`, kandydat `y = mesh.position.y + vy*dt`; jeśli `y <= groundY` → `y = groundY`, `vy = 0`, `grounded = true`; inaczej `y` zostaje kandydatem, `grounded = false`.
- Animacja: **brak klipu w rigu (patrz §4 pyt. 5)** — v1 używa procedury bez `AnimationAction`, w stylu istniejącego `crouch()` (`modelRoot.rotation.x`/`position.y`), np. krótki przysiad przed odbiciem i/lub lekkie pochylenie w locie. Nie blokować fazy na nowym rigu/klipie.
- Kamera: `syncCamera()` już czyta `mesh.position.y` co klatkę — powinno działać bez zmian, ale zweryfikować w przeglądarce (szarpanie przy szybkiej zmianie Y).
- Pływanie: `MAX_SWIM_DEPTH`/`sampleFloor` bez zmian (jw. — skok wyłączony w wodzie).
- Dźwięk: brak dziś SFX lądowania/skoku — dodano `S17` do [SOUNDS.md](../assets/SOUNDS.md) (`needed`), niekrytyczne dla mechaniki, może wejść bez dźwięku i dostać SFX później.
- Strome zbocza: `snapToGround` nie ma dziś limitu nachylenia — poza zakresem tej fazy, obecne zachowanie (przyklejanie do zbocza) się nie pogarsza.

**Kryteria akceptacji:**
- Spacja na `grounded=true` odpala skok (widoczna zmiana Y łukiem góra-dół), ignorowana w powietrzu (brak podwójnego skoku) i w wodzie.
- Lądowanie na terenie i (po 2.2) na przeszkodzie z kolizją nie zapada się w geometrię ani nie zawiesza w powietrzu.
- Kamera nie szarpie przy skoku.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` przechodzą.

**Dotknięte pliki:** `src/player/PlayerController.ts`, `src/input/Keyboard.ts`, `src/app/gameLoop.ts` (odczyt `consumeJump()`), `docs/assets/SOUNDS.md`.

---

### Assety

- **Modele:** brak nowych — §4 pyt. 5 zamyka temat wymiany rigu jako osobne, przyszłe zadanie (nie blocker tego planu).
- **Dźwięk:** dodano `S17 — Jump / land (player)` do [SOUNDS.md](../assets/SOUNDS.md) backlog jako `needed`, powiązane z tym planem; opcjonalne dla v1 skoku.

### Weryfikacja

Techniczna po każdej fazie: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`. Manualna w przeglądarce (nie uruchamiać Playwright/headless samodzielnie — poprosić usera o test na działającym dev serverze):
1. **2.1:** upuszczenie kilku różnych itemów (`G`) — widoczny spadek, poprawny pickup po wylądowaniu.
2. **2.2:** spacer/bieg w las i po wiosce — brak przechodzenia przez drzewa/skały/domy/studnię; obserwacja NPC/zwierząt pod kątem tego samego; brak spadku FPS.
3. **2.3:** skok na płaskim terenie, przy zboczu, przy przeszkodzie (po 2.2), w wodzie (powinien być zablokowany).
