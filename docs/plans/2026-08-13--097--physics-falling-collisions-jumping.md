# Plan: Fizyka — opadanie przedmiotów, kolizje, skok

**Status:** `todo` ⬜ (szkic — do uzupełnienia w następnej sesji)
**Created:** 2026-08-13
**Priority:** 🟡 medium · **Effort:** L · **Depends on:** —
**Źródło:** rozmowa 2026-08-13 przy researchu [009 — jaskinie podziemne](../research/2026-08-13--009--underground-caves.md); potrzeba `clampToVolume` w jaskini to ten sam brakujący fundament co kolizje w świecie.

> **Kolejność:** research 009 §11.4 rekomenduje, żeby **ten plan szedł przed jaskiniami**. Jaskinie są pierwszym poważnym konsumentem kolizji; jeśli powstaną wcześniej, dostaną tymczasowy własny `clampToVolume`, który potem trzeba będzie usunąć.

> **To jest szkic zakresu, nie gotowy plan.** Sekcje „Do ustalenia” są celowo puste — następna sesja ma je wypełnić przed implementacją.

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
2. Skąd biorą się ciała kolizyjne propsów — z katalogu (ręczny promień per model), czy liczone z bounding boxa GLB przy ładowaniu?
3. Czy kolizje dotyczą NPC/zwierząt, czy tylko gracza?
4. Czy wchodzimy w bibliotekę fizyki, czy zostajemy przy własnych prymitywach? (Rekomendacja wstępna: własne — patrz 2.2.)
5. Czy skok ma mieć animację i czy istnieje klip w rigu gracza.
6. ~~Jak to spina się z `CaveVolume` / `clampToVolume` z researchu 009~~ → **rozstrzygnięte 2026-08-13**: wspólna abstrakcja, ten plan idzie pierwszy. Ściany jaskini to statyczne ciała w tym systemie; graf jaskini zostaje wyłącznie jako źródło mesha, sitingu i navmeshu dla zwierzęcia (research 009 §11.4). Konsekwencja dla 2.2: kolizja musi obsłużyć **wnętrze** (wypchnięcie do środka objętości), nie tylko **omijanie** propsów z zewnątrz.
7. Czy fizyka ma dotyczyć rzucania przedmiotami (nowa mechanika) czy tylko upuszczania (istniejąca).

## 5. Poza zakresem (na teraz)

Odbicia, toczenie, stosy przedmiotów, ragdolle, niszczenie obiektów, fizyka wody/pływalności, pojazdy.

## 6. Do uzupełnienia

- [ ] Kryteria akceptacji
- [ ] Dotknięte pliki
- [ ] Kolejność implementacji / podział na fazy
- [ ] Assety (prawdopodobnie brak — sprawdzić klip skoku, SFX lądowania w [SOUNDS.md](../assets/SOUNDS.md))
