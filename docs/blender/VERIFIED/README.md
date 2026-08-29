# Verified Blender / MPFB2 Procedures

This directory contains procedures executed successfully in the target environment.

Each verified document must state:

- Blender version;
- MPFB2 version;
- Seedvale commit;
- exact procedure;
- expected result;
- actual result;
- limitations.

Do not place merely researched recipes here.

## Verification queue

The 2026-08-29 source recon identified these high-value runtime tests:

1. Character generation from a deterministic spec.
2. Native MHCLO hair/beard/clothing attachment and fitting.
3. Medieval/Viking clothing fitting with the selected assets.
4. Native Delete Groups on fitted clothing.
5. Delete Groups → Export Copy → baked mask → GLB.
6. Mixamo rig + external animation → mapping/snap → Blender bake → GLB.
7. Material/alpha behaviour for hair and beard in GLB.
8. GLB import and visual validation in Seedvale.
9. Deterministic batch generation.
10. Resolve the 2.0.17 asset path discrepancy and identify concrete Low Poly Eyes / Hair assets.

Until these tests are executed, the corresponding knowledge remains `researched`.
