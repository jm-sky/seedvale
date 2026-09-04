import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { setSubtreeCastShadow } from '../world/waterMirror'
import { barsVisibleForDistance, labelOpacityForDistance } from './labelDistance'

/**
 * Shared floating name+stat-bars CSS2D label (plan 202) — `NpcAgent` and
 * `AnimalAgent` both build one above their mesh (name line + a row of
 * percent-fill bars: hp/stamina for both, plus vigor for NPCs or
 * satiety/hydration for fauna) and refresh it every frame with the same
 * "only touch the DOM when the rounded percent/visibility/opacity actually
 * changed" guards. This module owns that shared shape; each caller still
 * owns its own bar set, name text and update cadence.
 */

export type LabelBarKind = 'hp' | 'stamina' | 'vigor' | 'satiety' | 'hydration'

/** One `npc-label__bar--{kind}` bar + its fill div, ready to append into a
 *  `labelBarsEl`. `initialPercent` seeds the fill width before the first
 *  real `update()` call (matches each existing bar's pre-202 default). */
export function createLabelBar(kind: LabelBarKind, initialPercent = 100): { bar: HTMLDivElement, fill: HTMLDivElement } {
  const bar = document.createElement('div')
  bar.className = `npc-label__bar npc-label__bar--${kind}`
  const fill = document.createElement('div')
  fill.className = 'npc-label__bar-fill'
  fill.style.width = `${initialPercent}%`
  bar.appendChild(fill)
  return { bar, fill }
}

export type AgentLabelDom = {
  label: CSS2DObject
  el: HTMLDivElement
  nameEl: HTMLDivElement
  barsEl: HTMLDivElement
}

/** Builds the `.npc-label` DOM tree (name line + a `bars` container) and
 *  wraps it in a `CSS2DObject` positioned at `height` above the mesh
 *  origin — the shared skeleton both `NpcAgent` and `AnimalAgent` construct
 *  in their constructors. `bars` are the already-built `{ bar }` elements
 *  from `createLabelBar`, in display order; a caller that needs to append
 *  more children after the bars (e.g. `NpcAgent`'s debug line) can still do
 *  so via the returned `el`. Does not attach `label` to any mesh or assign
 *  a render layer — callers keep that (their own `mesh.add`/
 *  `assignRenderLayer` call sites differ slightly in ordering). */
export function createAgentLabel(
  initialName: string,
  bars: readonly { bar: HTMLDivElement }[],
  height: number,
): AgentLabelDom {
  const el = document.createElement('div')
  el.className = 'npc-label'

  const nameEl = document.createElement('div')
  nameEl.className = 'npc-label__name'
  nameEl.textContent = initialName

  const barsEl = document.createElement('div')
  barsEl.className = 'npc-label__bars'
  barsEl.append(...bars.map((b) => b.bar))

  el.append(nameEl, barsEl)

  const label = new CSS2DObject(el)
  label.position.set(0, height, 0)

  return { label, el, nameEl, barsEl }
}

/** `current/max` → rounded percent, `0` for a non-positive `max` — shared by
 *  every hp/stamina/vigor bar (not by fauna's satiety/hydration, which are
 *  an inverted 0-1 need with no `max`; those callers round inline). */
export function computeBarPercent(current: number, max: number): number {
  return max > 0 ? Math.round((current / max) * 100) : 0
}

/** Writes `fill`'s width only when `percent` actually differs from the
 *  caller-owned `lastPercent` (the raw ratio drifts by a hair every frame
 *  during regen/drain, so comparing the already-rounded percent is what
 *  actually catches a no-op frame) — returns the value to store back into
 *  that field. */
export function applyBarPercent(fill: HTMLDivElement, percent: number, lastPercent: number): number {
  if (percent !== lastPercent) fill.style.width = `${percent}%`
  return percent
}

/** Distance-derived visibility/shadow/opacity state a label tracks between
 *  frames — one combined field replacing the three separate `last*`
 *  booleans/numbers each caller used to keep. */
export type LabelDistanceState = {
  barsVisible: boolean | null
  shadowCasting: boolean | null
  opacity: number
}

export const INITIAL_LABEL_DISTANCE_STATE: LabelDistanceState = {
  barsVisible: null,
  shadowCasting: null,
  opacity: -1,
}

/**
 * Full label controller (review 2026-09-03 §5 E6) — the constructor-time
 * wiring + per-frame `sync()` guard logic both `NpcAgent` and `AnimalAgent`
 * hand-roll today, collapsed into one object. Owns name text, an arbitrary
 * set of percent-fill bars, the distance-based visibility/opacity rules
 * above, and (optionally) a debug line — everything below `createAgentLabel`
 * in the shared shape. A caller with presentation state beyond this (e.g.
 * `NpcAgent`'s highlight glow) still reaches `el`/`label` directly.
 */
export type AgentStatusLabelController = {
  label: CSS2DObject
  el: HTMLDivElement
  /** Guarded against the last-written text — a no-op DOM write when
   *  unchanged, same as every other field here. */
  setName: (text: string) => void
  /** `null` hides the debug line (and skips the text guard/write); a string
   *  shows it, guarded against the last-written text. Callers own deciding
   *  *when* a debug line applies (e.g. `isDebugMode()`) — this only ever
   *  renders what it's given. */
  setDebugLine: (text: string | null) => void
  /** One frame's worth of presentation updates — bar percents (only the
   *  kinds passed are touched; a controller built with fewer bar kinds than
   *  `bars` here simply ignores the extras), then the shared distance/
   *  opacity/shadow rule. `gazeFactor` defaults to `1` (fauna's case; NPCs
   *  pass their own gaze-highlight factor). */
  sync: (
    bars: Partial<Record<LabelBarKind, { current: number, max: number }>>,
    mesh: THREE.Object3D,
    distance: number,
    shadowDistance: number,
    gazeFactor?: number,
  ) => void
  /** Resets the bars-hidden/hp-zeroed presentation a death/despawn wants
   *  (mirrors `NpcAgent`'s pre-202 die() label reset) — `hp` alone, since
   *  that's the only bar every caller zeroes on death. */
  settleAtZeroHp: () => void
  dispose: () => void
}

/** Builds the full label (`createAgentLabel` + one `createLabelBar` per
 *  requested kind) and wraps it with the guarded `setName`/`setDebugLine`/
 *  `sync` behavior above. `bars` order is display order, matching
 *  `createAgentLabel`'s existing contract. */
export function createAgentStatusLabelController(
  name: string,
  bars: readonly LabelBarKind[],
  height: number,
): AgentStatusLabelController {
  const builtBars = bars.map((kind) => ({ kind, ...createLabelBar(kind) }))
  const labelDom = createAgentLabel(name, builtBars, height)
  const fillByKind = new Map<LabelBarKind, HTMLDivElement>(builtBars.map((b) => [b.kind, b.fill]))
  const lastPercentByKind = new Map<LabelBarKind, number>(builtBars.map((b) => [b.kind, -1]))

  const debugEl = document.createElement('div')
  debugEl.className = 'npc-label__debug'
  debugEl.style.display = 'none'
  labelDom.el.append(debugEl)

  let lastName = name
  let lastDebugText = ''
  let distanceState = INITIAL_LABEL_DISTANCE_STATE

  return {
    label: labelDom.label,
    el: labelDom.el,
    setName: (text) => {
      if (text === lastName) return
      lastName = text
      labelDom.nameEl.textContent = text
    },
    setDebugLine: (text) => {
      if (text === null) {
        if (debugEl.style.display !== 'none') debugEl.style.display = 'none'
        return
      }
      if (debugEl.style.display === 'none') debugEl.style.display = ''
      if (text !== lastDebugText) {
        lastDebugText = text
        debugEl.textContent = text
      }
    },
    sync: (barValues, mesh, distance, shadowDistance, gazeFactor = 1) => {
      for (const [kind, fill] of fillByKind) {
        const value = barValues[kind]
        if (!value) continue
        const percent = computeBarPercent(value.current, value.max)
        lastPercentByKind.set(kind, applyBarPercent(fill, percent, lastPercentByKind.get(kind) ?? -1))
      }
      distanceState = updateAgentLabelDistanceState(
        labelDom.el,
        labelDom.barsEl,
        mesh,
        distance,
        shadowDistance,
        distanceState,
        gazeFactor,
      )
    },
    settleAtZeroHp: () => {
      lastPercentByKind.set('hp', 0)
      const hpFill = fillByKind.get('hp')
      if (hpFill) hpFill.style.width = '0%'
      labelDom.barsEl.style.display = 'none'
    },
    dispose: () => {
      labelDom.label.removeFromParent()
      labelDom.el.remove()
    },
  }
}

/** Applies the shared distance-based presentation rules (bars hidden past
 *  `labelDistance.ts`'s fade-near radius, mesh shadow-casting gated by
 *  `shadowDistance`, name/bars opacity fading to 0 by the fade-far radius —
 *  optionally scaled by an NPC-only `gazeFactor`) — write-if-changed against
 *  `prev`, same guard shape as `applyBarPercent`. Returns the new state to
 *  store back into the caller's own field. */
export function updateAgentLabelDistanceState(
  el: HTMLDivElement,
  barsEl: HTMLDivElement,
  mesh: THREE.Object3D,
  distance: number,
  shadowDistance: number,
  prev: LabelDistanceState,
  gazeFactor = 1,
): LabelDistanceState {
  const showBars = barsVisibleForDistance(distance)
  if (showBars !== prev.barsVisible) barsEl.style.display = showBars ? '' : 'none'

  const shadowCasting = distance <= shadowDistance
  if (shadowCasting !== prev.shadowCasting) setSubtreeCastShadow(mesh, shadowCasting)

  // Quantized before comparing — `distance`/`gazeFactor` change by a hair
  // every frame while the observer moves, so an unrounded guard never
  // catches a repeat.
  const opacity = Math.round(labelOpacityForDistance(distance) * gazeFactor * 32) / 32
  if (opacity !== prev.opacity) {
    el.style.opacity = String(opacity)
    // At full visibility bars sit at 80%; once the shared label fades,
    // inherit the parent opacity without an extra dimming factor.
    barsEl.style.opacity = opacity === 1 ? '0.8' : '1'
  }

  return { barsVisible: showBars, shadowCasting, opacity }
}
