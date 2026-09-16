# Plan: Asset Browser UBC accessory overlay

**Created:** 2026-09-16
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** S
**Depends on:** ~~items-player-039~~
**Domain:** `items-player`
**Type:** `fix`
**Subdomains:** `presentation` `tools`
**Tags:** `player` `equipment` `ubc` `asset-browser`
**Roadmap:** -
**Implemented at:** 2026-09-16 14:00

## Cel

W Asset Browserze założyć skinned naramiennik na szkielet Reference (np. `character:ubc-peasant`) tak jak w grze, żeby ręcznie stroić `alignment` i wkleić go do `playerEquipmentVisual.ts`.

## Stan po implementacji

- Cztery pauldron GLB są w grupie `accessory` z `prepare: none`.
- Overlay woła `bindAccessoryToPlayerSkeleton` na klonie Targetu; oryginał w slocie jest ukryty.
- Edytor position/rotation/scale + Copy alignment snippet (bez auto-zapisu do katalogu).
- `leather_pauldron` dostaje brown tint jak w runtime.
- Held in-hand i grip editor pozostają wyłączne względem overlay.

## Weryfikacja ręczna

`asset-browser.html?reference=character:ubc-peasant&target=character:ubc-leather-pauldron`

- naramiennik na ramionach Peasanta w rest i idle
- swap Target na ranger / knight spike / round
- swap Reference na ranger / knight
- suwaki ruszają overlay; Copy daje wklejalny `alignment`
- Peasant + `held:axe` nadal in-hand
