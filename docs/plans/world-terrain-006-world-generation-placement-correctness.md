# Plan: World Generation & Placement Correctness

**Created:** 2026-09-03
**Status:** `verification needed` 🔍
**Type:** fix
**Priority:** medium · **Effort:** M
**Depends on:** ~~191~~
**Domain:** `world-terrain`
**Subdomains:** `terrain` `vegetation` `roads` `landmarks`
**Tags:** `water` `placement` `mountains`

> Check: `docs/plans/implementation-notes/world-terrain-006-world-generation-placement-correctness-implementation-notes.md`

## Implementation status (2026-09-03)

**Implemented + technically verified** (`npx tsc --noEmit`, `npm run lint:fix`, `npm run build`, `npx vitest run` — 2619/2620 passing; the one failing test is a pre-existing stale golden snapshot unrelated to this plan, see `docs/plans/LOOSE-ENDS.md`):

- River terminals now require a genuine water receiver (`hydrology.ts`'s `OCEAN_OUTLET` flag, extended to dry closed depressions too; `riverNetwork.ts`'s `buildChains` drops any chain that would dead-end at a non-water sink/boundary-exit instead of rendering a river into dry land).
- Trees/grass/flowers/ferns now reject candidates falling inside a river's actual carved channel (`riverNetwork.ts`'s `isInsideRiverChannel`, wired into `chunkVegetation.ts` and `grassPlacement.ts`) — catches mountain streams whose bed sits above the world's global `waterLevel`, where the existing heights-clamp reject alone missed them.
- Cemetery placement now rejects on its whole grave-grid footprint against nearby roads (`chunkEnvironment.ts`'s `cemeteryFootprintClearsRoads`), not just its center point.
- `createMonolith`/`createSmallRuins` (`settlement/decorProps.ts`) now take an optional `TerrainPlacementContext` and ground/tilt each element (stone/walls/rubble) at its own world position, same pattern as `createStoneCircle`/`createCemetery` — wired in `chunkManager.ts`.
- Cemetery grave spacing widened (`CEMETERY_LAYOUTS` colSpacing/rowSpacing/aisleWidth) with proportionally larger per-grave jitter.
- Mountain vegetation continuity extended: `biomeRegions.ts`'s `forestDensityAt` altitude fade end raised (0.55 → 0.62), `chunkVegetation.ts`'s tree treeline (0.6 → 0.66) and `grassPlacement.ts`'s grass treeline (0.5 → 0.58) raised to match — ridge-crest rejection is unchanged.

**Not done — needs browser verification** (visual/gameplay correctness, per this plan's own Verification section): river terminals at their visible endpoint across several seeds, river-bank vegetation exclusion on a mountain stream, cemetery-vs-road clearance in the world, stone circles/ruins/monoliths on real slopes, mountain slope vegetation continuity from lowland through the upper band, streaming/chunk-seam regressions.

## Cel

Usunąć widoczne błędy proceduralnego generowania i placementu świata, w których obiekty nie respektują podstawowych ograniczeń terenu, wody i istniejącej infrastruktury.

## Zakres

### Hydrologia i teren
- zapewnić, że rzeka nie kończy się przypadkowo na suchym terenie; jej endpoint musi prowadzić do poprawnego odbiornika zgodnego z istniejącym modelem hydrologii,
- zachować ciągłość rzek w miejscach generowania i streamingu,
- nie dopuszczać do placementu zwykłej trawy ani drzew na powierzchni/korycie rzeki.

### Placement obiektów
- kamienne kręgi i inne terrain-bound props nie mogą pozostawać zawieszone nad terenem,
- placement powinien poprawnie obsługiwać strome zbocza i różnice wysokości,
- cmentarze nie mogą nachodzić na drogi; uwzględnić bezpieczny margines,
- groby na cmentarzu powinny mieć większe i naturalniej zróżnicowane odstępy.

### Góry
- zwiększyć sensowną wizualną ciągłość roślinności na większych wysokościach,
- wykorzystać istniejący system vegetation/biome/environment constraints zamiast osobnego systemu górskiej flory,
- nie przywracać zwykłej nizinnej trawy tam, gdzie obecny model wysokości/biomu ją wyklucza.

## Ograniczenia

- Reuse istniejących terrain, water, road, landmark i vegetation queries.
- Nie tworzyć równoległego systemu kolizji tylko dla proceduralnego placementu.
- Nie przebudowywać hydrologii bardziej niż jest to potrzebne do poprawnych endpointów.
- Zachować deterministyczność generowania.

## Poza zakresem

- system picia wody,
- runtime player placement,
- fire/wood,
- cloud rendering,
- nowe duże biome'y lub kompletna przebudowa generatora świata.

## Verification

- rzeki nie kończą się na suchym polu,
- flora nie pojawia się w rzekach,
- kamienne kręgi i inne wskazane props poprawnie przylegają do terenu,
- cmentarz pozostaje poza drogą z widocznym marginesem,
- groby nie są nienaturalnie stłoczone,
- góry mają sensowną ciągłość roślinności,
- istniejące generowanie i streaming chunków nie mają regresji.

Przy implementacji dodać JSDoc do ważnych publicznych funkcji/klas architektonicznych, gdy pomaga to w preflight discovery; dla nowych mechanizmów preferować `@domain`.

**Zrób git commit i push do main, rebase jeżeli trzeba**
