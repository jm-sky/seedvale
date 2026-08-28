import sys
from pathlib import Path

from pygltflib import GLTF2
from PIL import Image
import io


SEPARATOR = "=" * 80


def percent(value, total):
    if not total:
        return 0.0
    return value / total * 100.0


def inspect_image(image_data):
    if not image_data:
        return None

    try:
        image = Image.open(io.BytesIO(image_data))
        image.load()

        result = {
            "format": image.format,
            "mode": image.mode,
            "size": image.size,
        }

        if "A" not in image.getbands():
            result.update({
                "has_alpha": False,
                "alpha_min": None,
                "alpha_max": None,
                "opaque_percent": 100.0,
                "transparent_percent": 0.0,
            })
            return result

        alpha = image.getchannel("A")
        histogram = alpha.histogram()

        total = sum(histogram)

        alpha_min = next(
            (i for i, count in enumerate(histogram) if count),
            0,
        )

        alpha_max = next(
            (
                i
                for i in range(255, -1, -1)
                if histogram[i]
            ),
            255,
        )

        opaque = histogram[255]
        transparent = histogram[0]

        result.update({
            "has_alpha": True,
            "alpha_min": alpha_min,
            "alpha_max": alpha_max,
            "opaque_percent": percent(opaque, total),
            "transparent_percent": percent(transparent, total),
        })

        return result

    except Exception as exc:
        return {
            "error": str(exc),
        }


def get_image_data(gltf, image_index):
    image = gltf.images[image_index]

    if image.bufferView is not None:
        buffer_view = gltf.bufferViews[image.bufferView]
        buffer = gltf.binary_blob()

        start = buffer_view.byteOffset or 0
        end = start + buffer_view.byteLength

        return buffer[start:end]

    if image.uri:
        uri = image.uri

        if uri.startswith("data:"):
            import base64

            encoded = uri.split(",", 1)[1]
            return base64.b64decode(encoded)

        path = Path(uri)

        if path.exists():
            return path.read_bytes()

    return None


def inspect_material(gltf, material_index):
    material = gltf.materials[material_index]

    print("-" * 80)
    print(f"MATERIAL #{material_index}")
    print(f"  name:        {material.name}")

    if material.alphaMode:
        print(f"  alphaMode:   {material.alphaMode}")

    if material.alphaCutoff is not None:
        print(f"  alphaCutoff: {material.alphaCutoff}")

    print(f"  doubleSided: {material.doubleSided}")

    pbr = material.pbrMetallicRoughness

    if pbr is None:
        print("  PBR:         None")
        return

    if pbr.baseColorFactor:
        print(f"  baseColorFactor: {pbr.baseColorFactor}")

    texture = pbr.baseColorTexture

    if texture is None:
        print("  baseColorTexture: None")
        return

    print(f"  texture index: {texture.index}")

    if texture.index >= len(gltf.textures):
        return

    gltf_texture = gltf.textures[texture.index]

    print(f"  texture source: {gltf_texture.source}")

    if gltf_texture.source is None:
        return

    image_info = inspect_image(
        get_image_data(gltf, gltf_texture.source)
    )

    if not image_info:
        print("  image: unavailable")
        return

    if "error" in image_info:
        print(f"  image ERROR: {image_info['error']}")
        return

    print(f"  image format:  {image_info['format']}")
    print(f"  image mode:    {image_info['mode']}")
    print(f"  image size:    {image_info['size']}")
    print(f"  has alpha:     {image_info['has_alpha']}")

    if image_info["has_alpha"]:
        print(f"  alpha min:     {image_info['alpha_min']}")
        print(f"  alpha max:     {image_info['alpha_max']}")
        print(
            f"  opaque:        "
            f"{image_info['opaque_percent']:.2f}%"
        )
        print(
            f"  transparent:   "
            f"{image_info['transparent_percent']:.2f}%"
        )


def inspect_mesh_materials(gltf):
    print()
    print(SEPARATOR)
    print("MESH -> PRIMITIVE -> MATERIAL")
    print(SEPARATOR)

    for mesh_index, mesh in enumerate(gltf.meshes):
        print()
        print("-" * 80)
        print(f"MESH #{mesh_index}: {mesh.name}")

        for primitive_index, primitive in enumerate(mesh.primitives):
            material_index = primitive.material

            if material_index is None:
                print(
                    f"  primitive #{primitive_index}: "
                    "NO MATERIAL"
                )
                continue

            material_name = (
                gltf.materials[material_index].name
                if material_index < len(gltf.materials)
                else "UNKNOWN"
            )

            print(
                f"  primitive #{primitive_index}: "
                f"material #{material_index} "
                f"({material_name})"
            )


def main():
    model_path = ""
    default_model_path = "public/models/characters/Viking.glb"

    if len(sys.argv) != 2:
        print("Using default model:", default_model_path)
        model_path = default_model_path
    else:
        model_path = sys.argv[1]

    glb_path = Path(model_path)

    if not glb_path.exists():
        print(f"ERROR: File not found: {glb_path}")
        sys.exit(1)

    print(SEPARATOR)
    print("GLB MATERIAL INSPECTION")
    print(SEPARATOR)
    print(f"File: {glb_path}")
    print(f"Size: {glb_path.stat().st_size:,} bytes")

    gltf = GLTF2().load(str(glb_path))

    print()
    print(f"Materials: {len(gltf.materials)}")
    print(f"Textures:  {len(gltf.textures)}")
    print(f"Images:    {len(gltf.images)}")

    print()
    print(SEPARATOR)
    print("MATERIALS")
    print(SEPARATOR)

    for index in range(len(gltf.materials)):
        inspect_material(gltf, index)

    inspect_mesh_materials(gltf)

    print()
    print(SEPARATOR)
    print("DONE")
    print(SEPARATOR)


if __name__ == "__main__":
    main()
