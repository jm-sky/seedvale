#!/usr/bin/env python3
"""Keep named animation clips from a GLB and drop the mannequin mesh."""

from __future__ import annotations

import argparse
import json
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


def read_glb(path: str) -> tuple[dict[str, Any], bytes]:
    data = open(path, 'rb').read()
    if data[0:4] != b'glTF':
        raise SystemExit(f'{path}: not a GLB')
    json_len = struct.unpack_from('<I', data, 12)[0]
    json_bytes = data[20:20 + json_len]
    doc = json.loads(json_bytes.rstrip(b'\x00'))
    offset = 20 + json_len
    bin_data = b''
    if offset + 8 <= len(data):
        chunk_len = struct.unpack_from('<I', data, offset)[0]
        chunk_type = struct.unpack_from('<I', data, offset + 4)[0]
        if chunk_type == 0x004E4942:
            bin_data = data[offset + 8:offset + 8 + chunk_len]
    return doc, bin_data


def write_glb(path: str, doc: dict[str, Any], bin_data: bytes) -> None:
    json_bytes = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    while len(json_bytes) % 4:
        json_bytes += b' '
    bin_padded = bin_data + b'\x00' * ((4 - (len(bin_data) % 4)) % 4)
    total = 12 + 8 + len(json_bytes) + (8 + len(bin_padded) if bin_padded else 0)
    out = bytearray()
    out.extend(b'glTF')
    out.extend(struct.pack('<II', 2, total))
    out.extend(struct.pack('<II', len(json_bytes), 0x4E4F534A))
    out.extend(json_bytes)
    if bin_padded:
        out.extend(struct.pack('<II', len(bin_padded), 0x004E4942))
        out.extend(bin_padded)
    with open(path, 'wb') as f:
        f.write(out)


def accessor_bytes(doc: dict[str, Any], bin_data: bytes, index: int) -> bytes:
    acc = doc['accessors'][index]
    view = doc['bufferViews'][acc['bufferView']]
    start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    comps = TYPE_COMPONENTS[acc['type']]
    elem = COMPONENT_BYTES[acc['componentType']] * comps
    count = acc['count']
    stride = view.get('byteStride') or elem
    if stride == elem:
        return bin_data[start:start + elem * count]
    out = bytearray()
    for i in range(count):
        off = start + i * stride
        out.extend(bin_data[off:off + elem])
    return bytes(out)


def extract(src_path: str, dest_path: str, keep: list[str]) -> None:
    doc, bin_data = read_glb(src_path)
    keep_set = set(keep)
    animations = [a for a in doc.get('animations', []) if a.get('name') in keep_set]
    found = {a.get('name') for a in animations}
    missing = [name for name in keep if name not in found]
    if missing:
        raise SystemExit(f'missing clips: {missing}')

    used_accessors: set[int] = set()
    for anim in animations:
        for sampler in anim.get('samplers', []):
            used_accessors.add(sampler['input'])
            used_accessors.add(sampler['output'])

    new_bin = bytearray()
    new_views: list[dict[str, Any]] = []
    new_accessors: list[dict[str, Any]] = []
    acc_map: dict[int, int] = {}

    def pad4() -> None:
        while len(new_bin) % 4:
            new_bin.append(0)

    for old in sorted(used_accessors):
        acc = dict(doc['accessors'][old])
        data = accessor_bytes(doc, bin_data, old)
        pad4()
        offset = len(new_bin)
        new_bin.extend(data)
        new_views.append({
            'buffer': 0,
            'byteOffset': offset,
            'byteLength': len(data),
        })
        acc['bufferView'] = len(new_views) - 1
        acc.pop('byteOffset', None)
        new_accessors.append(acc)
        acc_map[old] = len(new_accessors) - 1

    for anim in animations:
        for sampler in anim.get('samplers', []):
            sampler['input'] = acc_map[sampler['input']]
            sampler['output'] = acc_map[sampler['output']]

    for node in doc.get('nodes', []):
        node.pop('mesh', None)
        node.pop('skin', None)

    doc['animations'] = animations
    doc['accessors'] = new_accessors
    doc['bufferViews'] = new_views
    doc['buffers'] = [{'byteLength': len(new_bin)}]
    doc.pop('meshes', None)
    doc.pop('materials', None)
    doc.pop('textures', None)
    doc.pop('images', None)
    doc.pop('samplers', None)
    doc.pop('skins', None)

    write_glb(dest_path, doc, bytes(new_bin))
    print(f'extracted {len(animations)} clips -> {dest_path} ({len(new_bin)} bytes bin)')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--in', dest='src', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--keep', required=True, help='comma-separated clip names')
    args = parser.parse_args()
    extract(args.src, args.out, [n.strip() for n in args.keep.split(',') if n.strip()])


if __name__ == '__main__':
    main()
