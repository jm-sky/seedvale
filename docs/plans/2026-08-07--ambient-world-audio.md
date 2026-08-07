# Plan: Ambient audio świata (dźwięki tła, zależne od obszaru)

**Status:** `in progress` — fundament audio (`src/audio/createWorldAudio.ts`) zaimplementowany; assety, sampler obszaru i mixer runtime nadal `planned`
**Created:** 2026-08-07
**Scope:** [world/](../../src/world/) (ocean/water/dayNight), [terrain/](../../src/terrain/) (biomy/regiony); niezależne od NPC, ale dzieli fundament audio z [npc-reaction-sounds.md](./2026-08-07--npc-reaction-sounds.md)

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

- **Brak systemu audio w projekcie w ogóle** — to nakłada się z [npc-reaction-sounds.md](./2026-08-07--npc-reaction-sounds.md), które też zakłada "pierwszy dźwięk w grze poza ciszą". **Który plan wyląduje pierwszy, buduje bazowy `AudioListener`/mixer** (`THREE.AudioListener` dopięty do kamery + `THREE.Audio`/`THREE.PositionalAudio`), drugi go reużywa zamiast duplikować.
- Dane o obszarze już istnieją, ale są rozproszone po workerach terenu (`chunkHeightmap.worker.ts`, `buildChunkGeometry.ts` — `moisture`, `continentalness`/`mountainness`) — trzeba sprawdzić, czy jest już jakaś **main-thread** funkcja "co jest pod graczem" (np. używana przez minimapę do kolorowania), czy trzeba dorobić lekki sampler dla pozycji gracza per klatkę (nie generować pełnego chunku, tylko odczytać wartość noise).
- `waterLevel` jest znany globalnie (używany przez `NpcAgent`/`AnimalAgent` do "isWalkable"), więc "blisko oceanu" można na start uprościć do **dystansu do brzegu / głębokiej wody** zamiast pełnej klasyfikacji ocean vs jezioro/rzeka — do doprecyzowania czy world ma w ogóle rozróżnienie ocean vs lokalna woda (`createOcean.ts` vs `createWater.ts` per-chunk — do sprawdzenia, czy to różne systemy czy jeden).
- `dayNight.ts` ma `phaseName(timeOfDay)` — gotowy sygnał do krzyżowania warstwy dzień/noc.

## Zakres (szkic — do doprecyzowania przy starcie)

### 1. Fundament audio — `done`

Zaimplementowany przed `npc-reaction-sounds.md`, więc tamten plan go reużywa (nie na odwrót, jak sugerował oryginalny szkic). `src/audio/createWorldAudio.ts` (`createWorldAudio(camera): WorldAudio`, nazwa dopasowana do `WorldSky`/`WorldOcean` — nie `createAudioListener.ts` jak w pierwotnym szkicu pliku niżej):

- `AudioListener` na kamerze gracza, `listener.context.resume()` na pierwszy `pointerdown`/`keydown` (autoplay policy).
- `createLoop(url): AudioLoopHandle` — ładuje klip, odtwarza w pętli od gain=0, zwraca `{ setTargetGain(gain), dispose() }`; `update(dt)` w `WorldAudio` co klatkę lerpuje gain każdej aktywnej pętli w stronę targetu (`GAIN_LERP_SPEED = 1.5`/s) — to jest dokładnie mechanizm crossfade, którego potrzebuje sampler obszaru (sekcja 4 niżej).
- `playOnce(url, volume?)` — fire-and-forget klip (dla `npc-reaction-sounds.md`).
- Wpięty w `createApp.ts`: instancja obok `camera`, `worldAudio.update(dt)` w pętli tick, `dispose()` w cleanup. Na razie **bez żadnych realnych klipów** (brak assetów `public/sounds/`) — tylko fundament, `ambientWeightsAt()`/mixer runtime z sekcji 3-4 nadal `planned`.

### 2. Assety

- Loop'y: świerszcze/cykady (noc), ptaki/owady dzienne, szum fal (ocean), wiatr (góry/otwarty teren) — do znalezienia (freesound.org lub podobne, licencja do sprawdzenia), `public/sounds/ambient/`.

### 3. Sampler obszaru

- Funkcja `ambientWeightsAt(x, z, timeOfDay): { ocean: number; forest: number; mountain: number; ... }` — zwraca wagi 0-1 per warstwa, na podstawie: dystansu do wody, `moisture`/wysokości pod graczem, pory dnia.
- Wywoływana co klatkę (albo throttled, np. co kilka klatek — dokładność nie musi być per-frame) z pozycją gracza.

### 4. Mixer runtime

- Co klatkę: `ambientWeightsAt(...)` → płynnie (lerp) dostosuj `gain` każdej zapętlonej warstwy audio do docelowej wagi — unika trzasków/nagłych przełączeń.
- Warstwa dzień/noc (cykady↔ptaki) crossfaduje osobno, niezależnie od warstwy terenowej (ocean/las/góry).

## Poza zakresem v1

- Pełny system audio gry (muzyka, SFX akcji, UI sounds) — tylko ambient tła.
- Pozycyjne audio 3D per-źródło (np. konkretna fala rozbijająca się o konkretny kawałek brzegu) — na start warstwy są **globalne/2D**, tylko ich głośność zależy od pozycji gracza, nie panning.
- Pogoda (deszcz, burza) — nie ma jeszcze systemu pogody w grze.
- Głośność sterowana z UI (settings/volume slider) — może być potrzebna od razu jako podstawowy toggle mute, ale pełny mixer głośności to osobna sprawa (game-ui-screens.md).

## Szkic zmian (pliki)

```
src/audio/                        # katalog współdzielony z npc-reaction-sounds.md
  createWorldAudio.ts              # done: AudioListener na kamerze + helper do zapętlonych warstw z gain lerp (patrz sekcja 1 wyżej)
src/audio/ambientWeights.ts       # nowy: ambientWeightsAt(x, z, timeOfDay) na podstawie terrain/water/dayNight
src/audio/createAmbientAudio.ts   # nowy: orchestration — warstwy, update(dt, playerPos, timeOfDay)
src/app/createApp.ts              # wiring: stwórz ambient audio, wywołuj update() w pętli gry
public/sounds/ambient/            # nowe assety: crickets/birds/waves/wind loops
```

## Done when

- [ ] Bazowy ambient loop gra w tle (cichy, nie irytujący przy dłuższej sesji)
- [ ] Warstwa dzień/noc: cykady w nocy, ptaki/owady w dzień, płynne przejście na granicy fazy
- [ ] Warstwa terenowa: szum fal wyraźnie głośniejszy blisko oceanu/dużej wody, cichnie w głębi lądu
- [ ] Przejście między warstwami przy chodzeniu jest płynne (brak słyszalnych "kliknięć"/nagłych skoków głośności)
- [ ] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`

## Do przetestowania (http://localhost:5577/)

1. Stój w miejscu dłuższą chwilę w dzień, potem poczekaj/przewiń do nocy (time multiplier) — dźwięk tła powinien się zmienić (ptaki→cykady), płynnie.
2. Idź od centrum osady w stronę oceanu/dużej wody — szum fal powinien narastać stopniowo, nie pojawić się nagle na jakiejś granicy.
3. Odejdź od wody w głąb lądu/w góry — szum fal powinien zanikać, ewentualnie pojawić się wiatr.
4. Sprawdź głośność ogólną — nic nie powinno przytłaczać (na razie bez UI volume, ale wartości w kodzie rozsądne).
5. Sanity check: reszta audio (jeśli `npc-reaction-sounds.md` już wdrożone) — dźwięki NPC dalej słyszalne, nie zagłuszone przez ambient.

## Następnie

- Volume/mute toggle w UI (pause menu lub przyszły settings screen)
- Pozycyjne audio 3D dla konkretnych źródeł (np. wodospad, ognisko)
- Pogoda jako kolejna warstwa ambientu
