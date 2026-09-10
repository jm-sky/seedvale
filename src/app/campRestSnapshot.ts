import type { PlacedTent } from '../items/createPlacedTents'
import { isPlayerPlacedFire } from '../settlement/PlacedFires'
import {
  BEDROLL_ON_PLATFORM_RADIUS,
  BEDROLL_REST_RADIUS,
  type BedrollRecord,
  findNearestSleepingUtility,
  type PlatformRecord,
} from '../world/sleepingUtilities'
import {
  type CampRestContext,
  type CampRestExplanation,
  explainCampRest,
  formatCampRestBreakdown,
  TENT_SHELTER_RADIUS,
  tentShelterFactor,
  WARM_FIRE_RADIUS,
} from './campRest'

export type CampSnapshotFire = {
  id: string
  x: number
  z: number
  lit: boolean
}

/**
 * Derived camp snapshot at an explicit `(x, z)` anchor (plan items-player-018).
 * Not a persistent `CampEntity` — ids/records are only for the current
 * inspection, rest, or full-camp intent step.
 *
 * @domain items-player
 */
export type CampRestSnapshot = {
  anchor: { x: number, z: number }
  context: CampRestContext
  quality: number
  explanation: CampRestExplanation
  tent: PlacedTent | null
  tentCondition: number
  bedroll: BedrollRecord | null
  bedrollCondition: number
  platform: PlatformRecord | null
  platformCondition: number
  fire: CampSnapshotFire | null
}

export type CampRestSnapshotInput = {
  x: number
  z: number
  tents: {
    list: () => readonly PlacedTent[]
    conditionOf: (id: string, worldDays: number) => number | null
  }
  bedrolls: {
    list: () => readonly BedrollRecord[]
    conditionOf: (id: string, worldDays: number, shelterFactor: number) => number | null
  }
  platforms: {
    list: () => readonly PlatformRecord[]
    conditionOf: (id: string, worldDays: number, shelterFactor: number) => number | null
  }
  fires: readonly {
    id: string
    x: number
    z: number
    habitatBurn: boolean
    fire: { isLit: () => boolean }
  }[]
  nowDays: number
  hasBlanket: boolean
  survivalValue: number
}

function distanceSq(a: { x: number, z: number }, x: number, z: number): number {
  const dx = a.x - x
  const dz = a.z - z
  return dx * dx + dz * dz
}

/** Nearest player-built fire within `radius`. Lit fires win, then nearest,
 *  then stable id tie-break — same policy as cooking-fire resolution, but
 *  settlement fires are never camp components (plan items-player-018). */
export function findNearestPlayerFire(
  fires: CampRestSnapshotInput['fires'],
  x: number,
  z: number,
  radius = WARM_FIRE_RADIUS,
): CampSnapshotFire | null {
  const radiusSq = radius * radius
  let best: CampSnapshotFire | null = null
  let bestLit = false
  let bestDistSq = Infinity
  for (const entry of fires) {
    if (!isPlayerPlacedFire(entry)) continue
    const distSq = distanceSq(entry, x, z)
    if (distSq > radiusSq) continue
    const lit = entry.fire.isLit()
    const candidate: CampSnapshotFire = { id: entry.id, x: entry.x, z: entry.z, lit }
    if (!best) {
      best = candidate
      bestLit = lit
      bestDistSq = distSq
      continue
    }
    if (lit !== bestLit) {
      if (lit) {
        best = candidate
        bestLit = true
        bestDistSq = distSq
      }
      continue
    }
    if (distSq < bestDistSq || (distSq === bestDistSq && candidate.id < best.id)) {
      best = candidate
      bestDistSq = distSq
    }
  }
  return best
}

/**
 * Spatial membership of sleeping utilities around a tent, using the same
 * radii and nearest-selection as `resolveCampRestSnapshot` without reading
 * condition, weather or quality. Used by the per-frame interaction list so
 * tent + bedroll + platform become one camp target (plan items-player-022).
 *
 * @domain items-player
 */
export function resolveCampInteractionMembers(
  tent: { id: string, x: number, z: number },
  bedrolls: readonly { id: string, x: number, z: number }[],
  platforms: readonly { id: string, x: number, z: number }[],
): { tentId: string, bedrollId: string | null, platformId: string | null } {
  const bedroll = findNearestSleepingUtility(bedrolls, tent.x, tent.z, BEDROLL_REST_RADIUS)
  const platform = bedroll
    ? findNearestSleepingUtility(platforms, bedroll.x, bedroll.z, BEDROLL_ON_PLATFORM_RADIUS)
    : null
  return {
    tentId: tent.id,
    bedrollId: bedroll?.id ?? null,
    platformId: platform?.id ?? null,
  }
}

/**
 * Reusable structured rows for camp inspection (plan items-player-022).
 * Values and tones are already resolved — Vue only renders them.
 *
 * @domain items-player
 */
export type CampInspectionDetailRow = {
  label: string
  value: string
  secondaryValue?: string
  tone?: 'positive' | 'warning' | 'muted'
}

function contributionDisplay(value: number): { text: string, positive: boolean } {
  const pct = Math.round(value * 100)
  if (pct > 0) return { text: `+${pct}%`, positive: true }
  if (pct < 0) return { text: `${pct}%`, positive: false }
  return { text: '', positive: false }
}

/**
 * Presentation rows derived from a freshly resolved `CampRestSnapshot`.
 * Detected components always appear; contribution percentages come from
 * `snapshot.explanation` and are never recomputed here.
 *
 * @domain items-player
 */
export function formatCampInspectionDetails(snapshot: CampRestSnapshot): CampInspectionDetailRow[] {
  const byKey = new Map(snapshot.explanation.lines.map((line) => [line.key, line]))
  const rows: CampInspectionDetailRow[] = []

  const pushObject = (
    present: boolean,
    key: 'tent' | 'bedroll' | 'platform',
    label: string,
    condition: number,
  ): void => {
    if (!present) return
    const line = byKey.get(key)
    const contrib = line ? contributionDisplay(line.value) : { text: '', positive: false }
    rows.push({
      label,
      value: `stan ${Math.round(condition)}%`,
      secondaryValue: contrib.text || undefined,
      tone: contrib.positive ? 'positive' : condition < 40 ? 'warning' : undefined,
    })
  }

  pushObject(snapshot.tent != null, 'tent', 'Namiot', snapshot.tentCondition)
  pushObject(snapshot.bedroll != null, 'bedroll', 'Posłanie', snapshot.bedrollCondition)
  pushObject(snapshot.platform != null, 'platform', 'Platforma', snapshot.platformCondition)

  if (snapshot.fire) {
    const line = byKey.get('fire')
    const contrib = line ? contributionDisplay(line.value) : { text: '', positive: false }
    rows.push({
      label: 'Ognisko',
      value: snapshot.fire.lit ? 'rozpalone' : 'zgaszone',
      secondaryValue: contrib.text || undefined,
      tone: contrib.positive ? 'positive' : snapshot.fire.lit ? undefined : 'muted',
    })
  }

  const survival = byKey.get('survival')
  if (survival) {
    const contrib = contributionDisplay(survival.value)
    rows.push({
      label: 'Survival',
      value: '',
      secondaryValue: contrib.text || undefined,
      tone: contrib.positive ? 'positive' : undefined,
    })
  }

  rows.push({
    label: 'Komfort',
    value: `${Math.round(snapshot.explanation.quality * 100)}%`,
  })
  return rows
}

/** Component ids a composed camp inspection may offer repair for — only
 *  records actually present on the freshly resolved snapshot. */
export function campInspectionRepairTargets(snapshot: CampRestSnapshot): {
  kind: 'tent' | 'bedroll' | 'platform'
  id: string
}[] {
  const targets: { kind: 'tent' | 'bedroll' | 'platform', id: string }[] = []
  if (snapshot.tent) targets.push({ kind: 'tent', id: snapshot.tent.id })
  if (snapshot.bedroll) targets.push({ kind: 'bedroll', id: snapshot.bedroll.id })
  if (snapshot.platform) targets.push({ kind: 'platform', id: snapshot.platform.id })
  return targets
}

/**
 * Spatial camp lookup + condition reads for one explicit anchor. Does not
 * read the camera or `player.mesh`. Quality comes from `campRest.ts` — the
 * same path sleep uses.
 *
 * @domain items-player
 */
export function resolveCampRestSnapshot(input: CampRestSnapshotInput): CampRestSnapshot {
  const { x, z, nowDays, hasBlanket, survivalValue } = input
  const tent = findNearestSleepingUtility(input.tents.list(), x, z, TENT_SHELTER_RADIUS)
  const tentCondition = tent ? input.tents.conditionOf(tent.id, nowDays) ?? 0 : 0
  const shelterFactor = tentShelterFactor(tentCondition)

  const bedroll = findNearestSleepingUtility(input.bedrolls.list(), x, z, BEDROLL_REST_RADIUS)
  const bedrollCondition = bedroll
    ? input.bedrolls.conditionOf(bedroll.id, nowDays, shelterFactor) ?? 0
    : 0

  const platform = bedroll
    ? findNearestSleepingUtility(input.platforms.list(), bedroll.x, bedroll.z, BEDROLL_ON_PLATFORM_RADIUS)
    : null
  const platformCondition = platform
    ? input.platforms.conditionOf(platform.id, nowDays, shelterFactor) ?? 0
    : 0

  const fire = findNearestPlayerFire(input.fires, x, z)
  const context: CampRestContext = {
    hasBlanket,
    hasWarmFire: fire?.lit === true,
    tentCondition,
    bedrollCondition,
    platformCondition,
  }
  const explanation = explainCampRest(context, survivalValue)
  return {
    anchor: { x, z },
    context,
    quality: explanation.quality,
    explanation,
    tent,
    tentCondition,
    bedroll,
    bedrollCondition,
    platform,
    platformCondition,
    fire,
  }
}

export function formatCampInspectionDescription(snapshot: CampRestSnapshot): string {
  const detected: string[] = []
  if (snapshot.tent) detected.push(`• Namiot (${Math.round(snapshot.tentCondition)}%)`)
  if (snapshot.bedroll) detected.push(`• Posłanie (${Math.round(snapshot.bedrollCondition)}%)`)
  if (snapshot.platform) detected.push(`• Platforma (${Math.round(snapshot.platformCondition)}%)`)
  if (snapshot.fire) detected.push(`• Ognisko — ${snapshot.fire.lit ? 'rozpalone' : 'zgaszone'}`)
  if (detected.length === 0) detected.push('• brak dodatkowych elementów obozu')

  return [
    `Stan namiotu: ${Math.round(snapshot.tentCondition)}%`,
    '',
    'Wykryte elementy:',
    ...detected,
    '',
    formatCampRestBreakdown(snapshot.explanation),
  ].join('\n')
}
