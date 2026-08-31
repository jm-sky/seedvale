bl_info = {
    "name": "Seedvale Character Tools v2",
    "author": "Seedvale",
    "version": (0, 2, 0),
    "blender": (5, 2, 0),
    "location": "View3D > Sidebar > Seedvale",
    "description": "Preparation tools for MPFB2 Export Copy characters.",
    "category": "3D View",
}

import bpy
import time
import traceback

PREFIX = "[Seedvale Character Tools v2]"

EXPORT_COLLECTION_NAME = "export copy"
EXPORT_COPY_SUFFIX = "_export_copy"

DECIMATE_MODIFIER_NAME = "Seedvale Decimate"

DECIMATE_RATIO_BODY = 0.35
DECIMATE_RATIO_CLOTHING = 0.35
DECIMATE_RATIO_HEAD = 0.50

EYE_SOURCE_NAMES = {
    "Human.low-poly",
}

HEAD_GROUPS = {
    "mixamorig:Head",
    "mixamorig:Neck",
    "mixamorig:Spine2",
}


def log(message):
    print(f"{PREFIX} {message}", flush=True)


def activate_object(obj):
    """Activate an object without bpy.ops.object.select_all()."""
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT", toggle=False)

    for other in bpy.context.view_layer.objects:
        other.select_set(False)

    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def find_export_collection():
    collection = bpy.data.collections.get(EXPORT_COLLECTION_NAME)
    if collection is None:
        raise RuntimeError(
            f'MPFB2 Export Copy collection "{EXPORT_COLLECTION_NAME}" not found.'
        )
    return collection


def find_export_copy_root():
    """Find the MPFB2 Export Copy armature."""
    collection = find_export_collection()

    roots = [
        obj
        for obj in collection.objects
        if obj.type == "ARMATURE"
        and obj.name.endswith(EXPORT_COPY_SUFFIX)
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


def is_descendant(obj, root):
    parent = obj.parent
    while parent is not None:
        if parent == root:
            return True
        parent = parent.parent
    return False


def classify_export_mesh(obj, export_root):
    """Classify an Export Copy mesh using structural evidence."""
    if obj.type != "MESH" or not is_descendant(obj, export_root):
        return None

    if obj.vertex_groups.get("body") is not None:
        return "body"

    source_name = obj.name.removesuffix(EXPORT_COPY_SUFFIX)
    if source_name in EYE_SOURCE_NAMES:
        return "eyes"

    group_names = {group.name for group in obj.vertex_groups}
    if group_names and group_names.issubset(HEAD_GROUPS):
        return "head"

    return "clothing"


def find_export_copy_meshes(export_root):
    result = []

    for obj in find_export_collection().objects:
        component = classify_export_mesh(obj, export_root)
        if component is not None:
            result.append((obj, component))

    if not result:
        raise RuntimeError("No supported Export Copy mesh targets found.")

    return result


def find_export_basemesh(export_root):
    meshes = [
        obj
        for obj in find_export_collection().objects
        if obj.type == "MESH" and is_descendant(obj, export_root)
    ]

    body_meshes = [
        obj for obj in meshes
        if obj.vertex_groups.get("body") is not None
    ]

    if len(body_meshes) == 1:
        return body_meshes[0]

    if not body_meshes:
        raise RuntimeError("Export Copy basemesh not found.")

    raise RuntimeError(
        "Multiple Export Copy basemesh meshes found: "
        + ", ".join(obj.name for obj in body_meshes)
    )


def find_export_clothing(export_root, basemesh):
    result = []

    for obj in find_export_collection().objects:
        if obj.type != "MESH":
            continue
        if obj == basemesh or not is_descendant(obj, export_root):
            continue

        if classify_export_mesh(obj, export_root) == "clothing":
            result.append(obj)

    return result


def add_or_update_decimate(obj, ratio):
    modifier = obj.modifiers.get(DECIMATE_MODIFIER_NAME)

    if modifier is None:
        modifier = obj.modifiers.new(
            name=DECIMATE_MODIFIER_NAME,
            type="DECIMATE",
        )
        log(f"Decimate added: {obj.name} ratio={ratio:.2f}")
    else:
        log(f"Decimate updated: {obj.name} ratio={ratio:.2f}")

    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    return modifier


def generate_decimate():
    """
    Add and apply Decimate.

    v1 deliberately applies the modifier immediately so subsequent
    Delete Group generation operates on reduced Export Copy geometry.
    """
    export_root = find_export_copy_root()
    targets = find_export_copy_meshes(export_root)

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

        modifier = add_or_update_decimate(obj, ratios[component])
        activate_object(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)

        changed += 1
        log(f"Decimate applied: {obj.name} [{component}]")

    return changed, skipped


def remove_mask_if_exists(basemesh, group_name):
    for modifier in list(basemesh.modifiers):
        if modifier.type == "MASK" and modifier.vertex_group == group_name:
            basemesh.modifiers.remove(modifier)


def create_delete_group_for_clothing(basemesh, clothes):
    from bl_ext.extensions_blender_org.mpfb.services.clothesservice import (
        ClothesService,
    )
    from bl_ext.extensions_blender_org.mpfb.entities.clothes.vertexmatch import (
        VertexMatch,
    )
    from bl_ext.extensions_blender_org.mpfb.entities.meshcrossref import (
        MeshCrossRef,
    )
    from bl_ext.extensions_blender_org.mpfb.entities.objectproperties import (
        GeneralObjectProperties,
    )
    import bl_ext.extensions_blender_org.mpfb

    group_name = (
        f"Delete."
        f"{clothes.name.removesuffix(EXPORT_COPY_SUFFIX).removeprefix('Human.')}"
    )

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
        activate_object(clothes_copy)

        # The Export Copy has already had Decimate applied. Only an ARMATURE
        # modifier is expected here, if any.
        for modifier in list(clothes_copy.modifiers):
            if modifier.type == "ARMATURE":
                log(f"Applying temporary ARMATURE: {modifier.name}")
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
        if vertex_count == 0:
            raise RuntimeError(f"No vertices in clothing mesh: {clothes.name}")

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
    """Generate Delete Groups on the already-decimated Export Copy."""
    export_root = find_export_copy_root()
    basemesh = find_export_basemesh(export_root)
    clothing = find_export_clothing(export_root, basemesh)

    if not clothing:
        raise RuntimeError("No Export Copy clothing meshes found.")

    log(f"Export Copy root: {export_root.name}")
    log(f"Export basemesh: {basemesh.name}")
    log(f"Export clothing meshes: {len(clothing)}")

    created = []

    for clothes in clothing:
        log(f"Processing clothing: {clothes.name}")
        created.append(
            create_delete_group_for_clothing(
                basemesh,
                clothes,
            )
        )

    return len(created)


def fix_alpha_materials():
    """Fix alpha materials used by Export Copy clothing/hair."""
    export_root = find_export_copy_root()
    material_names = set()

    for obj, component in find_export_copy_meshes(export_root):
        if component not in {"clothing", "head"}:
            continue

        for slot in obj.material_slots:
            if slot.material is not None:
                material_names.add(slot.material.name)

    fixed = 0

    for name in sorted(material_names):
        mat = bpy.data.materials.get(name)
        if mat is None or not mat.use_nodes:
            continue

        bsdf = next(
            (
                node
                for node in mat.node_tree.nodes
                if node.type == "BSDF_PRINCIPLED"
            ),
            None,
        )
        if bsdf is None:
            continue

        alpha_input = bsdf.inputs.get("Alpha")
        if alpha_input and alpha_input.is_linked:
            for link in list(alpha_input.links):
                mat.node_tree.links.remove(link)

        mat.surface_render_method = "DITHERED"
        fixed += 1
        log(f"Alpha fixed: {mat.name}")

    return fixed


class SEEDVALE_OT_generate_decimate(bpy.types.Operator):
    bl_idname = "seedvale_v2.generate_decimate"
    bl_label = "Generate + Apply Decimate"
    bl_description = "Add and apply Decimate on MPFB2 Export Copy meshes"
    bl_options = {"REGISTER"}

    def execute(self, context):
        try:
            changed, skipped = generate_decimate()
            self.report(
                {"INFO"},
                f"Decimate applied to {changed} meshes, {skipped} skipped",
            )
            return {"FINISHED"}
        except Exception as exc:
            traceback.print_exc()
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class SEEDVALE_OT_generate_delete(bpy.types.Operator):
    bl_idname = "seedvale_v2.generate_delete"
    bl_label = "Generate Delete Groups + Masks"
    bl_description = "Generate MPFB2 Delete.* groups on Export Copy"
    bl_options = {"REGISTER"}

    def execute(self, context):
        try:
            count = generate_delete_groups_and_masks()
            self.report(
                {"INFO"},
                f"Generated {count} Delete groups + Masks",
            )
            return {"FINISHED"}
        except Exception as exc:
            traceback.print_exc()
            self.report({"ERROR"}, str(exc))
            return {"CANCELLED"}


class SEEDVALE_OT_fix_alpha(bpy.types.Operator):
    bl_idname = "seedvale_v2.fix_alpha"
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


class SEEDVALE_PT_character_tools(bpy.types.Panel):
    bl_label = "Seedvale Character Tools v2"
    bl_idname = "SEEDVALE_PT_character_tools_v2"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Seedvale"

    def draw(self, context):
        layout = self.layout

        layout.label(text="MPFB2 Export Copy")

        box = layout.box()
        box.label(text="1. Reduce Export Copy")
        box.operator(
            "seedvale_v2.generate_decimate",
            icon="MOD_DECIM",
        )

        box = layout.box()
        box.label(text="2. Generate Delete Groups")
        box.operator(
            "seedvale_v2.generate_delete",
            icon="MOD_MASK",
        )

        box = layout.box()
        box.label(text="3. Materials")
        box.operator(
            "seedvale_v2.fix_alpha",
            icon="MATERIAL",
        )

        layout.separator()
        layout.label(
            text="Export Copy → Decimate → Delete Groups → Alpha → GLB"
        )


classes = (
    SEEDVALE_OT_generate_decimate,
    SEEDVALE_OT_generate_delete,
    SEEDVALE_OT_fix_alpha,
    SEEDVALE_PT_character_tools,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    log("Registered")


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
    log("Unregistered")


if __name__ == "__main__":
    register()
