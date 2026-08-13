# Research: prawdziwe jaskinie podziemne (underground caves)

**Status:** `done`
**Created:** 2026-08-13
**Updated:** 2026-08-13
**Brief:** [2026-08-13--008--real-caves-in-three-js--brief.md](2026-08-13--008--real-caves-in-three-js--brief.md)
**Zakres:** research, **nie implementacja**. Nic w kodzie nie zostało zmienione, żaden plan nie został oznaczony jako done.

Legenda statusu wiedzy: ✅ potwierdzone w kodzie (z `file:line`) · 🟡 założenie / wnioskowanie · ❓ pytanie otwarte (do użytkownika).

---

## 1. Werdykt

> ⚠️ **Uzupełniony po odpowiedziach użytkownika — patrz [§11](#11-werdykt-po-odpowiedziach-użytkownika-2026-08-13).** Poziom **L2 i technika B zostają bez zmian**. Zmieniają się trzy rzeczy: generator przechodzi na **siatkę jaskiń z jitterem** (wzorzec siatki osad, ~500 m), kolizja przechodzi do planowanego systemu fizyki (plan `097`), a v1 przestaje być puste (zwierzę + skarb).

**Rekomendacja: celuj w L2, ale zbuduj to jako jedną abstrakcję od pierwszego dnia. v1 = L1 zrealizowany jako graf z jedną krawędzią.**

| Pytanie | Odpowiedź |
|---|---|
| Poziom ambicji na 12–24 mies. | **L2** (3–4 korytarze + sala, rzadkie lokacje). L3 (biom jaskiń) — poza zakresem. |
| Technika | **B** — osobny mesh wnętrza + lokalna kolizja — ale z jedną istotną zmianą względem briefu (niżej). |
| Milestone v1 | Jeden opadający korytarz 20–30 m, ślepy, pusty, wejście w zbocze. Zbudowany na strukturze `CaveVolume` (graf), która v2 wypełnia się drugą krawędzią i komnatą **bez rewrite**. |
| Odrzucone | A (heightmapa) jako „pod ziemię”, F (woksle) całkowicie, E (portal) jako plan A. |
| Fallback | D (outcrop) tylko dla płaskich sitów; E (portal) tylko jeśli siting w terenie się wyłoży (patrz §7). |

**Zmiana względem hipotezy w briefie (§7.5), i to jest główny wynik tego researchu:**

> Kolizja jaskini **nie może pochodzić z mesha**. Ma pochodzić z **grafu layoutu** (analitycznie: odległość od odcinka / od środka komnaty). Mesh jest tylko wizualizacją tego samego grafu.

To jedna decyzja, która załatwia naraz: podłogę, ściany, wykrywanie „jestem w środku”, skalowanie na graf i komnatę, determinizm, brak physics engine, brak BVH, i późniejszą nawigację fauny w środku. Kolizja oparta na meshu (raycast/BVH/AABB) jest **właśnie tą false economy**, która wymusiłaby rewrite przy przejściu L1 → L2.

**Drugi wynik, równie ważny:** korytarz powinien **opadać** (~10–15%), a nie być poziomy. To jest jedyny tani sposób na uzyskanie nadkładu (miąższości skały nad dachem) w tym terenie — i to on decyduje o tym, czy sala pod łąką jest w ogóle możliwa. Szczegóły w §4.

**Trzeci wynik:** obecne large caves rzeźbią teren **po** wygenerowaniu chunka w workerze (✅ `chunkManager.ts:1135-1147` vs `chunkHeightmap.worker.ts:87`), więc trawa/drzewa/skały nic o wykopie nie wiedzą. Jaskinie muszą stać się **wejściem world-genu** (jak drogi i `clearings`), nie post-hoc `modifyTerrain`. Bez tego wejście do jaskini zawsze będzie zarośnięte.

---

## 2. Stan faktyczny (weryfikacja briefu wobec kodu)

Brief zgadza się z kodem. Uzupełnienia i sprostowania:

| Fakt | Źródło |
|---|---|
| Large caves: `DEFAULT_COUNT = 10`, pierścień `RING_MIN 130` – `RING_MAX 620` m od (0,0), separacja ≥ 90 m, długość 10–15 m | ✅ `src/world/largeCaves.ts:37-40`, stałe `LARGE_CAVE_*` |
| Siting = `measureSlope(..., radius 4).drop >= 0.85` + omijanie wiosek/dróg/wybrzeża/szczytów | ✅ `largeCaves.ts:74-92` |
| Rzeźba = **8–11 wywołań** `modifyTerrain`, głębokość 1.35 / 2.4 / 2.8 / 2.2, promień 1.5–3.2 | ✅ `src/world/createLargeCaves.ts:29-59` |
| Wizual = wyłącznie skały + `CircleGeometry` cienia; komentarz w kodzie: „Complements the heightmap carve — does not fake the hole itself” | ✅ `src/world/largeCaveVisual.ts:11-12` |
| **Zero geometrii tunelu/dachu/wnętrza. Zero kolizji.** Plan 090 mówi „tunel”, kod robi rów | ✅ (kod > plan) |
| Teren: `PlaneGeometry(64, 64, 64, 64)` → 65×65 wierzchołków, krok 1 m, indeksowany, **brak LOD, brak skirtu, brak mechanizmu wycinania trójkątów** | ✅ `src/terrain/buildChunkGeometry.ts:305`, `worldConfig.ts:131,137` |
| Szew między chunkami trzyma się na „apronie” 67×67 i ręcznych normalnych, nie na geometrii-zasłonie | ✅ `buildChunkGeometry.ts:276-333` |
| `modifyTerrain` żyje **tylko w pamięci** (`modifications[]`), reaplikowany przy (re)loadzie chunka, **nie jest w save** | ✅ `chunkManager.ts:352, 615-626`; brak odniesień w `src/persistence/` |
| `sampleHeight` poza załadowanym chunkiem spada na czysty szum — **bez modyfikacji** | ✅ `chunkManager.ts:1029-1054` |
| Streaming: `loadRadius 3`, `unloadRadius 4` (Chebyshev, chunk 64 m) → ~192 / 256 m. Istnieje `record.pinned` / `homeChunks` | ✅ `chunkManager.ts:979-1004, 606`, `worldConfig.ts:139-140` |
| Gracz: ruch czysto kinematyczny, **zero kolizji ze ścianami/propsami w całym repo**. Wysokość tylko z `sampleHeight` | ✅ `src/player/PlayerController.ts:316-348, 405-417` |
| `sampleHeight` / `sampleFloor` / `waterLevel` są **wstrzykiwane i wymienialne** przez `setGround()` | ✅ `PlayerController.ts:98-107, 226-235` — **to jest gotowy seam** |
| Kamera: boom liczony w `syncCamera()`, `distance` 1.6–22 (default 12), **zero raycastu/collision** | ✅ `PlayerController.ts:419-451`, `src/input/MouseLook.ts:19-21, 85-93` |
| Trawa/drzewa/skały/props: **jeden wspólny mechanizm wykluczeń** — grid `tile.roadTint` liczony w workerze z `roadSegments`/`clearings` | ✅ `src/terrain/chunkHeightmap.ts:600-798`; czytany w `grassPlacement.ts:70-71,308-309` (fade 0.04→0.38), `chunkEnvironment.ts:122+` i `chunkVegetation.ts:52,183` (reject > 0.15) |
| **Gracz ma już przenośne światło**: `PlayerTorch` = `PointLight` na nadgarstku, paliwo 90 s / 240 s, wygasanie | ✅ `src/player/PlayerTorch.ts:20-22, 168, 213, 292-297` |
| Post-processing: N8AO + SMAA + Bloom + god rays + grading | ✅ `src/render/createPostProcessing.ts:66-97` |
| `waterLevel` jest **jednym globalnym skalarem**; woda renderuje się per-chunk tam, gdzie `heights <= waterLevel` | ✅ `chunkManager.ts:126`, `src/world/createWater.ts:50-58`, `src/terrain/waterBodies.ts:31-80` |
| AI (`NpcAgent`, `AnimalAgent`): pozycja Y wyłącznie z `sampleHeight`; jedyne strefy zakazane to **koła** (`isWithinVillageRadius`, `WELL_COLLISION_RADIUS`) | ✅ `AnimalAgent.ts:132-138, 393-394`, `NpcAgent.ts:82-85, 1207-1250` |
| Fauna cave to osobny, mniejszy system: **1** `modifyTerrain` (r 2.6, d 1.8), spawner zwierzyny 25–45 m od osady | ✅ `src/fauna/createFauna.ts:100,123,159-160,428-430`, `src/settlement/props.ts:1231-1272` |

**Znaleziony problem uboczny (nie był w briefie):** ponieważ `carveSite()` woła `modifyTerrain` już **po** powrocie danych z workera, a trawa/drzewa/skały są liczone **w workerze** z `roadTint`, dziś w rowie dużej jaskini i wokół niego może rosnąć trawa i stać drzewa (✅ na poziomie kodu; 🟡 wizualnie — wymaga sprawdzenia w przeglądarce). To samo dotyczy fauna-cave. Wart osobnego issue niezależnie od decyzji o jaskiniach.

---

## 3. Tabela technik A–F

Kolumna „unosi L2?” = czy ta technika obsłuży 3–4 korytarze + salę **bez wymiany fundamentu**.

| # | Technika | Za | Przeciw | Koszt v1 | Unosi L2? | Blocker w *tym* codebase |
|---|---|---|---|---|---|---|
| **A** | Heightmapa dalej (`modifyTerrain` głębiej) | zero nowej pracy; działa dziś | **Nigdy nie będzie dachu** — jedna wysokość na (x,z) | ~0 | ❌ | ✅ `buildChunkGeometry.ts` to czysty heightfield, brak maskowania trójkątów. Fizycznie niemożliwe. |
| **B** | Osobny mesh wnętrza + lokalna kolizja | heightmapa nietknięta; streaming nietknięty; vanilla Three wystarcza; graf skaluje się liniowo | pierwsze wnętrze w projekcie; szew przy wejściu; wymaga świadomego sitingu (§4) | **średni** (§5) | ✅ **tak**, jeśli kolizja z grafu, nie z mesha | brak — `setGround()` i `PlayerTorch` to gotowe seamy |
| **C** | B + hole punch w terenie | ładniejszy szew; skylight/dziura w łące | kontrakt ze streamingiem, apronem, trawą, cieniami; brak jakiegokolwiek mechanizmu masek w geometrii | wysoki | ✅ (dodatek do B) | ✅ `PlaneGeometry` + apron + brak LOD/skirtu = wycięcie trójkątów rozjeżdża szew chunków i cienie. **Odłożyć.** |
| **D** | Outcrop / skalna bryła z wnętrzem (CSG lub GLB) | dach „za darmo”; działa na płaskim; brak walki z nadkładem | czyta się jak kopiec/bunkier; duża sala = duża góra; `three-bvh-csg` nie jest zależnością repo | średni | 🟡 częściowo (sala 20 m = absurdalny kopiec) | brak twardego; runtime CSG = nowa zależność + niedeterminizm |
| **E** | Portal / osobna scena | tanie; dowolnie duże wnętrze; zero szwów | **łamie VISION** („świat trwa bez gracza”, ✅ `VISION.md:19,172,198`); fauna/pogoda/dzień-noc nad jaskinią przestają istnieć; minimapa | niski | ✅ technicznie, ❌ produktowo | brak technicznego; blocker jest produktowy |
| **F** | Woksle / SDF całego terenu | jedyna droga do L3 i do kopania 3D | nowy silnik terenu: chunki, worker, trawa, woda, `roadTint`, drogi, wioski, save | **rewrite świata** | ✅ (i tylko ona daje L3) | ✅ cały `src/terrain/` + `chunkHeightmap.worker.ts` + `roadTint` pipeline do wyrzucenia |

**Werdykt tabeli:** B. D jako fallback na płaskim. C odłożone do momentu, gdy ktoś zażąda skylightu. E tylko awaryjnie. F nie.

**🟡 Jak robią to inne gry** (wiedza ogólna, nie weryfikowana w tej sesji): silniki heightmapowe praktycznie nigdy nie dziurawią heightmapy dla kilku landmarków. Valheim — jaskinie/krypty to osobne prefabrykowane pomieszczenia z własną geometrią i kolizją, wstawione w świat, teren modyfikowany tylko przy wejściu (to jest dokładnie B). Skyrim/Oblivion — osobne interior cells z loadingiem (to jest E). BotW — jaskinie/świątynie jako osobne sceny (E), dopiero TotK dodaje realną warstwę podziemną. Enshrouded / No Man's Sky / Minecraft — woksle (F), ale tam jaskinie to biom, nie landmark. **Wniosek:** wybór B jest mainstreamem dla „kilkanaście lokacji w świecie heightmapowym”, a wybór E jest mainstreamem dla „setki wnętrz”.

---

## 4. Czy „osobny mesh + lokalna kolizja” jest proste? — L1 vs L2, bez marketingu

Nie, nie jest „proste”. Ale jest **ograniczone** — i to jest różnica.

### 4.1 Geometria nadkładu — najważniejsza rzecz, którą brief nie doszacował

Żeby korytarz był pod ziemią, w każdym punkcie wzdłuż jego długości musi być spełnione:

```
teren(s) − dach(s) ≥ margines      dla s ∈ [wejście, koniec]
nadkład(s) = wzrost_terenu(s) + zejście_podłogi(s) ≥ prześwit (~2.5 m) + grubość_skały (~1.0 m)
```

Dzisiejsze kryterium sitingu to `drop >= 0.85` przy promieniu próbkowania 4 m (✅ `largeCaves.ts:74-92`), czyli gradient ok. **0.21 (≈12°)**.

- **Korytarz poziomy:** cały nadkład 3.5 m musi dać sam teren → **~17 m biegu zanim tunel w ogóle wejdzie pod ziemię**, przy założeniu, że stok utrzymuje 12° przez cały czas (a `measureSlope` sprawdza to tylko na 4 m!). Dla korytarza 20–30 m oznacza to, że połowa długości to jeszcze rów. Praktycznie: potrzeba stromego zbocza albo wzgórza wysokiego na 5+ m.
- **Korytarz opadający 12%:** nadkład rośnie z dwóch stron naraz → **~10 m biegu** do pełnego przykrycia, a na 25 m mamy ~3 m zejścia + ~5 m wzrostu terenu = 8 m nadkładu na końcu. Komfortowo.

Stąd rekomendacja z §1: **korytarz opada**. Konsekwencje, wszystkie korzystne:

- ❓ „Czy sala może być pod łąką?” — **tak**, jeśli droga do niej opada. Nadkład bierze się z zejścia, nie z góry nad głową. To odblokowuje L2 bez szukania klifów.
- Siting przestaje być „znajdź stok” a staje się „przetestuj profil nadkładu wzdłuż całego footprintu grafu” — kilkadziesiąt `sampleHeight` na kandydata, liczone raz przy tworzeniu świata. Tanie. ✅ `sampleHeight` działa poza załadowanym chunkiem (spada na szum proceduralny), czyli siting nie wymaga załadowanych chunków — to ważne, bo jaskinie powstają w `worldBundle` przy starcie.
- Trzeba dołożyć warunek: `Y_wejścia − całkowite_zejście > waterLevel + margines` (inaczej podłoga sali ląduje pod globalnym poziomem wody — patrz §6.7).

### 4.2 L1 (jeden korytarz) — co naprawdę trzeba zrobić

| Praca | Rozmiar | Uwaga |
|---|---|---|
| `CaveVolume` — graf (węzły/krawędzie), generator layoutu, siting z profilem nadkładu | **M** | v1: 1 krawędź, ale API grafowe |
| Mesh z grafu (tuba per krawędź, merge do jednej `BufferGeometry`) | **S** | kilkaset–niskie tysiące tris, znikomy koszt GPU |
| `sampleCaveFloor(x,z)` + `clampToVolume(pos)` — **analitycznie z grafu** | **S** | najbliższy punkt na odcinku; zero physics, zero BVH |
| Przełączanie `setGround()` na wejściu/wyjściu + trigger wejścia | **S** | ✅ seam istnieje (`PlayerController.ts:226-235`) |
| Kamera: clamp `distance` wewnątrz volume (raycast tylko o mesh jaskini) | **S** | 1 mesh, ~1 promień/klatkę |
| Wejście jako input world-genu (`roadTint`-owy clearing) zamiast post-hoc `modifyTerrain` | **M** | dotyka `chunkHeightmap.ts` — najbardziej „inwazyjna” część |
| Oświetlenie: zapiekane przyciemnienie vertex-color + fog override wewnątrz | **S–M** | 🟡 wymaga oceny w przeglądarce |
| AI: koło wykluczenia wokół wejścia | **S** | ✅ wzorzec `isWithinVillageRadius` |
| Skała/arka przy wejściu zasłaniająca szew | **S** | reuse `largeCaveVisual.ts` |

Suma: **średnia praca, nie mała**. Realnie 1 duży plan lub 2 mniejsze. Ale **nic z tego nie jest badawcze** — nie ma tu nierozwiązanego problemu, są tylko zadania.

### 4.3 L2 (graf + sala) — co dochodzi

Jeżeli §4.2 zrobione „z grafu”, L2 dokłada **przyrostowo**:

- generator layoutu: 3–4 krawędzie + 1–2 węzły-komnaty, walidacja braku samoprzecięć i wspólny profil nadkładu — **M**
- `clampToVolume` dla komnaty (okrąg/wypukły wielokąt) i dla rozwidleń (unia odcinków — najbliższy odcinek wygrywa) — **S**, bo to ta sama funkcja
- mesh: łączenie tub w węzłach bez dziur — **M** (jedyna realnie trudna rzecz graficznie; obejście: komnata jako osobna skorupa, korytarze wchodzą w nią z zapasem i polegamy na tym, że wnętrze jest ciemne)
- 2. wejście — **S** (to tylko drugi węzeł typu `mouth`)
- fauna wewnątrz — **M**, ale **graf layoutu jest już navmeshem** (patrz §6.6)

Jeżeli §4.2 zrobione „na rurze + AABB”: L2 = przepisanie kolizji, sitingu i generatora. **To jest ta false economy.**

---

## 5. Minimalna abstrakcja, która nie wymusza rewrite

Jeden nowy moduł w `WorldBundle`, obok istniejącego `LargeCaves`:

```text
CaveNode   = { id, kind: 'mouth' | 'junction' | 'chamber' | 'dead-end',
               pos: {x, y, z}, radius, height }
CaveEdge   = { from, to, radius, height }        // profil przekroju
CaveVolume = { id, seed, nodes: CaveNode[], edges: CaveEdge[], bounds: AABB }
```

API (całe, jakie jest potrzebne):

```text
contains(x, y, z)            -> bool              // jestem w środku
sampleFloor(x, z)            -> y | null          // podłoga z grafu
clampToVolume(pos)           -> pos'              // ściany: najbliższy odcinek + promień
nearestMouth(pos)            -> node              // wyjście, trigger, orientacja
buildMesh(volume)            -> THREE.Group       // wizualizacja tego samego grafu
carveInputs(volume)          -> ClearingSegment[] // do world-genu, wejścia
```

Dlaczego to nie wymusza rewrite:

- **v1 to `nodes: [mouth, dead-end], edges: [1]`.** Ten sam typ obiektu co pełna jaskinia L2.
- Kolizja to „odległość do najbliższego elementu grafu”. Jeden korytarz i graf 4-krawędziowy z salą to **ta sama funkcja**, inne dane. To jest cała pointa.
- Mesh jest funkcją grafu, więc zmiana layoutu nigdy nie wymaga zmiany kolizji i odwrotnie.
- Determinizm za darmo — graf z seeda, tak jak dziś `createSeededRandom(seed ^ 0xca7e51)` (✅ `largeCaves.ts:100`).
- Persystencja: dziś zerowa i **niepotrzebna** dla pustych jaskiń (graf odtwarza się z seeda). Potrzebna dopiero, gdy w środku będzie skarb/mob — wtedy zapisujemy tylko `{ volumeId, flags }`, nie geometrię.
- ❓ Jeśli odpowiedź na pytanie 5 w §8 brzmi „tak”, nazwać to `InteriorVolume` zamiast `CaveVolume` — wnętrze chaty to ten sam kontrakt (graf pokoi + podłoga + ściany + drzwi jako `mouth`), tylko mesh pochodzi z GLB zamiast z tuby.

---

## 6. Couplingi do ruszenia (jeden po drugim, z werdyktem)

| # | System | Stan | Werdykt |
|---|---|---|---|
| 6.1 | **Gracz — podłoga** | ✅ `setGround()` wymienia `sampleHeight`/`sampleFloor`/`waterLevel` | **Rozwiązane seamem, który już istnieje.** Wejście do volume podmienia provider na `sampleCaveFloor` + własny `waterLevel` (np. −Inf). |
| 6.2 | **Gracz — ściany** | ✅ **zero kolizji w całym repo** | Nowa praca, ale mała: `clampToVolume`. Uwaga: to jest też pierwsza kolizja ze ścianami w projekcie w ogóle — nie próbować przy okazji zrobić z tego ogólnego systemu kolizji. |
| 6.3 | **Kamera** | ✅ zero collision, `distance` 1.6–22 | Wewnątrz volume: clamp `look.distance` do wyniku raycastu o **sam mesh jaskini** (jeden `Raycaster`, jeden mesh, 1–3 promienie/klatkę). Bez `three-mesh-bvh`. Minimalny hack (stały clamp do ~3 m) jest akceptowalny na v1, ale raycast jest niewiele droższy. |
| 6.4 | **Trawa / drzewa / props** | ✅ jeden mechanizm: `roadTint` w workerze | **Dobra wiadomość:** dziura potrzebna **tylko wokół wejścia**, nie w całej objętości — powierzchnia nad tunelem pozostaje nietknięta i *ma* być zarośnięta. Zła: żeby to zadziałało, wejście musi trafić do `chunkHeightmap.ts` jako segment typu `clearing` (✅ `chunkHeightmap.ts:600-660`), a nie jako post-hoc `modifyTerrain`. To dotyczy też dzisiejszych large caves (§2, znaleziony problem). |
| 6.5 | **Światło / postprocess** | ✅ ambient + hemi + dir „sun” (follow gracza), fog z `dayNight`, N8AO/bloom/godrays; ✅ **`PlayerTorch` już istnieje** | Wnętrze będzie domyślnie **za jasne** (ambient + hemi świecą wszędzie). Rekomendacja v1: (a) zapieczone przyciemnienie w vertex colors rosnące z odległością od wejścia — deterministyczne, zero kosztu runtime; (b) `PlayerTorch` jako realne źródło światła — **duży darmowy zysk, pochodnia zyskuje pierwszy prawdziwy powód istnienia**; (c) override `fog` (ciemny, krótki) gdy gracz wewnątrz. 🟡 Godrays i N8AO wewnątrz — do sprawdzenia w przeglądarce, nie da się orzec z kodu. **Nie** przyciemniać globalnego ambientu — widok przez otwór wyjdzie źle. |
| 6.6 | **AI** | ✅ tylko `sampleHeight`, strefy zakazane wyłącznie kołowe | v1: koło wykluczenia wokół wejścia (wzorzec `isWithinVillageRadius`, ✅ `AnimalAgent.ts:132-138`). Zwierzęta i tak chodzą po powierzchni, więc **nad** tunelem mogą chodzić swobodnie i to jest poprawne. L2+: fauna w środku dostaje `CaveVolume.edges` jako navgraf — dlatego graf, a nie mesh. |
| 6.7 | **Woda** | ✅ `waterLevel` globalny; woda per-chunk z `heights <= waterLevel` | **Nie jest blockerem.** Powierzchnia nad tunelem jest nietknięta, więc żadna woda się w jaskini nie wyrenderuje, nawet gdy podłoga jest poniżej `waterLevel`. Jedyny realny punkt to `PlayerController.snapToGround` (✅ `:405-417`), który sam sprawdza `waterLevel` — załatwia to podmieniony provider z 6.1. Zalecane mimo to: siting wymusza podłogę powyżej `waterLevel`, żeby nie budować długu, gdy kiedyś pojawi się water table. |
| 6.8 | **Streaming** | ✅ `loadRadius 3` / `unloadRadius 4` (≈192/256 m), `record.pinned` istnieje | **Nie jest blockerem.** Mesh jaskini należy do `WorldBundle`, nie do chunka; dodawany/usuwany po odległości od gracza. Gracz stojący w jaskini zawsze ma załadowane chunki wokół siebie. `pinned` jest dostępny, ale prawdopodobnie zbędny. |
| 6.9 | **Szew wejścia** | — | Wejście = rampa wykuta w terenie + arka/skały (reuse ✅ `largeCaveVisual.ts`). Mesh startuje na dnie rampy. Ryzyko z-fightu i szczeliny „przez którą widać niebo” — mitygacja: wpuścić mesh 0.5–1 m *pod* powierzchnię terenu i zasłonić skałami. 🟡 wygląd tylko do oceny w przeglądarce. |
| 6.10 | **Wejście na granicy dwóch chunków** | ✅ apron 67×67 gwarantuje ciągłość wysokości | **Nie jest blockerem** dla B (mesh jaskini nie jest częścią chunka i ignoruje granice). Byłby blockerem dla **C** — kolejny argument, żeby C odłożyć. |
| 6.11 | **Save / determinizm** | ✅ `modifications` nie są w save, wszystko z seeda | v1 nie potrzebuje persystencji. Przy skarbie/mobie: zapisywać flagi stanu, nie geometrię. |

---

## 7. Ryzyko

**Najtańszy L1, który nie zamyka L2:** jeden opadający korytarz, ślepy, pusty, ale zbudowany jako `CaveVolume` z jedną krawędzią, z kolizją analityczną z grafu i wejściem wpiętym w world-gen. Wszystko poza tym (druga krawędź, komnata, drugie wejście, loot, mob, fauna) to dane i przyrosty, nie fundament.

**False economy (czego nie robić):**

1. Kolizja/podłoga z **mesha** (raycast w dół, `three-mesh-bvh`, AABB volume). Działa dla rury, rozpada się na skrzyżowaniu i w komnacie, i wymusza rewrite dokładnie wtedy, gdy projekt chce L2.
2. Dalsze pogłębianie `modifyTerrain` „aż będzie jak jaskinia”. Fizycznie nie może zadziałać (✅ heightfield).
3. Rzeźbienie wejścia post-hoc (dzisiejszy `carveSite`) zamiast przez world-gen — gwarantuje trawę w wykopie i podwójne źródło prawdy o terenie.
4. Runtime CSG (`three-bvh-csg`) dla kilku statycznych lokacji — nowa zależność, koszt i ryzyko niedeterminizmu za efekt, który daje zwykła tuba z grafu.
5. „Zrobimy najpierw portal (E), potem zamienimy na prawdziwą jaskinię” — portal wyszkoli cały UX i quest-hooki pod założenie „jaskinia to inna scena”, które potem trzeba będzie cofnąć.

**Kiedy powiedzieć „za drogie, zostajemy przy rowie”:** jeśli odpowiedź na pytanie 4 w §8 (kopanie wewnątrz jaskini) brzmi „tak” — wtedy B jest ślepą uliczką, bo destrukcyjne wnętrze to F, i lepiej nie zaczynać. Podobnie, jeśli odpowiedź na pytanie 1 idzie w stronę „jaskinie mają być wszędzie, to cecha geografii” — to jest L3 = F, a wtedy uczciwa odpowiedź brzmi: nie w tym silniku terenu, nie w tym roku.

**Ryzyko sitingu (jedyne realne ryzyko techniczne B):** możliwe, że w obecnym terenie zbyt mało kandydatów przechodzi test nadkładu i z 10 jaskiń zostaje 1–2. To jest **sprawdzalne przed implementacją**: skrypt, który dla obecnego seeda liczy profil nadkładu wzdłuż 25 m opadającego korytarza dla N kandydatów i podaje odsetek akceptacji. **Rekomendacja: to jest właściwy pierwszy krok każdego planu** — jeśli akceptacja jest bardzo niska, wracamy do D (outcrop) albo obniżamy ambicję długości, zanim napiszemy jedną linijkę mesha.

---

## 8. Otwarte pytania do użytkownika ❓

Odpowiedzi na 1, 4 i 5 zmieniają technikę; reszta zmienia zakres.

1. **Skala.** Ile jaskiń „prawdziwych” w promieniu grywalnym? Dziś jest 10 rowów w pierścieniu 130–620 m. Czy L2 to *rzadkość* (2–4 na świat, reszta zostaje fasadą/rowem), czy każda z dzisiejszych 10 ma stać się prawdziwą jaskinią? (Odpowiedź „wszystkie i więcej” przesuwa nas w stronę F i wtedy rekomendacja się zmienia.)

**Odpowiedź**: chcę 0-2 duże jaskinie (2+ korytarze) na chunk gdzie są góry (75% szans na jaskinię), oraz 0-1 małą jaskinię (1 korytarz) na innych terenach (30% szans).

2. **Zejście.** Czy korytarz opadający ~10–15% w dół jest OK produktowo? To jest techniczny warunek nadkładu i tego, żeby sala mogła być pod łąką, a nie tylko pod klifem.

**Odpowiedź:** Tak

3. **Fauna/NPC w środku.** Czy kiedykolwiek mają wchodzić (niedźwiedź w jaskini, wilki w legowisku), czy jaskinia jest przestrzenią wyłącznie gracza? Wpływa na to, czy graf od razu projektujemy jako navgraf.

**Odpowiedź:** Tak - wilk lub niedźwiedź. (btw. chcę dodać fizykę dla kolizji)

4. **Kopanie wewnątrz.** Czy kilof/łopata mają działać na ściany jaskini (poszerzanie, własne tunele)? **Jeśli tak — B jest niewłaściwe** i trzeba świadomie odłożyć temat do czasu decyzji o wokselach.

**Odpowiedź:** Byłoby miło, ale możemy to odłożyć.

5. **Czy jaskinia to prototyp wnętrz w ogóle?** Czy ta sama abstrakcja ma później obsłużyć wnętrza chat (VISION: rozszerzać couplingi, nie tworzyć równoległych mechanizmów), czy jaskinia ma zostać jaskinią? Wpływa tylko na nazwę i granicę API — ale lepiej zdecydować przed, niż po.

**Odpowiedź:** Byłoby miło mieć wnętrza chat i zamków. Nie wiem czy tym samym mechanizmem.

6. **Fasada vs lokacja.** Czy fauna-cave (`createCaveMouth`, spawner zwierzyny przy osadzie) ma **na zawsze** zostać płaską fasadą? Rekomendacja: tak, i rozdzielić to nazewniczo w docs/kodzie (`FaunaDen` vs `CaveVolume`), żeby nikt nie próbował włożyć lisów do sali 30 m.

**Odpowiedź:** Tak, ewentualnie to będzie mała jaskinia (1 tunel).

7. **Zawartość v1.** Plan 090 mówi „pusto”. Czy v1 prawdziwej jaskini też ma być pusta (czyli nagrodą jest sama eksploracja + użycie pochodni), czy od razu chcemy jeden przedmiot na końcu? To zmienia, czy potrzebna jest persystencja stanu.

**Odpowiedź:** Chcę w jaskini dać zwierzę i/lub skarb.

---

## 9. Status wiedzy — podsumowanie

| Twierdzenie | Status |
|---|---|
| Dzisiejsze jaskinie (obie rodziny) nie mają geometrii podziemnej ani kolizji | ✅ |
| Heightfield nie może mieć dachu; brak mechanizmu maskowania trójkątów | ✅ |
| `setGround()` jest gotowym seamem do lokalnej podłogi | ✅ |
| Kamera nie ma żadnej kolizji; gracz nie ma żadnej kolizji ze ścianami | ✅ |
| `roadTint` to jedyny mechanizm wykluczania trawy/drzew/propsów | ✅ |
| `PlayerTorch` (PointLight + paliwo) już istnieje | ✅ |
| Trawa/drzewa mogą dziś rosnąć w wykopie large cave (worker nie zna `modifyTerrain`) | ✅ w kodzie / 🟡 wizualnie |
| Kolizja z grafu zamiast z mesha jest tańsza i skaluje się na L2 | 🟡 (ocena inżynierska, nie zmierzona) |
| Opadający korytarz rozwiązuje problem nadkładu przy gradiencie ~0.21 | 🟡 (arytmetyka na stałych z kodu, nie na realnym rozkładzie terenu — patrz test sitingu w §7) |
| N8AO / godrays / fog we wnętrzu nie dają artefaktów | ❓ (tylko przeglądarka) |
| Odsetek sitów przechodzących test nadkładu | ❓ (do zmierzenia przed planem) |
| Docelowa liczba jaskiń, zejście, fauna w środku, kopanie, wnętrza chat | ❓ (§8) |

---

## 10. Rekomendowana kolejność, gdyby werdykt użytkownika brzmiał „robimy”

Nie jest to plan implementacyjny — to kolejność, w jakiej powinny powstać plany.

1. **Spike sitingu** (§7). Zmierzyć, ile kandydatów utrzymuje nadkład na 25 m opadającego korytarza. Bez tego reszta jest hazardem.
2. **Issue: wejścia jaskiń jako input world-genu** (`roadTint`/`clearings`), naprawia też dzisiejszą trawę w rowie. Wartość samodzielna, niezależna od decyzji o wnętrzach.
3. **Plan: `CaveVolume` v1** — graf (1 krawędź), mesh, `sampleFloor`/`clampToVolume`, `setGround` swap, clamp kamery, przyciemnienie + pochodnia, koło wykluczenia AI.
4. **Weryfikacja w przeglądarce** — szew wejścia, fog/N8AO/godrays, czytelność ciemności z pochodnią. Dopiero tu wiadomo, czy L1 „czuje się” jak jaskinia.
5. **Plan: L2** — generator grafu 3–4 krawędzi + komnata, drugie wejście, ewentualnie fauna/loot.

**Nie implementować niczego z tej listy w ramach tego researchu.**

---

## 11. Werdykt po odpowiedziach użytkownika (2026-08-13)

Odpowiedzi są w §8. Trzy z nich realnie zmieniają wnioski: **1 (gęstość)**, **3 (fizyka kolizji + zwierzę w środku)** i **7 (zawartość v1)**. Odpowiedzi 2, 4, 5, 6 potwierdzają rekomendacje z §1–§10.

### 11.1 Gęstość — kalibracja (poprawka po rozmowie, 2026-08-13)

Pierwotna odpowiedź mówiła „na chunk”, przy założeniu, że chunk to obszar mieszczący wioskę i dużo przestrzeni wokół (~500–1000 m). **Chunk ma 64 × 64 m** (✅ `worldConfig.ts:137`), czyli ~20× mniejszą powierzchnię niż komórka wioski. Intencja brzmiała: **„jaskinia nie jest częsta”**, i ta intencja jest wiążąca — nie liczby per chunk.

Punkty odniesienia w tym świecie:

| Wielkość | Wartość | Źródło |
|---|---|---|
| Chunk | 64 × 64 m = 4 096 m² | ✅ `worldConfig.ts:137` |
| Siatka osad („1 wioska + przestrzeń wokół”) | **280 m**, min. separacja ~150 m | ✅ `settlementGenerator.ts:62` (`SETTLEMENT_GRID_STEP`) |
| Załadowany świat wokół gracza | ±192 m (`loadRadius 3`) | ✅ `chunkManager.ts:979-1004` |
| Dzisiejsze large caves | 10 sztuk, pierścień 130–620 m | ✅ `largeCaves.ts:37-40` |

Te same procenty przeliczone na komórkę o rozmiarze, który miałeś na myśli:

| Komórka | Małe jaskinie (30%) — średni odstęp | Duże (75% × 0–2) w górach — średni odstęp | Ile w promieniu 1 km |
|---|---|---|---|
| 64 m (chunk — **błędna interpretacja**) | ~117 m | ~64 m | ~200+ ❌ |
| 280 m (siatka osad) | ~510 m | ~270 m | ~12 małych + duże tylko w górach |
| **500 m (najbliższe intencji)** | **~910 m** | **~480 m** | **~4 małe + ~3–8 dużych** 🟡 |
| 1000 m | ~1 800 m | ~950 m | ~1 mała + ~3 duże |

**Wniosek: przy komórce 500 m wracamy dokładnie do L2 i werdykt z §1 obowiązuje bez zmian.** Alarm „L3-lite”, który postawiłem w poprzedniej wersji tej sekcji, wynikał z odczytania „chunk” dosłownie i **jest wycofany**. Rzędy wielkości (~4 małe + ~3–8 dużych w promieniu grywalnym) są bardzo blisko dzisiejszych 10 sitów — czyli technika B, koszt z §4 i kolejność z §10 zostają aktualne.

**Rekomendacja: przestać wyrażać gęstość „na chunk” i wyrażać ją w metrach między wejściami.** To jednostka odporna na zmianę `chunkSize` i zgodna z tym, jak myślisz o świecie.

### 11.2 Model generatora: siatka jaskiń, analogicznie do siatki osad

Dzisiejsze `largeCaves.ts` losuje 10 sitów globalnie w pierścieniu wokół (0,0) (✅ `largeCaves.ts:37-40, 100`) — to nie skaluje się na nieskończony świat, niezależnie od gęstości.

Silnik ma już gotowy, sprawdzony wzorzec na dokładnie ten problem: **deterministyczna siatka z jitterem**, używana przez osady (`SETTLEMENT_GRID_STEP = 280` + losowe przesunięcie w komórce, ✅ `settlementGenerator.ts:62, 125-126, 158`). Rekomendacja:

```text
CAVE_GRID_STEP ≈ 500 m
per komórka: hash(seed, gx, gz) → kandydat + jitter w obrębie komórki
             teren górski  → duża jaskinia (2+ korytarze), p ≈ 0.6–0.75
             pozostały     → mała jaskinia (1 korytarz),   p ≈ 0.3
             następnie: test nadkładu (§4.1) — odrzuca lub akceptuje
```

Dlaczego to, a nie „per chunk w workerze”:

- Odstęp 500 m jest ~8× większy niż chunk, więc jaskinia i tak przecina wiele chunków — decyzja per chunk wymagałaby odpytywania sąsiadów i tak. Siatka to załatwia z definicji.
- **To jest ten sam mechanizm, którym powstają wioski** — czyli rozszerzenie istniejącego couplingu, nie równoległy system (CLAUDE.md).
- Wejścia trafiają do world-genu tą samą drogą co polany wiosek: jako segmenty zasilające `roadTint` w `chunkHeightmap.ts` (✅ `:600-798`), co automatycznie wycina trawę/drzewa/skały wokół otworu i naprawia problem z §2.
- Determinizm z seeda za darmo, zero persystencji geometrii.

**Deklarowane procenty to *częstość prób*, nie gwarancja.** Test nadkładu odrzuci część kandydatów — i to jest pożądane, bo odsiewa miejsca, gdzie korytarz przebiłby wzgórze. Realna gęstość wyjdzie niższa od nominalnej i **trzeba ją zmierzyć przed ustaleniem progów** (spike, §11.8).

### 11.3 Ryzyko przy tej (skalibrowanej) gęstości

Po kalibracji trzy z czterech wcześniejszych ryzyk znikają: draw calls (1–2 volumes naraz zamiast ~50), monotonia (kilkanaście jaskiń da się dopieścić generatorem), „ser szwajcarski” w górach (przy odstępie ~480 m to rzadkość, nie sito). Zostaje jedno:

**Wejście na płaskim terenie.** Brief §1 wymaga: „wejście **w zbocze, nie dziura w łące**”. Małe jaskinie mają powstawać na „pozostałych terenach”, czyli głównie na nizinach — a tam test nadkładu odrzuci większość kandydatów i deklarowane 30% nigdy się nie zrealizuje. Dwa wyjścia:

1. Przyjąć, że małe jaskinie **też wymagają zbocza** (pagórek, skarpa, brzeg wąwozu) i pogodzić się, że na płaskiej łące ich nie ma. Realna gęstość spada, ale każde wejście wygląda dobrze.
2. Dopuścić **drugi archetyp wejścia** — zapadlisko / skalna wychodnia (technika **D** z §3) — jako równorzędny wariant dla płaskiego terenu.

Rekomendacja: **(1) na v1**, (2) dopiero jeśli pomiar pokaże, że nizin bez zbocza jest tyle, że jaskinie praktycznie z nich znikają. Odwrotnie niż rekomendowałem przed kalibracją — przy rzadkich jaskiniach nie ma presji, żeby wciskać je na płaskie tereny.

### 11.4 Fizyka i kolizje (odpowiedź 3) — unieważnia część rekomendacji z §1

Użytkownik chce **realnego systemu kolizji** (plan [`097`](../plans/2026-08-13--097--physics-falling-collisions-jumping.md)). To zmienia rekomendację „kolizja z grafu, nie z mesha”:

- **Nie budować dla jaskini własnej kolizji**, jeśli system kolizji i tak powstaje (CLAUDE.md: rozszerzać istniejące couplingi, nie tworzyć równoległych mechanizmów). Ściany jaskini stają się po prostu ciałami statycznymi w tym systemie.
- **Ale graf layoutu zostaje** — z trzech innych powodów, niezależnych od kolizji: (a) jest źródłem mesha, (b) jest źródłem sitingu/testu nadkładu, (c) **jest navmeshem dla zwierzęcia w środku** (odpowiedź 3: wilk/niedźwiedź).
- Kolejność ma znaczenie: jeśli plan `097` (kolizje) idzie **przed** jaskiniami, jaskinia dostaje ściany za darmo. Jeśli **po** — jaskinia potrzebuje tymczasowego `clampToVolume` z grafu, który potem trzeba będzie usunąć. **Rekomendacja: fizyka/kolizje przed jaskiniami.**

### 11.5 Zwierzę i skarb w środku (odpowiedzi 3 i 7) — nowe couplingi

v1 przestaje być „pusta rura”, więc dochodzą rzeczy, których §6 nie obejmował:

| Coupling | Problem | Uwaga |
|---|---|---|
| `AnimalAgent` w objętości | ✅ dziś Y **wyłącznie** z `sampleHeight` (`AnimalAgent.ts:393-394`) — wilk w jaskini stanąłby na powierzchni terenu, nad dachem | Zwierzę musi umieć brać Y z `CaveVolume.sampleFloor`. To ten sam seam co `setGround()` u gracza, ale `AnimalAgent` go nie ma — trzeba dodać. **To jest realna nowa praca, nie drobiazg.** |
| Ruch zwierzęcia po grafie | brak navmeshu, ruch to wander/chase po płaszczyźnie | Krawędzie grafu jako navgraf; zwierzę porusza się wzdłuż korytarza, nie w linii prostej do gracza |
| Zwierzę wychodzi / gracz ucieka | granica volume | Trzeba zdefiniować, co się dzieje przy przekroczeniu wejścia w obie strony |
| Skarb | brak persystencji jakiegokolwiek stanu jaskiń | Zapisywać flagi `{ caveId, looted, cleared }` — **nie** geometrię. `caveId` musi być stabilny: `(chunkCoord, index)`, nie indeks w globalnej liście |
| Walka we wnętrzu | melee istnieje, ale nigdy nie działało w ciasnej przestrzeni z kamerą przy ścianie | 🟡 ryzyko UX, do sprawdzenia w przeglądarce |

### 11.6 Pozostałe odpowiedzi — potwierdzenia

- **2 (zejście ~10–15%): tak** → §4.1 zostaje bez zmian. To warunek nadkładu i tego, żeby sala mogła być pod łąką.
- **4 (kopanie: odłożone)** → B pozostaje właściwe. **Uwaga:** kopanie + gęstość z 11.1 razem = F. Jeśli kopanie kiedyś wróci jako wymaganie, to jest moment na przemyślenie silnika terenu, a nie na doklejanie go do B.
- **5 (wnętrza chat/zamków: „byłoby miło, nie wiem czy tym samym mechanizmem”)** → rekomendacja: **nie abstrahować na zapas**. Nazwać `CaveVolume`, ale trzymać API z §5 czyste (graf + `sampleFloor` + `contains` + mesh), żeby przemianowanie na `InteriorVolume` było refaktorem nazwy, a nie przebudową. Wnętrze chaty i tak będzie miało inny mesh (GLB) i inne wejście (drzwi), więc wspólny jest tylko kontrakt, nie implementacja.
- **6 (fauna-cave)**: mała jaskinia (1 korytarz) **zastępuje** dzisiejszą fasadę `createCaveMouth` tam, gdzie siting przejdzie. Dobra konsolidacja — znika osobny system. Tam, gdzie siting nie przejdzie, zostaje fasada. Rozdział nazewniczy (`FaunaDen` vs `CaveVolume`) nadal potrzebny.

### 11.7 Zrewidowany werdykt

| | Przed odpowiedziami | Po odpowiedziach + kalibracji gęstości |
|---|---|---|
| Poziom | L2 (rzadkie lokacje) | **L2 — bez zmian.** Gęstość „na chunk” była nieporozumieniem; intencja to ~500 m między wejściami |
| Technika | B | **B** — pod warunkiem że kopanie zostaje odłożone |
| Generator | globalna lista sitów (jak dziś) | **siatka jaskiń z jitterem (`CAVE_GRID_STEP ≈ 500 m`), wzorowana na siatce osad** ← główna zmiana |
| Kolizja | analitycznie z grafu | **z systemu fizyki (plan 097)**; graf zostaje jako mesh-source, siting i navmesh |
| Wejścia | jeden archetyp (w zbocze) | **jeden archetyp na v1** (zbocze); zapadlisko/wychodnia (D) tylko jeśli pomiar pokaże, że nizin bez zbocza jest za dużo |
| v1 | pusty korytarz | korytarz + **zwierzę i/lub skarb** → persystencja flag + `AnimalAgent` w objętości |
| Kolejność | jaskinie samodzielnie | **fizyka/kolizje (097) przed jaskiniami** |

### 11.8 Zrewidowana kolejność prac (zastępuje §10)

1. **Plan `097` — kolizje** (przynajmniej warstwa 2.2). Jaskinie są jego pierwszym poważnym konsumentem.
2. **Spike gęstości i nadkładu.** Dla obecnego seeda zmierzyć, jaki odsetek komórek siatki 500 m (górskich i nizinnych) faktycznie przechodzi test nadkładu przy korytarzu 20–30 m opadającym 12%, i jaki wychodzi realny odstęp między wejściami w metrach. **Dopiero ta liczba pozwala ustawić `CAVE_GRID_STEP` i progi 75%/30%.** Bez pomiaru progi są zgadywaniem.
3. **Plan: siting jaskiń jako część world-genu** — siatka `CAVE_GRID_STEP` z jitterem (wzorzec `SETTLEMENT_GRID_STEP`), wejście podawane do `chunkHeightmap.ts` jako segment `roadTint`, jak polany wiosek. Sam w sobie naprawia też dzisiejszą trawę w rowie (§2).
4. **Plan: `CaveVolume` v1** — graf, mesh, wejście, oświetlenie + `PlayerTorch`, kamera, mała jaskinia (1 korytarz).
5. **Weryfikacja w przeglądarce** — szew, ciemność, kamera w ciasnym korytarzu, gęstość „na oko” podczas spaceru.
6. **Plan: duża jaskinia** — 2+ korytarze, komnata, zwierzę (navgraf) + skarb (persystencja flag).

### 11.9 Nowe pytania otwarte ❓

1. Czy `CAVE_GRID_STEP ≈ 500 m` odpowiada Twojemu „jaskinia nie jest częsta”? Konkretnie: **duża jaskinia co ~500 m w górach, mała co ~900 m poza nimi** — czyli podczas typowego spaceru mijasz jedną co kilka minut, nie co kilkanaście sekund.
2. Czy małe jaskinie mogą **nie występować na płaskiej łące** (wymóg zbocza), czy wolisz drugi archetyp wejścia (zapadlisko), żeby były też na nizinach?
3. Czy plan `097` (kolizje) ma faktycznie iść przed jaskiniami — to jest kolejność, która minimalizuje pracę do wyrzucenia.
4. Czy zwierzę w jaskini ma być **stałym mieszkańcem** (respawn, terytorium, wychodzi na powierzchnię) czy **strażnikiem skarbu** (jednorazowy, po zabiciu jaskinia zostaje pusta)? Pierwsze jest bliższe VISION („świat żyje niezależnie”), drugie jest znacznie tańsze.
