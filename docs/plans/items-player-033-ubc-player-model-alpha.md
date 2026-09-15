# Plan: UBC player model alpha

**Created:** 2026-09-15
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** L
**Depends on:** none
**Domain:** `items-player`
**Type:** `feature`
**Subdomains:** `presentation` `assets`
**Tags:** `player` `characters` `animation`
**Roadmap:** -

## Cel

ALFA wizualna gracza na rigu Quaternius Universal Base Characters: dwa męskie outfity (Peasant, Ranger) plus subset animacji UAL1, wybierane query parametrem. Default pozostaje Adventurer.

Nie podmieniać modelu produkcyjnego. Nie ruszać NPC. Nie budować runtime modular outfitów.

## Stan obecny

Gracz to Quaternius Adventurer (`PLAYER_MODEL_URL` w `src/player/PlayerController.ts`), mixer z clipami `Idle` / `Walk` / `Run` / `Sword_Slash` / gun-aim. Kamera TPP. Narzędzia wiszą na `WristR`. `PlayerController.create` już przyjmuje `modelUrl`.

Paczki w `_temp/` (CC0, SKU Standard):

- UBC — `Superhero_Male/Female_FullBody` + fryzury.
- Fantasy outfits — pełne `Male_Peasant` / `Male_Ranger`. README: z base zostaje tylko głowa.
- UAL1 in-place (nie `_RM`) — ten sam szkielet 65 kości. Nie Mixamo, nie Adventurer.
- UAL2 — poza ALFĄ.

tools-007 (MPFB2/Mixamo) zostaje osobną ścieżką.

## Zakres

Po `?player=peasant` lub `?player=ranger`:

- męski Peasant lub Ranger (głowa UBC + fryzura + outfit),
- lokomocja idle/walk/run + atak wręcz,
- reszta gry bez zmian.

Poza zakresem: runtime-swap outfitów, warianty żeńskie, UAL2, jump/crouch/swim clipy, retarget na NPC, zmiana save schema.

## Pipeline assetów

Źródła zostają w `_temp/`. Runtime tylko `public/models/`.

```text
public/models/characters/ubc/male_peasant.glb
public/models/characters/ubc/male_ranger.glb
public/models/characters/ubc/ual1_player.glb
```

Compose na jeden szkielet UBC. Z UAL1 wyciąć subset: `Idle_Loop`, `Walk_Loop`, `Sprint_Loop`, `Sword_Attack`. Cały UAL1 nie idzie do runtime.

Jeśli pełny outfit już ma używalną głowę — pominąć merge Superhero i zostawić notatkę.

## Runtime

Whitelist resolver `?player=` (brak / `adventurer` / `peasant` / `ranger`). Nieznana wartość → warn + Adventurer. Nie wstrzykiwać surowej ścieżki z URL.

Mixer: aliasy UAL + drugi load `ual1_player.glb` tylko dla presetów UBC. Dodać `hand_r` do `RIGHT_HAND_BONE_NAMES`. Korekta `HELD_ATTACH` tylko przy oczywistym błędzie w przeglądarce.

## Weryfikacja

- default Adventurer bez regresji
- `?player=peasant` i `?player=ranger`: idle, chód, sprint, cios, trzymane narzędzie, cienie
