import { describe, expect, it } from 'vitest'
import { treeInspectionCanYieldBranch, treeInspectionFlavor } from './treeInspection'

describe('treeInspectionFlavor', () => {
  it('does not mention leaves for harvested stumps', () => {
    for (let i = 0; i < 20; i++) {
      const { speakerName, line } = treeInspectionFlavor('harvested')
      expect(speakerName).toBe('Pień')
      expect(line.toLowerCase()).not.toMatch(/liśc/)
    }
  })

  it('names limbed / felled as Pień', () => {
    expect(treeInspectionFlavor('limbed').speakerName).toBe('Pień')
    expect(treeInspectionFlavor('felled').speakerName).toBe('Pień')
  })
})

describe('treeInspectionCanYieldBranch', () => {
  it('allows living stages only', () => {
    expect(treeInspectionCanYieldBranch('mature')).toBe(true)
    expect(treeInspectionCanYieldBranch('young')).toBe(true)
    expect(treeInspectionCanYieldBranch('limbed')).toBe(false)
    expect(treeInspectionCanYieldBranch('harvested')).toBe(false)
  })
})
