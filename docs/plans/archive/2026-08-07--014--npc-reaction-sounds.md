# Plan: Dźwięki reakcji NPC

**Status:** `done`
**Created:** 2026-08-07
**Scope:** Wydzielone z [npc-gender-models.md](./2026-08-07--013--npc-gender-models.md) (był w Problem/p.3, niezależny kawałek pracy — audio, nie modele)

## Problem

NPC już dziś zatrzymuje się na chwilę i patrzy na gracza, gdy ten podejdzie zbyt blisko (`phase = 'lookAtPlayer'` w [NpcAgent.ts](../../src/ai/NpcAgent.ts), per-personality `PAUSE_PARAMS` w [dialogue.ts](../../src/ai/dialogue.ts)). Reakcja jest czysto wizualna (obrót w stronę gracza) — brak jakiegokolwiek dźwięku, przez co moment przechodzi bez feedbacku audio.

## Cel

Krótki dźwięk (`Hmm`, `Tak?` lub podobny) odtwarzany raz przy wejściu w `lookAtPlayer`, w wersji męskiej/żeńskiej zależnie od płci NPC.

## Zależność

Wymaga rozstrzygniętej płci NPC — czyli albo [npc-gender-models.md](./2026-08-07--013--npc-gender-models.md), albo pola `gender` z [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md), którykolwiek wyląduje pierwszy. Bez tego można zacząć od jednego, neutralnego zestawu dźwięków i dograć rozróżnienie płci później.

## Zakres

1. **Assety audio** — `done`. Dostarczone przez użytkownika w `public/sounds/` (nie `public/sounds/npc/` jak pierwotnie zakładano — spłaszczone, bo to jedyne audio w repo na razie), 2 klipy męskie + 2 żeńskie, źródła/licencje w [public/sounds/README.md](../../public/sounds/README.md):
   - `male-hmm-01.m4a`, `male-hmm-02.wav`
   - `female-hmm-01.wav`, `female-hmm-02.wav`
   Zahardkodowane w `NPC_REACTION_SOUND_URLS`, [NpcAgent.ts](../../src/ai/NpcAgent.ts). Mieszane formaty (`.m4a`/`.wav`) — `AudioLoader`/`decodeAudioData` obsługuje oba w Chrome/Safari, nie ujednolicano do jednego kontenera.
2. **Loader** — `done`, wspólny fundament z [ambient-world-audio.md](./2026-08-07--016--ambient-world-audio.md): `src/audio/createWorldAudio.ts` (`createWorldAudio(camera): WorldAudio`). `AudioListener` dopięty do kamery, `listener.context.resume()` na pierwszy `pointerdown`/`keydown` (obejście autoplay policy przeglądarek). `playOnce(url, volume?)` — fire-and-forget klip. Wpięte w `createApp.ts` (instancja + `dispose()`), `update(dt)` w pętli tick.
3. **Trigger** — `done`. W `NpcAgent.update()`, w momencie przejścia `phase → 'lookAtPlayer'`, `playReactionSound()` odtwarza losowy klip z puli odpowiedniej płci (`this.gender`) przez `playSound` — callback wstrzykiwany do `NpcAgent.create()`/`createSettlement()` (domyślnie no-op), spięty w `createApp.ts` z `worldAudio.playOnce`.
4. **Throttle/cooldown** — `done`. Bez dodatkowej logiki: trigger siedzi w tym samym `if` co ustawienie `pauseTimer`, więc dzieli istniejący `pauseCooldown` (per personality) — odtwarza się dokładnie raz na wejście w `lookAtPlayer`.
5. **Głośność / mix** — `done`, wstępnie. `REACTION_SOUND_VOLUME = 0.35` w `NpcAgent.ts` — do przesłuchania/dostrojenia w przeglądarce.

## Poza zakresem v1

- Pełny system audio (muzyka, ambient, SFX ścinania drzewa itd.) — to pierwszy krok, nie cały pipeline dźwiękowy.
- Pozycyjne audio 3D (panning/attenuation z odległością) — na start wystarczy proste odtworzenie.
- Dźwięki dla fauny.

## Done when

- [x] `public/sounds/` z 2 klipami męskimi + 2 żeńskimi
- [x] `NpcAgent` odtwarza losowy klip (zgodny z płcią) przy wejściu w `lookAtPlayer`
- [x] Nie odtwarza się częściej niż raz na trigger (reużycie `pauseCooldown`)
- [x] Głośność nie przytłacza — subiektywna ocena w przeglądarce (potwierdzone przez usera)
- [x] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`

## Do przetestowania (http://localhost:5577/)

1. Podejdź blisko kilku różnych NPC (różne płcie, jeśli gender-models już wdrożone) — przy każdym zatrzymaniu-spojrzeniu powinien być słyszalny krótki dźwięk.
2. Podejdź do tego samego NPC kilka razy pod rząd — dźwięk nie powinien nakładać się/spamować (cooldown).
3. Kilku NPC blisko siebie jednocześnie — sprawdź czy dźwięki się nie tłuką (kakofonia).
