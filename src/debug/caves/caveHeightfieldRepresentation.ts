/** Debug harness re-export of the production cave heightfield representation.
 *
 *  The algorithm lives in `src/world/caves/caveHeightfieldRepresentation.ts`.
 *  This module keeps the spike names (`CaveHeightfield`, `buildCaveHeightfield`)
 *  so the `?caveHeightfieldTest` harness does not fork a second implementation.
 *
 * @domain world-terrain
 */

export {
  APERTURE_LIFT,
  BETA,
  buildCaveHeightfieldRepresentation as buildCaveHeightfield,
  buildChamberLobes,
  buildEntranceInfluence,
  closure,
  crossSectionAt,
  DEFAULT_HEIGHTFIELD_CONFIG,
  ENTRANCE_INWARD,
  ENTRANCE_OUTWARD,
  FAR_GAP,
  heightfieldGapGradient,
  heightfieldNodeGap,
  heightfieldNodeIndex,
  heightfieldNodeOpenSky,
  heightfieldNodePosition,
  KAPPA,
  mouthOpeningAt,
  NC,
  NF,
  OUTSIDE_REACH,
  R_MIN,
  resampleSegmentStations,
  RIM_ASPECT,
  RIM_BAND_MAX,
  RIM_BAND_MIN,
  rimBand,
  sampleHeightfieldAt,
  SMOOTH_K,
  U_CORE,
  U_FADE,
} from '../../world/caves/caveHeightfieldRepresentation'
export type {
  CaveHeightfieldRepresentation as CaveHeightfield,
  CaveHeightfieldBounds,
  CaveHeightfieldBuildResult,
  CaveHeightfieldConfig,
  HeightfieldSample,
  HeightfieldStation,
  NoiseOctave2D,
  SurfaceSampler,
} from '../../world/caves/caveHeightfieldRepresentation'
