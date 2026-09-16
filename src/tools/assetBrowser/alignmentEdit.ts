import { reactive } from 'vue'
import type { AssetIndexEntry } from '../../assets/assetIndex'
import type { AccessoryAlignmentOverride } from './viewer/mountAccessoryPreview'
import { resolvePlayerEquipmentVisualByUrl } from '../../player/playerEquipmentVisual'

export type AlignmentEditValues = {
  position: [number, number, number]
  rotationDeg: [number, number, number]
  scale: number
}

export type AlignmentEditState = AlignmentEditValues & {
  active: boolean
  sourceId: string | null
  revision: number
}

export const alignmentEdit = reactive<AlignmentEditState>({
  active: false,
  sourceId: null,
  position: [0, 0, 0],
  rotationDeg: [0, 0, 0],
  scale: 1,
  revision: 0,
})

function radToDeg(r: number): number {
  return (r * 180) / Math.PI
}

function degToRad(d: number): number {
  return (d * Math.PI) / 180
}

export function loadAlignmentEditor(entry: AssetIndexEntry | null): void {
  const visual = resolvePlayerEquipmentVisualByUrl(entry?.url ?? null)
  if (!visual || !entry) {
    alignmentEdit.active = false
    alignmentEdit.sourceId = null
    return
  }
  alignmentEdit.active = true
  alignmentEdit.sourceId = entry.id
  alignmentEdit.position = [...(visual.alignment?.position ?? [0, 0, 0])] as [number, number, number]
  alignmentEdit.rotationDeg = (visual.alignment?.rotation ?? [0, 0, 0]).map(radToDeg) as [
    number,
    number,
    number,
  ]
  alignmentEdit.scale = visual.alignment?.scale ?? 1
  alignmentEdit.revision++
}

export function alignmentEditToOverride(): AccessoryAlignmentOverride {
  return {
    position: [...alignmentEdit.position] as [number, number, number],
    rotation: [
      degToRad(alignmentEdit.rotationDeg[0]),
      degToRad(alignmentEdit.rotationDeg[1]),
      degToRad(alignmentEdit.rotationDeg[2]),
    ],
    scale: alignmentEdit.scale,
  }
}

export function alignmentOverrideForTarget(targetId: string | null): AccessoryAlignmentOverride | null {
  if (!alignmentEdit.active || !targetId || alignmentEdit.sourceId !== targetId) return null
  return alignmentEditToOverride()
}

export function bumpAlignmentEdit(): void {
  alignmentEdit.revision++
}

export function formatAlignmentSnippet(): string {
  const a = alignmentEditToOverride()
  const fmt = (n: number, dp = 3) => {
    const t = Number(n.toFixed(dp))
    return Object.is(t, -0) ? 0 : t
  }
  return [
    'alignment: {',
    `  position: [${a.position.map((n) => fmt(n)).join(', ')}],`,
    `  rotation: [${a.rotation.map((n) => fmt(n, 4)).join(', ')}],`,
    `  scale: ${fmt(a.scale, 2)},`,
    '},',
  ].join('\n')
}
