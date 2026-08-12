# Plan: Distance falloff for world one-shots

**Status:** `verification needed`
**Created:** 2026-08-12
**Scope:** `worldAudio.playAt` — gain od dystansu listener↔źródło dla one-shotów światowych (bez PositionalAudio/HRTF).

## Problem

Wszystkie SFX szły przez `playOnce` (stały volume na kamerze). Dźwięki emitowane przez świat (NPC przy studni, hmm w `triggerDistance`) grały pełną głośnością nawet z daleka.

## Cel

Dalej = ciszej dla one-shotów z pozycją źródła. Inventory / quest thank-you / ambient bez zmian.

## Zakres

1. **API** — `done`. [`src/audio/createWorldAudio.ts`](../../src/audio/createWorldAudio.ts): `playAt`, `distanceGain` (ref=4, max=45, liniowo), skip gdy gain &lt; 0.02. Unit test: [`distanceGain.test.ts`](../../src/audio/distanceGain.test.ts).
2. **Helpery** — `done`. `playActionWell` / melee / chop / `playAnimalSound` biorą `PlayAt` + pozycję. Dig zostaje na `playOnce`.
3. **P0** — `done`. NPC well drink + NPC reaction → `playAt` (well landmark / mesh).
4. **P1** — `done`. Player well, melee, animal observe, axe chop → `playAt`.
5. **Poza zakresem** — dig, inventory, ambient beds, quest thank-you, stereo pan / `PositionalAudio`, per-frame falloff w trakcie klipu.

## Zależności

~~014~~ (world audio), ~~016~~ (ambient — nie mieszać).

## Acceptance

- [ ] NPC pije przy studni z daleka → ciszej / cisza poza ~45 m
- [ ] NPC hmm dalej od gracza → ciszej niż z bliska
- [ ] Inventory pick/drop i quest thank-you bez zmiany głośności względem dystansu
- [ ] `npx tsc --noEmit` + `npm run test` (distanceGain) OK
