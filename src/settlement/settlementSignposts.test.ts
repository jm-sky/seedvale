// @vitest-environment jsdom
import { Group, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { SettlementLandmarks, SettlementLandPlot } from './props'
import type { SettlementDef } from './settlementGenerator'
import { createLabeledProp, createSettlementSignposts, updateLabelOpacity } from './settlementSignposts'

const sampleHeight = () => 0

function fakeDef(id = 'settlement:0:0'): SettlementDef {
  return { id, name: 'Testowo' } as unknown as SettlementDef
}

function fakePlot(overrides: Partial<SettlementLandPlot> = {}): SettlementLandPlot {
  return {
    plotId: 'plot-0',
    position: new Vector3(5, 0, 5),
    rotation: 0,
    price: 100,
    ...overrides,
  }
}

function fakeLandmarks(landPlots: SettlementLandPlot[] = []): SettlementLandmarks {
  return {
    well: new Vector3(0, 0, 0),
    landPlots,
    dockRoute: [],
  } as unknown as SettlementLandmarks
}

/** Counts live `.npc-label` CSS2DObjects under `group` — a CSS2DObject's DOM
 *  element is only ever inserted into the page by `CSS2DRenderer.render()`,
 *  which nothing in this unit test drives, so `document.querySelectorAll`
 *  would always read empty. Walking the Three.js graph is the actual signal. */
function countNpcLabels(group: Group): number {
  let count = 0
  group.traverse((obj) => {
    const css2d = obj as unknown as { isCSS2DObject?: boolean, element?: HTMLElement }
    if (css2d.isCSS2DObject && css2d.element?.className === 'npc-label') count++
  })
  return count
}

describe('createLabeledProp / updateLabelOpacity', () => {
  it('does not write to the DOM when the quantized opacity is unchanged', () => {
    const group = new Group()
    const inst = createLabeledProp(group, { x: 0, z: 0, labelHeight: 2, text: 'x', sampleHeight })
    updateLabelOpacity(inst, new Vector3(0, 0, 0))
    const lastOpacityAfterFirst = inst.lastOpacity
    // Sentinel value — if the guard fails, the write below would overwrite it.
    inst.labelEl.style.opacity = '0.4242'
    // A tiny movement that quantizes to the same 1/32 bucket must not touch the DOM.
    updateLabelOpacity(inst, new Vector3(0.0001, 0, 0))
    expect(inst.lastOpacity).toBe(lastOpacityAfterFirst)
    expect(inst.labelEl.style.opacity).toBe('0.4242')
  })
})

describe('createSettlementSignposts (no roadCtx)', () => {
  it('creates no sign for an already-owned plot', async () => {
    const group = new Group()
    const landmarks = fakeLandmarks([fakePlot()])
    const signposts = await createSettlementSignposts({
      def: fakeDef(),
      group,
      landmarks,
      sampleHeight,
      isLandPlotOwned: () => true,
    })
    // Namepost only — no land-plot sign.
    expect(countNpcLabels(group)).toBe(1)
    signposts.dispose()
  })

  it('creates a sign for an unowned plot', async () => {
    const group = new Group()
    const landmarks = fakeLandmarks([fakePlot()])
    const signposts = await createSettlementSignposts({
      def: fakeDef(),
      group,
      landmarks,
      sampleHeight,
      isLandPlotOwned: () => false,
    })
    // Namepost + one land-plot sign.
    expect(countNpcLabels(group)).toBe(2)
    signposts.dispose()
  })

  it('removes the sign on the first update() after ownership flips', async () => {
    const group = new Group()
    const landmarks = fakeLandmarks([fakePlot()])
    let owned = false
    const signposts = await createSettlementSignposts({
      def: fakeDef(),
      group,
      landmarks,
      sampleHeight,
      isLandPlotOwned: () => owned,
    })
    expect(countNpcLabels(group)).toBe(2)

    owned = true
    signposts.update(new Vector3(0, 0, 0))
    expect(countNpcLabels(group)).toBe(1)
    signposts.dispose()
  })

  it('dispose() removes every .npc-label it created', async () => {
    const group = new Group()
    const landmarks = fakeLandmarks([fakePlot({ plotId: 'a' }), fakePlot({ plotId: 'b', position: new Vector3(-5, 0, -5) })])
    const before = countNpcLabels(group)
    const signposts = await createSettlementSignposts({
      def: fakeDef(),
      group,
      landmarks,
      sampleHeight,
      isLandPlotOwned: () => false,
    })
    expect(countNpcLabels(group)).toBe(before + 3)
    signposts.dispose()
    expect(countNpcLabels(group)).toBe(before)
  })
})
