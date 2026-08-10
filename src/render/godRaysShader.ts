import { Vector2 } from 'three'

/**
 * Screen-space crepuscular rays (radial blur toward the sun's projected
 * screen position, weighted by a bright-pass threshold). No occlusion buffer
 * — terrain/objects in front of the sun are already dark in `tDiffuse`, so
 * they contribute ~0 to the accumulation and read as naturally occluding the
 * rays. Cheap approximation, not physically-based volumetric lighting.
 */
export const GodRaysShader = {
  name: 'GodRaysShader',

  uniforms: {
    tDiffuse: { value: null },
    lightPosition: { value: new Vector2(0.5, 0.5) },
    exposure: { value: 0.35 },
    decay: { value: 0.95 },
    density: { value: 0.9 },
    weight: { value: 0.6 },
    threshold: { value: 0.6 },
    /** Overall fade — 0 while the sun is below/far from the horizon or off
     *  screen, so the sample loop below is wasted work only near dawn/dusk. */
    intensity: { value: 0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 lightPosition;
    uniform float exposure;
    uniform float decay;
    uniform float density;
    uniform float weight;
    uniform float threshold;
    uniform float intensity;
    varying vec2 vUv;

    const int NUM_SAMPLES = 32;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);

      if (intensity <= 0.001) {
        gl_FragColor = base;
        return;
      }

      vec2 deltaTexCoord = (vUv - lightPosition) * (density / float(NUM_SAMPLES));
      vec2 coord = vUv;
      float illuminationDecay = 1.0;
      vec3 accumulated = vec3(0.0);

      for (int i = 0; i < NUM_SAMPLES; i++) {
        coord -= deltaTexCoord;
        vec3 samp = texture2D(tDiffuse, coord).rgb;
        float lum = dot(samp, vec3(0.299, 0.587, 0.114));
        float bright = smoothstep(threshold, threshold + 0.2, lum);
        accumulated += samp * bright * illuminationDecay * weight;
        illuminationDecay *= decay;
      }

      // Near lightPosition itself (looking straight at/near the sun),
      // deltaTexCoord shrinks toward zero and every sample lands on
      // (near-)the same bright, not-yet-tonemapped sky pixel — accumulating
      // 32 of those unclamped blew the whole screen out to white/grey ("walk
      // into the ray and see nothing"). Capped so the rays stay a glow, not
      // a full-screen wash, at any viewing angle.
      vec3 rays = min(accumulated * exposure * intensity, vec3(0.8));
      gl_FragColor = vec4(base.rgb + rays, base.a);
    }`,
}
