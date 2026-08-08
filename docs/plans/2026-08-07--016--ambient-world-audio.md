# Plan: Ambient audio świata (dźwięki tła, zależne od obszaru)

**Status:** `in progress` — fundament audio (`src/audio/createWorldAudio.ts`) + warstwa dzień/noc (`src/audio/createAmbientAudio.ts`, świerszcze w nocy, crossfade po `dayFactor`) zaimplementowane; sampler obszaru (ocean/las/góry) i mixer runtime mają teraz konkretny projekt gotowy do implementacji (2026-08-08 review — patrz sekcje 2-4: reużywają istniejący `ChunkManager`/`biomeWeightsAt`, dwa z trzech brakujących assetów już leżą w `public/sounds/` nieużywane), ale kod jeszcze nie napisany
**Created:** 2026-08-07
**Scope:** [world/](../../src/world/) (ocean/water/dayNight), [terrain/](../../src/terrain/) (biomy/regiony); niezależne od NPC, ale dzieli fundament audio z [npc-reaction-sounds.md](./2026-08-07--014--npc-reaction-sounds.md)

## Problem

W grze nie ma żadnego dźwięku tła — cisza niezależnie od tego, gdzie stoi gracz. Świat ma już zróżnicowane obszary (ocean/woda, biomy wilgotne/suche z `moisture`, regiony makro — continentalness/mountainness, cykl dnia/nocy), ale nic z tego nie ma odzwierciedlenia w audio.

## Cel

1. **Bazowy ambient** — pętla tła, zmienna dzień/noc (np. cykady/świerszcze w nocy, ptaki w dzień) — [pomysł usera: „cykanie świerszczy”].
2. **Warstwy zależne od obszaru** — dodatkowa warstwa audio crossfadowana zależnie od pozycji gracza względem terenu, np.:
   - blisko oceanu/dużej wody → szum fal
   - w gęstym lesie (wysoka `moisture` + drzewa) → więcej ptaków/owadów, cichszy wiatr
   - wysoko w górach (rock/snow biome) → wiatr, brak owadów
3. **Płynne przejścia** — crossfade między warstwami przy przemieszczaniu się gracza, nie twarde przełączanie (unikać "kafelkowania" dźwięku na granicach).

## Stan obecny (kontekst techniczny)

- **Brak systemu audio w projekcie w ogóle** — to nakłada się z [npc-reaction-sounds.md](./2026-08-07--014--npc-reaction-sounds.md), które też zakłada "pierwszy dźwięk w grze poza ciszą". **Który plan wyląduje pierwszy, buduje bazowy `AudioListener`/mixer** (`THREE.AudioListener` dopięty do kamery + `THREE.Audio`/`THREE.PositionalAudio`), drugi go reużywa zamiast duplikować.
- `dayNight.ts` ma `phaseName(timeOfDay)` — gotowy sygnał do krzyżowania warstwy dzień/noc.

### Update (2026-08-08, review przed implementacją sekcji 2-4)

Sprawdzone w kodzie — obie niepewności z akapitu wyżej ("czy trzeba pisać sampler od zera", "czy jest rozróżnienie ocean vs lokalna woda") są już rozstrzygnięte na korzyść dużo mniejszego zakresu pracy, niż pierwotny szkic zakładał:

- **Main-thread sampler terenu już istnieje, nie trzeba go pisać.** `ChunkManager` (`src/terrain/chunkManager.ts`, typ `ChunkManager` ok. linii 154-176) już eksponuje dokładnie takie funkcje: `sampleHeight`/`sampleFloor: HeightSampler`, `sampleContinentalness`/`sampleMountainRidge`/`sampleMoistureRegion: (x, z) => number`, oraz `waterLevel: number`. Czytają bilinearnie z aktualnie załadowanego chunka, z fallbackiem na analityczny sampler (`chunkHeightmap.ts`: `sampleContinentalnessAt`/`sampleMoistureRegionAt`/`sampleMountainRidgeAt`) gdy chunk jeszcze się generuje — to jest dokładnie ten sam mechanizm, którego już dziś używa `settlementsManager`/`roadNetwork.ts` (patrz `createApp.ts` `buildSettlementsManager`). Sekcja 3 niżej to więc głównie kompozycja istniejących funkcji, nie nowa infrastruktura próbkowania. **To żywy kod — zweryfikuj przy starcie, że te nazwy/sygnatury się nie zmieniły.**
- **Klasyfikacja obszaru też już istnieje.** `biomeWeightsAt(moistureRegion, altitude01, region)` (`src/terrain/biomeRegions.ts`) liczy desert/swamp/forest wagi z dokładnie tych osi (moisture + wysokość), które audio i tak by chciało — `buildChunkGeometry.ts:129-130` pokazuje dokładny wzór na `altitude01` z `floorH`/`waterLevel`/`heightScale`. Reużycie tej funkcji oznacza, że warstwa "las" w audio pokrywa się wizualnie z tym, co gracz widzi (ten sam próg dla lasu/pustyni/bagna).
- **Ocean vs lokalna woda: nie ma osobnego rozróżnienia, i nie jest potrzebne.** `createOcean.ts` (jeden wielki plane, podąża za graczem) i `createWater.ts` (per-chunk shading jezior/rzek) to faktycznie dwa różne systemy renderujące, ale oba siedzą na tej samej osi `continentalness` z `RegionParams` (`config.terrain.region.oceanThreshold`/`coastThreshold`, dziś `0.32`/`0.45` — patrz `chunkHeightmap.ts`, `sampleRawTexel`). "Blisko oceanu" dla audio można więc odczytać wprost z `continentalness` zamiast liczyć dystans do wody (dziś nie ma do tego funkcji poza per-chunk `detectWaterBodies`, która nie nadaje się do zapytań o dowolny punkt gracza).
- **Assety już częściowo pobrane, nieużywane w kodzie poza night crickets** — patrz sekcja 2 niżej.

Poniższe sekcje 2-4 są przepisane pod te ustalenia — konkretne, ale kod cytowany jako szkic do zweryfikowania przy starcie implementacji (może się zmienić w międzyczasie), nie do wklejenia 1:1.

## Zakres (szkic — do doprecyzowania przy starcie)

### 0. Warstwa dzień/noc (świerszcze) — `done`

Zawężony pierwszy krok (na prośbę usera: "nocne dźwięki - tylko w nocy"), przed sekcjami 2-4 pełnego planu. `src/audio/createAmbientAudio.ts` (`createAmbientAudio(worldAudio): AmbientAudio`):

- Jedna pętla — `public/sounds/ambient-night-crickets-loop-01.wav` — przez `worldAudio.createLoop()`.
- `update(dayFactor)` ustawia target gain na `(1 - dayFactor) * 0.35` — pełna głośność w nocy, cichnie płynnie w dzień, bez twardego przełącznika po zegarze; crossfade robi już `WorldAudio.update()` (gain lerp).
- Wpięte w `createApp.ts`: `ambientAudio.update(skyParamsFromTime(dayNight.timeOfDay).dayFactor)` w pętli tick (niezależnie od `dayNight.enabled`), `dispose()` w cleanup.
- Poza zakresem tego kroku: warstwa dzienna (ptaki/owady) i warstwy terenowe (ocean/las/góry) — nadal `planned` w sekcjach 2-4 niżej.

### 1. Fundament audio — `done`

Zaimplementowany przed `npc-reaction-sounds.md`, więc tamten plan go reużywa (nie na odwrót, jak sugerował oryginalny szkic). `src/audio/createWorldAudio.ts` (`createWorldAudio(camera): WorldAudio`, nazwa dopasowana do `WorldSky`/`WorldOcean` — nie `createAudioListener.ts` jak w pierwotnym szkicu pliku niżej):

- `AudioListener` na kamerze gracza, `listener.context.resume()` na pierwszy `pointerdown`/`keydown` (autoplay policy).
- `createLoop(url): AudioLoopHandle` — ładuje klip, odtwarza w pętli od gain=0, zwraca `{ setTargetGain(gain), dispose() }`; `update(dt)` w `WorldAudio` co klatkę lerpuje gain każdej aktywnej pętli w stronę targetu (`GAIN_LERP_SPEED = 1.5`/s) — to jest dokładnie mechanizm crossfade, którego potrzebuje sampler obszaru (sekcja 4 niżej).
- `playOnce(url, volume?)` — fire-and-forget klip (dla `npc-reaction-sounds.md`).
- Wpięty w `createApp.ts`: instancja obok `camera`, `worldAudio.update(dt)` w pętli tick, `dispose()` w cleanup. Na razie **bez żadnych realnych klipów** (brak assetów `public/sounds/`) — tylko fundament, `ambientWeightsAt()`/mixer runtime z sekcji 3-4 nadal `planned`.

### 2. Assety — `done` (częściowo), reszta ma jasną ścieżkę

- **Noc (świerszcze):** `done`, już wdrożone — sekcja 0.
- **Dzień (ptaki/wiatr) + wybrzeże (mewy/fale): assety już w repo, tylko nieużywane w kodzie.** Sprawdzone (2026-08-08) w `public/sounds/`:
  - `ambient-forest-loop-01.wav` (170515__rolandasb__forest_ambient_01_loop.wav, freesound.org) — pętla dnia (ptaki/wiatr), kandydat na warstwę `forest`.
  - `ambient-coast-seagulls-waves-01.wav` (56531__juskiddink__seagullswavesjuly-084of4freesound.wav, freesound.org) — mewy+fale, kandydat na warstwę `ocean`.
  - Oba już opisane w `public/sounds/README.md` (tabela "Ambient / background") z source/notes — **nic do pobierania/licencjonowania dla tych dwóch warstw**, tylko wiring (sekcja 4).
- **Brakuje: pętla wiatru na góry/wysokie tereny** (warstwa `mountain`) — jedyny realny brakujący asset. Do znalezienia na freesound.org (szukaj "wind loop ambient" / "mountain wind"), zapisać jako `public/sounds/ambient-mountain-wind-loop-01.wav`, dopisać wiersz do `public/sounds/README.md` (ten sam format co istniejące wiersze: filename / oryginal filename / source url / notes). Do czasu znalezienia dobrego klipu, warstwa `mountain` może zostać wyłączona (gain zawsze 0) bez blokowania reszty.

### 3. Sampler obszaru — kompozycja istniejących funkcji, nie nowa infrastruktura

Patrz „Update (2026-08-08)” wyżej — `ChunkManager` i `biomeWeightsAt` już dają wszystko, czego potrzeba. Szkic (zweryfikuj sygnatury przy starcie — żywy kod):

```ts
// src/audio/ambientWeights.ts (nowy)
import { MathUtils } from 'three'
import { biomeWeightsAt } from '../terrain/biomeRegions'
import type { RegionParams } from '../terrain/chunkHeightmap'

export type AmbientWeights = { ocean: number; forest: number; mountain: number }

/** Podzbiór pól, jakie `ChunkManager` (src/terrain/chunkManager.ts) już zwraca —
 *  w createApp.ts przekaż stamtąd wprost, nie duplikuj samplera. */
export type AmbientSamplers = {
  sampleFloor: (x: number, z: number) => number
  sampleContinentalness: (x: number, z: number) => number
  sampleMountainRidge: (x: number, z: number) => number
  sampleMoistureRegion: (x: number, z: number) => number
  waterLevel: number
  heightScale: number
  region: RegionParams
}

/** Ile dalej (w jednostkach continentalness) za `coastThreshold` fale są jeszcze
 *  słyszalne w głąb lądu — audio-only stała, nie dotyka RegionParams (steruje
 *  generacją terenu, nie dźwiękiem). Do wytuningowania w przeglądarce. */
const COAST_AUDIO_FADE = 0.08
/** altitude01 (jak w biomeColors.ts), od którego wiatr górski słychać niezależnie
 *  od tego, czy gracz stoi akurat na grani (mountainRidge). */
const HIGHLAND_WIND_START = 0.55
const HIGHLAND_WIND_END = 0.75

export function ambientWeightsAt(x: number, z: number, s: AmbientSamplers): AmbientWeights {
  const continentalness = s.sampleContinentalness(x, z)
  const ocean = 1 - MathUtils.smoothstep(
    continentalness,
    s.region.oceanThreshold,
    s.region.coastThreshold + COAST_AUDIO_FADE,
  )

  // Ten sam wzór co buildChunkGeometry.ts (altitude01 → biomeWeightsAt) —
  // "las" w audio pokrywa się z tym, co gracz widzi.
  const floorH = s.sampleFloor(x, z)
  const altitude01 = MathUtils.clamp(
    (floorH - s.waterLevel) / Math.max(s.heightScale, 0.001),
    0,
    1,
  )
  const { forest } = biomeWeightsAt(s.sampleMoistureRegion(x, z), altitude01, s.region)

  const highland = MathUtils.smoothstep(altitude01, HIGHLAND_WIND_START, HIGHLAND_WIND_END)
  const mountain = Math.max(s.sampleMountainRidge(x, z), highland)

  return { ocean, forest: forest * (1 - ocean) * (1 - mountain), mountain }
}
```

- Throttling: nie trzeba liczyć co klatkę — samplery same są tanie (bilinear read z załadowanego chunka), ale `biomeWeightsAt`/kilka `smoothstep` na klatkę to wciąż zbędny koszt. Wołaj co ~0.2-0.25s (sekcja 4 pokazuje `sampleAccum`), gain i tak dalej lerpuje płynnie co klatkę przez istniejący `WorldAudio.update()`.

### 4. Mixer runtime

`createAmbientAudio.ts` już ma mechanizm, jakiego to potrzebuje (`worldAudio.createLoop()` + `setTargetGain()`, `WorldAudio.update(dt)` lerpuje gain co klatkę, `GAIN_LERP_SPEED = 1.5`/s — patrz sekcja 1) — to rozszerzenie istniejącego pliku, nie nowy system:

```ts
// src/audio/createAmbientAudio.ts (rozszerzenie) — szkic, zweryfikuj przy starcie
const FOREST_LOOP_URL = '/sounds/ambient-forest-loop-01.wav'
const COAST_LOOP_URL = '/sounds/ambient-coast-seagulls-waves-01.wav'
const MOUNTAIN_LOOP_URL = '/sounds/ambient-mountain-wind-loop-01.wav' // po dodaniu assetu (sekcja 2)
const SAMPLE_INTERVAL = 0.25 // throttle sekcja 3

// createAmbientAudio(worldAudio, samplers: AmbientSamplers): ...
const forestLoop = worldAudio.createLoop(FOREST_LOOP_URL)
const coastLoop = worldAudio.createLoop(COAST_LOOP_URL)
const mountainLoop = worldAudio.createLoop(MOUNTAIN_LOOP_URL)
let sampleAccum = 0

function update(dt: number, dayFactor: number, playerX: number, playerZ: number): void {
  nightLoop.setTargetGain((1 - dayFactor) * NIGHT_MAX_VOLUME)

  sampleAccum += dt
  if (sampleAccum < SAMPLE_INTERVAL) return
  sampleAccum = 0
  const w = ambientWeightsAt(playerX, playerZ, samplers)
  forestLoop.setTargetGain(w.forest * dayFactor * FOREST_MAX_VOLUME) // ciszej/wyłączone w nocy — ptaki śpią
  coastLoop.setTargetGain(w.ocean * COAST_MAX_VOLUME)
  mountainLoop.setTargetGain(w.mountain * MOUNTAIN_MAX_VOLUME)
}
```

- `createApp.ts` (dziś ok. linii 484) już woła `ambientAudio.update(skyParamsFromTime(dayNight.timeOfDay).dayFactor)` w pętli tick — rozszerzyć wywołanie o `player.mesh.position.x/z` (dostępne w tym samym scope tick()). Zmienia się tylko sygnatura wywołania, nie miejsce.
- `AmbientSamplers` w `createApp.ts` złożyć z `chunkManager`: `{ sampleFloor: chunkManager.sampleFloor, sampleContinentalness: chunkManager.sampleContinentalness, sampleMountainRidge: chunkManager.sampleMountainRidge, sampleMoistureRegion: chunkManager.sampleMoistureRegion, waterLevel: chunkManager.waterLevel, heightScale: config.terrain.heightScale, region: config.terrain.region }` — pola do zweryfikowania wobec aktualnego `ChunkManager` typu (`chunkManager.ts`), mogły się przemianować.
- Głośności (`FOREST_MAX_VOLUME` itd.) do wytuningowania w przeglądarce, jak dziś `NIGHT_MAX_VOLUME = 0.35`.
- Warstwa dzień/noc (cykady, już `done`) crossfaduje niezależnie od warstwy terenowej (ocean/las/góry) — dwa osobne sygnały (`dayFactor` vs `ambientWeightsAt`), nie jeden połączony stan.

## Poza zakresem v1

- Pełny system audio gry (muzyka, SFX akcji, UI sounds) — tylko ambient tła.
- Pozycyjne audio 3D per-źródło (np. konkretna fala rozbijająca się o konkretny kawałek brzegu) — na start warstwy są **globalne/2D**, tylko ich głośność zależy od pozycji gracza, nie panning.
- Pogoda (deszcz, burza) — nie ma jeszcze systemu pogody w grze.
- Głośność sterowana z UI (settings/volume slider) — może być potrzebna od razu jako podstawowy toggle mute, ale pełny mixer głośności to osobna sprawa (game-ui-screens.md).

## Szkic zmian (pliki)

```
src/audio/createWorldAudio.ts     # done: AudioListener na kamerze + helper do zapętlonych warstw z gain lerp (sekcja 1)
src/audio/createAmbientAudio.ts   # done (noc) + rozszerzenie: forest/coast/mountain loopy, update(dt, dayFactor, playerX, playerZ)
src/audio/ambientWeights.ts       # nowy: ambientWeightsAt(x, z, samplers) — kompozycja ChunkManager + biomeWeightsAt (sekcja 3)
src/app/createApp.ts              # wiring: AmbientSamplers z chunkManager, rozszerzyć wywołanie ambientAudio.update() (~linia 484)
public/sounds/ambient-forest-loop-01.wav          # done: już w repo, nieużywany w kodzie
public/sounds/ambient-coast-seagulls-waves-01.wav # done: już w repo, nieużywany w kodzie
public/sounds/ambient-mountain-wind-loop-01.wav   # brakuje: jedyny nowy asset do znalezienia (sekcja 2)
public/sounds/README.md           # dopisać wiersz dla mountain-wind po znalezieniu
```

## Done when

- [ ] Bazowy ambient loop gra w tle (cichy, nie irytujący przy dłuższej sesji)
- [ ] Warstwa dzień/noc: cykady w nocy, ptaki/owady w dzień, płynne przejście na granicy fazy
- [ ] Warstwa terenowa: szum fal wyraźnie głośniejszy blisko oceanu/dużej wody, cichnie w głębi lądu
- [ ] Przejście między warstwami przy chodzeniu jest płynne (brak słyszalnych "kliknięć"/nagłych skoków głośności)
- [ ] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`

## Do przetestowania (http://localhost:5577/)

1. Stój w miejscu dłuższą chwilę w dzień, potem poczekaj/przewiń do nocy (time multiplier) — dźwięk tła powinien się zmienić (ptaki→cykady), płynnie.
2. Idź od centrum osady w stronę oceanu/dużej wody — szum fal (warstwa `ocean`, z `sampleContinentalness` vs `oceanThreshold`/`coastThreshold`) powinien narastać stopniowo, nie pojawić się nagle na jakiejś granicy.
3. Odejdź od wody w głąb lądu/w góry (wysoki `altitude01` i/lub `mountainRidge`) — szum fal powinien zanikać, wiatr (jeśli asset już dodany) narastać.
3b. Idź w las (wysoka `moistureRegion`, `biomeWeightsAt.forest` blisko 1) vs pustynię/bagno — warstwa `forest` powinna być głośniejsza w lesie, cichsza/zerowa w pustyni (gdzie `forest` waży mało) i w bagnie (`forest` też przygaszony przez `desert`/`swamp` w `biomeWeightsAt`).
4. Sprawdź głośność ogólną — nic nie powinno przytłaczać (na razie bez UI volume, ale wartości w kodzie rozsądne).
5. Sanity check: reszta audio (jeśli `npc-reaction-sounds.md` już wdrożone) — dźwięki NPC dalej słyszalne, nie zagłuszone przez ambient.

## Następnie

- Volume/mute toggle w UI (pause menu lub przyszły settings screen)
- Pozycyjne audio 3D dla konkretnych źródeł (np. wodospad, ognisko)
- Pogoda jako kolejna warstwa ambientu
