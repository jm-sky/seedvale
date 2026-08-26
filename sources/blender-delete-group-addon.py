import bpy
import time


# ============================================================
# CONFIG
# ============================================================

DEFAULT_GROUP_NAME = "Delete.outfit"
DEFAULT_SKIN_KEYWORDS = "base,skin"
DEFAULT_TOLERANCE = 0.002

LOG_TEXT_NAME = "MPFB2_Delete_Generator_Log"
LOG_PREFIX = "[MPFB2 Delete Generator]"


# ============================================================
# LOGGING
# ============================================================

def get_log_text():
    text = bpy.data.texts.get(LOG_TEXT_NAME)

    if text is None:
        text = bpy.data.texts.new(LOG_TEXT_NAME)

    return text


def log(message):
    line = f"{LOG_PREFIX} {message}"

    # Blender System Console
    print(line)

    # Blender Text datablock
    try:
        get_log_text().write(line + "\n")
    except Exception:
        pass


def log_separator():
    log("=" * 70)


def clear_log():
    text = bpy.data.texts.get(LOG_TEXT_NAME)

    if text:
        text.clear()

    print(f"{LOG_PREFIX} Log cleared.")


# ============================================================
# HELPERS
# ============================================================

def is_mesh(obj):
    return obj is not None and obj.type == 'MESH'


def matches_skin_filter(obj, keywords):
    """
    Match both object name and mesh datablock name.

    Example:
        Human
        Human.rig
        base
    """

    if not is_mesh(obj):
        return False

    object_name = obj.name.lower()
    mesh_name = obj.data.name.lower()

    for keyword in keywords:

        keyword = keyword.strip().lower()

        if not keyword:
            continue

        if keyword in object_name:
            return True

        if keyword in mesh_name:
            return True

    return False


def build_outfit_bvh(outfit_objects):
    """
    Build one BVH containing all outfit geometry
    in world space.
    """

    from mathutils.bvhtree import BVHTree

    log("Building outfit BVH...")

    all_verts = []
    all_tris = []

    for obj in outfit_objects:

        vertex_count = len(obj.data.vertices)
        polygon_count = len(obj.data.polygons)

        log(
            f"  Outfit: '{obj.name}' | "
            f"mesh='{obj.data.name}' | "
            f"vertices={vertex_count} | "
            f"polygons={polygon_count}"
        )

        base_index = len(all_verts)

        # World-space vertices
        for vertex in obj.data.vertices:

            world_position = (
                obj.matrix_world @ vertex.co
            )

            all_verts.append(world_position)

        # Polygon -> triangles
        for polygon in obj.data.polygons:

            vertices = list(polygon.vertices)

            if len(vertices) < 3:
                continue

            # Fan triangulation
            for i in range(1, len(vertices) - 1):

                all_tris.append(
                    (
                        base_index + vertices[0],
                        base_index + vertices[i],
                        base_index + vertices[i + 1],
                    )
                )

    log(
        f"BVH source geometry: "
        f"{len(all_verts)} vertices, "
        f"{len(all_tris)} triangles"
    )

    if not all_verts or not all_tris:

        log(
            "ERROR: Outfit geometry contains no usable "
            "vertices/triangles."
        )

        return None

    bvh = BVHTree.FromPolygons(
        all_verts,
        all_tris,
        all_triangles=True
    )

    log("BVH created successfully.")

    return bvh


def point_near_outfit(point, bvh, tolerance):
    """
    Check whether a skin vertex is close enough
    to outfit geometry.
    """

    nearest = bvh.find_nearest(
        point,
        tolerance
    )

    return nearest is not None


# ============================================================
# SKIN DETECTION
# ============================================================

def is_strong_skin_candidate(obj, keywords):
    """
    Determine whether a mesh is a strong skin candidate.

    Important:
    Generic substring matches like "human" are NOT enough.

    Strong matches include:
        Human
        base
        human_base

    while:
        Human.viking_pants
        Human.viking_tunic

    are deliberately rejected.
    """

    if not is_mesh(obj):
        return False

    object_name = obj.name.lower()
    mesh_name = obj.data.name.lower()

    # Exact common base-skin names
    strong_exact_names = {
        "human",
        "base",
        "human_base",
        "base_human",
        "skin",
        "human_skin",
    }

    if object_name in strong_exact_names:
        return True

    if mesh_name in strong_exact_names:
        return True

    # If keyword is "rig", it should not match meshes
    # simply because they belong to a Human.rig hierarchy.
    #
    # "rig" is useful for identifying the armature,
    # not the clothing.
    #
    # Therefore we deliberately do not use it here.

    # Look for a keyword as a suffix/prefix separated
    # by common delimiters, but reject arbitrary
    # Human.<outfit> names.
    for keyword in keywords:

        keyword = keyword.strip().lower()

        if not keyword:
            continue

        if keyword == "rig":
            continue

        # Exact keyword
        if object_name == keyword:
            return True

        if mesh_name == keyword:
            return True

        # Explicit base/skin combinations
        strong_patterns = (
            f"{keyword}_base",
            f"base_{keyword}",
            f"{keyword}_skin",
            f"skin_{keyword}",
            f"{keyword}.base",
            f"base.{keyword}",
            f"{keyword}.skin",
            f"skin.{keyword}",
        )

        if object_name in strong_patterns:
            return True

        if mesh_name in strong_patterns:
            return True

    return False


def find_skin(context, selected, require_filter, keywords):
    """
    Safely detect the base skin mesh.

    Detection priority:

    1. Active mesh explicitly matching a strong skin candidate.
    2. Active armature -> mesh with matching base name.
       Example:
           Human.rig -> Human
    3. Mesh with Armature Modifier targeting active armature.
    4. Exact object/data name match against a skin keyword.
    5. Unique fallback candidate.

    Generic keywords such as "human" are deliberately treated
    as weak matches and cannot by themselves identify the skin
    when multiple meshes contain the keyword.
    """

    active = context.active_object

    log(
        f"Active object: "
        f"'{active.name if active else None}' | "
        f"type={active.type if active else None}"
    )

    mesh_candidates = [
        obj
        for obj in selected
        if is_mesh(obj)
    ]

    log(
        f"Selected mesh candidates: "
        f"{len(mesh_candidates)}"
    )

    for obj in mesh_candidates:

        log(
            f"  Mesh candidate: '{obj.name}' | "
            f"mesh='{obj.data.name}'"
        )

    # --------------------------------------------------------
    # 1. Active object is already a mesh
    # --------------------------------------------------------

    if is_mesh(active):

        if not require_filter:

            log(
                f"Using active mesh as skin "
                f"(filter disabled): '{active.name}'"
            )

            return active

        # Strong match:
        # exact "Human" / "base" style names
        if is_strong_skin_candidate(
            active,
            keywords
        ):

            log(
                f"Using active mesh as skin: "
                f"'{active.name}'"
            )

            return active

        log(
            f"Active mesh '{active.name}' "
            f"is not a strong skin candidate."
        )

    # --------------------------------------------------------
    # 2. Active object is an armature
    #
    # Example:
    #
    # Human.rig
    # Human
    # --------------------------------------------------------

    if active and active.type == 'ARMATURE':

        log(
            f"Active object is an armature: "
            f"'{active.name}'"
        )

        armature_name = active.name

        # Remove common rig suffixes.
        base_names = [
            armature_name,
            armature_name.removesuffix(".rig"),
            armature_name.removesuffix("_rig"),
            armature_name.removesuffix("-rig"),
        ]

        base_names = [
            name
            for name in base_names
            if name
        ]

        log(
            f"Armature base-name candidates: "
            f"{base_names}"
        )

        # Exact object-name match
        for candidate in mesh_candidates:

            if candidate.name in base_names:

                log(
                    f"Skin detected by armature "
                    f"base-name match: "
                    f"'{candidate.name}'"
                )

                return candidate

        # Exact mesh datablock-name match
        for candidate in mesh_candidates:

            if candidate.data.name in base_names:

                log(
                    f"Skin detected by mesh datablock "
                    f"name match: "
                    f"'{candidate.name}' "
                    f"(mesh='{candidate.data.name}')"
                )

                return candidate

        # ----------------------------------------------------
        # Armature Modifier
        # ----------------------------------------------------

        armature_matches = []

        for candidate in mesh_candidates:

            for modifier in candidate.modifiers:

                if modifier.type != 'ARMATURE':
                    continue

                if modifier.object == active:

                    armature_matches.append(
                        candidate
                    )

                    break

        log(
            f"Meshes using active armature: "
            f"{len(armature_matches)}"
        )

        for candidate in armature_matches:

            log(
                f"  Armature modifier match: "
                f"'{candidate.name}'"
            )

        # If exactly one mesh uses the armature,
        # it is an excellent skin candidate.
        if len(armature_matches) == 1:

            skin = armature_matches[0]

            log(
                f"Skin detected through Armature "
                f"Modifier: '{skin.name}'"
            )

            return skin

    # --------------------------------------------------------
    # 3. Strong keyword candidates
    # --------------------------------------------------------

    strong_candidates = [
        obj
        for obj in mesh_candidates
        if is_strong_skin_candidate(
            obj,
            keywords
        )
    ]

    log(
        f"Strong skin candidates: "
        f"{len(strong_candidates)}"
    )

    for candidate in strong_candidates:

        log(
            f"  Strong candidate: "
            f"'{candidate.name}' | "
            f"mesh='{candidate.data.name}'"
        )

    if len(strong_candidates) == 1:

        skin = strong_candidates[0]

        log(
            f"Skin detected from strong keyword "
            f"match: '{skin.name}'"
        )

        return skin

    if len(strong_candidates) > 1:

        message = (
            "Multiple strong skin candidates: "
            + ", ".join(
                obj.name
                for obj in strong_candidates
            )
        )

        log(
            f"ERROR: {message}"
        )

        return None

    # --------------------------------------------------------
    # 4. Generic keyword fallback
    # --------------------------------------------------------

    if require_filter:

        generic_candidates = [
            obj
            for obj in mesh_candidates
            if matches_skin_filter(
                obj,
                keywords
            )
        ]

        log(
            f"Generic keyword candidates: "
            f"{len(generic_candidates)}"
        )

        for candidate in generic_candidates:

            log(
                f"  Generic candidate: "
                f"'{candidate.name}'"
            )

        if len(generic_candidates) == 1:

            skin = generic_candidates[0]

            log(
                f"Skin detected from unique "
                f"generic keyword match: "
                f"'{skin.name}'"
            )

            return skin

    # --------------------------------------------------------
    # Failed
    # --------------------------------------------------------

    log(
        "ERROR: Could not uniquely identify skin."
    )

    return None


# ============================================================
# GENERATE DELETE GROUP
# ============================================================

class MPFB_OT_generate_delete_group(
    bpy.types.Operator
):

    bl_idname = "mpfb.generate_delete_group"
    bl_label = "Generate Delete.* Group"

    bl_description = (
        "Generate an MPFB2 Delete.* vertex group "
        "from selected outfit geometry"
    )

    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):

        start_time = time.perf_counter()

        log_separator()
        log("START")

        scene = context.scene

        # ----------------------------------------------------
        # SETTINGS
        # ----------------------------------------------------

        require_filter = (
            scene.mpfb_require_skin_filter
        )

        keywords = [
            keyword.strip()
            for keyword
            in scene.mpfb_skin_keywords.split(",")
            if keyword.strip()
        ]

        tolerance = max(
            0.0,
            scene.mpfb_delete_tolerance
        )

        log(
            "Settings:"
        )

        log(
            f"  Skin filter: "
            f"{'ENABLED' if require_filter else 'DISABLED'}"
        )

        log(
            f"  Skin keywords: {keywords}"
        )

        log(
            f"  Tolerance: {tolerance:.6f}"
        )

        # ----------------------------------------------------
        # SELECTION
        # ----------------------------------------------------

        selected_objects = list(
            context.selected_objects
        )

        selected_meshes = [
            obj
            for obj in selected_objects
            if is_mesh(obj)
        ]

        log(
            f"Selected objects: "
            f"{len(selected_objects)}"
        )

        log(
            f"Selected meshes: "
            f"{len(selected_meshes)}"
        )

        for obj in selected_objects:

            log(
                f"  Selected: '{obj.name}' | "
                f"type={obj.type}"
            )

        if len(selected_meshes) < 2:

            message = (
                "Select the skin and at least "
                "one outfit mesh."
            )

            log(
                f"ERROR: {message}"
            )

            self.report(
                {'ERROR'},
                message
            )

            return {'CANCELLED'}

        # ----------------------------------------------------
        # FIND SKIN
        # ----------------------------------------------------

        skin = find_skin(
            context,
            selected_objects,
            require_filter,
            keywords
        )

        if skin is None:

            message = (
                "Could not uniquely identify skin mesh. "
                "Check skin keywords."
            )

            log(
                f"ERROR: {message}"
            )

            self.report(
                {'ERROR'},
                message
            )

            return {'CANCELLED'}

        log(
            f"Using skin: '{skin.name}' | "
            f"mesh='{skin.data.name}' | "
            f"vertices={len(skin.data.vertices)} | "
            f"polygons={len(skin.data.polygons)}"
        )

        # ----------------------------------------------------
        # FIND OUTFITS
        # ----------------------------------------------------

        outfits = [
            obj
            for obj in selected_meshes
            if obj != skin
        ]

        log(
            f"Outfit meshes detected: "
            f"{len(outfits)}"
        )

        for obj in outfits:

            log(
                f"  Outfit accepted: "
                f"'{obj.name}'"
            )

        if not outfits:

            message = (
                "No outfit meshes detected."
            )

            log(
                f"ERROR: {message}"
            )

            self.report(
                {'ERROR'},
                message
            )

            return {'CANCELLED'}

        # ----------------------------------------------------
        # BUILD BVH
        # ----------------------------------------------------

        bvh_start = time.perf_counter()

        bvh = build_outfit_bvh(
            outfits
        )

        bvh_time = (
            time.perf_counter()
            - bvh_start
        )

        log(
            f"BVH build time: "
            f"{bvh_time:.3f}s"
        )

        if bvh is None:

            message = (
                "Could not build BVH from outfit geometry."
            )

            log(
                f"ERROR: {message}"
            )

            self.report(
                {'ERROR'},
                message
            )

            return {'CANCELLED'}

        # ----------------------------------------------------
        # VERTEX GROUP
        # ----------------------------------------------------

        group_name = (
            scene.mpfb_delete_group_name.strip()
        )

        if not group_name:

            group_name = DEFAULT_GROUP_NAME

        if not group_name.startswith(
            "Delete."
        ):

            group_name = (
                "Delete."
                + group_name
            )

        log(
            f"Output vertex group: "
            f"'{group_name}'"
        )

        group = skin.vertex_groups.get(
            group_name
        )

        if group:

            log(
                "Existing vertex group found."
            )

            log(
                "Clearing previous assignments..."
            )

            all_indices = [
                vertex.index
                for vertex
                in skin.data.vertices
            ]

            if all_indices:

                group.remove(
                    all_indices
                )

        else:

            log(
                "Creating new vertex group..."
            )

            group = (
                skin.vertex_groups.new(
                    name=group_name
                )
            )

        # ----------------------------------------------------
        # DETECT COVERED VERTICES
        # ----------------------------------------------------

        detection_start = time.perf_counter()

        skin_matrix = skin.matrix_world

        delete_indices = []

        total_vertices = (
            len(skin.data.vertices)
        )

        log(
            f"Testing {total_vertices} "
            f"skin vertices..."
        )

        progress_step = max(
            1,
            total_vertices // 10
        )

        for vertex_index, vertex in enumerate(
            skin.data.vertices
        ):

            world_position = (
                skin_matrix @ vertex.co
            )

            if point_near_outfit(
                world_position,
                bvh,
                tolerance
            ):

                delete_indices.append(
                    vertex_index
                )

            if (
                vertex_index > 0
                and vertex_index % progress_step == 0
            ):

                progress = (
                    vertex_index
                    / total_vertices
                    * 100.0
                )

                log(
                    f"  Progress: "
                    f"{progress:.0f}% | "
                    f"matched="
                    f"{len(delete_indices)}"
                )

        detection_time = (
            time.perf_counter()
            - detection_start
        )

        log(
            f"Vertex detection time: "
            f"{detection_time:.3f}s"
        )

        # ----------------------------------------------------
        # ASSIGN
        # ----------------------------------------------------

        delete_count = (
            len(delete_indices)
        )

        if delete_indices:

            log(
                f"Assigning {delete_count} "
                f"vertices to '{group_name}'..."
            )

            group.add(
                delete_indices,
                1.0,
                'REPLACE'
            )

        else:

            log(
                "WARNING: No vertices matched "
                "outfit geometry."
            )

        # ----------------------------------------------------
        # RESULT
        # ----------------------------------------------------

        percentage = (
            delete_count
            / total_vertices
            * 100.0
            if total_vertices
            else 0.0
        )

        total_time = (
            time.perf_counter()
            - start_time
        )

        log_separator()
        log("RESULT")

        log(
            f"Skin: '{skin.name}'"
        )

        log(
            f"Outfit objects: {len(outfits)}"
        )

        log(
            f"Delete group: '{group_name}'"
        )

        log(
            f"Deleted vertices: "
            f"{delete_count} / {total_vertices}"
        )

        log(
            f"Coverage: "
            f"{percentage:.2f}%"
        )

        log(
            f"Total time: "
            f"{total_time:.3f}s"
        )

        if delete_count == 0:

            log(
                "WARNING: Delete group is EMPTY."
            )

        elif percentage > 70:

            log(
                "WARNING: More than 70% of skin "
                "vertices marked."
            )

        elif percentage > 50:

            log(
                "WARNING: More than 50% of skin "
                "vertices marked."
            )

        else:

            log(
                "Delete group generated successfully."
            )

        log("DONE")
        log_separator()

        # ----------------------------------------------------
        # UI REPORT
        # ----------------------------------------------------

        self.report(
            {'INFO'},
            (
                f"{group_name}: "
                f"{delete_count}/"
                f"{total_vertices} "
                f"vertices "
                f"({percentage:.1f}%)"
            )
        )

        return {'FINISHED'}


# ============================================================
# CLEAR LOG
# ============================================================

class MPFB_OT_clear_log(
    bpy.types.Operator
):

    bl_idname = "mpfb.clear_delete_log"
    bl_label = "Clear Log"

    def execute(self, context):

        clear_log()

        self.report(
            {'INFO'},
            "Log cleared."
        )

        return {'FINISHED'}


# ============================================================
# OPEN LOG
# ============================================================

class MPFB_OT_open_log(
    bpy.types.Operator
):

    bl_idname = "mpfb.open_delete_log"
    bl_label = "Open Full Log"

    def execute(self, context):

        text = get_log_text()

        for area in context.screen.areas:

            if area.type == 'TEXT_EDITOR':

                area.spaces.active.text = text

                return {'FINISHED'}

        # Change current area if possible
        if context.area:

            context.area.type = 'TEXT_EDITOR'

            context.area.spaces.active.text = text

        return {'FINISHED'}


# ============================================================
# GENERATOR PANEL
# ============================================================

class MPFB_PT_delete_group_panel(
    bpy.types.Panel
):

    bl_label = "MPFB2 Delete.* Generator"

    bl_idname = (
        "MPFB_PT_delete_group_panel"
    )

    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'MPFB2'

    def draw(self, context):

        layout = self.layout
        scene = context.scene

        # ----------------------------------------------------
        # SELECTION
        # ----------------------------------------------------

        box = layout.box()

        box.label(
            text="Selection",
            icon='RESTRICT_SELECT_OFF'
        )

        box.label(
            text="Select skin + all outfit meshes."
        )

        box.label(
            text="Active object may be the rig."
        )

        # ----------------------------------------------------
        # SKIN
        # ----------------------------------------------------

        box.separator()

        box.label(
            text="Skin Detection",
            icon='ARMATURE_DATA'
        )

        box.prop(
            scene,
            "mpfb_require_skin_filter"
        )

        row = box.row()

        row.enabled = (
            scene.mpfb_require_skin_filter
        )

        row.prop(
            scene,
            "mpfb_skin_keywords",
            text="Keywords"
        )

        # ----------------------------------------------------
        # DETECTION
        # ----------------------------------------------------

        box.separator()

        box.label(
            text="Geometry Detection",
            icon='MESH_DATA'
        )

        box.prop(
            scene,
            "mpfb_delete_tolerance",
            text="Tolerance"
        )

        # ----------------------------------------------------
        # OUTPUT
        # ----------------------------------------------------

        box.separator()

        box.label(
            text="Output",
            icon='GROUP_VERTEX'
        )

        box.prop(
            scene,
            "mpfb_delete_group_name",
            text="Group"
        )

        # ----------------------------------------------------
        # GENERATE
        # ----------------------------------------------------

        box.separator()

        row = box.row()

        row.scale_y = 1.5

        row.operator(
            "mpfb.generate_delete_group",
            icon='GROUP_VERTEX'
        )


# ============================================================
# LOG PANEL
# ============================================================

class MPFB_PT_delete_log_panel(
    bpy.types.Panel
):

    bl_label = "MPFB2 Delete.* Log"

    bl_idname = (
        "MPFB_PT_delete_log_panel"
    )

    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'MPFB2'

    def draw(self, context):

        layout = self.layout

        text = bpy.data.texts.get(
            LOG_TEXT_NAME
        )

        # ----------------------------------------------------
        # HEADER
        # ----------------------------------------------------

        row = layout.row()

        row.label(
            text="Execution Log",
            icon='CONSOLE'
        )

        # ----------------------------------------------------
        # BUTTONS
        # ----------------------------------------------------

        row = layout.row(
            align=True
        )

        row.operator(
            "mpfb.open_delete_log",
            text="Open Full Log",
            icon='TEXT'
        )

        row.operator(
            "mpfb.clear_delete_log",
            text="Clear",
            icon='TRASH'
        )

        # ----------------------------------------------------
        # CONTENT
        # ----------------------------------------------------

        if text is None:

            layout.label(
                text="No log available."
            )

            return

        lines = (
            text.as_string()
            .splitlines()
        )

        if not lines:

            layout.label(
                text="Log is empty."
            )

            return

        max_lines = 35

        visible_lines = (
            lines[-max_lines:]
        )

        box = layout.box()

        for line in visible_lines:

            if len(line) > 110:

                line = (
                    line[:107]
                    + "..."
                )

            box.label(
                text=line
            )

        if len(lines) > max_lines:

            layout.label(
                text=(
                    f"... "
                    f"{len(lines) - max_lines} "
                    f"earlier lines hidden"
                )
            )


# ============================================================
# SAFE REGISTER
# ============================================================

classes = (
    MPFB_OT_generate_delete_group,
    MPFB_OT_clear_log,
    MPFB_OT_open_log,
    MPFB_PT_delete_group_panel,
    MPFB_PT_delete_log_panel,
)


def safe_unregister():

    # --------------------------------------------------------
    # Classes
    # --------------------------------------------------------

    for cls in reversed(classes):

        try:

            bpy.utils.unregister_class(
                cls
            )

        except RuntimeError:
            pass

    # --------------------------------------------------------
    # Scene properties
    # --------------------------------------------------------

    properties = (
        "mpfb_require_skin_filter",
        "mpfb_skin_keywords",
        "mpfb_delete_tolerance",
        "mpfb_delete_group_name",
    )

    for property_name in properties:

        if hasattr(
            bpy.types.Scene,
            property_name
        ):

            try:

                delattr(
                    bpy.types.Scene,
                    property_name
                )

            except AttributeError:
                pass


def register():

    # Makes repeated Run Script safe.
    safe_unregister()

    for cls in classes:

        bpy.utils.register_class(
            cls
        )

    # --------------------------------------------------------
    # Scene properties
    # --------------------------------------------------------

    bpy.types.Scene.mpfb_require_skin_filter = (
        bpy.props.BoolProperty(
            name="Require skin name filter",
            description=(
                "Require the detected skin object or "
                "mesh name to contain one of the keywords"
            ),
            default=True,
        )
    )

    bpy.types.Scene.mpfb_skin_keywords = (
        bpy.props.StringProperty(
            name="Skin keywords",
            description=(
                "Comma-separated skin detection keywords"
            ),
            default=DEFAULT_SKIN_KEYWORDS,
        )
    )

    bpy.types.Scene.mpfb_delete_tolerance = (
        bpy.props.FloatProperty(
            name="Tolerance",
            description=(
                "Maximum distance between skin vertex "
                "and outfit geometry"
            ),
            default=DEFAULT_TOLERANCE,
            min=0.0,
            soft_max=0.01,
            unit='LENGTH',
        )
    )

    bpy.types.Scene.mpfb_delete_group_name = (
        bpy.props.StringProperty(
            name="Delete group",
            description=(
                "Generated MPFB2 Delete.* vertex group"
            ),
            default=DEFAULT_GROUP_NAME,
        )
    )

    log("Addon registered.")


def unregister():

    safe_unregister()


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    register()
