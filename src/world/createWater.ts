import {
  Color,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
} from 'three'

export type WorldWater = {
  mesh: Mesh
  setLevel: (y: number) => void
  update: (dt: number) => void
  addTo: (scene: Scene) => void
  dispose: () => void
}

/**
 * Stylized water plane — gentle waves + fresnel (pasuje do low-poly lepiej niż Water.js).
 */
export function createWater(size: number, level: number): WorldWater {
  const geometry = new PlaneGeometry(size * 1.15, size * 1.15, 64, 64)
  geometry.rotateX(-Math.PI / 2)

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new Color(0x1a4d6b) },
      uShallow: { value: new Color(0x4fa3c8) },
      uFoam: { value: new Color(0xc8e8f4) },
      uOpacity: { value: 0.78 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying float vWave;
      varying vec3 vWorldPos;
      varying vec3 vViewDir;

      void main() {
        vec3 pos = position;
        float w1 = sin(pos.x * 0.18 + uTime * 1.1) * 0.12;
        float w2 = cos(pos.z * 0.22 + uTime * 0.85) * 0.1;
        float w3 = sin((pos.x + pos.z) * 0.09 + uTime * 0.6) * 0.08;
        vWave = w1 + w2 + w3;
        pos.y += vWave;

        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorldPos = world.xyz;
        vViewDir = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      uniform float uOpacity;
      varying float vWave;
      varying vec3 vViewDir;

      void main() {
        float fresnel = pow(1.0 - max(dot(normalize(vViewDir), vec3(0.0, 1.0, 0.0)), 0.0), 2.2);
        vec3 col = mix(uDeep, uShallow, fresnel);
        float foam = smoothstep(0.18, 0.28, vWave);
        col = mix(col, uFoam, foam * 0.35);
        float alpha = mix(uOpacity, 0.92, fresnel);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  })

  const mesh = new Mesh(geometry, material)
  mesh.position.y = level + 0.02
  mesh.renderOrder = 1
  mesh.name = 'water'

  return {
    mesh,
    setLevel(y) {
      mesh.position.y = y + 0.02
    },
    update(dt) {
      material.uniforms.uTime!.value += dt
    },
    addTo(scene) {
      scene.add(mesh)
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      mesh.removeFromParent()
    },
  }
}
