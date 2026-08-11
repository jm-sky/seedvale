# Wire nature + ore GLBs

**Status:** `verification needed`
**Created:** 2026-08-11
**Related:** [030 — World elements](./2026-08-07--030--world-elements-interactions.md), [032 — Natural resources](./2026-08-08--032--natural-resources-economy.md)
**Priority:** 🟡 medium · **Effort:** M · **Depends on:** ~~030~~, ~~032~~

**Implemented (2026-08-11):** chunk `largeRock` / `rockCluster` / `fallenLog` → GLB; ore piles → `resource_gold_1` / `resource_rock_1` (iron+coal tint). Procedural fallbacks retained.

## Cel

Podpiąć 5 nieużywanych modeli z `public/models/nature/` dla największego efektu wizualnego w „pustym” świecie:

| Placement | GLB | Fallback |
|---|---|---|
| `largeRock` | `rock_a.glb` | `createLargeRock` |
| `rockCluster` | `rock_cluster_a.glb` | `createRockCluster` |
| `fallenLog` | `fallen_log_a.glb` | `createFallenLog` |
| złoto | `resource_gold_1.glb` | tinted `createRockCluster` |
| żelazo / węgiel | `resource_rock_1.glb` + tint | tinted `createRockCluster` |

**Mapowanie złóż:** gold → `resource_gold_1`; iron/coal → `resource_rock_1` z tintem `0x8a4a30` / `0x1c1c1c`.

## Poza zakresem

Campfire / monolith / ruins / stone circle, harvest stump, pozostała rezerwa (settlement / world / flowers).

## Implementacja

- Specs + `tintPropMaterials` / `clonePropWithYaw` w `src/settlement/props.ts`
- Async GLB templates w `src/terrain/chunkManager.ts` dla rock/log kinds
- Lazy GLB load + tint w `src/terrain/resourceDeposits.ts` (1–2 piles / deposit)

## Weryfikacja

- **Techniczna:** `tsc` / lint / test / build
- **Przeglądarkowa (user):** skały/pnie GLB poza home; żelazo/węgiel/złoto czytelne + tint; etykiety; deterministyczny reload chunka
