import type { VillagePlan } from './villagePlan'

/** Compact plain-text dump of a VillagePlan for lil-gui / console debugging
 *  (plan 047 §9.16). No Three.js — safe to call from UI handlers. */
export function summarizeVillagePlan(plan: VillagePlan): string {
  const { identity, boundary, center, pattern, zones, plots, buildings, landmarks, paths, entrances } =
    plan
  const lines = [
    `VillagePlan ${identity.id} "${identity.name}"`,
    `  size=${identity.size} terrain=${identity.terrain} food=${identity.foodSourceType} pattern=${pattern}`,
    `  site=(${plan.site.x.toFixed(1)},${plan.site.z.toFixed(1)}) y=${plan.site.y.toFixed(1)} r=${plan.site.radius}`,
    `  boundary r=${boundary.radius} center=(${center.x.toFixed(1)},${center.z.toFixed(1)})`,
    `  zones=${zones.map((z) => z.kind).join(',') || '—'}`,
    `  plots=${plots.length} buildings=${buildings.length} landmarks=${landmarks.map((l) => l.kind).join(',')}`,
    `  entrances=${entrances.length} paths=${paths.length}`,
  ]
  for (const e of entrances) {
    lines.push(`    entrance ${e.id} (${e.x.toFixed(1)},${e.z.toFixed(1)}) kind=${e.kind}`)
  }
  for (const p of paths.slice(0, 12)) {
    const a = p.points[0]
    const b = p.points[p.points.length - 1]
    lines.push(
      `    path ${p.id} ${a ? `(${a.x.toFixed(0)},${a.z.toFixed(0)})` : '?'}→${b ? `(${b.x.toFixed(0)},${b.z.toFixed(0)})` : '?'} ${p.kind}`,
    )
  }
  if (paths.length > 12) lines.push(`    … +${paths.length - 12} more paths`)
  return lines.join('\n')
}
