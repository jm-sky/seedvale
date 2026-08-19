---
domain: ui-input
---

# Plan: Reset ustawień grafiki i dźwięku

**Created:** 2026-08-19
**Status:** `done` ✅
**Priority:** low · **Effort:** XS
**Depends on:** ~~154~~ ~~103~~

## Cel

Przycisk **Resetuj ustawienia** w Pauza → Ustawienia przywraca suwaki dźwięku do 100% i preset grafiki High. Zmiana idzie przez te same handlery, które już stosują suwaki / radio jakości na żywo i zapisują localStorage.

## Zakres

- Dźwięk: `master` / `ambient` / `sfx` → `DEFAULT_AUDIO_VOLUMES` (`seedvale:audio:v1`)
- Grafika: `onQualityPresetChange(DEFAULT_QUALITY_PRESET)` → `applyLiveGraphics` + `saveGraphics` (`seedvale:graphics:v1`)
- Bez seeda, terenu, imienia, cyklu dnia/nocy, FPS w HUD i pól poza `QualityKnobs` (`bloomStrength`, `aoRadius`, …)

Nie potrzeba nowych assetów.

## Implementacja

- `resetAudioSettings()` / `resetGraphicsQuality()` w [`src/ui-vue/store.ts`](../../src/ui-vue/store.ts)
- Przycisk w [`PauseMenuEntriesSettings.vue`](../../src/ui-vue/screens/PauseMenuEntriesSettings.vue)
- `DEFAULT_QUALITY_PRESET = 'High'` w [`qualityProfiles.ts`](../../src/config/qualityProfiles.ts), używany też przez `baseConfig`

Bez nowego callbacka w `createApp` — audio idzie przez `audioVolumesOnChange`, grafika przez istniejący `onQualityPresetChange`.

## Poza zakresem

- FPS w HUD, imię, seed, teren, dzień/noc
- `clear` localStorage (zapisujemy defaulty, żeby kolejny load ich nie nadpisał starymi wartościami)

## Implementation summary

- Store helpery + przycisk „Resetuj ustawienia”.
- `DEFAULT_QUALITY_PRESET` spina reset z `baseConfig`.
- Test: zapisany mix → zapis defaultów → load wraca do `{1,1,1}`.

## Weryfikacja

Techniczna: `npx tsc --noEmit` · `npm run lint` · `npm run build` · `npm run test` — zielona 2026-08-19 (1119 testów).

Ręczna (dev `5577`): Pauza → Ustawienia — ściszyć suwaki, w Świecie ustawić Low; wrócić → Resetuj; suwaki 100%, Świat pokazuje High, live grafika wraca (AO/bloom/woda). Imię i seed bez zmian.
