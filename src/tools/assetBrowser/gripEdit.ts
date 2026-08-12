import { reactive } from 'vue'
import type { HeldAttach } from '../../items/heldToolVisual'
import type { ItemKind } from '../../items/items'
import { isToolKind } from '../../items/HeldTool'
import {
  BRANCH_HELD_ATTACH,
  HELD_ATTACH,
} from '../../items/heldToolVisual'

/** Browser-only grips for held catalog entries that are not yet `ToolKind`. */
export const BROWSER_PROVISIONAL_ATTACH: Readonly<Record<string, HeldAttach>> = {
  // Y-up blade — same pitch/roll family as recalibrated shovel. Browser-only for now.
  'held:long_sword': {
    position: [0.02, 0.12, -0.02],
    rotation: [Math.PI / 2, 0, -Math.PI / 2.6],
    scale: 1,
    gripLocalOffset: [0, -0.25, 0],
  },
}

export type GripEditValues = {
  position: [number, number, number]
  rotationDeg: [number, number, number]
  scale: number
  gripLocalOffset: [number, number, number]
}

export type GripEditState = {
  /** True when target is a held tool with an editable attach. */
  active: boolean
  /** Asset id currently driving the editor (`held:knife`, …). */
  sourceId: string | null
  /** Bumps when values change so the viewer can remount. */
  revision: number
} & GripEditValues

export const gripEdit = reactive<GripEditState>({
  active: false,
  sourceId: null,
  position: [0, 0, 0],
  rotationDeg: [0, 0, 0],
  scale: 1,
  gripLocalOffset: [0, 0, 0],
  revision: 0,
})

function radToDeg(r: number): number {
  return (r * 180) / Math.PI
}

function degToRad(d: number): number {
  return (d * Math.PI) / 180
}

function fromAttach(a: HeldAttach): GripEditValues {
  return {
    position: [a.position[0], a.position[1], a.position[2]],
    rotationDeg: [
      radToDeg(a.rotation[0]),
      radToDeg(a.rotation[1]),
      radToDeg(a.rotation[2]),
    ],
    scale: a.scale,
    gripLocalOffset: a.gripLocalOffset
      ? [a.gripLocalOffset[0], a.gripLocalOffset[1], a.gripLocalOffset[2]]
      : [0, 0, 0],
  }
}

/** Resolve the game / provisional attach for a `held:*` asset id. */
export function defaultAttachForHeldId(id: string | null): HeldAttach | null {
  if (!id?.startsWith('held:')) return null
  const suffix = id.slice('held:'.length) as ItemKind
  if (suffix === 'branch') return BRANCH_HELD_ATTACH
  if (isToolKind(suffix)) return HELD_ATTACH[suffix]
  return BROWSER_PROVISIONAL_ATTACH[id] ?? null
}

export function loadGripEditor(targetId: string | null): void {
  const attach = defaultAttachForHeldId(targetId)
  if (!attach || !targetId) {
    gripEdit.active = false
    gripEdit.sourceId = null
    return
  }
  const next = fromAttach(attach)
  gripEdit.active = true
  gripEdit.sourceId = targetId
  gripEdit.position = next.position
  gripEdit.rotationDeg = next.rotationDeg
  gripEdit.scale = next.scale
  gripEdit.gripLocalOffset = next.gripLocalOffset
  gripEdit.revision++
}

export function gripEditToAttach(): HeldAttach {
  return {
    position: [...gripEdit.position] as [number, number, number],
    rotation: [
      degToRad(gripEdit.rotationDeg[0]),
      degToRad(gripEdit.rotationDeg[1]),
      degToRad(gripEdit.rotationDeg[2]),
    ],
    scale: gripEdit.scale,
    gripLocalOffset: [...gripEdit.gripLocalOffset] as [number, number, number],
  }
}

/** Live override used by in-hand preview when the editor is active for this target. */
export function gripOverrideForTarget(targetId: string | null): HeldAttach | null {
  if (!gripEdit.active || !targetId || gripEdit.sourceId !== targetId) return null
  return gripEditToAttach()
}

export function bumpGripEdit(): void {
  gripEdit.revision++
}

export function formatHeldAttachSnippet(sourceId: string | null = gripEdit.sourceId): string {
  const id = sourceId ?? 'held:tool'
  const key = id.startsWith('held:') ? id.slice('held:'.length) : id
  const a = gripEditToAttach()
  const fmt = (n: number, dp = 3) => {
    const t = Number(n.toFixed(dp))
    return Object.is(t, -0) ? 0 : t
  }
  const pos = a.position.map((n) => fmt(n))
  const rot = a.rotation.map((n) => {
    const v = fmt(n, 4)
    // Prefer readable π fractions when close.
    const turns = n / Math.PI
    if (Math.abs(turns) < 1e-6) return '0'
    if (Math.abs(turns - 1) < 1e-3) return 'Math.PI'
    if (Math.abs(turns + 1) < 1e-3) return '-Math.PI'
    if (Math.abs(turns - 0.5) < 1e-3) return 'Math.PI / 2'
    if (Math.abs(turns + 0.5) < 1e-3) return '-Math.PI / 2'
    return String(v)
  })
  const grip = a.gripLocalOffset!.map((n) => fmt(n))
  const constName = key === 'branch' ? 'BRANCH_HELD_ATTACH' : key
  if (key === 'branch') {
    return [
      'export const BRANCH_HELD_ATTACH: HeldAttach = {',
      `  position: [${pos.join(', ')}],`,
      `  rotation: [${rot.join(', ')}],`,
      `  scale: ${fmt(a.scale, 2)},`,
      `  gripLocalOffset: [${grip.join(', ')}],`,
      '}',
    ].join('\n')
  }
  return [
    `${constName}: {`,
    `  position: [${pos.join(', ')}],`,
    `  rotation: [${rot.join(', ')}],`,
    `  scale: ${fmt(a.scale, 2)},`,
    `  gripLocalOffset: [${grip.join(', ')}],`,
    '},',
  ].join('\n')
}

export type SeedvaleGripApi = {
  get: () => GripEditValues & { sourceId: string | null, active: boolean }
  set: (partial: Partial<GripEditValues>) => GripEditValues
  reset: () => void
  snippet: () => string
}

/** Dev/CDP helper — call from the browser console or automation. */
export function installGripApi(onChange: () => void): SeedvaleGripApi {
  const api: SeedvaleGripApi = {
    get: () => ({
      active: gripEdit.active,
      sourceId: gripEdit.sourceId,
      position: [...gripEdit.position] as [number, number, number],
      rotationDeg: [...gripEdit.rotationDeg] as [number, number, number],
      scale: gripEdit.scale,
      gripLocalOffset: [...gripEdit.gripLocalOffset] as [number, number, number],
    }),
    set: (partial) => {
      if (partial.position) gripEdit.position = [...partial.position] as [number, number, number]
      if (partial.rotationDeg) {
        gripEdit.rotationDeg = [...partial.rotationDeg] as [number, number, number]
      }
      if (partial.scale != null) gripEdit.scale = partial.scale
      if (partial.gripLocalOffset) {
        gripEdit.gripLocalOffset = [...partial.gripLocalOffset] as [number, number, number]
      }
      bumpGripEdit()
      onChange()
      return api.get()
    },
    reset: () => {
      loadGripEditor(gripEdit.sourceId)
      onChange()
    },
    snippet: () => formatHeldAttachSnippet(),
  }
  ;(window as unknown as { __seedvaleGrip?: SeedvaleGripApi }).__seedvaleGrip = api
  return api
}
