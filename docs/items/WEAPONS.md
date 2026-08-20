# Weapons — Seedvale

**Purpose:** one table of implemented melee weapons (and tools that share the
same combat stats) with combat numbers, block, weight and coin prices.

**Last updated:** 2026-08-19

Sources of truth (code, not this file):

| Concern | File |
|---------|------|
| Damage / range / arc / timings / stamina | `src/items/itemCatalog.ts` (`melee`) |
| Block chance / partial reduction | `src/items/itemCatalog.ts` (`defense`) |
| Weight / Polish label | `src/items/items.ts` (`ITEM_DEFS`) |
| Kupiec buy price / barter `tradeValue` | `src/items/tradeCatalog.ts` (`MERCHANT_PRICES`) |
| Quest-only trade value | `src/items/tradeCatalog.ts` (`RESOURCE_TRADE_VALUE`) |
| Player → Kupiec sell | `sellPrice()` = `floor(tradeValue × 0.5)`, min 1 |

Prices are in **monety**. Kupiec does not stock `damascus_long_sword` or
`obsidian_sword`; those rows use barter `tradeValue` only. `branch` has no
melee yet (roadmap in `itemCatalog.ts`).

## Legend

| Column | Meaning |
|--------|---------|
| **Dmg** | Hit damage vs animals (`HealthState`) |
| **Zasięg** | Max XZ distance (world units) |
| **Łuk (`arcDot`)** | Min `dot(forward, toTarget)`. Higher = narrower cone |
| **Wind / Hit / Rec** | Seconds: wind-up → hit window (damage once at start) → recovery |
| **Cykl** | `windUp + hitWindow + recovery` |
| **Stam** | Stamina cost per attack |
| **Blok** | `baseBlockChance` (before skill bonus) |
| **Partial** | Fraction of incoming damage removed on a partial block |
| **Kupiec** | Buy price if in `MERCHANT_STOCK`; otherwise — |
| **Wartość** | `tradeValue` (barter / inventory "Wartość") |
| **Sprzedaż** | `sellPrice` to Kupiec |

## Combat

Sorted by damage, then cycle (faster first).

| Kind | Label | Dmg | Zasięg | Łuk | Wind | Hit | Rec | Cykl | Stam |
|------|-------|----:|-------:|----:|-----:|----:|----:|-----:|-----:|
| obsidian_sword | obsydianowy miecz | 46 | 2.50 | 0.38 | 0.24 | 0.11 | 0.32 | 0.67 | 11 |
| damascus_long_sword | długi miecz damasceński | 40 | 2.65 | 0.35 | 0.27 | 0.12 | 0.36 | 0.75 | 13 |
| masterwork_sword | mistrzowski miecz | 34 | 2.60 | 0.35 | 0.26 | 0.12 | 0.34 | 0.72 | 12 |
| long_sword | miecz | 28 | 2.60 | 0.35 | 0.28 | 0.12 | 0.38 | 0.78 | 12 |
| battle_axe | topór bojowy | 28 | 2.15 | 0.28 | 0.38 | 0.14 | 0.50 | 1.02 | 14 |
| axe | siekiera | 20 | 2.00 | 0.40 | 0.30 | 0.12 | 0.40 | 0.82 | 10 |
| short_sword | krótki miecz | 18 | 2.10 | 0.50 | 0.18 | 0.10 | 0.26 | 0.54 | 7 |
| damascus_short_sword | krótki miecz damasceński | 24 | 2.15 | 0.50 | 0.16 | 0.10 | 0.22 | 0.48 | 7 |
| damascus_knife | nóż damasceński | 16 | 1.60 | 0.60 | 0.11 | 0.08 | 0.16 | 0.35 | 4 |
| spear | dzida | 20 | 3.00 | 0.60 | 0.24 | 0.10 | 0.30 | 0.64 | 9 |
| pitchfork | widły | 14 | 2.40 | 0.50 | 0.20 | 0.12 | 0.28 | 0.60 | 7 |
| knife | nóż | 12 | 1.60 | 0.60 | 0.12 | 0.08 | 0.18 | 0.38 | 4 |
| sickle | sierp | 12 | 1.80 | 0.55 | 0.15 | 0.10 | 0.20 | 0.45 | 5 |
| shovel | łopata | 8 | 2.00 | 0.45 | 0.25 | 0.10 | 0.35 | 0.70 | 8 |

Spear has the longest reach and a narrow thrust (`arcDot` 0.60, same as knives).
Battle axe has the widest arc (`0.28`) and the slowest cycle.

## Defense, weight, price, acquisition

| Kind | Label | kg | Blok | Partial | Kupiec | Wartość | Sprzedaż | Zdobywanie |
|------|-------|---:|-----:|--------:|-------:|--------:|---------:|------------|
| knife | nóż | 0.40 | 0.12 | 0.35 | 12 | 12 | 6 | start + Kupiec |
| damascus_knife | nóż damasceński | 0.35 | 0.16 | 0.40 | 90 | 90 | 45 | Kupiec; harvest jak nóż |
| sickle | sierp | 0.70 | 0.14 | 0.32 | 12 | 12 | 6 | wieś 1× + Kupiec |
| short_sword | krótki miecz | 1.60 | 0.22 | 0.45 | 40 | 40 | 20 | Kupiec |
| damascus_short_sword | krótki miecz damasceński | 1.50 | 0.26 | 0.50 | 140 | 140 | 70 | Kupiec |
| spear | dzida | 1.80 | 0.18 | 0.40 | 32 | 32 | 16 | Kupiec |
| pitchfork | widły | 1.80 | 0.22 | 0.50 | 12 | 12 | 6 | wieś 1× + Kupiec |
| shovel | łopata | 2.00 | 0.10 | 0.25 | 20 | 20 | 10 | wieś 1× + Kupiec |
| obsidian_sword | obsydianowy miecz | 2.00 | 0.22 | 0.45 | — | 320 | 160 | quest wilcza-jama |
| axe | siekiera | 2.50 | 0.20 | 0.45 | 25 | 25 | 12 | wieś 1× + Kupiec; ścina drzewa |
| long_sword | miecz | 2.50 | 0.28 | 0.55 | 50 | 50 | 25 | Strażnik / Kupiec |
| masterwork_sword | mistrzowski miecz | 2.40 | 0.32 | 0.58 | 160 | 160 | 80 | Kupiec |
| damascus_long_sword | długi miecz damasceński | 2.70 | 0.34 | 0.60 | — | 240 | 120 | quest grozny-wilk |
| battle_axe | topór bojowy | 3.80 | 0.24 | 0.50 | 110 | 110 | 55 | Kupiec; ścina drzewa |

`pickaxe` is holdable but has **no** `melee` / `defense` — it is not in this table.

## Roles (reading aid)

Not a second stat table — just how the numbers cluster:

| Rola | Kind | Charakter |
|------|------|-----------|
| Najszybsze | `damascus_knife`, `knife` | krótki zasięg, wąski łuk, niski stam |
| Zasięg | `spear` | 3.0, wąski thrust |
| Uniwersalne miecze | `short_sword` → `long_sword` → `masterwork_sword` → `damascus_long_sword` | rosnący dmg / blok, szerszy/wolniejszy łuk |
| Peak dmg | `obsidian_sword` | 46, lżejszy cykl niż damasceński długi; słabszy blok |
| Ciężkie | `axe`, `battle_axe` | wolny cykl, siekiera/topór tną drzewa |
| Narzędzia | `sickle`, `pitchfork`, `shovel` | niski dmg; widły mają przyzwoity zasięg i blok |

## Weapon maintenance (plan 161)

Every kind in this file's Combat table except `shovel` (and `pickaxe`, not in
the table at all) is instance-backed with `durability`/`sharpness` in `[0,1]`
(new = 1/1) — see `src/items/itemInstances.ts`'s `WEAPON_MAINTENANCE_KINDS`
and `src/items/weaponMaintenance.ts`. Sharpness modifies the damage numbers
above (100%→100% … 0%→55%, `getSharpnessDamageModifier`); durability is
tracked but has no repair/broken lifecycle in v1. `whetstone` (Kupiec, 6
monet) restores sharpness only via `sharpenWeapon()`.

## Ranged weapons (plan 162)

| Kind | Label | Dmg | Zasięg | Prędkość pocisku | Draw | Rec | Stam | Trafność | Krytyk | Kupiec |
|------|-------|----:|-------:|------------------:|-----:|----:|-----:|---------:|-------:|-------:|
| short_bow | krótki łuk | 14 | 11 | 26 | 0.32 | 0.22 | 6 | 0.72 | — | 45 |
| hunting_bow | łuk myśliwski | 20 | 15 | 30 | 0.45 | 0.30 | 8 | 0.78 | 0.05 | 75 |
| long_bow | długi łuk | 28 | 20 | 34 | 0.65 | 0.40 | 11 | 0.70 | 0.08 | 120 |

Ammo (`arrow` +0 / `broadhead_arrow` +4 / `war_arrow` +8 damage) is ordinary
stackable count — no per-arrow instance or recovery. `archery` skill raises
effective accuracy (narrower aim-deviation cone), not a flat damage bonus.
Critical hits (`combat/criticalHit.ts`) are a shared modifier also usable by
melee (flat baseline, not in the table above). No bow durability/sharpness —
out of plan 162's scope. See `src/items/itemCatalog.ts`'s `RangedConfig` for
the source of truth.

See also [CATALOG.md](./CATALOG.md) for hold/spawn/models of every item.
