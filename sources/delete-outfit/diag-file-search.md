============================================================
MPFB2 FILE SEARCH
============================================================
Root: C:\Users\MY_USERNAME\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\extensions_blender_org\mpfb

  entities\clothes\mhclo.py
  services\clothesservice.py
  ui\apply_assets\assetlibrary\operators\loadlibraryclothes.py
  ui\apply_assets\assetlibrary\operators\unloadlibraryclothes.py
  ui\apply_assets\loadclothes\loadclothespanel.py
  ui\apply_assets\loadclothes\operators\loadclothes.py
  ui\create_assets\makeclothes\makeclothespanel.py
  ui\create_assets\makeclothes\operators\checkclothes.py
  ui\create_assets\makeclothes\operators\clothescommon.py
  ui\create_assets\makeclothes\operators\extractclothes.py
  ui\create_assets\makeclothes\operators\gendelete.py
  ui\create_assets\makeclothes\operators\markclothes.py
  ui\create_assets\makeclothes\operators\writeclothes.py
  ui\create_assets\makeclothes\operators\writeclotheslibrary.py
  ui\haireditorpanel\operators\delete_hair_operator.py
  ui\new_human\randomize\clothespanel.py
  ui\operations\basemeshops\operators\deletehelpers.py

------------------------------------------------------------
FOUND: 17 files
============================================================

========================================================================
MPFB2 CLOTHING / DELETE API SUMMARY
========================================================================

------------------------------------------------------------------------
ui/create_assets/makeclothes/operators/gendelete.py
------------------------------------------------------------------------
  20: class MPFB_OT_GenDeleteOperator(MpfbOperator):
  22: bl_idname = "mpfb.makeclothes_gendelete"
  26: def get_logger(self):
  29: def hardened_execute(self, context):

------------------------------------------------------------------------
services/clothesservice.py
------------------------------------------------------------------------
 103: class ClothesService:
 116: def __init__(self):
 121: def fit_clothes_to_human(clothes, basemesh, mhclo=None, set_parent=True):
 260: def _conservative_mask(basemesh, vertices_list):
 295: def update_delete_group(mhclo, basemesh, replace_delete_group=False, delete_group_name=None, add_modifier=True, skip_if_empty_delete_group=True):
 352: def find_clothes_absolute_path(clothes_object):
 375: def interpolate_vertex_group_from_basemesh_to_clothes(basemesh, clothes_object, vertex_group_name, match_cutoff=0.3, mhclo_full_path=None):
 426: def interpolate_weights(basemesh, clothes, rig, mhclo):
 524: def set_up_rigging(basemesh, clothes, rig, mhclo, *,
 560: def load_custom_weights(clothes, armature_object, subrig, mhclo):
 567: def try_load_weights(suffix, all=False):
 592: def set_makeclothes_object_properties_from_mhclo(clothes_object, mhclo, delete_group_name=None):
 619: def mesh_is_valid_as_clothes(mesh_object, basemesh):
 724: def create_mhclo_from_clothes_matching(basemesh, clothes, properties_dict=None, delete_group=None, allow_exact=True):
 797: def get_reference_scale(basemesh, body_part_reference="Torso"):
 848: def create_new_delete_group(basemesh, clothes, mhclo, group_name="Delete"):

------------------------------------------------------------------------
entities/clothes/mhclo.py
------------------------------------------------------------------------
  13: class Mhclo:
  16: def __init__(self):
  39: def load(self, mhclo_filename, *, only_metadata=False):
 179: def load_mesh(self, context):
 193: def get_weights_filename(self, suffix=None):
 199: def _get_config_file(self):
 208: def set_scalings (self, context, human):
 222: def write_mhclo(self, filename, also_export_mhmat=False, also_export_obj=True, reference_scale=None):

========================================================================
DONE
========================================================================
