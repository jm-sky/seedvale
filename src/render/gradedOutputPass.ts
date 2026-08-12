import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

/** `OutputPass`'s own fragment shader (`OutputShader.fragmentShader`,
 *  `three/examples/jsm/shaders/OutputShader.js`) with the grade+dither logic
 *  from the former standalone `filmGradeShader.ts` pass appended after tone
 *  mapping / color space conversion — same math, same place in the pipeline
 *  (display-referred color), just folded into the pass that already reads
 *  and writes the full framebuffer once, instead of paying for that a second
 *  time in a separate `ShaderPass` right after (perf review A3.1). The
 *  `#include` directives and tone-mapping/color-space branches are copied
 *  verbatim from `OutputShader` — `OutputPass.render()` still owns rebuilding
 *  `material.defines` from `renderer.toneMapping`/`renderer.outputColorSpace`
 *  and setting `toneMappingExposure`, so that part is untouched. */
const GRADED_OUTPUT_FRAGMENT_SHADER = /* glsl */`

	precision highp float;

	uniform sampler2D tDiffuse;
	uniform float filmGradeIntensity;

	#include <tonemapping_pars_fragment>
	#include <colorspace_pars_fragment>

	varying vec2 vUv;

	// 4×4 Bayer without a dynamically indexed array (safer across GLSL ES).
	float bayer4( vec2 p ) {
		float x = mod( floor( p.x ), 4.0 );
		float y = mod( floor( p.y ), 4.0 );
		return ( mod( 8.0 * x + 2.0 * y + mod( x + 2.0 * y, 4.0 ) * 4.0, 16.0 ) / 16.0 ) - 0.5;
	}

	void main() {

		gl_FragColor = texture2D( tDiffuse, vUv );

		// tone mapping

		#ifdef LINEAR_TONE_MAPPING

			gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

		#elif defined( REINHARD_TONE_MAPPING )

			gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

		#elif defined( CINEON_TONE_MAPPING )

			gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

		#elif defined( ACES_FILMIC_TONE_MAPPING )

			gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

		#elif defined( AGX_TONE_MAPPING )

			gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

		#elif defined( NEUTRAL_TONE_MAPPING )

			gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

		#elif defined( CUSTOM_TONE_MAPPING )

			gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

		#endif

		// color space

		#ifdef SRGB_TRANSFER

			gl_FragColor = sRGBTransferOETF( gl_FragColor );

		#endif

		// Film grade + dither (formerly a separate ShaderPass, filmGradeShader.ts) —
		// mild saturation/contrast nudge with a soft highlight shoulder, plus an
		// ~1/255 ordered dither to break 8-bit banding in sky/fog gradients.
		{
			vec3 c = gl_FragColor.rgb;
			float luma = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
			vec3 graded = mix( vec3( luma ), c, 1.04 );
			graded = ( graded - 0.5 ) * 1.03 + 0.5;
			float peak = max( graded.r, max( graded.g, graded.b ) );
			graded *= mix( 1.0, 0.9, smoothstep( 0.72, 1.0, peak ) );
			graded.r += 0.006;
			graded.b -= 0.004;
			c = mix( c, clamp( graded, 0.0, 1.0 ), filmGradeIntensity );
			float dither = bayer4( gl_FragCoord.xy ) * ( 1.0 / 255.0 ) * filmGradeIntensity;
			c += dither;
			gl_FragColor.rgb = clamp( c, 0.0, 1.0 );
		}

	}`

/** `OutputPass` with the film-grade pass folded in — see
 *  `GRADED_OUTPUT_FRAGMENT_SHADER`. Drop-in replacement: same `render()`/
 *  `dispose()`/`setSize` behavior, `uniforms.filmGradeIntensity` in place of
 *  the old `filmGradePass.uniforms.intensity`. */
export function createGradedOutputPass(): OutputPass {
  const pass = new OutputPass()
  pass.uniforms.filmGradeIntensity = { value: 1 }
  pass.material.fragmentShader = GRADED_OUTPUT_FRAGMENT_SHADER
  pass.material.needsUpdate = true
  return pass
}
