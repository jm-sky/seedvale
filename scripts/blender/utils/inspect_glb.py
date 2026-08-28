import json
import struct
import sys


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()

    magic, version, length = struct.unpack_from("<4sII", data, 0)

    if magic != b"glTF":
        raise ValueError("Not a GLB file")

    offset = 12
    json_data = None

    while offset < length:
        chunk_length, chunk_type = struct.unpack_from(
            "<I4s", data, offset
        )
        offset += 8

        chunk = data[offset:offset + chunk_length]
        offset += chunk_length

        if chunk_type == b"JSON":
            json_data = json.loads(chunk.decode("utf-8"))

    if json_data is None:
        raise ValueError("GLB contains no JSON chunk")

    return json_data


def main():
    model_path = ""
    default_model_path = "public/models/characters/Viking.glb"

    if len(sys.argv) != 2:
        print("Using default model:", default_model_path)
        model_path = default_model_path
    else:
        model_path = sys.argv[1]

    gltf = read_glb(model_path)

    print("=" * 80)
    print("GLB MATERIAL INSPECTION")
    print("=" * 80)

    materials = gltf.get("materials", [])

    print(f"\nMaterials: {len(materials)}")

    for i, material in enumerate(materials):
        print("\n" + "-" * 80)
        print(f"MATERIAL #{i}")
        print(f"  name:        {material.get('name')}")
        print(f"  alphaMode:   {material.get('alphaMode', 'OPAQUE')}")
        print(f"  alphaCutoff: {material.get('alphaCutoff', 0.5)}")
        print(f"  doubleSided: {material.get('doubleSided', False)}")

        pbr = material.get("pbrMetallicRoughness", {})

        print(f"  baseColor:   {pbr.get('baseColorFactor')}")
        print(f"  texture:     {pbr.get('baseColorTexture')}")

    print("\n" + "=" * 80)
    print("MESH → PRIMITIVE → MATERIAL")
    print("=" * 80)

    meshes = gltf.get("meshes", [])

    for mesh_index, mesh in enumerate(meshes):
        print("\n" + "-" * 80)
        print(
            f"MESH #{mesh_index}: "
            f"{mesh.get('name', '<unnamed>')}"
        )

        for primitive_index, primitive in enumerate(
            mesh.get("primitives", [])
        ):
            material_index = primitive.get("material")

            material_name = "<default>"

            if material_index is not None:
                material_name = materials[material_index].get(
                    "name",
                    f"<material #{material_index}>"
                )

            print(
                f"  primitive #{primitive_index}: "
                f"material #{material_index} "
                f"({material_name})"
            )


if __name__ == "__main__":
    main()
