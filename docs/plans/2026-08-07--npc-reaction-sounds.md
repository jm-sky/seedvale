# Plan: Dźwięki reakcji NPC

**Status:** `planned`
**Created:** 2026-08-07
**Scope:** Wydzielone z [npc-gender-models.md](./2026-08-07--npc-gender-models.md) (był w Problem/p.3, niezależny kawałek pracy — audio, nie modele)

## Problem

NPC już dziś zatrzymuje się na chwilę i patrzy na gracza, gdy ten podejdzie zbyt blisko (`phase = 'lookAtPlayer'` w [NpcAgent.ts](../../src/ai/NpcAgent.ts), per-personality `PAUSE_PARAMS` w [dialogue.ts](../../src/ai/dialogue.ts)). Reakcja jest czysto wizualna (obrót w stronę gracza) — brak jakiegokolwiek dźwięku, przez co moment przechodzi bez feedbacku audio.

## Cel

Krótki dźwięk (`Hmm`, `Tak?` lub podobny) odtwarzany raz przy wejściu w `lookAtPlayer`, w wersji męskiej/żeńskiej zależnie od płci NPC.

## Zależność

Wymaga rozstrzygniętej płci NPC — czyli albo [npc-gender-models.md](./2026-08-07--npc-gender-models.md), albo pola `gender` z [npc-character-depth.md](./2026-08-07--npc-character-depth.md), którykolwiek wyląduje pierwszy. Bez tego można zacząć od jednego, neutralnego zestawu dźwięków i dograć rozróżnienie płci później.

## Zakres (szkic — do doprecyzowania przy starcie implementacji)

1. **Assety audio** — kilka krótkich klipów (`.mp3`/`.ogg`) w `public/sounds/npc/` (nowy katalog), męskie + żeńskie warianty. Źródło do znalezienia (freesound.org / Quaternius nie ma audio — osobne poszukiwanie, podobne do [research/2026-08-07-3d-asset-sources.md](../research/2026-08-07-3d-asset-sources.md)).
2. **Loader** — `done`, wspólny fundament z [ambient-world-audio.md](./2026-08-07--ambient-world-audio.md): `src/audio/createWorldAudio.ts` (`createWorldAudio(camera): WorldAudio`, nie `createAudioListener.ts` jak w pierwotnym szkicu pliku — nazwa dopasowana do konwencji `WorldSky`/`WorldOcean` w repo). `AudioListener` dopięty do kamery, `listener.context.resume()` na pierwszy `pointerdown`/`keydown` (obejście autoplay policy przeglądarek). Dla reaction sounds istotne: `playOnce(url, volume?)` — fire-and-forget klip, dokładnie to czego potrzebuje trigger w `lookAtPlayer`. Wpięte w `createApp.ts` (instancja + `dispose()`), `update(dt)` w pętli tick — na razie bez żadnych realnych klipów (brak assetów).
3. **Trigger** — w `NpcAgent.update()`, w momencie przejścia `phase → 'lookAtPlayer'` (tam gdzie dziś ustawiany jest `pauseTimer`), odtwórz losowy klip z puli odpowiedniej płci.
4. **Throttle/cooldown** — reużyć istniejący `pauseCooldown` (per personality), żeby dźwięk nie odtwarzał się co klatkę / zbyt często przy wielu NPC naraz.
5. **Głośność / mix** — dźwięk cichy, nie powinien dominować nad ambientem; sprawdzić czy jest już jakikolwiek system audio w projekcie (grep `Audio` w `src/` — obecnie brak, to będzie pierwszy dźwięk w grze poza ciszą).

## Poza zakresem v1

- Pełny system audio (muzyka, ambient, SFX ścinania drzewa itd.) — to pierwszy krok, nie cały pipeline dźwiękowy.
- Pozycyjne audio 3D (panning/attenuation z odległością) — na start wystarczy proste odtworzenie.
- Dźwięki dla fauny.

## Done when

- [ ] Katalog `public/sounds/npc/` z min. 2-3 klipami męskimi + 2-3 żeńskimi
- [ ] `NpcAgent` odtwarza losowy klip (zgodny z płcią) przy wejściu w `lookAtPlayer`
- [ ] Nie odtwarza się częściej niż raz na trigger (reużycie `pauseCooldown`)
- [ ] Głośność nie przytłacza — subiektywna ocena w przeglądarce
- [ ] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`

## Do przetestowania (http://localhost:5577/)

1. Podejdź blisko kilku różnych NPC (różne płcie, jeśli gender-models już wdrożone) — przy każdym zatrzymaniu-spojrzeniu powinien być słyszalny krótki dźwięk.
2. Podejdź do tego samego NPC kilka razy pod rząd — dźwięk nie powinien nakładać się/spamować (cooldown).
3. Kilku NPC blisko siebie jednocześnie — sprawdź czy dźwięki się nie tłuką (kakofonia).
