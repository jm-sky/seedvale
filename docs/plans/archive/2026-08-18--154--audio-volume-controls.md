# Plan: Audio volume controls

**Created:** 2026-08-18
**Status:** `done` ✅
**Priority:** medium · **Effort:** S/M
**Depends on:** none
**domain:** `ui-input`

## Cel

Dać graczowi płynną kontrolę głośności z pauzy. Suwaki, nie select. Trzy grupy, bo istniejący mixer już naturalnie je rozdziela:

- **Wszystko** — master
- **Otoczenie** — pętle środowiska (las, noc, wybrzeże, wiatr, łąka, deszcz, ognisko)
- **Efekty** — one-shoty (akcje, NPC, zwierzęta, kroki, drzwi, inventory, UI)

Domyślnie `1` na każdej grupie, więc obecny mix się nie zmienia. Cisza = suwak na 0 (bez osobnego mute).

Nie potrzeba nowych assetów (`docs/assets/SOUNDS.md` bez zmian).

## Dlaczego tu, a nie w WorldConfig / SaveData

Głośność to preferencja urządzenia, jak jakość grafiki — nie stan świata.

- UI: [PauseMenuEntriesSettings.vue](../../src/ui-vue/screens/PauseMenuEntriesSettings.vue) (obok FPS), nie Świat
- Persist: [src/audio/audioSettings.ts](../../src/audio/audioSettings.ts) (`seedvale:audio:v1`) — osobna domena, nie `WorldConfig` / `persistConfig`
- Nie wchodzi do `SaveData` / IndexedDB — nowa gra i reload zachowują suwaki, zapis świata ich nie nadpisuje
- lil-gui Audio zostaje A/B footstep packów; suwaki gracza nie idą do debug GUI

## Mixer

W [createWorldAudio.ts](../../src/audio/createWorldAudio.ts):

- dwa `GainNode` podpięte do `listener.getInput()`: `ambient`, `sfx`
- `createLoop(url)` po konstrukcji: `sound.gain.disconnect()` + `connect(ambientBus)` — zero zmian call-site’ów
- `playOnce` / `playAt` analogicznie na `sfxBus`
- `setVolumes({ master, ambient, sfx })` ustawia `listener.setMasterVolume(master)` oraz `bus.gain.setTargetAtTime(...)` (ten sam smooth ramp co Three.js)
- opcjonalny parametr kategorii (`createLoop(url, 'sfx')`), default jak wyżej

`worldAudio.update(dt)` nie leci w pauzie, więc mnożenie w `setVolume` nie ruszyłoby pętli podczas przeciągania suwaka. Magistrale `GainNode` działają niezależnie od pętli.

Start: wczytać zapisane wartości i od razu `setVolumes`. Rebuild świata nie odtwarza `WorldAudio` (żyje w `createApp`, nie w `WorldBundle`).

## Persist

```ts
type AudioVolumes = { master: number; ambient: number; sfx: number }
// clamp 0..1, brakujące pola → 1
```

- load przy starcie `createWorldAudio`
- save przy `input` suwaka
- testy: clamp, defaulty, round-trip localStorage

## UI

Pauza → Ustawienia → „Dźwięk”, trzy `input type="range"` (`min=0 max=1 step=0.01`, etykieta z procentem): Wszystko / Otoczenie / Efekty.

`@input` → `setAudioVolume` → persist + `worldAudio.setVolumes`.

## Poza zakresem

- osobna grupa UI (kliki pauzy idą w Efekty)
- mute button, ducking, kompresor
- zmiana per-clip stałych i packów kroków
- SaveData / URL query
- nowe dźwięki

## Implementation summary

- Mixer buses w `createWorldAudio` (`ambient` / `sfx` + `setVolumes` / `getVolumes`).
- `src/audio/audioSettings.ts` + testy clamp/round-trip.
- Suwaki w `PauseMenuEntriesSettings.vue`; `configureAudioVolumes` w store + `createApp.ts`.
- Per-clip głośności i call-site’y `playOnce`/`playAt`/`createLoop` bez zmian.

## Weryfikacja

Techniczna: `npx tsc --noEmit` · `npm run lint` · `npm run build` · `npm run test` — zielona 2026-08-18 (1022 testy, +6 w `audioSettings.test.ts`).

Ręczna: zweryfikowana 2026-08-18 (playtest).
