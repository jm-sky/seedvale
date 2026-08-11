import type { IUniform } from 'three'

/**
 * Full-screen pass after `OutputPass` (display-referred / tonemapped color):
 * subtle contrast + saturation nudge, then ordered dither to break banding in
 * sky/fog gradients (plan 066 — especially visible on mobile 8-bit panels).
 */
export const FilmGradeShader: {
  name: string
  uniforms: Record<string, IUniform>
  vertexShader: string
  fragmentShader: string
} = {
  name: 'FilmGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    // 0 = bypass, 1 = full grade+dither strength as authored below.
    intensity: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    varying vec2 vUv;

    // 4×4 Bayer without a dynamically indexed array (safer across GLSL ES).
    float bayer4( vec2 p ) {
      float x = mod( floor( p.x ), 4.0 );
      float y = mod( floor( p.y ), 4.0 );
      return ( mod( 8.0 * x + 2.0 * y + mod( x + 2.0 * y, 4.0 ) * 4.0, 16.0 ) / 16.0 ) - 0.5;
    }

    void main() {
      vec4 tex = texture2D( tDiffuse, vUv );
      vec3 c = tex.rgb;

      // Mild saturation + soft contrast — avoid expanding highlights into a
      // clipped white dome (midday whiteout on plan 066 screenshots).
      float luma = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
      vec3 graded = mix( vec3( luma ), c, 1.04 );
      graded = ( graded - 0.5 ) * 1.03 + 0.5;
      // Soft shoulder: pull the brightest pixels back a touch.
      float peak = max( graded.r, max( graded.g, graded.b ) );
      graded *= mix( 1.0, 0.9, smoothstep( 0.72, 1.0, peak ) );
      // Tiny warm mid bias (not a purple/teal LUT).
      graded.r += 0.006;
      graded.b -= 0.004;

      c = mix( c, clamp( graded, 0.0, 1.0 ), intensity );

      // ~1/255 dither — enough to break smooth sky bands, not visible grain.
      float dither = bayer4( gl_FragCoord.xy ) * ( 1.0 / 255.0 ) * intensity;
      c += dither;

      gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), tex.a );
    }
  `,
}
