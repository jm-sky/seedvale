# Plan: UBC — szerszy subset UAL i mixer gracza

**Created:** 2026-09-15
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** ~~items-player-033~~ ~~items-player-034~~
**Domain:** `items-player`
**Type:** `polish`
**Subdomains:** `presentation` `assets`
**Tags:** `player` `characters` `animation`
**Roadmap:** -

## Cel

UBC Peasant/Ranger ma ten sam zakres napędzanych animacji co Adventurer (idle/walk/run/melee + stand-in łuku) plus clipy UAL1 dla stanów, które gra już ma: skradanie, skok, pływanie, downed, kucanie obozu.

Nie ruszać NPC. Nie wrzucać pełnego UAL1/UAL2. `lieDown()` obozu zostaje proceduralne (brak leżącego idle w UAL).

## Assety

`scripts/assets/prepare-ubc-player-alpha.sh` wycina z `UAL1_Standard.glb` (nie `_RM`) do `public/models/characters/ubc/ual1_player.glb`:

`Idle_Loop`, `Walk_Loop`, `Sprint_Loop`, `Sword_Attack`, `Sword_Idle`, `Interact`, `Death01`, `Hit_Chest`, `Punch_Jab`, `Punch_Cross`, `Roll`, `Pistol_Idle_Loop`, `Pistol_Aim_Neutral`, `Pistol_Shoot`, `Crouch_Idle_Loop`, `Crouch_Fwd_Loop`, `Jump_Start`, `Jump_Loop`, `Jump_Land`, `Swim_Idle_Loop`, `Swim_Fwd_Loop`, `Idle_Torch_Loop`

`scripts/assets/list-character-animations.ts` skanuje też `ubc/`.

## Runtime

`PlayerController.bindMixer` / `syncAnimation`:

- ranged: `Pistol_Aim_Neutral` / `Pistol_Shoot` (nie `Sword_Idle` jako aim)
- sneak → crouch idle/fwd
- woda → swim idle/fwd
- skok → Jump_Start/Loop/Land; bez tiltu gdy clip jest
- `crouch()` → `Crouch_Idle_Loop` bez proceduralnego tipu, gdy clip jest
- `enterDowned` → `Death` / `Death01` LoopOnce
- idle z mieczem / pochodnią gdy stojący i clip jest

## Weryfikacja

- `?modelTest&model=ubc/male_ranger&anims=ubc/ual1_player` — więcej niż 4 clipy
- default Peasant / Ranger: locomotion, slash, łuk, sneak, woda, skok, HP 0 = death clip
- `?player=adventurer`: brak regresji idle/walk/run/slash/gun; downed może użyć `Death`
- `ual1_player.glb` setki KB, nie 7 MB
