# MPFB2 → Mixamo → GLB Export — Current Status

## Status

🟡 **Delete groups are generated correctly, but the final GLB still exposes the Human body through clothing.**

The native MPFB2 Delete-group generation has been successfully reproduced and verified.

---

## Working pipeline

Current asset preparation flow:

1. Create the base character in MPFB2.
2. Add Mixamo rig.
3. Prepare animations:
   - export reduced doll from Mixamo,
   - upload to Mixamo,
   - export animations,
   - import animations,
   - Snap to Mixamo,
   - Bake,
   - rename Actions.
4. Configure MPFB2 Asset Library:
   - `GameEngine (PBR)`
   - `Material Instances` disabled.
5. Add:
   - skin,
   - eyes,
   - clothing.
6. Generate MPFB2 `Delete.*` groups.
7. Create an MPFB2 `Export copy`.
8. Export the Export copy to GLB.

---

## Delete-group generation

The custom diagnostic/generation script now successfully uses MPFB2 native classes.

Important findings:

- `GeneralObjectProperties` is located under:

```text
mpfb.entities.objectproperties
```

not:

```text
mpfb.services.properties
```

- `LocationService` was not available at the previously assumed path and is not currently required.
- The clothing object can have its `ARMATURE` modifier applied on a temporary copy.
- The `SUBDIVISION` modifier is left untouched.
- `MeshCrossRef` successfully builds the basemesh and clothing cross-references.
- `VertexMatch` successfully processes all clothing vertices.
- `ClothesService.create_new_delete_group(...)` successfully creates the Delete group.

Example successful result:

```text
Human
└── Vertex Groups
    ├── Delete.viking_sth_tunic
    └── Delete.viking_pants
```

The naming convention is:

```python
group_name = f"Delete.{clothes.name.split('.')[-1]}"
```

---

## Latest test

Two clothing items were processed:

- tunic
- pants

Both generated their own `Delete.*` group on `Human`.

An `Export copy` was then created through MPFB2.

The objects from the Export copy were exported to GLB.

### Result

❌ The GLB still contains visible Human/body geometry underneath the clothing.

The attached screenshot shows significant skin/body geometry visible through the outfit.

---

## What is currently proven

### Proven ✅

- MPFB2 native API is available.
- `ObjectService.object_is_basemesh()` works.
- `ClothesService.get_reference_scale()` works.
- `MeshCrossRef` works.
- `VertexMatch` works.
- Native `ClothesService.create_new_delete_group()` works.
- Multiple clothing items can have separate `Delete.*` groups.
- The Delete groups are present on the Human object.

### Not yet proven ❓

We do not yet know whether:

1. the generated Delete groups contain the expected vertices,
2. MPFB2 `Export copy` actually consumes all `Delete.*` groups,
3. the Export copy has the expected body geometry removed,
4. another MPFB2 export setting affects Delete-group processing,
5. the GLB exporter is exporting geometry that should have been removed,
6. modifiers / evaluated meshes / vertex-group state interfere with the deletion,
7. the Delete groups need to be processed at a different stage of the MPFB2 pipeline.

---

## Next investigation

Do **not** change the Delete-group generation yet.

First inspect the pipeline immediately after:

```text
Create Delete.* groups
        ↓
MPFB2 Export copy
```

The key diagnostic question is:

> **Does the MPFB2 Export copy already have the body geometry removed?**

### Test A — inspect Export copy

Create the Export copy but do **not** export GLB.

Inspect the Human/body mesh in the Export copy.

Expected:

```text
Body covered by tunic/pants
        ↓
corresponding body vertices removed
```

If the body is already clean, the problem is in the GLB export stage.

If the body is still visible, the problem is in MPFB2 Export copy generation / Delete-group consumption.

### Test B — inspect Delete groups

For each group:

```text
Delete.viking_sth_tunic
Delete.viking_pants
```

verify:

- vertex count,
- affected body regions,
- whether the expected vertices are actually weighted,
- whether the groups survive creation of the Export copy.

### Test C — compare source vs Export copy

Compare:

```text
Human
        ↓
Human in Export copy
```

including:

- vertex count,
- polygon count,
- vertex groups,
- modifiers,
- evaluated geometry.

This should identify exactly where the unwanted body geometry survives.

---

## Important constraint

The current Delete-group generator should be considered **working** until evidence shows otherwise.

Avoid replacing the native:

```python
ClothesService.create_new_delete_group(...)
```

with a custom deletion algorithm.

The next step should be to determine why correctly generated MPFB2 `Delete.*` groups do not produce the expected final geometry.
