bl_info = {
    "name": "Seedvale Character Tools",
    "author": "Seedvale",
    "version": (0, 1, 0),
    "blender": (5, 2, 0),
    "location": "View3D > Sidebar > Seedvale",
    "description": "Preparation tools for MPFB2 characters before Export Copy.",
    "category": "3D View",
}

import bpy
import time
import traceback

PREFIX = "[Seedvale Character Tools v2]"

CLOTHING_PREFIX = "Human."
HAIR_PREFIXES = (
    "Human.short",
)
CLOTHING_HAIR_PREFIXES = (
    "Human.rehmanpolanski_",
    "Human.short",
)


DECIMATE_MODIFIER_NAME = "Seedvale Decimate"

# Initial export LOD settings. Keep these centralized for easy tuning.
DECIMATE_RATIO_BODY = 0.35
DECIMATE_RATIO_CLOTHING = 0.35
DECIMATE_RATIO_HEAD = 0.50


def find_export_copy_root():
    """Find the MPFB2 Export Copy armature."""
    collection = bpy.data.collections.get("export copy")
    if collection is None:
        raise RuntimeError("MPFB2 Export Copy collection not found.")

    roots = [
        obj for obj in collection.objects
        if obj.type == "ARMATURE"
        and obj.name.endswith("_export_copy")
        and obj.parent is None
    ]

    if len(roots) == 1:
        return roots[0]

    if not roots:
        raise RuntimeError("MPFB2 Export Copy armature not found.")

    raise RuntimeError(
        "Multiple Export Copy armatures found: "
        + ", ".join(obj.name for obj in roots)
    )


def classify_export_mesh(obj, export_root):
    """Classify an Export Copy mesh using structural evidence."""
    if obj.type != "MESH" or obj.parent != export_root:
        return None

    # Exported MPFB2 Human is the only verified mesh with the body group.
    if obj.vertex_groups.get("body") is not None:
        return "body"

    # Head-only weights are shared by hair/beard/eyes. The current verified
    # character has Human.low-poly as the eye mesh, so keep this narrow
    # fallback until eye identification is verified structurally.
    source_name = obj.name.removesuffix("_export_copy")
    if source_name == "Human.low-poly":
        return "eyes"

    head_groups = {
        "mixamorig:Head",
        "mixamorig:Neck",
        "mixamorig:Spine2",
    }
    group_names = {group.name for group in obj.vertex_groups}

    if group_names and group_names.issubset(head_groups):
        return "head"

    # Remaining child meshes of the Export Copy armature are currently
    # treated as renderable clothing/accessories.
    return "clothing"


def find_export_copy_meshes(export_root):
    """Return Export Copy mesh targets with their classification."""
    collection = bpy.data.collections.get("export copy")
    if collection is None:
        raise RuntimeError("MPFB2 Export Copy collection not found.")

    result = []
    for obj in collection.objects:
        component = classify_export_mesh(obj, export_root)
        if component is not None:
            result.append((obj, component))

    return result


def generate_decimate():
    """Add or update Seedvale Decimate modifiers on Export Copy meshes."""
    export_root = find_export_copy_root()
    targets = find_export_copy_meshes(export_root)

    if not targets:
        raise RuntimeError("No supported Export Copy mesh targets found.")

    ratios = {
        "body": DECIMATE_RATIO_BODY,
        "clothing": DECIMATE_RATIO_CLOTHING,
        "head": DECIMATE_RATIO_HEAD,
    }

    changed = 0
    skipped = 0

    log(f"Export Copy: {export_root.name}")
    log(f"Decimate targets: {len(targets)}")

    for obj, component in targets:
        if component == "eyes":
            skipped += 1
            log(f"Decimate skipped (eyes): {obj.name}")
            continue

        ratio = ratios[component]
        modifier = obj.modifiers.get(DECIMATE_MODIFIER_NAME)

        if modifier is None:
            modifier = obj.modifiers.new(
                name=DECIMATE_MODIFIER_NAME,
                type="DECIMATE",
            )
            log(f"Decimate added: {obj.name} [{component}]")
        else:
            log(f"Decimate updated: {obj.name} [{component}]")

        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        changed += 1

    return changed, skipped


def log(message):
    print(f"{PREFIX} {message}", flush=True)


def find_basemesh():
    obj = bpy.context.scene.seedvale_human
    if obj and obj.type == "MESH":
        try:
            from bl_ext.extensions_blender_org.mpfb.services.objectservice import ObjectService
            if ObjectService.object_is_basemesh(obj):
                return obj
        except Exception:
            pass

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue

        if obj.name == "Human":
            return obj

    try:
        from bl_ext.extensions_blender_org.mpfb.services.objectservice import ObjectService
        for obj in bpy.context.scene.objects:
            if obj.type == "MESH" and ObjectService.object_is_basemesh(obj):
                return obj
    except Exception:
        pass

    raise RuntimeError("Could not identify MPFB2 basemesh (Human).")


def find_clothing(basemesh):
    return [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH"
        and obj != basemesh
        and obj.name.startswith(CLOTHING_PREFIX)
        and not obj.name.startswith(CLOTHING_HAIR_PREFIXES)
    ]


def remove_mask_if_exists(basemesh, group_name):
    for modifier in list(basemesh.modifiers):
        if modifier.type == "MASK" and modifier.vertex_group == group_name:
            basemesh.modifiers.remove(modifier)


def create_delete_group_for_clothing(basemesh, clothes):
    from bl_ext.extensions_blender_org.mpfb.services.clothesservice import ClothesService
    from bl_ext.extensions_blender_org.mpfb.entities.clothes.vertexmatch import VertexMatch
    from bl_ext.extensions_blender_org.mpfb.entities.meshcrossref import MeshCrossRef
    from bl_ext.extensions_blender_org.mpfb.entities.objectproperties import GeneralObjectProperties
    import bl_ext.extensions_blender_org.mpfb

    group_name = f"Delete.{clothes.name.removeprefix('Human.')}"

    existing_group = basemesh.vertex_groups.get(group_name)
    if existing_group:
        log(f"Removing existing vertex group: {group_name}")
        basemesh.vertex_groups.remove(existing_group)

    remove_mask_if_exists(basemesh, group_name)

    clothes_copy = clothes.copy()
    clothes_copy.data = clothes.data.copy()
    clothes_copy.name = f"{clothes.name}__DELETE_TEST"

    for collection in clothes.users_collection:
        collection.objects.link(clothes_copy)

    clothes_copy.matrix_world = clothes.matrix_world.copy()

    try:
        # Do not use bpy.ops.object.select_all() here.
        # The operator may be executed from the Seedvale panel while the
        # current UI area/context is not compatible with object operators.
        for obj in bpy.context.view_layer.objects:
            obj.select_set(False)

        clothes_copy.select_set(True)
        bpy.context.view_layer.objects.active = clothes_copy

        for modifier in list(clothes_copy.modifiers):
            if modifier.type == "ARMATURE":
                log(f"Applying: {modifier.name} (ARMATURE)")
                bpy.ops.object.modifier_apply(modifier=modifier.name)

        for group in list(clothes_copy.vertex_groups):
            clothes_copy.vertex_groups.remove(group)

        body_group = clothes_copy.vertex_groups.new(name="body")
        body_group.add(
            list(range(len(clothes_copy.data.vertices))),
            1.0,
            "REPLACE",
        )

        reference_scale = ClothesService.get_reference_scale(basemesh)

        basemesh_xref = MeshCrossRef(
            basemesh,
            after_modifiers=True,
            build_faces_by_group_reference=True,
            cache_dir=None,
            write_cache=False,
            read_cache=True,
        )

        clothes_xref = MeshCrossRef(
            clothes_copy,
            after_modifiers=True,
            build_faces_by_group_reference=True,
            cache_dir=None,
            write_cache=False,
            read_cache=False,
        )

        scale_factor = GeneralObjectProperties.get_value(
            "scale_factor",
            entity_reference=basemesh,
        )

        mhclo = bl_ext.extensions_blender_org.mpfb.entities.clothes.mhclo.Mhclo()
        mhclo.verts = {}
        mhclo.clothes = clothes_copy

        vertex_count = len(clothes_xref.vertex_coordinates)
        started = time.time()

        for vert in range(vertex_count):
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

            if (vert + 1) % 250 == 0 or vert == vertex_count - 1:
                elapsed = time.time() - started
                log(
                    f"{clothes.name}: vertex match "
                    f"{vert + 1:,}/{vertex_count:,} "
                    f"({(vert + 1) / vertex_count * 100:.1f}%) "
                    f"{elapsed:.1f}s"
                )

        ClothesService.create_new_delete_group(
            basemesh,
            clothes_copy,
            mhclo,
            group_name=group_name,
        )

        group = basemesh.vertex_groups.get(group_name)
        if not group:
            raise RuntimeError(f"Delete group was NOT created: {group_name}")

        modifier = basemesh.modifiers.new(
            name=group_name,
            type="MASK",
        )
        modifier.vertex_group = group_name
        modifier.invert_vertex_group = True

        return group_name

    finally:
        if clothes_copy.name in bpy.data.objects:
            bpy.data.objects.remove(clothes_copy, do_unlink=True)


def generate_delete_groups_and_masks():
    basemesh = find_basemesh()
    clothing = find_clothing(basemesh)

    if not clothing:
        raise RuntimeError("No clothing meshes found.")

    log(f"Basemesh: {basemesh.name}")
    log(f"Clothing meshes: {len(clothing)}")

    created = []
    for clothes in clothing:
        log(f"Processing clothing: {clothes.name}")
        created.append(create_delete_group_for_clothing(basemesh, clothes))

    return len(created)


def fix_alpha_materials():
    fixed = 0

    for mat in bpy.data.materials:
        if not mat.name.startswith(CLOTHING_HAIR_PREFIXES):
            continue

        if not mat.use_nodes:
            continue

        bsdf = next(
            (node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
            None,
        )
        if not bsdf:
            continue

        alpha_input = bsdf.inputs.get("Alpha")
        if alpha_input and alpha_input.is_linked:
            for link in list(alpha_input.links):
                mat.node_tree.links.remove(link)

        mat.surface_render_method = "DITHERED"
        fixed += 1
        log(f"Alpha fixed: {mat.name}")

    return fixed


class SEEDVALE_OT_generate_delete(bpy.types.Operator):
    bl_idname = "seedvale.generate_delete"
    bl_label = "Generate Delete Groups + Masks"
    bl_description = "Generate MPFB2 Delete.* groups and inverted Mask modifiers"
    bl_options = {"REGISTER"}

    def execute(self, context):
        try:
            count = generate_delete_groups_and_masks()
            self.report({"INFO"}, f"Generated {count} Delete groups + Masks")
            return {"FINISHED"}
        except Exception as exc:
            traceback.print_exc()
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class SEEDVALE_OT_generate_decimate(bpy.types.Operator):
    bl_idname = "seedvale.generate_decimate"
    bl_label = "Generate Decimate"
    bl_description = "Add or update Decimate modifiers on MPFB2 Export Copy meshes"
    bl_options = {"REGISTER"}

    def execute(self, context):
        try:
            changed, skipped = generate_decimate()
            self.report(
                {"INFO"},
                f"Decimate: {changed} meshes configured, {skipped} skipped",
            )
            return {"FINISHED"}
        except Exception as exc:
            traceback.print_exc()
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class SEEDVALE_OT_fix_alpha(bpy.types.Operator):
    bl_idname = "seedvale.fix_alpha"
    bl_label = "Fix Clothing / Hair Alpha"
    bl_description = "Disconnect Principled Alpha and use DITHERED rendering"
    bl_options = {"REGISTER"}

    def execute(self, context):
        try:
            count = fix_alpha_materials()
            self.report({"INFO"}, f"Fixed {count} materials")
            return {"FINISHED"}
        except Exception as exc:
            traceback.print_exc()
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class SEEDVALE_OT_prepare(bpy.types.Operator):
    bl_idname = "seedvale.prepare_character"
    bl_label = "Prepare Character"
    bl_description = "Run all Seedvale preparation steps before MPFB2 Export Copy"
    bl_options = {"REGISTER"}

    def execute(self, context):
        try:
            groups = generate_delete_groups_and_masks()
            materials = fix_alpha_materials()
            self.report(
                {"INFO"},
                f"Character prepared: {groups} Delete groups + {materials} materials",
            )
            return {"FINISHED"}
        except Exception as exc:
            traceback.print_exc()
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class SEEDVALE_PT_character_tools(bpy.types.Panel):
    bl_label = "Seedvale Character Tools"
    bl_idname = "SEEDVALE_PT_character_tools"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Seedvale"

    def draw(self, context):
        layout = self.layout

        layout.label(text="Character Preparation")

        row = layout.row()
        row.prop(context.scene, "seedvale_human", text="Human")

        layout.separator()

        box = layout.box()
        box.label(text="Preparation")
        box.operator(
            "seedvale.generate_delete",
            icon="MOD_MASK",
        )
        box.operator(
            "seedvale.fix_alpha",
            icon="MATERIAL",
        )
        box.operator(
            "seedvale.generate_decimate",
            icon="MOD_DECIM",
        )

        layout.separator()

        row = layout.row()
        row.scale_y = 1.5
        row.operator(
            "seedvale.prepare_character",
            icon="CHECKMARK",
            text="Prepare Character",
        )

        layout.separator()
        layout.label(text="Then use MPFB2 Export Copy manually.")


classes = (
    SEEDVALE_OT_generate_delete,
    SEEDVALE_OT_generate_decimate,
    SEEDVALE_OT_fix_alpha,
    SEEDVALE_OT_prepare,
    SEEDVALE_PT_character_tools,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)

    bpy.types.Scene.seedvale_human = bpy.props.PointerProperty(
        name="Human",
        type=bpy.types.Object,
        description="MPFB2 basemesh used by Seedvale preparation tools",
    )

    log("Registered")


def unregister():
    del bpy.types.Scene.seedvale_human

    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

    log("Unregistered")


if __name__ == "__main__":
    register()
