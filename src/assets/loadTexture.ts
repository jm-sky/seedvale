import { SRGBColorSpace, Texture, TextureLoader } from 'three'

const loader = new TextureLoader()
const cache = new Map<string, Promise<Texture>>()

/** Load a texture from `/public` (e.g. `/images/clouds/cloud1.png`). Cached by
 *  URL — the returned Texture is shared across every caller; unlike
 *  `loadGltf`'s `SkeletonUtils.clone` there is no per-instance clone, since a
 *  Texture has no instance-varying state a shared reference can't hold.
 *  Explicitly sets `colorSpace` since three.js defaults new textures to
 *  `NoColorSpace`, which reads these color PNGs too flat/washed out. */
export function loadTexture(url: string): Promise<Texture> {
  let pending = cache.get(url)
  if (!pending) {
    pending = loader.loadAsync(url).then((texture) => {
      texture.colorSpace = SRGBColorSpace
      return texture
    })
    cache.set(url, pending)
  }
  return pending
}
