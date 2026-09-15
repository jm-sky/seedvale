# Plan: UBC Fantasy Source outfits

**Created:** 2026-09-15
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** ~~items-player-033~~ ~~items-player-034~~
**Domain:** `items-player`
**Type:** `feature`
**Subdomains:** `presentation` `assets`
**Tags:** `player` `characters` `equipment`
**Roadmap:** -

> Plan id is **036** — `items-player-035` is UAL mixer coverage.

## Cel

Przełączyć compose na kupioną paczkę Modular Character Outfits - Fantasy `[Source]`, dodać męskie Knight / Noble / Wizard (i Knight_Cloth jako override) do istniejącego swapu całego mesha, oraz zmapować kolczugę na Knight zamiast Ranger.

Bez modular parts, bez female, bez nowych itemów w katalogu.

## Mapowanie wyglądu

| Warunek | Outfit |
| --- | --- |
| pusty slot `body` | Peasant |
| `leather_armor` | Ranger |
| `chainmail` (i każdy inny przyszły body armor ≠ leather) | Knight (`Male_Knight`, nie Cloth) |
| `?player=` | `adventurer` \| `peasant` \| `ranger` \| `knight` \| `knight_cloth` \| `noble` \| `wizard` (override wygrywa) |

Tint: `?playerTint=brown` — sidecar `male_<id>_brown.webp` (`T_Peasant_2`, `T_Ranger_3`, pozostałe `T_<Class>_2`). Materiały: `MI_Peasant` / `MI_Ranger` / `MI_Knight` / `MI_Noble` / `MI_Wizard`.

Preload: Peasant, Ranger, Knight. Adventurer session-lock bez zmian.

Wizard / Noble / Knight_Cloth tylko przez `?player=` — w katalogu nie ma szaty / stroju szlacheckiego.

## Pipeline

Źródła w `_temp/`. Compose: `Modular Character Outfits - Fantasy[Source]` + UBC `[Standard]`. Knight i Knight_Cloth: slice głowy, bez `Hair_SimpleParted`.

Wyjście: `public/models/characters/ubc/male_{peasant,ranger,knight,knight_cloth,noble,wizard}.glb` + `*_brown.webp`. UAL1 bez zmian w tym planie.

## Weryfikacja

- pusty body = Peasant; skóra = Ranger; kolczuga = Knight (bez reloadu)
- `?player=wizard|noble|knight_cloth`; `?playerTint=brown` na Peasant/Ranger/Knight
- narzędzie na `hand_r`; Adventurer nadal lock
