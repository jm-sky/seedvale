#!/usr/bin/env python3
"""Compose UBC Fantasy runtime glTFs (outfit + sliced head + optional hair).

Male player outfits plus female Peasant/Wizard for profession NPCs.
Does not touch `_temp/` sources. Writes a work directory of glTF + textures
for a later gltf-transform / gltfpack pass.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import struct
from typing import Any

COMPONENT_BYTES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COMPONENTS = {
    'SCALAR': 1,
    'VEC2': 2,
    'VEC3': 3,
    'VEC4': 4,
    'MAT2': 4,
    'MAT3': 9,
    'MAT4': 16,
}

HEAD_BONES = {'Head', 'neck_01'}


class GltfDoc:
    def __init__(self, path: str) -> None:
        self.path = path
        self.dir = os.path.dirname(path)
        with open(path, encoding='utf-8') as f:
            self.j: dict[str, Any] = json.load(f)
        uri = self.j['buffers'][0].get('uri')
        if not uri:
            raise SystemExit(f'{path}: expected external .bin buffer')
        with open(os.path.join(self.dir, uri), 'rb') as f:
            self.bin = bytearray(f.read())

    def nodes(self) -> list[dict[str, Any]]:
        return self.j['nodes']

    def armature_index(self) -> int:
        scenes = self.j['scenes']
        roots = scenes[self.j.get('scene', 0)]['nodes']
        if len(roots) != 1:
            raise SystemExit(f'{self.path}: expected single scene root, got {roots}')
        return roots[0]

    def joint_names(self) -> list[str]:
        joints = self.j['skins'][0]['joints']
        return [self.nodes()[i].get('name', '') for i in joints]

    def accessor(self, index: int) -> dict[str, Any]:
        return self.j['accessors'][index]

    def view_slice(self, view_index: int) -> tuple[int, int, int | None]:
        view = self.j['bufferViews'][view_index]
        start = view.get('byteOffset', 0)
        length = view['byteLength']
        return start, length, view.get('byteStride')

    def read_accessor(self, index: int) -> bytes:
        acc = self.accessor(index)
        view_index = acc['bufferView']
        start, _length, stride = self.view_slice(view_index)
        start += acc.get('byteOffset', 0)
        comps = TYPE_COMPONENTS[acc['type']]
        elem = COMPONENT_BYTES[acc['componentType']] * comps
        count = acc['count']
        stride = stride or elem
        if stride == elem:
            return bytes(self.bin[start:start + elem * count])
        out = bytearray()
        for i in range(count):
            off = start + i * stride
            out.extend(self.bin[off:off + elem])
        return bytes(out)


def pad4(buf: bytearray) -> None:
    while len(buf) % 4:
        buf.append(0)


def append_bytes(dest: GltfDoc, data: bytes, target: int) -> int:
    pad4(dest.bin)
    offset = len(dest.bin)
    dest.bin.extend(data)
    pad4(dest.bin)
    dest.j['bufferViews'].append({
        'buffer': 0,
        'byteOffset': offset,
        'byteLength': len(data),
        'target': target,
    })
    return len(dest.j['bufferViews']) - 1


def copy_accessor(dest: GltfDoc, src: GltfDoc, src_index: int, target: int) -> int:
    acc = dict(src.accessor(src_index))
    data = src.read_accessor(src_index)
    view = append_bytes(dest, data, target)
    acc['bufferView'] = view
    acc.pop('byteOffset', None)
    dest.j['accessors'].append(acc)
    return len(dest.j['accessors']) - 1


def remap_joints(data: bytes, src_names: list[str], dest_names: list[str]) -> bytes:
    dest_index = {name: i for i, name in enumerate(dest_names)}
    out = bytearray(data)
    for i in range(0, len(out), 4):
        for k in range(4):
            src_joint = out[i + k]
            name = src_names[src_joint] if src_joint < len(src_names) else ''
            out[i + k] = dest_index.get(name, 0)
    return bytes(out)


def resolve_image_file(src: GltfDoc, image: dict[str, Any]) -> str:
    uri = image.get('uri')
    name = image.get('name')
    candidates: list[str] = []
    if uri:
        candidates.append(os.path.join(src.dir, uri))
        # Godot export sometimes writes `T_Foo_png.png` for `T_Foo.png`.
        if uri.endswith('_png.png'):
            candidates.append(os.path.join(src.dir, uri.replace('_png.png', '.png')))
        candidates.append(os.path.join(src.dir, os.path.basename(uri)))
    if name:
        candidates.append(os.path.join(src.dir, name if name.lower().endswith('.png') else f'{name}.png'))
    for path in candidates:
        if os.path.isfile(path):
            return path
    raise SystemExit(f'{src.path}: missing image {uri or name}; tried {candidates}')


def copy_image(dest: GltfDoc, src: GltfDoc, src_index: int, out_dir: str) -> int:
    image = dict(src.j['images'][src_index])
    uri = image.get('uri')
    if not uri:
        raise SystemExit(f'{src.path}: embedded image {src_index} not supported')
    src_file = resolve_image_file(src, image)
    dest_name = os.path.basename(uri)
    if dest_name.endswith('_png.png'):
        dest_name = dest_name.replace('_png.png', '.png')
    # Avoid colliding hair/superhero filenames that differ only by directory.
    if dest_name in {img.get('uri') for img in dest.j.get('images', [])}:
        stem, ext = os.path.splitext(dest_name)
        dest_name = f'{stem}_{src_index}{ext}'
        image['uri'] = dest_name
    else:
        image['uri'] = dest_name
    shutil.copy2(src_file, os.path.join(out_dir, dest_name))
    dest.j.setdefault('images', []).append(image)
    return len(dest.j['images']) - 1


def copy_texture(dest: GltfDoc, src: GltfDoc, src_index: int, out_dir: str, tex_map: dict[int, int]) -> int:
    if src_index in tex_map:
        return tex_map[src_index]
    tex = dict(src.j['textures'][src_index])
    if 'source' in tex:
        tex['source'] = copy_image(dest, src, tex['source'], out_dir)
    if 'sampler' in tex:
        sampler = dict(src.j['samplers'][tex['sampler']])
        dest.j.setdefault('samplers', []).append(sampler)
        tex['sampler'] = len(dest.j['samplers']) - 1
    dest.j.setdefault('textures', []).append(tex)
    dest_index = len(dest.j['textures']) - 1
    tex_map[src_index] = dest_index
    return dest_index


def remap_texture_info(info: dict[str, Any], dest: GltfDoc, src: GltfDoc, out_dir: str, tex_map: dict[int, int]) -> dict[str, Any]:
    out = dict(info)
    out['index'] = copy_texture(dest, src, info['index'], out_dir, tex_map)
    return out


def copy_material(dest: GltfDoc, src: GltfDoc, src_index: int, out_dir: str, mat_map: dict[int, int], tex_map: dict[int, int]) -> int:
    if src_index in mat_map:
        return mat_map[src_index]
    mat = json.loads(json.dumps(src.j['materials'][src_index]))
    pbr = mat.get('pbrMetallicRoughness', {})
    if 'baseColorTexture' in pbr:
        pbr['baseColorTexture'] = remap_texture_info(pbr['baseColorTexture'], dest, src, out_dir, tex_map)
    if 'metallicRoughnessTexture' in pbr:
        pbr['metallicRoughnessTexture'] = remap_texture_info(pbr['metallicRoughnessTexture'], dest, src, out_dir, tex_map)
    if 'normalTexture' in mat:
        mat['normalTexture'] = remap_texture_info(mat['normalTexture'], dest, src, out_dir, tex_map)
    if 'occlusionTexture' in mat:
        mat['occlusionTexture'] = remap_texture_info(mat['occlusionTexture'], dest, src, out_dir, tex_map)
    if 'emissiveTexture' in mat:
        mat['emissiveTexture'] = remap_texture_info(mat['emissiveTexture'], dest, src, out_dir, tex_map)
    dest.j.setdefault('materials', []).append(mat)
    dest_index = len(dest.j['materials']) - 1
    mat_map[src_index] = dest_index
    return dest_index


def unpack_u16(data: bytes) -> list[int]:
    return list(struct.unpack('<' + 'H' * (len(data) // 2), data))


def pack_u16(values: list[int]) -> bytes:
    return struct.pack('<' + 'H' * len(values), *values)


def head_vertex_mask(src: GltfDoc, prim: dict[str, Any]) -> list[bool]:
    attrs = prim['attributes']
    joints_acc = attrs['JOINTS_0']
    weights_acc = attrs['WEIGHTS_0']
    joints = src.read_accessor(joints_acc)
    weights = src.read_accessor(weights_acc)
    names = src.joint_names()
    count = src.accessor(joints_acc)['count']
    mask: list[bool] = []
    for i in range(count):
        w = struct.unpack_from('<ffff', weights, i * 16)
        total = 0.0
        for c in range(4):
            name = names[joints[i * 4 + c]] if joints[i * 4 + c] < len(names) else ''
            if name in HEAD_BONES:
                total += w[c]
        mask.append(total >= 0.5)
    return mask


def compact_attributes(
    dest: GltfDoc,
    src: GltfDoc,
    prim: dict[str, Any],
    used: list[int],
    src_names: list[str],
    dest_names: list[str],
) -> dict[str, int]:
    old_to_new = {old: new for new, old in enumerate(used)}
    attrs_out: dict[str, int] = {}
    for name, acc_index in prim['attributes'].items():
        acc = dict(src.accessor(acc_index))
        raw = src.read_accessor(acc_index)
        comps = TYPE_COMPONENTS[acc['type']]
        elem = COMPONENT_BYTES[acc['componentType']] * comps
        pieces = [raw[old * elem:(old + 1) * elem] for old in used]
        data = b''.join(pieces)
        if name == 'JOINTS_0':
            data = remap_joints(data, src_names, dest_names)
        view = append_bytes(dest, data, 34962)
        acc['bufferView'] = view
        acc['count'] = len(used)
        acc.pop('byteOffset', None)
        if name == 'POSITION':
            # bbox will be recomputed from the compacted head verts
            floats = struct.unpack('<' + 'f' * (len(data) // 4), data)
            xs, ys, zs = floats[0::3], floats[1::3], floats[2::3]
            acc['min'] = [min(xs), min(ys), min(zs)]
            acc['max'] = [max(xs), max(ys), max(zs)]
        dest.j['accessors'].append(acc)
        attrs_out[name] = len(dest.j['accessors']) - 1
        _ = old_to_new
    return attrs_out


def add_skinned_mesh(
    dest: GltfDoc,
    src: GltfDoc,
    mesh_index: int,
    node_name: str,
    out_dir: str,
    mat_map: dict[int, int],
    tex_map: dict[int, int],
    slice_head: bool = False,
) -> None:
    src_mesh = src.j['meshes'][mesh_index]
    dest_mesh: dict[str, Any] = {'name': src_mesh.get('name', node_name), 'primitives': []}
    src_names = src.joint_names()
    dest_names = dest.joint_names()

    for prim in src_mesh['primitives']:
        new_prim: dict[str, Any] = {'mode': prim.get('mode', 4), 'attributes': {}}
        if 'material' in prim:
            new_prim['material'] = copy_material(dest, src, prim['material'], out_dir, mat_map, tex_map)

        if slice_head:
            mask = head_vertex_mask(src, prim)
            indices = unpack_u16(src.read_accessor(prim['indices']))
            kept: list[int] = []
            used_set: set[int] = set()
            for t in range(0, len(indices), 3):
                tri = indices[t:t + 3]
                if all(mask[v] for v in tri):
                    kept.extend(tri)
                    used_set.update(tri)
            if not kept:
                raise SystemExit(f'{src.path}: head slice produced no triangles for {src_mesh.get("name")}')
            used = sorted(used_set)
            old_to_new = {old: new for new, old in enumerate(used)}
            new_prim['attributes'] = compact_attributes(dest, src, prim, used, src_names, dest_names)
            new_indices = [old_to_new[v] for v in kept]
            view = append_bytes(dest, pack_u16(new_indices), 34963)
            dest.j['accessors'].append({
                'bufferView': view,
                'componentType': 5123,
                'count': len(new_indices),
                'type': 'SCALAR',
            })
            new_prim['indices'] = len(dest.j['accessors']) - 1
            print(f'  sliced {src_mesh.get("name")}: {len(mask)} verts -> {len(used)} head verts, {len(new_indices)//3} tris')
        else:
            for name, acc_index in prim['attributes'].items():
                copied = copy_accessor(dest, src, acc_index, 34962)
                if name == 'JOINTS_0':
                    remapped = remap_joints(dest.read_accessor(copied), src_names, dest_names)
                    # overwrite the just-appended view
                    view_index = dest.accessor(copied)['bufferView']
                    start = dest.j['bufferViews'][view_index]['byteOffset']
                    dest.bin[start:start + len(remapped)] = remapped
                new_prim['attributes'][name] = copied
            if 'indices' in prim:
                new_prim['indices'] = copy_accessor(dest, src, prim['indices'], 34963)

        dest_mesh['primitives'].append(new_prim)

    dest.j['meshes'].append(dest_mesh)
    mesh_i = len(dest.j['meshes']) - 1
    dest.j['nodes'].append({
        'name': node_name,
        'mesh': mesh_i,
        'skin': 0,
    })
    node_i = len(dest.j['nodes']) - 1
    armature = dest.j['nodes'][dest.armature_index()]
    armature.setdefault('children', []).append(node_i)


def write_doc(doc: GltfDoc, out_gltf: str) -> None:
    bin_name = os.path.splitext(os.path.basename(out_gltf))[0] + '.bin'
    doc.j['buffers'] = [{'byteLength': len(doc.bin), 'uri': bin_name}]
    out_dir = os.path.dirname(out_gltf)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, bin_name), 'wb') as f:
        f.write(doc.bin)
    with open(out_gltf, 'w', encoding='utf-8') as f:
        json.dump(doc.j, f, indent=2)
        f.write('\n')


# Helmeted outfits already cover the skull; hair would poke through.
# hair: None | 'simple' | 'long'. sex: 'male' | 'female'.
OUTFITS: tuple[tuple[str, str, str | None, str], ...] = (
    ('Male_Peasant', 'male_peasant', 'simple', 'male'),
    ('Male_Ranger', 'male_ranger', 'simple', 'male'),
    ('Male_Knight', 'male_knight', None, 'male'),
    ('Male_Knight_Cloth', 'male_knight_cloth', None, 'male'),
    ('Male_Noble', 'male_noble', 'simple', 'male'),
    ('Male_Wizard', 'male_wizard', 'simple', 'male'),
    ('Female_Peasant', 'female_peasant', 'long', 'female'),
    ('Female_Wizard', 'female_wizard', 'simple', 'female'),
)

ALT_ALBEDOS: tuple[tuple[str, str], ...] = (
    ('Textures/Peasant/T_Peasant_2_BaseColor.png', 'male_peasant_brown.png'),
    ('Textures/Ranger/T_Ranger_3_BaseColor.png', 'male_ranger_brown.png'),
    ('Textures/Knight/T_Knight_2_BaseColor.png', 'male_knight_brown.png'),
    ('Textures/Knight/T_Knight_2_BaseColor.png', 'male_knight_cloth_brown.png'),
    ('Textures/Noble/T_Noble_2_BaseColor.png', 'male_noble_brown.png'),
    ('Textures/Wizard/T_Wizard_2_BaseColor.png', 'male_wizard_brown.png'),
    ('Textures/Peasant/T_Peasant_3_BaseColor.png', 'npc_peasant.png'),
    ('Textures/Peasant/T_Peasant_2_BaseColor.png', 'npc_woodcutter.png'),
    ('Textures/Wizard/T_Wizard_3_BaseColor.png', 'npc_wizard.png'),
)

HAIR_NODE_NAMES = {
    'simple': 'Hair_SimpleParted',
    'long': 'Hair_Long',
}


def compose_outfit(
    outfit_gltf: str,
    base_gltf: str,
    hair_gltf: str | None,
    out_gltf: str,
    label: str,
    hair_kind: str | None,
) -> None:
    out_dir = os.path.dirname(out_gltf)
    os.makedirs(out_dir, exist_ok=True)
    dest = GltfDoc(outfit_gltf)
    # Copy existing outfit textures next to the composed glTF.
    for image in dest.j.get('images', []):
        uri = image.get('uri')
        if uri:
            shutil.copy2(os.path.join(dest.dir, uri), os.path.join(out_dir, os.path.basename(uri)))
            image['uri'] = os.path.basename(uri)

    base = GltfDoc(base_gltf)
    mat_map: dict[int, int] = {}
    tex_map: dict[int, int] = {}

    print(f'Composing {label}')
    # Superhero meshes: 0 Face (eyebrows), 1 Face.001 (eyes), 2 body (slice head).
    add_skinned_mesh(dest, base, 0, 'Eyebrows', out_dir, mat_map, tex_map)
    add_skinned_mesh(dest, base, 1, 'Eyes', out_dir, mat_map, tex_map)
    add_skinned_mesh(dest, base, 2, 'HeadSkin', out_dir, mat_map, tex_map, slice_head=True)
    if hair_kind:
        if not hair_gltf:
            raise SystemExit(f'{label}: hair kind {hair_kind} without hair glTF')
        hair = GltfDoc(hair_gltf)
        add_skinned_mesh(dest, hair, 0, HAIR_NODE_NAMES[hair_kind], out_dir, {}, {})
    write_doc(dest, out_gltf)
    print(f'  wrote {out_gltf}')


def copy_alt_albedos(outfits_root: str, out_dir: str) -> None:
    """Copy brown/NPC BaseColor variants next to composed glTFs (runtime loads them separately)."""
    for rel, dest_name in ALT_ALBEDOS:
        src = os.path.join(outfits_root, rel)
        if not os.path.isfile(src):
            raise SystemExit(f'missing alt albedo {src}')
        dest = os.path.join(out_dir, dest_name)
        shutil.copy2(src, dest)
        print(f'  copied alt albedo {dest_name}')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--out-dir', required=True)
    args = parser.parse_args()

    people = os.path.join(args.root, '_temp/Models/people')
    ubc = os.path.join(people, 'Universal Base Characters[Standard]')
    outfits = os.path.join(people, 'Modular Character Outfits - Fantasy[Source]')
    bases = {
        'male': os.path.join(ubc, 'Base Characters/Godot - UE/Superhero_Male_FullBody.gltf'),
        'female': os.path.join(ubc, 'Base Characters/Godot - UE/Superhero_Female_FullBody.gltf'),
    }
    hairs = {
        'simple': os.path.join(ubc, 'Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_SimpleParted.gltf'),
        'long': os.path.join(ubc, 'Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_Long.gltf'),
    }
    outfit_dir = os.path.join(outfits, 'Exports/glTF (Godot-Unreal)/Outfits')

    for path in (*bases.values(), *hairs.values()):
        if not os.path.isfile(path):
            raise SystemExit(f'missing source {path}')

    os.makedirs(args.out_dir, exist_ok=True)
    for src_stem, dest_stem, hair_kind, sex in OUTFITS:
        src = os.path.join(outfit_dir, f'{src_stem}.gltf')
        if not os.path.isfile(src):
            raise SystemExit(f'missing source {src}')
        compose_outfit(
            src,
            bases[sex],
            hairs[hair_kind] if hair_kind else None,
            os.path.join(args.out_dir, f'{dest_stem}.gltf'),
            dest_stem,
            hair_kind,
        )
    copy_alt_albedos(outfits, args.out_dir)


if __name__ == '__main__':
    main()
