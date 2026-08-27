========================================================================
MPFB2 NATIVE DELETE IMPLEMENTATION
========================================================================

------------------------------------------------------------------------
ui/create_assets/makeclothes/operators/gendelete.py
------------------------------------------------------------------------

>>> hardened_execute()
  29:     def hardened_execute(self, context):
  30:
  31:         basemesh = None
  32:         clothes = None
  33:         for obj in context.selected_objects:
  34:             if ObjectService.object_is_basemesh(obj):
  35:                 basemesh = obj
  36:             else:
  37:                 ot = ObjectService.get_object_type(obj)
  38:                 if ot and ot != "Skeleton":
  39:                     clothes = obj
  40:
  41:         if not basemesh:
  42:             self.report({'ERROR'}, "No basemesh selected")
  43:             return {'CANCELLED'}
  44:
  45:         if not clothes:
  46:             self.report({'ERROR'}, "No clothes selected")
  47:             return {'CANCELLED'}
  48:
  49:         for modifier in clothes.modifiers:
  50:             self.report({'ERROR'}, "Interpolating does not work when clothes have modifiers")
  51:             return {'CANCELLED'}
  52:
  53:         # The real clothes might match against helper mesh, but we want to hide the body mesh
  54:         clothes_copy = clothes.copy()
  55:         clothes_copy.data = clothes.data.copy()
  56:         for group in clothes_copy.vertex_groups:
  57:             clothes_copy.vertex_groups.remove(group)
  58:         clothes_copy.vertex_groups.new(name="body")
  59:         for vert in clothes_copy.data.vertices:
  60:             clothes_copy.vertex_groups["body"].add([vert.index], 1.0, "REPLACE")
  61:
  62:         mhclo = ClothesService.create_mhclo_from_clothes_matching(basemesh, clothes_copy)
  63:         _LOG.debug("mhclo", mhclo)
  64:
  65:         delete_group = MakeClothesObjectProperties.get_value("delete_group", entity_reference=clothes)
  66:
  67:         if not delete_group:
  68:             delete_group = "Delete"
  69:
  70:         ClothesService.create_new_delete_group(basemesh, clothes_copy, mhclo, group_name=delete_group)
  71:
  72:         ObjectService.delete_object(clothes_copy)
  73:
  74:         self.report({'INFO'}, "A very rough delete group has been created on the basemesh. You should check and edit this manually before using it.")
  75:         return {'FINISHED'}
  76:

------------------------------------------------------------------------
services/clothesservice.py
------------------------------------------------------------------------

>>> update_delete_group()
 295:     def update_delete_group(mhclo, basemesh, replace_delete_group=False, delete_group_name=None, add_modifier=True, skip_if_empty_delete_group=True):
 296:         """Create or update a "delete" group on the base mesh."""
 297:
 298:         if skip_if_empty_delete_group:
 299:             if not mhclo.delete or not mhclo.delverts or len(mhclo.delverts) < 1:
 300:                 # mhclo has empty delete group. There's no point continuing.
 301:                 return
 302:
 303:         if delete_group_name is None:
 304:             if mhclo.delete_group is None:
 305:                 delete_group_name = "Delete"
 306:             else:
 307:                 delete_group_name = mhclo.delete_group
 308:
 309:         # If requested, remove the previously existing delete group.
 310:         if replace_delete_group and mhclo.delete and delete_group_name in basemesh.vertex_groups:
 311:             vertex_group = basemesh.vertex_groups.get(delete_group_name)
 312:             basemesh.vertex_groups.remove(vertex_group)
 313:
 314:         # We'll want to set up the delete group even if it doesn't contain any vertices. This
 315:         # so that a modifier won't fail later on
 316:         if delete_group_name not in basemesh.vertex_groups:
 317:             delete_group = basemesh.vertex_groups.new(name=delete_group_name)
 318:         else:
 319:             delete_group = basemesh.vertex_groups.get(delete_group_name)
 320:
 321:         human_vertices_count = len(basemesh.data.vertices)
 322:
 323:         # If the clothes do not have a defined delete group, we can skip the next step
 324:         if mhclo.delete:
 325:             # Find vertices to delete. For safety check so that the vertex index actually
 326:             # exist in the base mesh. It might refer to a helper index that have been excluded
 327:             # or deleted.
 328:             delete_vertices_list = []
 329:             for vertex_to_delete in  mhclo.delverts:
 330:                 if vertex_to_delete < human_vertices_count:
 331:                     delete_vertices_list.append(int(vertex_to_delete))
 332:
 333:             # Remove outliers
 334:             ClothesService._conservative_mask(basemesh, delete_vertices_list)
 335:
 336:             # Add the delete vertices to the previously created vertex group
 337:             delete_group.add(delete_vertices_list, 1.0, 'ADD')
 338:
 339:         has_applicable_modifier = False
 340:
 341:         for modifier in basemesh.modifiers:
 342:             if modifier.type == "MASK":
 343:                 if modifier.vertex_group == delete_group_name:
 344:                     has_applicable_modifier = True
 345:
 346:         if add_modifier and not has_applicable_modifier:
 347:             modifier = basemesh.modifiers.new(name=delete_group_name, type="MASK")
 348:             modifier.vertex_group = delete_group_name
 349:             modifier.invert_vertex_group = True
 350:

>>> create_new_delete_group()
 848:     def create_new_delete_group(basemesh, clothes, mhclo, group_name="Delete"):
 849:         """
 850:         Creates a new delete group on the given basemesh based on which vertices are covered by the clothes.
 851:
 852:         Args:
 853:             basemesh (bpy.types.Mesh): The basemesh object. This needs to be a valid MakeHuman basemesh object.
 854:             clothes (bpy.types.Mesh): The clothes object. This needs to match the mesh in the mhclo object
 855:             mhclo (mpfb.entities.clothes.mhclo.Mhclo): A mhclo object describing the matching between the clothes and the base mesh.
 856:
 857:         Returns:
 858:             bpy.types.VertexGroup: The new delete group.
 859:         """
 860:         if not basemesh or not clothes or not mhclo:
 861:             raise ValueError("basemesh, clothes and mhclo must be valid objects")
 862:
 863:         if basemesh.type != "MESH" or clothes.type != "MESH":
 864:             raise ValueError("basemesh and clothes must be mesh objects")
 865:
 866:         if not mhclo.verts or len(mhclo.verts.keys()) < 1:
 867:             raise ValueError("This MHCLO object does not seem to have been populated with matchings")
 868:
 869:         _LOG.dump("mhclo.verts", mhclo.verts)
 870:
 871:         if len(mhclo.verts.keys()) != len(clothes.data.vertices):
 872:             _LOG.error("len mhclo.verts", len(mhclo.verts))
 873:             _LOG.error("len clothes.data.vertices", len(clothes.data.vertices))
 874:             raise ValueError("The clothes mesh does not have the same number of vertices as the MHCLO object")
 875:
 876:         all_verts_raw = []
 877:         for vert_idx in mhclo.verts:
 878:             vert_match = mhclo.verts[vert_idx]
 879:             all_verts_raw.extend(vert_match["verts"])
 880:
 881:         all_verts = numpy.sort(numpy.unique(numpy.array(all_verts_raw, dtype=numpy.int32))).tolist()
 882:
 883:         _LOG.debug("Vertices belonging to a match", len(all_verts))
 884:
 885:         # At this point the "all_verts" list contains the indices of the vertices in the clothes mesh which have been
 886:         # matched by the MHCLO. This is likely to be patchy, especially where the base mesh is denser than the clothes.
 887:         #
 888:         # We will thus extend the list to also include all other verts which belong to a face which was touched by
 889:         # the first set
 890:
 891:         face_verts_raw = []
 892:
 893:         for vert in all_verts:
 894:             for polygon in basemesh.data.polygons:
 895:                 if vert in polygon.vertices:
 896:                     face_verts_raw.extend(list(polygon.vertices))
 897:
 898:         face_verts = numpy.sort(numpy.unique(numpy.array(face_verts_raw, dtype=numpy.int32))).tolist()
 899:
 900:         _LOG.debug("Vertices belonging to a relevant face", len(face_verts))
 901:
 902:         if group_name in basemesh.vertex_groups:
 903:             _LOG.debug("Deleting existing group", group_name)
 904:             basemesh.vertex_groups.remove(basemesh.vertex_groups[group_name])
 905:
 906:         delete_group = basemesh.vertex_groups.new(name=group_name)
 907:         delete_group.add(face_verts, 1.0, "REPLACE")

>>> create_mhclo_from_clothes_matching()
 724:     def create_mhclo_from_clothes_matching(basemesh, clothes, properties_dict=None, delete_group=None, allow_exact=True):
 725:         """Create a MHCLO object by matching vertices on the clothes to vertices on the basemesh."""
 726:         mhclo = Mhclo()
 727:         mhclo.verts = dict()
 728:         mhclo.clothes = clothes
 729:
 730:         _LOG.debug("Starting match process")
 731:
 732:         reference_scale = ClothesService.get_reference_scale(basemesh)
 733:
 734:         if properties_dict:
 735:             for key in properties_dict.keys():
 736:                 name = str(key)
 737:                 if hasattr(mhclo, name):
 738:                     value = properties_dict[key]
 739:                     setattr(mhclo, name, value)
 740:
 741:         cache_dir = LocationService.get_user_cache("basemesh_xref")
 742:         read_cache = os.path.exists(cache_dir)
 743:
 744:         before = time.time()
 745:         basemesh_xref = MeshCrossRef(basemesh, after_modifiers=True, build_faces_by_group_reference=True, cache_dir=cache_dir, write_cache=False, read_cache=read_cache)
 746:         after = time.time()
 747:         duration = int((after - before) * 1000.0)
 748:         _LOG.debug("basemesh xref duration", duration)
 749:
 750:         before = time.time()
 751:         clothes_xref = MeshCrossRef(clothes, after_modifiers=True, build_faces_by_group_reference=True, cache_dir=None, write_cache=False, read_cache=False)
 752:         after = time.time()
 753:         duration = int((after - before) * 1000.0)
 754:         _LOG.debug("clothes xref duration", duration)
 755:
 756:         scale_factor = GeneralObjectProperties.get_value("scale_factor", entity_reference=basemesh)
 757:
 758:         max_pole = 0
 759:         _LOG.dump("edges by vertex", clothes_xref.edges_by_vertex)
 760:         for edges in clothes_xref.edges_by_vertex:
 761:             _LOG.dump("edges", edges)
 762:             if len(edges) > max_pole:
 763:                 max_pole = len(edges)
 764:
 765:         if max_pole:
 766:             mhclo.max_pole = max_pole
 767:
 768:         before = time.time()
 769:         for vert in range(len(clothes_xref.vertex_coordinates)):
 770:             before_internal = time.time()
 771:             vmatch = VertexMatch(clothes, vert, clothes_xref, basemesh, basemesh_xref, scale_factor=scale_factor, reference_scale=reference_scale, allow_exact=allow_exact)
 772:             after_internal = time.time()
 773:             duration_internal = int((after_internal - before_internal) * 1000.0)
 774:             _LOG.dump("vmatch", (duration_internal, vmatch.final_strategy))
 775:             mhclo.verts[vert] = vmatch.mhclo_line
 776:         after = time.time()
 777:         duration = int((after - before) * 1000.0)
 778:         _LOG.debug("vert matching total", duration)
 779:
 780:         _LOG.debug("delete group", delete_group)
 781:
 782:         if delete_group and delete_group in basemesh.vertex_groups:
 783:             mhclo.delete_group = delete_group
 784:             all_verts = []
 785:             for vert in MeshService.find_vertices_in_vertex_group(basemesh, delete_group):
 786:                 all_verts.append(vert[0])
 787:             all_verts.sort()
 788:             _LOG.dump("All verts", all_verts)
 789:             mhclo.delverts = numpy.sort(numpy.unique(numpy.array(all_verts, dtype=numpy.int32))).tolist()
 790:             mhclo.delete = True
 791:         else:
 792:             _LOG.warn("Delete group not specified or not present", delete_group)
 793:
 794:         return mhclo
 795:
