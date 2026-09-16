import { describe, expect, it } from 'vitest'
import { createGradedOutputPass } from './gradedOutputPass'

describe('createGradedOutputPass', () => {
  it('folds film grade into a single OutputPass fragment shader', () => {
    const pass = createGradedOutputPass()
    const fs = pass.material.fragmentShader
    expect(fs.match(/texture2D\s*\(\s*tDiffuse/g)?.length).toBe(1)
    expect(fs).toContain('bayer4')
    expect(fs).toContain('filmGradeIntensity')
    expect(fs).toContain('#include <tonemapping_pars_fragment>')
    expect(fs).toContain('#include <colorspace_pars_fragment>')
    pass.dispose()
  })
})
