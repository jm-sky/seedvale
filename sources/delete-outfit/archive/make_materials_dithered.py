import bpy

MATERIALS = [
    "Human.body",
    "Human.rehmanpolanski_viking_pants",
    "Human.rehmanpolanski_viking_tunic",
    "Human.rehmanpolanski_viking_boots",
]

print("=" * 80)
print("[MPFB2 Alpha Test] START")
print("=" * 80)

for name in MATERIALS:
    mat = bpy.data.materials.get(name)

    if not mat:
        print(f"\n[NOT FOUND] {name}")
        continue

    print(f"\n[MATERIAL] {name}")
    print(f"  BEFORE surface_render_method: {mat.surface_render_method}")

    if not mat.use_nodes:
        print("  Nodes disabled")
        continue

    bsdf = next(
        (n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'),
        None
    )

    if not bsdf:
        print("  Principled BSDF NOT FOUND")
        continue

    alpha_input = bsdf.inputs.get("Alpha")

    if alpha_input and alpha_input.is_linked:
        link = alpha_input.links[0]
        print(
            f"  Alpha link: {link.from_node.name}.{link.from_socket.name}"
            f" -> {bsdf.name}.Alpha"
        )

        mat.node_tree.links.remove(link)
        print("  Alpha link REMOVED")
    else:
        print("  Alpha link: NOT LINKED")

    # Blender 5.2
    mat.surface_render_method = 'DITHERED'

    print(f"  AFTER surface_render_method: {mat.surface_render_method}")
    print(f"  AFTER Alpha linked: {alpha_input.is_linked}")

print("\n" + "=" * 80)
print("[MPFB2 Alpha Test] DONE")
print("=" * 80)
