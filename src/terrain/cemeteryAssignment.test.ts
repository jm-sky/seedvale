import { beforeEach, describe, expect, it } from 'vitest'
import type { SettlementCell } from '../settlement/settlementGenerator'
import type { CemeterySettlementRef } from './cemeteryAssignment'
import {
  cemeteryAssignmentId,
  cemeteryIdForAssignment,
  clearCemeteryCaches,
  resolveCemeteryTopologyForSettlement,
  resolveSmSharePartner,
  servedSettlementIdsForCemeteryId,
  SM_SHARING_MAX_DISTANCE,
} from './cemeteryAssignment'

function ref(id: string, gx: number, gz: number, size: 'SM' | 'MD' | 'LG' | 'XL' = 'SM'): CemeterySettlementRef {
  return { id, gx, gz, x: gx * 280, z: gz * 280, size }
}

function peekMap(refs: CemeterySettlementRef[]) {
  const map = new Map(refs.map((r) => [`${r.gx}_${r.gz}`, r]))
  return (cell: SettlementCell) => map.get(`${cell.gx}_${cell.gz}`) ?? null
}

describe('cemeteryAssignment (world-terrain-016)', () => {
  beforeEach(() => clearCemeteryCaches())

  it('pairs nearby SM settlements mutually and symmetrically', () => {
    const a = ref('0_0', 0, 0, 'SM')
    const b = ref('1_0', 1, 0, 'SM')
    const peek = peekMap([a, b])
    expect(resolveSmSharePartner(a, peek)?.id).toBe('1_0')
    expect(resolveSmSharePartner(b, peek)?.id).toBe('0_0')
    const topoA = resolveCemeteryTopologyForSettlement('0_0', peek)!
    const topoB = resolveCemeteryTopologyForSettlement('1_0', peek)!
    expect(topoA.intent).toBe('shared')
    expect(topoB.assignmentId).toBe(topoA.assignmentId)
    expect(topoA.servedSettlementIds).toEqual(['0_0', '1_0'])
  })

  it('is order-independent for shared SM pairing', () => {
    const a = ref('0_0', 0, 0, 'SM')
    const b = ref('1_0', 1, 0, 'SM')
    const peek = peekMap([a, b])
    const first = resolveCemeteryTopologyForSettlement('0_0', peek)!
    clearCemeteryCaches()
    const second = resolveCemeteryTopologyForSettlement('1_0', peek)!
    expect(first.assignmentId).toBe(second.assignmentId)
  })

  it('keeps MD/LG/XL dedicated and out of sharing', () => {
    const sm = ref('0_0', 0, 0, 'SM')
    const md = ref('1_0', 1, 0, 'MD')
    const peek = peekMap([sm, md])
    const mdTopo = resolveCemeteryTopologyForSettlement('1_0', peek)!
    expect(mdTopo.intent).toBe('dedicated')
    expect(mdTopo.servedSettlementIds).toEqual(['1_0'])
    expect(resolveSmSharePartner(md, peek)).toBeNull()
  })

  it('does not pair SM settlements beyond sharing distance', () => {
    const a = ref('0_0', 0, 0, 'SM')
    const far = ref('2_0', 2, 0, 'SM')
    far.x = SM_SHARING_MAX_DISTANCE + 20
    const peek = peekMap([a, far])
    expect(resolveSmSharePartner(a, peek)).toBeNull()
  })

  it('derives stable cemetery ids and reverse lookup', () => {
    const assignmentId = cemeteryAssignmentId(['0_0', '1_0'])
    const cemeteryId = cemeteryIdForAssignment(assignmentId, 42)
    expect(cemeteryId.startsWith('cemetery:a:0_0+1_0:')).toBe(true)
    expect(servedSettlementIdsForCemeteryId(cemeteryId)).toEqual(['0_0', '1_0'])
    expect(servedSettlementIdsForCemeteryId('cemetery:w:1:2:0:abc')).toEqual([])
  })
})
