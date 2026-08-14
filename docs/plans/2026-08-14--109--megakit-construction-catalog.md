# Plan 109: MegaKit Construction Audit & Construction Catalog

**Status:** `planned`
**Created:** 2026-08-14
**Priority:** 🟡 medium
**Effort:** `L`
**Depends on:** — (does not depend on 107; both extend `AssetIndex` independently, see below)
**Related:** [review 008](../reviews/2026-08-14--008--asset-browser-modular-cottage.md), [plan 107](./2026-08-14--107--asset-browser-agent-discovery.md), [megakit README](../../public/models/settlement/megakit/README.md)

## Po co

Full Medieval Village MegaKit (176 GLB) is parked in `public/models/settlement/megakit/`
(closed 2026-08-14, review 008 §11). Nobody can build houses from it yet because there is
no machine-readable answer to "which file is a wall, what are its real dimensions, what
does it connect to". This plan builds that layer: a **Construction Catalog** over the
existing `AssetIndex`, derived from measured GLB geometry, not hand-typed guesses.

This plan does **not** implement a `HouseBuilder`, settlement wiring, colliders, or an
entrance system. It produces the data + types a future builder plan will consume.

## Zakres

1. **Audit all 176 MegaKit GLB** programmatically (parse GLB binary/JSON directly, or via
   a Node script using accessor `min`/`max`, not the browser/Asset Browser UI) — native
   AABB, node/material names, mesh/animation counts. Cross-check against the prefix-based
   role table already in `megakit/README.md` (`wall_*` 20, `roof_*` 39, `door_*` 8, …).
2. **Classify** each asset into a construction kind (`wall` / `door` / `window` / `floor` /
   `roof` / `corner` / `opening` / `decoration`) from the measured/verified prefix table.
3. **Confirm or refute the 2 m module** across walls / floor / roof / door openings using
   measured dimensions, not filenames.
4. **Derive anchors** (`LEFT` / `RIGHT` / `FRONT` / `BACK` / `TOP` / `BOTTOM`, roof-specific
   as needed) from AABB + measured module where geometry supports it deterministically.
   Mark anything that can't be derived reliably as unresolved — do not eyeball it.
5. **Implement `ConstructionCatalog`** as a layer over `AssetIndex` (`src/assets/`), reusing
   `AssetIndexEntry` conventions rather than a second registry. Exact wiring of parked
   MegaKit into `buildAssetIndex()` may reuse/overlap with plan 107's `status`/`pack`
   fields — if 107 hasn't landed, this plan adds the minimum parked entries it needs
   locally and documents the seam for 107 to consolidate later.
6. **Construction Rules** — minimal connectivity rules (wall↔wall module, wall↔door/window
   requirements, roof adjacency) derived from the audit, not invented ontology.
7. **Tests** for discovery (filename → kind), dimensions (known values), and rule
   consistency (declared-compatible parts share a module/anchor).
8. **Construction Audit Report** (`docs/reviews/2026-08-14--009--megakit-construction-audit.md`)
   with findings, confirmed modules, open/unresolved anchors, MegaKit limitations, and an
   example `HouseDefinition` (data only) showing the catalog carries enough information for
   a future builder.
9. Update `docs/assets/MODELS.md` (M01) if status changes.

## Poza zakresem

`HouseBuilder`, settlement generator wiring, snap UI, house editor, physics/colliders,
entrance system, `SettlementsManager` changes, procedural 10-house generation. Next plan
(after this one, separately scoped) is Construction Catalog → `HouseBuilder` →
`HouseValidator` → 10-house test scene.

## Ograniczenia sesji

No browser access in this session — geometry audit uses a Node-side GLB parser (accessor
bounds), not the Asset Browser UI or a headless render. Visual/in-editor verification of
the catalog against the Asset Browser is left for a browser-enabled session (Cursor).

## Weryfikacja

`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`. No browser verification
in this session (see above).
