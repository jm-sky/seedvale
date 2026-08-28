import bpy

print("=" * 80)
print("[MPFB2 Hair Fix] START")
print("=" * 80)

HAIR_PREFIXES = (
    "Human.short02",
    "Human.short04",
)

for mat in bpy.data.materials:
    if not mat.name.startswith(HAIR_PREFIXES):
        continue

    print(f"\n[MATERIAL] {mat.name}")

    # Blender 5.2
    print(f"  BEFORE surface_render_method: {mat.surface_render_method}")
    mat.surface_render_method = 'BLENDED'
    print(f"  AFTER  surface_render_method: {mat.surface_render_method}")

    if not mat.use_nodes:
        print("  No nodes -> SKIP")
        continue

    bsdf = next(
        (n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'),
        None
    )

    alpha_tex = next(
        (
            n for n in mat.node_tree.nodes
            if n.type == 'TEX_IMAGE'
            and n.name == 'AlphaMapTexture'
        ),
        None
    )

    if not bsdf:
        print("  Principled BSDF not found -> SKIP")
        continue

    if not alpha_tex:
        print("  AlphaMapTexture not found -> SKIP")
        continue

    # Remove existing alpha links.
    for link in list(mat.node_tree.links):
        if link.to_node == bsdf and link.to_socket == bsdf.inputs["Alpha"]:
            mat.node_tree.links.remove(link)

    # Restore texture alpha -> Principled Alpha.
    mat.node_tree.links.new(
        alpha_tex.outputs["Alpha"],
        bsdf.inputs["Alpha"]
    )

    print("  Alpha: AlphaMapTexture.Alpha -> Principled BSDF.Alpha")
    print("  Alpha link RESTORED")

print("\n" + "=" * 80)
print("[MPFB2 Hair Fix] DONE")
print("=" * 80)
