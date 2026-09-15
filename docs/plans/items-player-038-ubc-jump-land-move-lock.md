# Plan: UBC jump land move lock

**Created:** 2026-09-15
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** S
**Depends on:** ~~items-player-035~~
**Domain:** `items-player`
**Type:** `polish`
**Subdomains:** `presentation`
**Tags:** `player` `characters` `animation`
**Roadmap:** -

> Plan id is **038** — `items-player-036`/`037` are UBC outfit plans.

## Cel

`Jump_Land` jest in-place (~1.27 s), a WASD nadal przesuwa kapsułę. Krótki lock XZ przy lądowaniu, potem od razu walk/run.

## Zachowanie

`JUMP_LAND_MOVE_LOCK_SEC = 0.5` w `PlayerController`.

Przy `landed` + `jumpLandAction`: grać `Jump_Land`; lock XZ `min(0.5, clip)` gdy jest wish, inaczej pełny `clip.duration`. Klawisze nadal ustawiają `moving`/`sprinting`/facing. Po locku `jumpPhase = none` i `syncAnimation()`.

Adventurer bez jump clipów — bez zmian. Air control bez zmian.

## Weryfikacja

UBC: skok z WASD — krótki recover, potem chód/sprint bez slajdu w pozie stania. Skok w miejscu — pełny `Jump_Land`.
