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
    exposure: { value: 0.22 },
    decay: { value: 0.95 },
    density: { value: 0.9 },
    // Kept modest so shafts read as streaks, not a full-frame lift when many
    // samples hit HDR sky (see issue 016 — mountain whiteout).
    weight: { value: 0.4 },
    // Above typical day-fog luminance so fogged horizons don't feed the rays.
    threshold: { value: 0.75 },
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

      // Near lightPosition (or with a sky-heavy frame from a ridge), many
      // samples hit the same bright, not-yet-tonemapped sky — the geometric
      // series can exceed ~3× before exposure. A high per-pixel cap (0.8)
      // still washed the whole frame white on mountains (issue 016); keep
      // shafts as a local glow, not a screen-wide lift.
      vec3 rays = min(accumulated * exposure * intensity, vec3(0.2));
      gl_FragColor = vec4(base.rgb + rays, base.a);
    }`,
}
