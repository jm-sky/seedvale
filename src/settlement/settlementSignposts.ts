import { type Group, type Object3D, Vector3 } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
import type { SettlementDef } from './settlementGenerator'
import { disposeObject3D } from '../assets/loadGltf'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { minorLocationsFor } from './minorLocations'
import {
  cloneProp,
  createDock,
  createSignpost,
  createVillageNamepost,
  DOCK_SPECS,
  loadPropTemplates,
  placeOnGround,
  type SettlementLandmarks,
  VILLAGE_NAMEPOST_BOARD_CENTER_Y,
} from './props'
import { type RoadNetworkContext, routeToMinorLocation, signpostsForSettlement } from './roadNetwork'

/**
 * Settlement signposts + CSS2D labels (createSettlement refactor review, E1)
 * — owns build + per-frame + dispose for the village namepost, the dock prop
 * + route, directional road signposts, and land-plot sale signs (including
 * their live removal when a plot is bought). Extracted out of
 * `createSettlement.ts` to kill four copies of the same
 * prop+CSS2DObject+label idiom (the fourth being `SettlementsManager
 * .buildMidpointInstance`, which now builds on `createLabeledProp` below
 * too) and to fix the missing quantized DOM-write guard the settlement's own
 * signposts previously lacked.
 *
 * @domain settlements
 * @system settlement-signposts
 * @role Owns build/update/dispose for every settlement prop that pairs a ground-placed mesh with a distance-faded CSS2D label.
 */

export type LabeledProp = {
  prop: Object3D
  labelEl: HTMLDivElement
  label: CSS2DObject
  position: Vector3
  /** Last opacity written to the DOM, quantized — guards the style write. */
  lastOpacity: number
}

/**
 * Ground-places `prop` at (x,z) and attaches an `.npc-label` CSS2DObject at
 * `labelHeight`. Exactly one of `text`/`html` is used. Does not parent `prop`
 * anywhere — the caller adds it to whichever group/scene owns its lifecycle.
 */
export function createLabeledProp(prop: Object3D, opts: {
  x: number
  z: number
  rotationY?: number
  labelHeight: number
  text?: string
  html?: string
  sampleHeight: HeightSampler
}): LabeledProp {
  if (opts.rotationY !== undefined) prop.rotation.y = opts.rotationY
  placeOnGround(prop, opts.x, opts.z, opts.sampleHeight)

  const labelEl = document.createElement('div')
  labelEl.className = 'npc-label'
  if (opts.html !== undefined) labelEl.innerHTML = opts.html
  else labelEl.textContent = opts.text ?? ''
  const label = new CSS2DObject(labelEl)
  label.position.set(0, opts.labelHeight, 0)
  prop.add(label)

  return {
    prop,
    labelEl,
    label,
    position: new Vector3(opts.x, opts.sampleHeight(opts.x, opts.z), opts.z),
    lastOpacity: -1,
  }
}

/** Quantized (1/32) distance fade; skips the DOM write when the quantized
 *  value hasn't changed since the last call — same guard
 *  `SettlementsManager`'s midpoints and `createFauna.ts`'s spawner labels
 *  already use. */
export function updateLabelOpacity(inst: LabeledProp, observerPos: Vector3): void {
  const opacity = Math.round(labelOpacityForDistance(inst.position.distanceTo(observerPos)) * 32) / 32
  if (opacity === inst.lastOpacity) return
  inst.lastOpacity = opacity
  inst.labelEl.style.opacity = String(opacity)
}

/** `disposeProp: true` also frees the prop's GPU resources — use only for a
 *  prop removed mid-life (a bought land plot). Props parented under the
 *  settlement group are freed by `disposeSettlementGroup` instead — pass
 *  nothing (or `disposeProp: false`) for those. */
export function disposeLabeledProp(inst: LabeledProp, opts?: { disposeProp?: boolean }): void {
  inst.label.removeFromParent()
  inst.labelEl.remove()
  if (opts?.disposeProp) {
    disposeObject3D(inst.prop)
    inst.prop.removeFromParent()
  }
}

type LandPlotSignInstance = LabeledProp & { plotId: string }

export type SettlementSignposts = {
  update: (observerPos: Vector3) => void
  dispose: () => void
}

export async function createSettlementSignposts(params: {
  def: SettlementDef
  group: Group
  landmarks: SettlementLandmarks
  sampleHeight: HeightSampler
  roadCtx?: RoadNetworkContext
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean
}): Promise<SettlementSignposts> {
  const { def, group, landmarks, sampleHeight, roadCtx, isLandPlotOwned } = params

  const signposts: LabeledProp[] = []
  const landPlotSigns: LandPlotSignInstance[] = []

  // Name plaque by the well — reuses signpost label fade/dispose path.
  {
    const nameX = landmarks.well.x + 1.35
    const nameZ = landmarks.well.z + 1.05
    const prop = createVillageNamepost()
    const inst = createLabeledProp(prop, {
      x: nameX,
      z: nameZ,
      labelHeight: VILLAGE_NAMEPOST_BOARD_CENTER_Y,
      text: def.name,
      sampleHeight,
    })
    group.add(prop)
    signposts.push(inst)
  }

  if (roadCtx) {
    const [dock] = minorLocationsFor(
      def,
      roadCtx.sampleHeight,
      roadCtx.terrainSamplers.sampleContinentalness,
      roadCtx.region,
      roadCtx.region.roadNetwork.dockSearchRadius,
    )
    if (dock) {
      const dockTemplates = await loadPropTemplates(DOCK_SPECS, () => createDock())
      const dockProp = cloneProp(dockTemplates, 0, 1)
      dockProp.rotation.y = dock.angle
      placeOnGround(dockProp, dock.x, dock.z, sampleHeight)
      group.add(dockProp)
      landmarks.dock = new Vector3(dock.x, dock.y, dock.z)

      const route = routeToMinorLocation(def, 'dock', roadCtx)
      landmarks.dockRoute = route.map((p) => new Vector3(p.x, sampleHeight(p.x, p.z), p.z))
    }

    for (const sp of signpostsForSettlement(def, roadCtx)) {
      const prop = createSignpost()
      const inst = createLabeledProp(prop, {
        x: sp.position.x,
        z: sp.position.z,
        rotationY: sp.angle,
        labelHeight: 2.5,
        text: sp.targetName,
        sampleHeight,
      })
      group.add(prop)
      signposts.push(inst)
    }
  }

  // Sale-plot "NA SPRZEDAŻ" signs (plan 129) — one per unowned `landmarks
  // .landPlots` entry, same signpost prop + CSS2D label idiom as the
  // namepost/directional signs above. Skipped entirely for an already-owned
  // plot so it never comes back after a stream-out/stream-in (plan 129 §14.1).
  for (const plot of landmarks.landPlots) {
    if (isLandPlotOwned?.(def.id, plot.plotId)) continue
    const prop = createSignpost()
    const inst = createLabeledProp(prop, {
      x: plot.position.x,
      z: plot.position.z,
      rotationY: plot.rotation,
      labelHeight: 2.5,
      html: `NA SPRZEDAŻ<br>${plot.price} monet`,
      sampleHeight,
    })
    group.add(prop)
    landPlotSigns.push({ ...inst, plotId: plot.plotId })
  }

  return {
    update(observerPos) {
      for (const sp of signposts) updateLabelOpacity(sp, observerPos)
      // Drop a sale sign the moment its plot is bought (same session — a
      // purchase doesn't tear the settlement down).
      for (let i = landPlotSigns.length - 1; i >= 0; i--) {
        const sign = landPlotSigns[i]!
        if (!isLandPlotOwned?.(def.id, sign.plotId)) {
          updateLabelOpacity(sign, observerPos)
          continue
        }
        disposeLabeledProp(sign, { disposeProp: true })
        landPlotSigns.splice(i, 1)
      }
    },
    dispose() {
      // Labels only — the props themselves are children of `group`, freed by
      // `disposeSettlementGroup(group)`.
      for (const sp of signposts) disposeLabeledProp(sp)
      for (const sign of landPlotSigns) disposeLabeledProp(sign)
    },
  }
}
