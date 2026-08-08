# Review: performance, refactoring, błędy (przegląd całej aplikacji)

**Status:** `done` (analiza) — implementacja poza scope tego review
**Created:** 2026-08-08
**Updated:** 2026-08-08
**Zlecenie:** pierwsze ogólne review aplikacji (nie deep-dive) — focus: wydajność, proste możliwości refactoringu, jasne błędy.

## Metoda

Statyczna analiza kodu (bez uruchamiania w przeglądarce, zgodnie z CLAUDE.md).
Przeczytane w całości: `app/createApp.ts`, `terrain/chunkManager.ts`, `terrain/grass.ts`,
`terrain/buildChunkGeometry.ts`, `terrain/chunkWorkerPool.ts`, `terrain/chunkVegetation.ts`,
`ai/NpcAgent.ts`, `fauna/AnimalAgent.ts`, `fauna/createFauna.ts`, `settlement/props.ts`,
`settlement/createSettlement.ts`, `settlement/SettlementsManager.ts`, `settlement/roadNetwork.ts` (część),
`player/PlayerController.ts`, `assets/loadGltf.ts`, `quests/QuestManager.ts`, `items/*`,
`world/createWater.ts`, `world/dayNight.ts`, `world/createLights.ts`, `render/*`, `ui/createHud.ts`,
`ui/createMinimap.ts`, `config/worldConfig.ts`.

Stan bazowy: `npx tsc --noEmit` ✅ czysto, `npm run lint` ✅ czysto.

## Podsumowanie

Kod jest w dobrym stanie: konsekwentna determinizm-dyscyplina (seed → chunk), sensowne
histerezy load/unload, worker pool, komentarze wyjaśniające *dlaczego* (rzadkość), testy
jednostkowe czystej logiki. Znalezione problemy są punktowe, nie architektoniczne.

Najważniejsze trzy rzeczy: **(1)** `disposeObject3D` zwalnia zasoby GPU współdzielone z cache'em
loadera GLTF (stutter przy każdym unload chunka/osady), **(2)** globalne cache w `roadNetwork.ts`
nie są czyszczone przy zmianie seeda, **(3)** koszt trawy jest płacony nieefektywnie — nie dlatego,
że jest jej za dużo (gęstość to świadoma decyzja projektowa), tylko dlatego, że brakuje LOD-u,
mgły w shaderze i offloadu generacji.

---

## Findings — błędy / poprawność

### 1. [High] `disposeObject3D()` zwalnia geometrię i materiały współdzielone z cache'em GLTF

`src/assets/loadGltf.ts:99-108` przechodzi po drzewie i woła `geometry.dispose()` +
`material.dispose()` na każdym meshu. Problem: **wszystkie klony GLB współdzielą geometrię
i materiały z rootem w cache'u loadera**:

- `loadGltf()` → `cloneSkinned(asset.root)` — `SkeletonUtils.clone` kopiuje `Object3D`,
  ale `geometry`/`material` przekazuje **przez referencję**,
- `cloneProp()` (`props.ts:419-429`) → `src.clone(true)` — to samo.

Miejsca, które to robią na gorącej ścieżce:

| Miejsce | Kiedy | Co zwalnia |
|---|---|---|
| `chunkManager.ts:447-450` (`unload`) | przy **każdym** unload chunka | geometria/materiały szablonów drzew, krzewów, kaktusów, trzcin |
| `createSettlement.ts:139-143` (`dispose`) | przy każdym unload osady | jw. + chatki + dok |
| `NpcAgent.ts:501-506` (`dispose`) | jw. | geometria/materiał modelu postaci z `NPC_MODEL_URLS` |

Że to jest znany hazard, widać po tym, że **dwa inne miejsca jawnie się przed nim bronią**:

```ts
// createFauna.ts:96-97
// GLB clones share GPU resources with the loader cache — only free capsules.
if (agent.mesh.userData.faunaCapsule) disposeObject3D(agent.mesh)

// PlayerController.ts:261-262
// GLB clones share GPU resources with the loader cache — only free the capsule fallback.
if (this.isCapsule) disposeObject3D(this.mesh)
```

`NpcAgent` i ścieżka roślinności/propsów tego guardu nie mają.

**Skutek:** nie jest to twarde zepsucie (three.js leniwie re-uploaduje bufory atrybutów przy
następnym renderze), ale `material.dispose()` zwalnia też referencję do skompilowanego programu
shadera → **rekompilacja shadera przy następnym użyciu**. Kompilacja to milisekundy. Przy
streamingu chunków unload zdarza się regularnie w trakcie chodzenia → mikro-zacięcia
skorelowane z ruchem gracza, plus ciągły re-upload buforów.

**Fix (propozycja):** oznaczać zasoby pochodzące z cache'a i pomijać je przy dispose — np.
`prepareProp`/`loadCached` ustawia `mesh.userData.sharedGpu = true`, a `disposeObject3D` to
respektuje. Alternatywnie: refcount w `loadGltf.ts` z realnym zwolnieniem dopiero przy teardownie
cache'a. Jednolicie dla wszystkich trzech miejsc — dziś dwa guardują ad hoc, trzecie nie.

### 2. [High] Globalne cache w `roadNetwork.ts` nie są kluczowane seedem ani czyszczone

`src/settlement/roadNetwork.ts:55` i `:293`:

```ts
const defCache = new Map<string, SettlementDef>()   // klucz: `${gx}_${gz}`
const routeCache = new Map<string, RoadSegment[] | null>()  // klucz: para id
```

Oba są **module-level**, klucz nie zawiera seeda (`cellKey` = `settlementGenerator.ts:59-61`),
i nigdzie nie ma funkcji czyszczącej. `rebuildWorld()` (`createApp.ts:240-281`) tworzy nowy
`ChunkManager` i nowy `SettlementsManager`, ale te dwie mapy przeżywają.

**Skutek:** po „New Game" (nowy seed) albo po zmianie parametrów terenu z GUI, `paramsFor()`
(`chunkManager.ts:229-260`) dostaje **drogi i pozycje osad ze starego świata**. Teren zostanie
wyrzeźbiony korytarzami dróg prowadzącymi donikąd, a `villageSegmentsNear` wypłaszczy polany
w miejscach, gdzie żadnej wioski nie ma.

Zauważ, że `SettlementsManager` ma **własny**, instancyjny `defCache`
(`SettlementsManager.ts:68`) — więc po rebuildzie dwa cache się rozjeżdżają: manager liczy
nowe defy, `roadNetwork` serwuje stare.

**Fix:** wyeksportować `clearRoadNetworkCaches()` i wołać na starcie `rebuildWorld()`, albo
wpiąć seed w klucz (`${seed}_${gx}_${gz}`) i zostawić eviction.

### 3. [High] „New Game" nie resetuje ekwipunku, questów, exp ani relacji

`createApp.ts:417-422`:

```ts
onNewGame: () => {
  if (!window.confirm(...)) return
  void clearSave()
  config.seed = randomSeed()
  void rebuildWorld(true)
},
```

`inventory` (`:189`) i `questManager` (`:227`) to `const` tworzone raz przy starcie aplikacji.
`rebuildWorld` ich nie dotyka — resetuje tylko `collectedItemIds`, dropy i ogniska.

**Skutek:** nowa gra startuje z pełnym ekwipunkiem i ukończonymi questami poprzedniej. Co gorsza,
`clearSave()` czyści IndexedDB, ale autosave (`setInterval` co 60 s, `:489`) natychmiast zapisze
z powrotem stary progress do nowego save'a. HUD też pokaże stary stan, bo `hud.setInventory`
nie jest wołane po rebuildzie.

**Fix:** dołożyć `inventory.clear()` + odtworzenie `QuestManager` (albo `questManager.reset()`)
do gałęzi `resetCollectedItems === true` w `rebuildWorld`, plus `hud.setInventory` / `hud.setExp`.

### 4. [Medium] `chunkWorkerPool`: `worker.onerror` nigdy nie odrzuca zadania → wisząca Promise

`src/terrain/chunkWorkerPool.ts:96-100`:

```ts
worker.onerror = (event) => {
  free.push(worker)
  console.error('[chunkWorkerPool] worker error', event.message)
  pump()
}
```

Handler nie wie, które zadanie leciało na tym workerze — nie usuwa go z `inflight`, nie woła
`job.reject()`. Promise zwrócona z `requestChunk` nigdy się nie rozstrzyga.

**Skutek:** `ChunkRecord.state` zostaje na `'generating'` na zawsze (`pendingPromise` nigdy nie
przechodzi przez `.finally`), rekord nie jest usuwalny normalną ścieżką, a `inflight` przecieka.
Najgorszy wariant: błąd trafi w jeden z 9 chunków startowych — `await chunkManager.waitForChunks(homeChunks())`
(`createApp.ts:181`) nigdy nie wróci, `createApp` nie dokończy, **loading screen zostaje na ekranie**.

**Fix:** trzymać mapę `worker → currentJobId` (albo przekazać `job` do domknięcia w `pump()`),
w `onerror` odrzucić bieżące zadanie i wyczyścić `inflight`/`keyToId`.

### 5. [Low] Współdzielony atrybut geometrii trawy jest zwalniany przez `dispose()` pojedynczego chunka

`src/terrain/grass.ts:278-280` — każdy chunk dostaje własne `BufferGeometry`, ale wstawia do niej
**ten sam** obiekt `template.position` / `template.index` (tworzony raz w `createGrassSystem`).
`WorldGrassChunk.dispose()` (`:300-304`) woła `geometry.dispose()`, co w three.js kasuje bufory
GPU **wszystkich** atrybutów tej geometrii — czyli także współdzielonego szablonu, używanego
jeszcze przez pozostałe kilkadziesiąt chunków trawy.

three.js odtworzy bufor leniwie przy następnym renderze, więc nie widać artefaktu — ale jest to
niepotrzebny re-upload szablonu przy każdym unload chunka trawy.

**Fix:** `template.position.clone()` / `template.index.clone()` per chunk (to ~20 wierzchołków,
koszt zerowy), albo przejść na `InstancedBufferGeometry` ze współdzieloną nie-instancyjną
częścią zarządzaną osobno.

### 6. [Low] Pętla `tick()` nie jest wstrzymywana na czas `rebuildWorld()`

`rebuildWorld` (`createApp.ts:240-281`) woła `dispose()` na `ocean`, `chunkManager`, `fauna`,
`settlementsManager`, `itemSpawners`, `droppedItems`, `placedFires`, a potem `await`-uje generację
chunków. `tick()` w tym czasie leci dalej i operuje na zwolnionych obiektach:
`ocean.follow()` / `ocean.update()` na rozmontowanym oceanie, `player.update()` na samplerach
starego `chunkManager` (mapa `chunks` pusta → fallback na analityczny sampling CPU).

Nic tu nie wybucha (dispose'y zostawiają puste kolekcje), ale to niepotrzebna praca i
kruche założenie. Flaga `rebuilding` już istnieje — wystarczy jej użyć jako bramki w `tick`.

### 7. [Info] Rozjazd dokumentacji: domyślna rozdzielczość

`worldConfig.ts:70`: `const DEFAULT_RESOLUTION = 65`.
`CLAUDE.md` mówi „Resolution: 65 … 769 (Insane); default **193**".

---

## Findings — wydajność

### P1. [High] Trawa — koszt gęstości jest płacony nieefektywnie

> **Korekta po feedbacku (2026-08-08):** pierwsza wersja tego findingu rekomendowała zejście
> z `density`. To błędna rekomendacja — wysoka gęstość jest **świadomą decyzją projektową**
> (rzadka trawa wygląda źle, wartość była dobierana wizualnie), więc jej obniżenie to regresja
> wyglądu, a nie fix. Poniżej przeredagowane: jak zachować dokładnie ten sam wygląd taniej.
> Zastrzeżenie: koszt jest **wyliczony z kodu, nie zmierzony profilerem**.

#### P1.0 Najpierw: nie wiadomo, jaka gęstość jest realnie uruchomiona

Rozjazd konfiguracji:

| Miejsce | Wartość |
|---|---|
| `worldConfig.ts:143` (default) | `density: 12000` |
| `createDebugGui.ts:349` (zakres suwaka) | `120000 – 400000` |

Default leży **10× poniżej minimum własnego suwaka**, a `density` persystuje w localStorage
(`worldConfig.ts:221`). Skutek: pierwsze dotknięcie suwaka skacze z 12 000 na ≥120 000 i tam
zostaje między sesjami. Realna wartość zależy więc od historii interakcji z GUI, nie od defaultu.
**Do pogodzenia w pierwszej kolejności** — bez tego nie da się sensownie tuningować ani mierzyć.

#### P1.1 Weryfikacja, czy trawa w ogóle jest wąskim gardłem

GUI → Grass → `Enabled` off, porównać FPS. Pięć sekund, rozstrzyga zanim cokolwiek się zmieni
w kodzie. Wszystko poniżej zakłada, że ten test wypadł na niekorzyść trawy.

#### P1.2 Skala pracy (wyliczona z kodu)

`syncGrassForRecord` (`chunkManager.ts:297-302`) iteruje tylko po istniejących rekordach chunków,
a te istnieją wyłącznie w promieniu `loadRadius: 3` → 7×7 = 49 chunków z trawą. Przy `density: 12000`
to ~590 000 losowań; przy 120 000 (minimum suwaka) — ~5,9 mln. Każdy kandydat to ~9 wywołań
`sampleApronGrid`. Generacja leci **synchronicznie na main threadzie** w `.then()` po odebraniu
tile'a (`chunkManager.ts:354` → `ensureGrass`) — jeden blok na każdy wczytany chunk.
Każde ocalałe źdźbło to 2 skrzyżowane quady × 4 segmenty = 16 trójkątów, `DoubleSide`, 20 wierzchołków.

#### P1.3 Jak zbić koszt bez zmiany gęstości

**(a) LOD przez `InstancedMesh.count`.** Źdźbła powstają w losowej kolejności przestrzennej
(seeded random), więc renderowanie *prefiksu* instancji to nieobciążona podpróbka przestrzenna.
`count` można obniżyć bez przebudowy geometrii i bez realokacji. Dalekie chunki renderują 25–50%
źdźbeł — przy perspektywie i mgle różnica jest niewidoczna. `computeBoundingSphere` policzone
dla pełnego zestawu pozostaje poprawne (nadzbiór). ~5 linii, nie rusza `density`.

**(b) Shader trawy nie ma mgły — osobny błąd wizualny.** `grass.ts:156-164` to
`gl_FragColor = vec4(vColor * brightness, 1.0)`, bez członu fog; `ShaderMaterial` (`:175-183`)
nie ma też `fog: true`, więc three.js nie wstrzyknie uniformów mgły. Teren
(`MeshStandardMaterial`) blaknie w `scene.fog`, trawa nie. Przy `fogFar` 180–260
(`dayNight.ts:66-67`) i zasięgu trawy ~200 jednostek zewnętrzny pierścień zostaje ostry na tle
wyblakłego terenu. Naprawa poprawia wygląd *i* uzasadnia agresywniejszy LOD z punktu (a).

**(c) Kolejność testów odrzucających.** `grass.ts:223-253` — 9 sampli na kandydata, z czego
**4 to test nachylenia** (`:226-231`), wykonywany jako drugi, czyli na niemal każdym kandydacie.
Przeniesienie go za tanie testy (ridge / roadTint / moisture — po 1 sampel) ścina próbkowanie
o ~30–40%.
*Warunek zachowania identycznego layoutu:* jedyne `random()` w pętli odrzuceń to roll
`random() > density` (`:254`). Testy oparte na samplach nie konsumują RNG, więc można je dowolnie
przestawiać **między sobą**, dopóki roll zostaje ostatni — do niego trafia ten sam zbiór
kandydatów w tej samej kolejności, więc trawa wychodzi bit-w-bit taka sama.

**(d) `matrices.push(matrix.clone())`** (`:265`) — jeden jednorazowy `Matrix4` na ocalałe źdźbło,
potem i tak przepisywany do `InstancedMesh` (`:292`). Zapis prosto do prealokowanego
`Float32Array` (`candidatesPerChunk * 16`, na końcu `subarray`) usuwa setki tysięcy obiektów
tymczasowych. Czysty zysk GC, zero zmian wizualnych.

**(e) Worker.** Przeniesienie generacji kandydatów do chunk workera (faza 5 planu trawy)
likwiduje hitch per-chunk całkowicie, zamiast go zmniejszać — i też nie dotyka gęstości.

#### P1.4 `radius: 10` przy `loadRadius: 3` — martwy knob, nie „za dużo trawy"

Chunki nie istnieją poza `loadRadius`, więc trawa fizycznie nie sięga dalej niż 3 — wartości
4–12 na suwaku `Render radius (chunks)` nie robią nic. Dodatkowo `grassUnloadRadius = radius + 1 = 11`
oznacza, że własna histereza trawy nigdy się nie uruchamia: trawa znika dopiero razem z chunkiem.
Landmina: podniesienie `loadRadius` sprawi, że `radius: 10` nagle zacznie obowiązywać i zasięg
trawy skoczy skokowo. Do zsynchronizowania z `loadRadius` (albo zaklamrowania w kodzie).

### P2. [Medium] `buildChunkGeometry`: alokacja `Vector3` na wierzchołek + 6× redundantny bilinear

`terrain/buildChunkGeometry.ts:62-71` — `normalAt()` robi `new THREE.Vector3(...)` przy **każdym**
wierzchołku. Przy `resolution: 193` to ~37 000 alokacji na chunk; przy 769 — ~590 000. Wystarczy
jeden scratch vector poza pętlą (albo zapis prosto do `normalAttr`).

W tej samej pętli (`:80-142`) jest 6 osobnych wywołań `sampleApronGrid` dla tego samego `(x, z)`,
z których każde od nowa liczy `fx/fz`, `floor`, `tx/tz` i cztery clampy. Wspólny helper
„policz wagi raz, spróbkuj N siatek" zdejmuje ~5/6 tej pracy.

Dodatkowo każdy chunk dostaje **własny** `MeshStandardMaterial` (`:148-153`) o identycznych
parametrach — jeden współdzielony materiał terenu (dysponowany raz, przy teardownie) zmniejszy
liczbę przełączeń stanu i ilość obiektów do sprzątania.

Uwaga kierunkowa: cała ta funkcja to główne źródło hitchu przy streamingu i jest w 100% czystą
arytmetyką na `Float32Array` — nadaje się do przeniesienia do workera z transferable buffers
(worker zwracałby gotowe `position`/`normal`/`color`).

### P3. [Medium] Zapisy do DOM w każdej klatce

- `NpcAgent.update` (`:493-497`): `labelEl.textContent = ...` **i** `labelEl.style.opacity = ...`
  co klatkę, dla każdego NPC każdej załadowanej osady — nawet gdy nic się nie zmieniło.
  Ten sam plik ma już wzorzec „idempotentnie" w `setHighlighted` (`:371-375`).
- `AnimalAgent.update` (`:309-311`) i etykiety spawnerów (`createFauna.ts:209-213`): `style.opacity` co klatkę.
- `createApp.ts:694-695`: `hud.setTime(...)` + `hud.setExp(...)` co klatkę → 3 zapisy `textContent`
  (`formatClock` liczy nowy string co klatkę, a zegar zmienia się raz na ~333 ms przy `dayLengthSec: 480`).

Zapis `textContent` unieważnia layout węzła; przy kilkudziesięciu etykietach CSS2D to realny
koszt. Fix jest mechaniczny: cache'ować ostatnią wartość i pisać tylko przy zmianie
(dokładnie tak, jak robi to już `Fauna.setSpawnerMarker`, `createFauna.ts:226-234`).

### P4. [Medium] `buildInteractables()` przebudowuje pełną listę kandydatów w każdej klatce

`createApp.ts:587-595` + `:771-869`. Co klatkę powstaje tablica z jednym świeżym obiektem na:
każdego NPC, każdą studnię, **każde drzewo każdej załadowanej osady** (`landmarks.trees` to
setki pozycji dla domowej wioski z pasem leśnym), każde zwierzę, każdy spawner, każdy item ze
spawner-poola i każdy dropiony item. Do tego `chunkManager.getNearbyItems` (`:550-567`)
skanuje `children` grupy itemów **wszystkich** załadowanych chunków, a `gazeCandidates`
(`:605-609`) buduje drugą tablicę.

Wszystko to jest potem odfiltrowane do promienia 2.5 / 5 jednostek. Docstring mówi
„Cheap: a few dozen objects total, dominated by settlement trees" — przy multi-settlement
streamingu i pasie leśnym to już nie kilkadziesiąt.

**Fix:** albo przebudowywać listę tylko gdy gracz się ruszył o próg / świat się zmienił
(ten sam wzorzec `recheckDistance` co w `chunkManager.update`), albo wstępnie odfiltrować
po `GAZE_RANGE` przed alokacją obiektu opisu.

### P5. [Low] Śmieciowanie w pętli głównej

W jednej klatce (`createApp.ts:674-718`):
- `settlementsManager.getLoaded()` wołane **6 razy**, za każdym razem nowa tablica (`SettlementsManager.ts:178-184`),
- `litFires` — `flatMap` + `filter` + `map` (3 tablice),
- `minimap.update(...)` — kolejny `map` z obiektami `MinimapSettlement`,
- `skyParamsFromTime()` — **3 wywołania na klatkę** (`applyDayNight`, `ambientAudio.update`,
  oraz `createFauna.ts:180` w `fauna.update`), każde zwraca świeży 11-polowy obiekt.

Policzenie `const loaded = settlementsManager.getLoaded()` i `const sky = skyParamsFromTime(...)`
raz na klatkę i przekazanie dalej to zmiana na kilka linii.

### P6. [Low] Markery questowe przeliczane dla wszystkich NPC co klatkę

`createApp.ts:681-688` — `questManager.labelMarker(npc.name)` dla każdego NPC każdej osady,
a `labelMarker` (`QuestManager.ts:249-262`) iteruje po wszystkich definicjach questów.
Stan questów zmienia się tylko w `onInteract`/`onInteractObjective` — wystarczy odświeżać markery
tam (albo trzymać `dirty` flagę w `QuestManager`).

### P7. [Low] `antialias: true` w rendererze jest kosztem bez efektu

`render/createRenderer.ts:5` włącza MSAA na domyślnym framebufferze, ale wszystko idzie przez
`EffectComposer` do offscreenowych render targetów — i komentarz w `createPostProcessing.ts:17-19`
sam to stwierdza („once we render into the composer's offscreen targets that AA is lost"),
dlatego dodano `SMAAPass`. `antialias: true` alokuje więc wielosamplowy backbuffer, z którego
nic nie korzysta. Do usunięcia.

### P8. [Low] `applyDayNight` przeliczany w każdej klatce

`createApp.ts:690-692` → `applyDayNight` (`:890-920`) przy `dayNight.enabled` co klatkę: zapis
uniformów `Sky`, pozycji słońca, trzech intensywności, koloru/near/far mgły, a przez
`setWaterDayNight`/`setGrassDayNight` — pętla po wszystkich chunkach z 3 `Color.copy().lerp()`
na chunk wody. Przy `dayLengthSec: 480` zmiana między klatkami jest podpikselowa. Throttle na
delcie `timeOfDay` (np. 1/2000 doby) usuwa to praktycznie w całości.

### P9. [Low] Setki pojedynczych draw calli wokół domowej wioski

`buildSettlementProps` (`props.ts:616-724`) sadzi ~2 + ~14 + ~18 + ~13 klastrów × 4–13 propsów,
każdy jako osobny `cloneProp` → osobny obiekt w scenie. To kilkaset draw calli w jednym miejscu
mapy (plus tyle samo w passie cieni — `loadGltf.ts:36-38` ustawia `castShadow` na wszystkim).

Podobnie `chunk-items` i `chunk-environment` (`chunkManager.ts:390-424`): `createItemMesh`
(`items/items.ts:21-96`) i `createLargeRock`/`createRockCluster`/`createFallenLog`/`createCampfire`
tworzą **nową geometrię i nowy materiał na każdą instancję**. Materiały tu są bezstanowe —
powinny być modułowymi stałymi; geometrie prymitywów też można współdzielić per-kind.

Kierunek docelowy dla roślinności: `InstancedMesh` per (gatunek, chunk).

### P10. [Info] Martwy kod

- `AnimalAgent.get xz()` (`AnimalAgent.ts:236-238`) — alokuje `Vector2`, nieużywany nigdzie.
- `NpcAgent.disposeLabel()` (`NpcAgent.ts:508-510`) — alias na `dispose()`, nieużywany.

---

## Findings — refactoring

### R1. [Łatwe] `mulberry()` to kopia `createSeededRandom()`

`settlement/props.ts:399-408` jest bajt w bajt tym samym co `world/parseSeed.ts:2-11`
(ten sam Mulberry32, ta sama stała `0x6d2b79f5`). Pozostałe **17** miejsc w kodzie importuje
`createSeededRandom`. Do usunięcia.

### R2. [Łatwe] `findAction` / `playAction` / `crossfade` potrojone

Ta sama logika w `PlayerController.ts:265-282`, `NpcAgent.ts:512-549`, `AnimalAgent.ts:536-553`.
Różnią się tylko listą klipów i tym, że `NpcAgent` fade-outuje pozostałe akcje ręcznie zamiast
trzymać `currentAction`. Prosi się o `src/shared/AnimationSet.ts` (`{ find, play(name) }`),
przy okazji ujednolicając zachowanie.

### R3. [Łatwe] `steerTo` / `isWalkable` zduplikowane między NPC a fauną

`NpcAgent.steerTo` (`:606-629`) i `AnimalAgent.steerToward` (`:481-502`) mają identyczny
mechanizm „spróbuj pełnego kroku, potem ślizg po X, potem po Z" oraz identyczne
`isWalkable = sampleHeight(x,z) > waterLevel + WATER_MARGIN` (obie klasy definiują też własną
stałą `WATER_MARGIN = 0.3`). Jedna funkcja `steerWithShoreSlide(position, dest, speed, dt, isWalkable)`
w `src/shared/`.

### R4. [Łatwe] `distanceToSegment` duplikuje `projectOntoSegment`

`props.ts:434-441` vs `chunkHeightmap.ts:456`. Komentarz przy kopii sam to przyznaje
(„small local copy … pulling in the terrain module here just for this would be overkill").
Właściwe miejsce to `src/math/` — wtedy ani `props.ts` nie zależy od terenu, ani nie ma kopii.

### R5. [Średnie] `createApp.ts` — 1018 linii, cztery odpowiedzialności

Plik miesza: bootstrap sceny, przebudowę świata (`rebuildWorld` żongluje 7 współzależnymi
obiektami), pętlę symulacji, obsługę interakcji i składanie save'a. Trzy konkretne, bezpieczne cięcia:

1. **Kaskada stanu modali** (`:542-672`) — 6 gałęzi `else if`, z których pięć robi to samo
   („skonsumuj wszystkie klawisze + wyczyść highlight"), różniąc się jednym szczegółem.
   Zamiana na `activeModal()` zwracające union type + jedną wspólną ścieżkę „modal otwarty"
   usuwa ~60 linii i eliminuje ryzyko, że nowy modal zapomni jednego `consume*`.
2. **`WorldBundle`** — siódemka `chunkManager`/`ocean`/`settlementsManager`/`fauna`/`itemSpawners`/
   `droppedItems`/`placedFires` jest tworzona, dysponowana i podmieniana zawsze razem
   (raz na starcie `:179-188`, raz w `rebuildWorld` `:250-272`). Jeden `createWorldBundle(scene, config, …)`
   z własnym `dispose()` znosi duplikat i klasę błędów „dodałem system, zapomniałem o rebuildzie".
3. **Pętla** — `tick()` do `createGameLoop(bundle, ui, …)`.

### R6. [Łatwe] `chunkManager.ensureLoaded` — trzykrotnie ten sam blok

`:356-424`: dla `vegetation`, `items` i `environment` powtarza się identyczne
`apronOriginWorld(...)` + definicja `sampleTileHeight` + `new Group()` + pętla + `scene.add`.
Do wyciągnięcia jako `buildPlacementGroup(name, placements, makeProp)`; `sampleTileHeight`
policzyć raz przed trzema blokami.

### R7. [Łatwe] Cztery bliźniacze memo-fabryki szablonów

`chunkManager.ts:59-78` — `getTreeTemplates` / `getBushTemplates` / `getCactusTemplates` /
`getReedTemplates` to ta sama funkcja cztery razy. Jedna `memoTemplates(specs, fallback)`
zwracająca gettera.

### R8. [Łatwe] Dwa pliki `HealthState.ts` o różnym znaczeniu

`src/fauna/HealthState.ts` jest dziś głównie re-eksportem `src/shared/HealthState.ts` plus
tabelami obrażeń fauny (`MAX_HP`, `DAMAGE_TABLE`, `damageFor`). Dwa pliki o tej samej nazwie
w różnych katalogach są mylące przy nawigacji (i przy grepie) — nazwa `fauna/faunaCombat.ts`
oddaje faktyczną treść.

### R9. [Łatwe] `includes()` po tablicach faz w pętli NPC

`NpcAgent.update` (`:381-388`) robi `FATIGUE_PHASES.includes(...)`, `REST_PHASES.includes(...)`
i `PAUSE_INTERRUPTIBLE_PHASES.includes(...)` — trzy liniowe skany tablic na NPC na klatkę.
`Set<Phase>` albo `Record<Phase, {fatigue: boolean, restful: boolean, interruptible: boolean}>`
jest i szybsze, i czytelniejsze (jedna tabela zamiast trzech list do zsynchronizowania przy
dodaniu fazy).

---

## Co jest zrobione dobrze (żeby nie zepsuć przy refactoringu)

- **Determinizm** — konsekwentne `seed ^ hashChunk(cx, cz) ^ salt` z osobną solą per system
  (roślinność / trawa / itemy / environment), plus jawne komentarze *dlaczego* `Math.random()`
  jest w danym miejscu zakazane (`props.ts:236`, `chunkManager.ts:382`).
- **Histerezy** load/unload — ten sam wzorzec zastosowany spójnie na trzech poziomach
  (chunki, trawa, osady), za każdym razem z uzasadnieniem w komentarzu.
- **Apron w `buildChunkGeometry`** — poprawne rozwiązanie szwów normalnych, z ostrzeżeniem
  („`computeVertexNormals()` must NOT be called on it") chroniącym przed regresją.
- **Komentarze wyjaśniające decyzje, nie kod** — np. `createApp.ts:118-126` (dlaczego klasa
  nie może się nazywać `seedvale-touch`) czy `:460-470` (dlaczego usunięto Fullscreen API).
  To realnie ratuje przed cofnięciem naprawionych bugów.
- Czysty `tsc --noEmit` i `eslint` na całym repo.

---

## Sugerowana kolejność (ocena zysk/koszt)

| # | Zadanie | Typ | Koszt |
|---|---|---|---|
| 0 | Pogodzić default `density` (12000) z zakresem suwaka (120000–400000) + test `Enabled` off (P1.0, P1.1) | bug/pomiar | trywialny |
| 1 | Trawa: mgła w shaderze + LOD przez `count` + kolejność testów + bez `Matrix4` (P1.3 a–d) | perf/wygląd | mały |
| 2 | Guard w `disposeObject3D` dla zasobów z cache'a (Finding 1) | bug | mały |
| 3 | Czyszczenie cache'ów `roadNetwork` przy rebuildzie (Finding 2) | bug | mały |
| 4 | Reset inventory/questów w „New Game" (Finding 3) | bug | mały |
| 5 | `onerror` w worker poolu (Finding 4) | bug | mały |
| 6 | Zapisy DOM tylko przy zmianie (P3) | perf | mały |
| 7 | Scratch vector + wspólne wagi w `buildChunkGeometry` (P2) | perf | mały |
| 8 | `antialias: false`, throttle `applyDayNight` (P7, P8) | perf | trywialny |
| 9 | Duplikaty R1–R4, R6–R9 | refactor | mały |
| 10 | Cache'owanie `buildInteractables` (P4) | perf | średni |
| 11 | Trawa do workera (P1c), `buildChunkGeometry` do workera (P2) | perf | duży |
| 12 | `WorldBundle` + rozbicie `createApp.ts` (R5) | refactor | duży |

## Follow-up

Pozycje 1–9 to kandydaci na wpisy w [issues/README.md](../issues/README.md).
Pozycje 11–12 zasługują na własne plany w [plans/](../plans/README.md).
