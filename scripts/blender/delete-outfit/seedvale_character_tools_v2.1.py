bl_info = {
    "name": "Seedvale Character Tools v2.1",
    "author": "Seedvale",
    "version": (0, 2, 2),
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


# =============================================================================
# LOGGING
# =============================================================================

def log(message=""):
    print(f"{PREFIX} {message}", flush=True)


# =============================================================================
# BLENDER OBJECT HELPERS
# =============================================================================

def activate_object(obj):
    """
    Make obj the active selected object.

    Operators requiring OBJECT context are only used after this function.
    """
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT", toggle=False)

    for other in bpy.context.view_layer.objects:
        other.select_set(False)

    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def is_descendant(obj, root):
    parent = obj.parent

    while parent is not None:
        if parent == root:
            return True
        parent = parent.parent

    return False


# =============================================================================
# EXPORT COPY DISCOVERY
# =============================================================================

def find_export_collection():
    collection = bpy.data.collections.get(EXPORT_COLLECTION_NAME)

    if collection is None:
        raise RuntimeError(
            f'MPFB2 Export Copy collection "{EXPORT_COLLECTION_NAME}" not found.'
        )

    return collection


def find_export_copy_root():
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
        raise RuntimeError(
            "MPFB2 Export Copy armature not found."
        )

    raise RuntimeError(
        "Multiple Export Copy armatures found: "
        + ", ".join(obj.name for obj in roots)
    )


# =============================================================================
# EXPORT MESH CLASSIFICATION
# =============================================================================

def classify_export_mesh(obj, export_root):
    """
    Classify an Export Copy mesh using structural evidence.
    """

    if obj.type != "MESH":
        return None

    if not is_descendant(obj, export_root):
        return None

    # MPFB2 body mesh.
    if obj.vertex_groups.get("body") is not None:
        return "body"

    source_name = obj.name.removesuffix(EXPORT_COPY_SUFFIX)

    # Known MPFB2 eye mesh.
    if source_name in EYE_SOURCE_NAMES:
        return "eyes"

    group_names = {
        group.name
        for group in obj.vertex_groups
    }

    # Head-only weighted meshes.
    if group_names and group_names.issubset(HEAD_GROUPS):
        return "head"

    # Remaining child meshes are clothing/accessories.
    return "clothing"


def find_export_copy_meshes(export_root):
    result = []

    for obj in find_export_collection().objects:
        component = classify_export_mesh(obj, export_root)

        if component is not None:
            result.append((obj, component))

    if not result:
        raise RuntimeError(
            "No supported Export Copy mesh targets found."
        )

    return result


def find_export_basemesh(export_root):
    meshes = [
        obj
        for obj in find_export_collection().objects
        if obj.type == "MESH"
        and is_descendant(obj, export_root)
    ]

    body_meshes = [
        obj
        for obj in meshes
        if obj.vertex_groups.get("body") is not None
    ]

    if len(body_meshes) == 1:
        return body_meshes[0]

    if not body_meshes:
        raise RuntimeError(
            "Export Copy basemesh not found."
        )

    raise RuntimeError(
        "Multiple Export Copy basemesh meshes found: "
        + ", ".join(obj.name for obj in body_meshes)
    )


def find_export_clothing(export_root, basemesh):
    return [
        obj
        for obj in find_export_collection().objects
        if obj.type == "MESH"
        and obj != basemesh
        and is_descendant(obj, export_root)
        and classify_export_mesh(obj, export_root) == "clothing"
    ]


# =============================================================================
# DECIMATE
# =============================================================================

def add_or_update_decimate(obj, ratio):
    modifier = obj.modifiers.get(DECIMATE_MODIFIER_NAME)

    if modifier is None:
        modifier = obj.modifiers.new(
            name=DECIMATE_MODIFIER_NAME,
            type="DECIMATE",
        )

        log(
            f"Decimate added: {obj.name} "
            f"ratio={ratio:.2f}"
        )
    else:
        log(
            f"Decimate updated: {obj.name} "
            f"ratio={ratio:.2f}"
        )

    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio

    return modifier


def apply_decimate(obj, ratio):
    modifier = add_or_update_decimate(obj, ratio)

    activate_object(obj)

    bpy.ops.object.modifier_apply(
        modifier=modifier.name
    )

    log(
        f"Decimate applied: {obj.name} "
        f"ratio={ratio:.2f}"
    )


def decimate_clothing():
    export_root = find_export_copy_root()
    basemesh = find_export_basemesh(export_root)
    clothing = find_export_clothing(
        export_root,
        basemesh,
    )

    if not clothing:
        raise RuntimeError(
            "No Export Copy clothing meshes found."
        )

    for obj in clothing:
        apply_decimate(
            obj,
            DECIMATE_RATIO_CLOTHING,
        )

    log(
        f"Clothing decimated: {len(clothing)}"
    )

    return len(clothing)


def decimate_body():
    export_root = find_export_copy_root()
    basemesh = find_export_basemesh(export_root)

    apply_decimate(
        basemesh,
        DECIMATE_RATIO_BODY,
    )

    log(
        f"Body decimated: {basemesh.name}"
    )

    return basemesh.name


# =============================================================================
# DELETE GROUPS / MASKS
# =============================================================================

def remove_mask_if_exists(
    basemesh,
    group_name,
):
    for modifier in list(basemesh.modifiers):
        if (
            modifier.type == "MASK"
            and modifier.vertex_group == group_name
        ):
            basemesh.modifiers.remove(modifier)


def apply_temporary_armature(
    clothes_copy,
):
    """
    Apply all ARMATURE modifiers on temporary clothing copy.

    The real Export Copy clothing object is never modified here.
    """

    armature_modifiers = [
        modifier
        for modifier in clothes_copy.modifiers
        if modifier.type == "ARMATURE"
    ]

    if not armature_modifiers:
        log(
            f"No temporary ARMATURE modifier: "
            f"{clothes_copy.name}"
        )
        return

    activate_object(clothes_copy)

    for modifier in list(armature_modifiers):
        if modifier.name not in clothes_copy.modifiers:
            continue

        log(
            f"Applying temporary ARMATURE: "
            f"{modifier.name}"
        )

        bpy.ops.object.modifier_apply(
            modifier=modifier.name
        )


def apply_temporary_triangulate(clothes_copy):
    """
    Triangulate temporary clothing copy after all existing modifiers.

    MPFB2 MeshCrossRef requires faces with a uniform vertex count.
    """

    modifier_name = "Seedvale Temporary Triangulate"

    # Remove stale temporary triangulate modifier, if any.
    for modifier in list(clothes_copy.modifiers):
        if modifier.name == modifier_name:
            clothes_copy.modifiers.remove(modifier)

    # modifiers.new() appends the modifier to the end of the stack.
    triangulate = clothes_copy.modifiers.new(
        name=modifier_name,
        type="TRIANGULATE",
    )

    log(
        f"Applying temporary TRIANGULATE: "
        f"{clothes_copy.name}"
    )

    activate_object(clothes_copy)

    bpy.ops.object.modifier_apply(
        modifier=triangulate.name
    )

    # Verify topology.
    triangles = 0
    quads = 0
    other = 0

    for polygon in clothes_copy.data.polygons:
        vertex_count = len(polygon.vertices)

        if vertex_count == 3:
            triangles += 1
        elif vertex_count == 4:
            quads += 1
        else:
            other += 1

    log(
        f"Temporary topology: "
        f"triangles={triangles:,}, "
        f"quads={quads:,}, "
        f"other={other:,}"
    )

    if quads or other:
        raise RuntimeError(
            f"Temporary clothing mesh is not fully triangulated: "
            f"{clothes_copy.name} "
            f"(triangles={triangles:,}, "
            f"quads={quads:,}, "
            f"other={other:,})"
        )


def create_delete_group_for_clothing(
    basemesh,
    clothes,
):
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

    log(
        f"Delete group target: "
        f"{clothes.name} -> {group_name}"
    )

    # -------------------------------------------------------------------------
    # Remove previous result.
    # -------------------------------------------------------------------------

    existing_group = basemesh.vertex_groups.get(
        group_name
    )

    if existing_group:
        log(
            f"Removing existing vertex group: "
            f"{group_name}"
        )

        basemesh.vertex_groups.remove(
            existing_group
        )

    remove_mask_if_exists(
        basemesh,
        group_name,
    )

    # -------------------------------------------------------------------------
    # Temporary clothing copy.
    # -------------------------------------------------------------------------

    clothes_copy = clothes.copy()
    clothes_copy.data = clothes.data.copy()

    clothes_copy.name = (
        f"{clothes.name}__DELETE_TEST"
    )

    for collection in clothes.users_collection:
        collection.objects.link(clothes_copy)

    clothes_copy.matrix_world = (
        clothes.matrix_world.copy()
    )

    try:
        # ---------------------------------------------------------------------
        # IMPORTANT:
        #
        # 1. Apply ARMATURE to temporary copy.
        # 2. Triangulate temporary copy.
        # 3. Only then construct MeshCrossRef.
        #
        # This avoids MPFB2's "Found both 4 and 3" error.
        # ---------------------------------------------------------------------

        apply_temporary_armature(
            clothes_copy
        )

        apply_temporary_triangulate(
            clothes_copy
        )

        # ---------------------------------------------------------------------
        # Remove temporary vertex groups.
        # ---------------------------------------------------------------------

        for group in list(
            clothes_copy.vertex_groups
        ):
            clothes_copy.vertex_groups.remove(
                group
            )

        body_group = (
            clothes_copy.vertex_groups.new(
                name="body"
            )
        )

        body_group.add(
            list(
                range(
                    len(
                        clothes_copy.data.vertices
                    )
                )
            ),
            1.0,
            "REPLACE",
        )

        # ---------------------------------------------------------------------
        # MPFB2 reference information.
        # ---------------------------------------------------------------------

        reference_scale = (
            ClothesService.get_reference_scale(
                clothes_copy
            )
        )

        log(
            f"Reference scale acquired for "
            f"{clothes.name}: {reference_scale}"
        )

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

        scale_factor = (
            GeneralObjectProperties.get_value(
                "scale_factor",
                entity_reference=basemesh,
            )
        )

        mhclo = (
            bl_ext.extensions_blender_org.mpfb
            .entities.clothes.mhclo.Mhclo()
        )

        mhclo.verts = {}
        mhclo.clothes = clothes_copy

        vertex_count = len(
            clothes_xref.vertex_coordinates
        )

        if vertex_count == 0:
            raise RuntimeError(
                f"No vertices in clothing mesh: "
                f"{clothes.name}"
            )

        # ---------------------------------------------------------------------
        # Vertex matching.
        # ---------------------------------------------------------------------

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

            mhclo.verts[vert] = (
                vmatch.mhclo_line
            )

            if (
                (vert + 1) % 250 == 0
                or vert == vertex_count - 1
            ):
                elapsed = (
                    time.time() - started
                )

                log(
                    f"{clothes.name}: "
                    f"vertex match "
                    f"{vert + 1:,}/{vertex_count:,} "
                    f"({(vert + 1) / vertex_count * 100:.1f}%) "
                    f"{elapsed:.1f}s"
                )

        # ---------------------------------------------------------------------
        # Create MPFB2 Delete.* group.
        # ---------------------------------------------------------------------

        ClothesService.create_new_delete_group(
            basemesh,
            clothes_copy,
            mhclo,
            group_name=group_name,
        )

        group = basemesh.vertex_groups.get(
            group_name
        )

        if not group:
            raise RuntimeError(
                f"Delete group was NOT created: "
                f"{group_name}"
            )

        # ---------------------------------------------------------------------
        # Create inverted Mask.
        # ---------------------------------------------------------------------

        modifier = basemesh.modifiers.new(
            name=group_name,
            type="MASK",
        )

        modifier.vertex_group = group_name
        modifier.invert_vertex_group = True

        log(
            f"Delete group + Mask created: "
            f"{group_name}"
        )

        return group_name

    finally:
        if clothes_copy.name in bpy.data.objects:
            bpy.data.objects.remove(
                clothes_copy,
                do_unlink=True,
            )


def generate_delete_groups_and_masks():
    export_root = find_export_copy_root()

    basemesh = find_export_basemesh(
        export_root
    )

    clothing = find_export_clothing(
        export_root,
        basemesh,
    )

    if not clothing:
        raise RuntimeError(
            "No Export Copy clothing meshes found."
        )

    log(
        f"Export Copy root: "
        f"{export_root.name}"
    )

    log(
        f"Export basemesh: "
        f"{basemesh.name}"
    )

    log(
        f"Export clothing meshes: "
        f"{len(clothing)}"
    )

    created = []

    for clothes in clothing:
        log(
            f"Processing clothing: "
            f"{clothes.name}"
        )

        created.append(
            create_delete_group_for_clothing(
                basemesh,
                clothes,
            )
        )

    return len(created)


# =============================================================================
# ALPHA
# =============================================================================

def fix_alpha_materials():
    export_root = find_export_copy_root()

    material_names = set()

    for obj, component in find_export_copy_meshes(
        export_root
    ):
        if component not in {
            "clothing",
            "head",
        }:
            continue

        for slot in obj.material_slots:
            if slot.material is not None:
                material_names.add(
                    slot.material.name
                )

    fixed = 0

    for name in sorted(material_names):
        mat = bpy.data.materials.get(name)

        if mat is None:
            continue

        if not mat.use_nodes:
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

        alpha_input = bsdf.inputs.get(
            "Alpha"
        )

        if (
            alpha_input
            and alpha_input.is_linked
        ):
            for link in list(
                alpha_input.links
            ):
                mat.node_tree.links.remove(
                    link
                )

        mat.surface_render_method = (
            "DITHERED"
        )

        fixed += 1

        log(
            f"Alpha fixed: {mat.name}"
        )

    log(
        f"Materials fixed: {fixed}"
    )

    return fixed


# =============================================================================
# OPTIMIZE
# =============================================================================

def optimize_character():
    """
    V1 pipeline:

      1. Decimate + Apply clothing.
      2. Generate Delete.* groups and Masks.
         Temporary clothing copies are:
             ARMATURE -> TRIANGULATE -> MeshCrossRef
      3. Decimate + Apply body.
      4. Fix clothing/hair alpha.
    """

    log("=" * 72)
    log("OPTIMIZE CHARACTER")
    log("=" * 72)

    # -------------------------------------------------------------------------
    # STEP 1
    # -------------------------------------------------------------------------

    log(
        "STEP 1/4: Decimate + Apply clothing"
    )

    clothing_count = decimate_clothing()

    # -------------------------------------------------------------------------
    # STEP 2
    # -------------------------------------------------------------------------

    log(
        "STEP 2/4: Generate Delete Groups + Masks"
    )

    groups = (
        generate_delete_groups_and_masks()
    )

    # -------------------------------------------------------------------------
    # STEP 3
    # -------------------------------------------------------------------------

    log(
        "STEP 3/4: Decimate + Apply body"
    )

    body_name = decimate_body()

    # -------------------------------------------------------------------------
    # STEP 4
    # -------------------------------------------------------------------------

    log(
        "STEP 4/4: Fix Clothing / Hair Alpha"
    )

    materials = fix_alpha_materials()

    log("=" * 72)
    log("OPTIMIZE COMPLETE")
    log("=" * 72)

    return (
        clothing_count,
        groups,
        body_name,
        materials,
    )


# =============================================================================
# OPERATORS
# =============================================================================

class SEEDVALE_OT_optimize_character(
    bpy.types.Operator
):
    bl_idname = (
        "seedvale_v2.optimize_character"
    )

    bl_label = "Optimize Character"

    bl_description = (
        "Decimate clothing, generate Delete Groups, "
        "then decimate the body"
    )

    bl_options = {"REGISTER"}

    def execute(self, context):
        try:
            (
                clothing,
                groups,
                body,
                materials,
            ) = optimize_character()

            self.report(
                {"INFO"},
                (
                    f"Optimized: "
                    f"{clothing} clothing, "
                    f"{groups} Delete groups, "
                    f"body {body}, "
                    f"{materials} materials"
                ),
            )

            return {"FINISHED"}

        except Exception as exc:
            traceback.print_exc()

            self.report(
                {"ERROR"},
                str(exc),
            )

            return {"CANCELLED"}


class SEEDVALE_OT_generate_decimate(
    bpy.types.Operator
):
    bl_idname = (
        "seedvale_v2.generate_decimate"
    )

    bl_label = "Generate + Apply Decimate"

    bl_description = (
        "Add and apply Decimate on Export Copy meshes"
    )

    bl_options = {"REGISTER"}

    def execute(self, context):
        try:
            export_root = (
                find_export_copy_root()
            )

            targets = (
                find_export_copy_meshes(
                    export_root
                )
            )

            ratios = {
                "body": DECIMATE_RATIO_BODY,
                "clothing": DECIMATE_RATIO_CLOTHING,
                "head": DECIMATE_RATIO_HEAD,
            }

            changed = 0

            for obj, component in targets:
                if component == "eyes":
                    log(
                        f"Decimate skipped (eyes): "
                        f"{obj.name}"
                    )
                    continue

                apply_decimate(
                    obj,
                    ratios[component],
                )

                changed += 1

            self.report(
                {"INFO"},
                (
                    f"Decimate applied to "
                    f"{changed} meshes"
                ),
            )

            return {"FINISHED"}

        except Exception as exc:
            traceback.print_exc()

            self.report(
                {"ERROR"},
                str(exc),
            )

            return {"CANCELLED"}


class SEEDVALE_OT_generate_delete(
    bpy.types.Operator
):
    bl_idname = (
        "seedvale_v2.generate_delete"
    )

    bl_label = (
        "Generate Delete Groups + Masks"
    )

    bl_description = (
        "Generate MPFB2 Delete.* groups "
        "on Export Copy"
    )

    bl_options = {"REGISTER"}

    def execute(self, context):
        try:
            count = (
                generate_delete_groups_and_masks()
            )

            self.report(
                {"INFO"},
                (
                    f"Generated "
                    f"{count} Delete groups + Masks"
                ),
            )

            return {"FINISHED"}

        except Exception as exc:
            traceback.print_exc()

            self.report(
                {"ERROR"},
                str(exc),
            )

            return {"CANCELLED"}


class SEEDVALE_OT_fix_alpha(
    bpy.types.Operator
):
    bl_idname = (
        "seedvale_v2.fix_alpha"
    )

    bl_label = (
        "Fix Clothing / Hair Alpha"
    )

    bl_description = (
        "Disconnect Principled Alpha "
        "and use DITHERED rendering"
    )

    bl_options = {"REGISTER"}

    def execute(self, context):
        try:
            count = fix_alpha_materials()

            self.report(
                {"INFO"},
                (
                    f"Fixed {count} materials"
                ),
            )

            return {"FINISHED"}

        except Exception as exc:
            traceback.print_exc()

            self.report(
                {"ERROR"},
                str(exc),
            )

            return {"CANCELLED"}


# =============================================================================
# PANEL
# =============================================================================

class SEEDVALE_PT_character_tools(
    bpy.types.Panel
):
    bl_label = (
        "Seedvale Character Tools v2"
    )

    bl_idname = (
        "SEEDVALE_PT_character_tools_v2"
    )

    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Seedvale"

    def draw(self, context):
        layout = self.layout

        layout.label(
            text="MPFB2 Export Copy"
        )

        box = layout.box()

        box.label(
            text="Recommended"
        )

        box.operator(
            "seedvale_v2.optimize_character",
            icon="MODIFIER",
        )

        layout.separator()

        box = layout.box()

        box.label(
            text="Debug / individual steps"
        )

        box.operator(
            "seedvale_v2.generate_decimate",
            icon="MOD_DECIM",
        )

        box.operator(
            "seedvale_v2.generate_delete",
            icon="MOD_MASK",
        )

        box.operator(
            "seedvale_v2.fix_alpha",
            icon="MATERIAL",
        )

        layout.separator()

        layout.label(
            text="Export Copy → Optimize Character → GLB"
        )


# =============================================================================
# REGISTER
# =============================================================================

classes = (
    SEEDVALE_OT_optimize_character,
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
