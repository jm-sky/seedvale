import { describe, expect, it } from 'vitest'
import { treeInspectionCanYieldBranch, treeInspectionFlavor } from './treeInspection'

describe('treeInspectionFlavor', () => {
  it('does not mention leaves for harvested stumps', () => {
    for (let i = 0; i < 20; i++) {
      const { speakerName, line } = treeInspectionFlavor('harvested', 'medium')
      expect(speakerName).toBe('Pień')
      expect(line.toLowerCase()).not.toMatch(/liśc/)
    }
  })

  it('names limbed / felled as Pień', () => {
    expect(treeInspectionFlavor('limbed', 'large').speakerName).toBe('Pień')
    expect(treeInspectionFlavor('felled', 'small').speakerName).toBe('Pień')
  })

  it('mixes age and sizeClass in living lines', () => {
    const youngLarge = treeInspectionFlavor('young', 'large').line.toLowerCase()
    expect(youngLarge).toMatch(/młod|duż|olbrzym|kolos|gatunku/)

    const matureSmall = treeInspectionFlavor('mature', 'small').line.toLowerCase()
    expect(matureSmall).toMatch(/mał|wiśni|nisk|skrom|ogrodu|głow/)

    expect(treeInspectionFlavor('mature', 'small').speakerName).toBe('Małe drzewo')
    expect(treeInspectionFlavor('old', 'large').speakerName).toBe('Stare drzewo')
    expect(treeInspectionFlavor('sapling', 'medium').speakerName).toBe('Drzewko')
  })
})

describe('treeInspectionCanYieldBranch', () => {
  it('allows living stages only', () => {
    expect(treeInspectionCanYieldBranch('mature')).toBe(true)
    expect(treeInspectionCanYieldBranch('old')).toBe(true)
    expect(treeInspectionCanYieldBranch('young')).toBe(true)
    expect(treeInspectionCanYieldBranch('limbed')).toBe(false)
    expect(treeInspectionCanYieldBranch('harvested')).toBe(false)
  })
})
