# Plan: Handheld lights + village lanterns/torches

**Created:** 2026-08-12  
**Status:** `in progress`  
**Priority:** medium · **Effort:** L  
**Depends on:** held tools / ~~082~~

## Cel

Wpiąć modele z `_temp`: wooden torch (holdable item), lit branch w ręce, lantern przy domach, pochodnie wioski (plac/brama), plus `branch.glb` / `fire.glb`.

## Progress (2026-08-12)

- Done: assets, `wooden_torch` item + starting loadout, save v9 lit state, house lanterns, village torches (off-road), UI Zapal gałąź / Zapal pochodnię.
- Done: `wooden_torch` hand grip verified in-browser.
- In progress: lit-branch — upright (no sideways); tip flipped forward via BRANCH_ATTACH yaw +π (await confirm); flame/sparks TEMP off (`SHOW_HAND_FLAME_VISUAL`).
- Pending: re-enable flame tip + sparks once branch grip is right.

## Decisions

- `wooden_torch` — nowy `ItemKind`, 1× pickup przy placu/ognisku; dłuższe paliwo (240s) i silniejsze światło niż gałąź (90s).
- Płonąca gałąź — konsumuje 1× branch; mesh `branch.glb` + `fire.glb` na `WristR`.
- Wyłączność prawej ręki: lit branch **lub** wooden torch **lub** inne narzędzie.
- Latarnia przy domku zastępuje proceduralne body (`createHouseLight` + PointLight / `setNightIntensity`).
- Pochodnie wioski auto-zapalane o zmierzchu / gaszone o świcie (`NIGHT_FIRE_THRESHOLD`).

## Assets

| Destination | Source |
|-------------|--------|
| `public/models/items/wooden_torch.glb` | Wooden Torch by Quaternius |
| `public/models/items/branch.glb` | Branch B by AssetQuest |
| `public/models/fx/fire.glb` | Fire by J-Toastie (CC-BY) |
| `public/models/settlement/lantern.glb` | Lantern by Tomáš Bayer |
| `public/models/settlement/torch.glb` | Torch by Quaternius |

## Implementacja

- `PlayerTorch` — hand-mounted, `light('branch' \| 'wooden_torch')`
- `HeldTool` + catalog + spawners + Quick Actions / Pause (Zapal gałąź / Zapal pochodnię)
- `createHouseLight` + village torch posts w `buildSettlementProps`

## Weryfikacja techniczna

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`

## Manual (browser)

1. Zapal gałąź → w ręce gałąź+ogień; Weź siekiery gaśnie/odmawia do czasu zgaśnięcia.
2. Podnieś pochodnię → Weź → Zapal pochodnię → dłużej/jaśniej.
3. Noce: latarnie GLB przy hutach; pochodnie przy placu i bramie zapalają się o zmierzchu.
