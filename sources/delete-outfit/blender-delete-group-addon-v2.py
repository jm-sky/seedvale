import bpy
import traceback
import time

PREFIX = "[MPFB2 Native Delete]"


def log(msg):
    print(f"{PREFIX} {msg}", flush=True)


def deselect_all():
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)


def apply_armature_only(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            log(f"Applying: {modifier.name} (ARMATURE)")
            bpy.ops.object.modifier_apply(modifier=modifier.name)

    log("Remaining modifiers:")
    for modifier in obj.modifiers:
        log(f"  {modifier.name} ({modifier.type})")


def find_objects():
    selected = [
        obj for obj in bpy.context.selected_objects
        if obj.type == "MESH"
    ]

    if len(selected) != 2:
        raise RuntimeError(
            f"Select exactly 2 meshes: Human + clothing. Found {len(selected)}."
        )

    from bl_ext.extensions_blender_org.mpfb.services.objectservice import (
        ObjectService,
    )

    basemesh = None
    clothes = None

    for obj in selected:
        if ObjectService.object_is_basemesh(obj):
            basemesh = obj
        elif clothes is None:
            clothes = obj

    if basemesh is None:
        for obj in selected:
            if obj.name == "Human":
                basemesh = obj
                break

    if basemesh is None:
        raise RuntimeError("Could not identify basemesh.")

    for obj in selected:
        if obj != basemesh:
            clothes = obj
            break

    if clothes is None:
        raise RuntimeError("Could not identify clothing.")

    return basemesh, clothes


def main():

    log("=" * 72)
    log("START")

    basemesh, clothes = find_objects()

    log(f"Basemesh: {basemesh.name}")
    log(f"Clothes:  {clothes.name}")

    # ------------------------------------------------------------
    # MPFB2
    # ------------------------------------------------------------

    import bl_ext.extensions_blender_org.mpfb

    from bl_ext.extensions_blender_org.mpfb.services.clothesservice import (
        ClothesService,
    )

    from bl_ext.extensions_blender_org.mpfb.entities.clothes.vertexmatch import (
        VertexMatch,
    )

    from bl_ext.extensions_blender_org.mpfb.entities.meshcrossref import (
        MeshCrossRef,
    )

    # from bl_ext.extensions_blender_org.mpfb.services.locations import (
    #     LocationService,
    # )

    from bl_ext.extensions_blender_org.mpfb.services.objectservice import (
        ObjectService,
    )

    from bl_ext.extensions_blender_org.mpfb.entities.objectproperties import (
        GeneralObjectProperties,
    )

    log("MPFB2 native classes loaded")

    # ------------------------------------------------------------
    # Temporary copy
    # ------------------------------------------------------------

    clothes_copy = clothes.copy()
    clothes_copy.data = clothes.data.copy()
    clothes_copy.name = f"{clothes.name}__DELETE_TEST"

    for collection in clothes.users_collection:
        collection.objects.link(clothes_copy)

    clothes_copy.matrix_world = clothes.matrix_world.copy()

    log(f"Temporary copy: {clothes_copy.name}")
    log(f"Clothes vertices: {len(clothes_copy.data.vertices):,}")
    log(f"Basemesh vertices: {len(basemesh.data.vertices):,}")

    try:

        # --------------------------------------------------------
        # Prepare copy
        # --------------------------------------------------------

        deselect_all()

        clothes_copy.select_set(True)
        bpy.context.view_layer.objects.active = clothes_copy

        log("Applying ARMATURE only...")

        apply_armature_only(clothes_copy)

        # --------------------------------------------------------
        # Remove vertex groups
        # --------------------------------------------------------

        log("Removing vertex groups...")

        for group in list(clothes_copy.vertex_groups):
            clothes_copy.vertex_groups.remove(group)

        body_group = clothes_copy.vertex_groups.new(name="body")

        body_group.add(
            list(range(len(clothes_copy.data.vertices))),
            1.0,
            "REPLACE"
        )

        log("Created body vertex group")

        # --------------------------------------------------------
        # Reproduce native MPFB2 matching manually
        # --------------------------------------------------------

        log("")
        log("BUILDING BASEMESH CROSSREF...")
        start = time.time()

        reference_scale = ClothesService.get_reference_scale(basemesh)

        # cache_dir = LocationService.get_user_cache("basemesh_xref")
        cache_dir = None

        basemesh_xref = MeshCrossRef(
            basemesh,
            after_modifiers=True,
            build_faces_by_group_reference=True,
            cache_dir=cache_dir,
            write_cache=False,
            read_cache=True,
        )

        log(
            f"Basemesh CrossRef DONE "
            f"({time.time() - start:.1f}s)"
        )

        # --------------------------------------------------------

        log("")
        log("BUILDING CLOTHES CROSSREF...")
        start = time.time()

        clothes_xref = MeshCrossRef(
            clothes_copy,
            after_modifiers=True,
            build_faces_by_group_reference=True,
            cache_dir=None,
            write_cache=False,
            read_cache=False,
        )

        clothes_vertex_count = len(clothes_xref.vertex_coordinates)

        log(
            f"Clothes CrossRef DONE "
            f"({time.time() - start:.1f}s)"
        )

        log(f"Matching vertices: {clothes_vertex_count:,}")

        # --------------------------------------------------------
        # Vertex matching with progress
        # --------------------------------------------------------

        scale_factor = GeneralObjectProperties.get_value(
            "scale_factor",
            entity_reference=basemesh
        )

        log("")
        log("STARTING VERTEX MATCHING")
        log("-" * 72)

        mhclo = bl_ext.extensions_blender_org.mpfb.entities.clothes.mhclo.Mhclo()
        mhclo.verts = {}
        mhclo.clothes = clothes_copy

        started = time.time()
        last_log = started

        for vert in range(clothes_vertex_count):

            vmatch = VertexMatch(
                clothes_copy,
                vert,
                clothes_xref,
                basemesh,
                basemesh_xref,
                scale_factor=scale_factor,
                reference_scale=reference_scale,
                allow_exact=True,
            )

            mhclo.verts[vert] = vmatch.mhclo_line

            # Progress every 100 vertices
            if (vert + 1) % 100 == 0 or vert == clothes_vertex_count - 1:

                elapsed = time.time() - started
                done = vert + 1

                rate = done / elapsed if elapsed > 0 else 0

                remaining = (
                    (clothes_vertex_count - done) / rate
                    if rate > 0
                    else 0
                )

                percent = done / clothes_vertex_count * 100

                log(
                    f"VERTEX MATCH: "
                    f"{done:,}/{clothes_vertex_count:,} "
                    f"({percent:5.1f}%) | "
                    f"{rate:,.1f} vert/s | "
                    f"elapsed {elapsed:.1f}s | "
                    f"ETA {remaining:.1f}s"
                )

        total = time.time() - started

        log("-" * 72)
        log(f"VERTEX MATCHING DONE in {total:.1f}s")

        # --------------------------------------------------------
        # Create Delete group
        # --------------------------------------------------------

        log("")
        log("CREATING DELETE GROUP...")

        # group_name = f"Delete.{clothes.name.split('.')[-1]}"
        group_name = f"Delete.{clothes.name.removeprefix('Human.')}"

        ClothesService.create_new_delete_group(
            basemesh,
            clothes_copy,
            mhclo,
            group_name=group_name,
        )

        group = basemesh.vertex_groups.get(group_name)

        if group:
            log(f"SUCCESS: Delete group '{group_name}' created")
        else:
            log(f"ERROR: Delete group'{group_name}' NOT created")

    finally:

        log("")
        log("Removing temporary copy...")

        if clothes_copy.name in bpy.data.objects:
            bpy.data.objects.remove(
                clothes_copy,
                do_unlink=True
            )

    log("=" * 72)
    log("DONE")
    log("Original clothing was NOT modified.")


try:
    main()

except Exception as e:
    log("=" * 72)
    log(f"ERROR: {e}")
    traceback.print_exc()
