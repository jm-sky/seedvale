# Plan: Inventory pick-up / drop SFX

**Status:** `verification needed`
**Created:** 2026-08-11
**Scope:** Podpięcie dźwięków ekwipunku (pick-up / drop) przez istniejące `worldAudio.playOnce`.

## Problem

Assety `inventory-pick-up-*.wav` i `inventory-drop-01.wav` leżały w `public/sounds/` bez użycia. Pick-up był jednym ~7 s pakietem z 4 blipami. Podniesienie / wyrzucenie itemów nie dawało feedbacku audio.

## Cel

Krótki SFX przy udanym zdobyciu itemu (ziemia, drzewo, kopanie) oraz przy wyrzuceniu (UI „Wyrzuć”, `[G]` / touch).

## Zakres

1. **Assety** — `done`. Paczka pick-up pocięta na `inventory-pick-up-01…04.wav`; drop bez zmian. README w `public/sounds/` zaktualizowany.
2. **Helper** — `done`. [`src/audio/inventorySounds.ts`](../../src/audio/inventorySounds.ts): pula URL + `playInventoryPickUp` / `playInventoryDrop` (volume `0.4`).
3. **Trigger** — `done`.
   - Pick-up: `gameLoop` po `inventory.add` (collect / branch / stone).
   - Drop: `dropItemStack` w `createApp` (raz na stack) oraz `consumeDrop` w `gameLoop` (raz na akcję).
4. **Poza zakresem** — bootstrap starting gear, paliwo ogniska, quest turn-in, failed `canAdd`. Bez audio-sprite API.

## Zależności

~~014~~ (world audio / `playOnce`), ~~043~~ (inventory drop/pick mechanics).

## Acceptance

- [ ] Podniesienie itemu z ziemi → krótki click (warianty się różnią)
- [ ] `[G]` / touch drop oraz Inventory „Wyrzuć” → drop clip
- [ ] `+1 Gałąź` / `+1 Kamień` → pick-up SFX
- [ ] Brak SFX przy dołożeniu gałęzi do ogniska / New Game starting gear
