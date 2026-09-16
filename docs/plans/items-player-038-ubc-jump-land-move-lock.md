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

`JUMP_LAND_MOVE_LOCK_SEC = 0.12` w `PlayerController`.

Przy `landed` + `jumpLandAction`: grać `Jump_Land`; lock XZ zawsze `min(0.12, clip)` — nigdy pełny klip. Klawisze nadal ustawiają `moving`/`sprinting`/facing. Timer zamyka `jumpPhase` i woła `syncAnimation()` tylko gdy jest wish; bez wish klip gra do `finished`.

Adventurer bez jump clipów — bez zmian. Air control bez zmian.

## Weryfikacja

UBC: skok z WASD — recover ~0.12 s, potem chód/sprint bez slajdu w pozie stania. Skok w miejscu — pełny `Jump_Land`; WASD w recoverze rusza po ~0.12 s, nie po całym klipie.
