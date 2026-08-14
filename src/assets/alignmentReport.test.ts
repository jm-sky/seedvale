import { describe, expect, it } from 'vitest'
import {
  ALIGNED_POSITION_EPSILON_M,
  ALIGNED_ROTATION_EPSILON_DEG,
  buildAlignmentReport,
  computeAlignmentStatus,
  formatAlignmentReport,
  groundContactVerdict,
} from './alignmentReport'

describe('alignmentReport', () => {
  it('formats deterministic snapshot text', () => {
    const report = buildAlignmentReport({
      mode: 'pair',
      status: 'ALIGNED',
      referenceAssetId: 'character:player',
      targetAssetId: 'held:axe',
      referenceUrl: '/models/characters/Adventurer.glb',
      targetUrl: '/models/items/axe.glb',
      referenceAnchor: 'hand.right',
      targetAnchor: 'origin',
      pose: 'rest',
      rendering: { mode: 'diagnostic', preset: 'alignment', timeOfDay: null, composerActive: false },
      referenceRoot: {
        position: [0, 0, 0],
        rotationDeg: [0, 0, 0],
        scale: [1, 1, 1],
      },
      targetRoot: {
        position: [0.1, 0, 0],
        rotationDeg: [0, 45, 0],
        scale: [1, 1, 1],
      },
      delta: {
        positionM: [0, 0, 0],
        positionDistanceM: 0,
        rotationDeg: 0,
        orientationKnown: true,
      },
      bounds: {
        min: [0, 0, 0],
        max: [1, 1, 1],
        size: [1, 1, 1],
        center: [0.5, 0.5, 0.5],
        minY: 0,
      },
      groundContact: { verdict: 'ok', offsetM: 0 },
      anchors: [{
        name: 'origin',
        type: 'origin',
        source: 'synthetic',
        space: 'assetLocal',
        node: null,
        hasOrientation: false,
        localPosition: [0, 0, 0],
        localRotationDeg: null,
        worldPosition: [0, 0, 0],
        worldRotationDeg: null,
      }],
      issues: [],
      warnings: [],
    })

    const text = formatAlignmentReport(report)
    expect(text).toContain('alignment_report_version: 1')
    expect(text).toContain('status: ALIGNED')
    expect(text).toContain('position_m: [0.000, 0.000, 0.000]')
    expect(text).toContain('available_anchors:')
    expect(formatAlignmentReport(report)).toBe(text)
  })

  it('prints per-slot native and prepared AABB', () => {
    const report = buildAlignmentReport({
      mode: 'single',
      status: 'SINGLE_ASSET',
      referenceAssetId: 'parked:settlement/megakit/wall_plaster_straight',
      referenceBounds: {
        prepare: 'none',
        status: 'parked',
        pack: 'megakit',
        kind: 'wall',
        nativeSize: [2, 3.12, 0.41],
        preparedSize: [2, 3.12, 0.41],
        min: [-1, 0, -0.205],
        max: [1, 3.12, 0.205],
        size: [2, 3.12, 0.41],
        center: [0, 1.56, 0],
        minY: 0,
        triangles: 86,
        materials: ['MI_Plaster', 'MI_WoodTrim'],
        clipCount: 0,
      },
    })
    const text = formatAlignmentReport(report)
    expect(text).toContain('reference_bounds:')
    expect(text).toContain('native_size_m: [2.000, 3.120, 0.410]')
    expect(text).toContain('prepared_size_m: [2.000, 3.120, 0.410]')
    expect(text).toContain('status: parked')
    expect(text).toContain('pack: megakit')
    expect(text).not.toContain('\nbounds:')
  })

  it('computes ALIGNED/MISALIGNED thresholds', () => {
    expect(computeAlignmentStatus(0, 0, true)).toBe('ALIGNED')
    expect(computeAlignmentStatus(ALIGNED_POSITION_EPSILON_M, 0, true)).toBe('ALIGNED')
    expect(computeAlignmentStatus(ALIGNED_POSITION_EPSILON_M + 0.01, 0, true)).toBe('MISALIGNED')
    expect(computeAlignmentStatus(0, ALIGNED_ROTATION_EPSILON_DEG, true)).toBe('ALIGNED')
    expect(computeAlignmentStatus(0, ALIGNED_ROTATION_EPSILON_DEG + 1, true)).toBe('MISALIGNED')
  })

  it('reports ground contact verdicts', () => {
    expect(groundContactVerdict(0).verdict).toBe('ok')
    expect(groundContactVerdict(0.043).verdict).toBe('floating')
    expect(groundContactVerdict(-0.012).verdict).toBe('sunken')
  })
})
