## Problem: Skin visible through clothing after GLB export

After preparing an MPFB2 character with:

- base Human mesh,
- Mixamo rig and animations,
- skin,
- eyes,
- clothing,
- generated MPFB2 `Delete.*` vertex groups,

an `Export copy` was created using MPFB2 and exported to GLB.

The Human mesh contains two Delete groups:

- `Delete.viking_sth_tunic`
- `Delete.viking_pants`

Both clothing items were processed successfully and the corresponding Delete groups were generated on the Human mesh.

However, after exporting the `Export copy` to GLB, the result still shows substantial parts of the underlying Human skin/body through the clothing.

The visible skin is especially apparent around the torso, arms, hands, legs and other areas where clothing should cover the body.

The problem therefore appears to be that the MPFB2 `Delete.*` vertex groups are present on the source Human object, but are not resulting in the expected removal/hiding of body geometry in the final GLB export.

### Current observation

The Delete groups exist:

```text
Human
└── Vertex Groups
    ├── Delete.viking_sth_tunic
    └── Delete.viking_pants
```

but the exported GLB still contains visible body geometry underneath the clothing.

### Important distinction

The Delete groups themselves were generated successfully using MPFB2's native:

```python
ClothesService.create_new_delete_group(...)
```

The failure occurs later in the pipeline, between:

```text
Delete.* groups
    ↓
MPFB2 Export copy
    ↓
GLB export
    ↓
GLB result
```

This needs to be investigated before changing the Delete-group generation process.
