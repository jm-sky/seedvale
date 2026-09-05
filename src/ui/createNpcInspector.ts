import type { NpcAgent, NpcInspectionSnapshot } from '../ai/NpcAgent'
import type { WorldBundle } from '../app/worldBundle'
import type { NpcTraceEvent } from '../debug/npcTrace'
import { needLabel } from '../ai/Needs'
import { freezeNpc, isNpcRegistered, reevaluateNpc, unfreezeNpc } from '../debug/npcInspector'

/**
 * Dedicated NPC Simulation Inspector modal (plan 170 §5) — vanilla DOM, no
 * Vue dependency, so it stays testable/automatable without mounted
 * component state. Opened only from the debug-gated Ctrl+click path; refreshes
 * from `NpcAgent.createInspectionSnapshot()`/`why()`/`history()` on a low-
 * frequency timer, never from the render loop, and never owns NPC state.
 */

export type NpcInspector = {
  open: (npc: NpcAgent, settlementName: string) => void
  close: () => void
  isOpen: () => boolean
  dispose: () => void
}

const REFRESH_INTERVAL_MS = 150
const HISTORY_RENDER_LIMIT = 50

let stylesInjected = false
function injectStyles(): void {
  if (stylesInjected) return
  stylesInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .npc-inspector { position: fixed; top: 16px; right: 16px; width: 360px; max-height: calc(100vh - 32px);
      overflow-y: auto; background: rgba(18, 20, 24, 0.94); color: #e6e6e6; font: 12px/1.4 monospace;
      border: 1px solid #444; border-radius: 6px; padding: 10px; z-index: 10000; }
    .npc-inspector--stale { opacity: 0.55; }
    .npc-inspector__header { display: flex; justify-content: space-between; align-items: baseline;
      border-bottom: 1px solid #444; padding-bottom: 6px; margin-bottom: 6px; }
    .npc-inspector__title { font-weight: bold; }
    .npc-inspector__close { cursor: pointer; background: none; border: none; color: #ccc; font-size: 14px; }
    .npc-inspector__section { margin-bottom: 8px; }
    .npc-inspector__section h4 { margin: 0 0 3px; color: #8ec1ff; font-size: 11px; text-transform: uppercase; }
    .npc-inspector__row { display: flex; justify-content: space-between; gap: 8px; }
    .npc-inspector__row span:first-child { color: #999; }
    .npc-inspector__controls { display: flex; gap: 6px; flex-wrap: wrap; }
    .npc-inspector__controls button { background: #2a2d34; color: #e6e6e6; border: 1px solid #555;
      border-radius: 4px; padding: 3px 6px; cursor: pointer; font: inherit; }
    .npc-inspector__controls button:hover { background: #3a3e47; }
    .npc-inspector__history { max-height: 160px; overflow-y: auto; }
    .npc-inspector__history div { border-bottom: 1px solid #2c2c2c; padding: 2px 0; }
    .npc-inspector__unavailable { color: #e08080; }
  `
  document.head.appendChild(style)
}

function buildInspectorText(
  npc: NpcAgent,
  snapshot: NpcInspectionSnapshot,
  settlementName: string,
  whyResult: ReturnType<NpcAgent['why']>,
): string {
  const lines: string[] = [`${snapshot.displayName} · ${settlementName}`, '']

  lines.push('Overview')
  lines.push(`  id: ${snapshot.id}`)
  lines.push(`  role: ${snapshot.role}`)
  lines.push(`  phase: ${snapshot.phase}`)
  lines.push(`  activity: ${snapshot.activity.kind}`)
  lines.push(`  position: ${snapshot.position.x.toFixed(1)}, ${snapshot.position.z.toFixed(1)}`)
  lines.push(`  hp: ${snapshot.health.current.toFixed(0)}/${snapshot.health.max}`)
  lines.push(`  stamina: ${snapshot.stamina.current.toFixed(0)}/${snapshot.stamina.max}`)
  lines.push(`  vigor: ${snapshot.vigor.current.toFixed(0)}/${snapshot.vigor.max}`)
  lines.push(`  rescue: ${snapshot.watchdog.rescueStage} (${snapshot.watchdog.lowProgressStrikes})`)
  lines.push(`  frozen: ${snapshot.frozen ? 'yes' : 'no'}`)

  lines.push('', 'Needs')
  lines.push(`  active need: ${needLabel(snapshot.activeNeed)}`)
  lines.push(`  thirst: ${snapshot.needs.thirst.toFixed(2)}`)
  lines.push(`  hunger: ${snapshot.needs.hunger.toFixed(2)}`)
  lines.push(`  woodDuty: ${snapshot.needs.woodDuty.toFixed(2)}`)
  lines.push(`  waterDuty: ${snapshot.needs.waterDuty.toFixed(2)}`)

  lines.push('', 'Decision / Why')
  lines.push(`  need: ${whyResult.need.id}${whyResult.need.value !== null ? ` (${whyResult.need.value.toFixed(2)})` : ''}`)
  lines.push(`  modifiers: ${formatWinningModifiers(snapshot, whyResult.need.id)}`)
  lines.push(`  phase: ${whyResult.phase}`)
  lines.push(`  action: ${whyResult.action ? `${whyResult.action.kind}${whyResult.action.target ? ` → ${whyResult.action.target}` : ''}` : '-'}`)
  lines.push(`  blocked: ${whyResult.blocked ?? '-'}`)

  lines.push('', 'Strategy')
  if (snapshot.strategyCandidates.length > 0) {
    for (const candidate of snapshot.strategyCandidates) {
      const marker = candidate.id === snapshot.selectedStrategy ? ' ← selected' : ''
      lines.push(`  ${candidate.id}: ${candidate.available ? 'available' : 'unavailable'}${marker}`)
    }
  } else {
    lines.push('  -')
  }

  lines.push('', 'Plan')
  if (snapshot.plan) {
    lines.push(`  goal: ${snapshot.plan.goal}`)
    lines.push(`  strategy: ${snapshot.plan.strategy ?? '-'}`)
    lines.push(`  state: ${snapshot.plan.state}`)
    lines.push(`  progress: ${snapshot.plan.progress}`)
    lines.push(`  current step: ${snapshot.plan.currentStep}`)
  } else {
    lines.push('  -')
  }

  lines.push('', 'Work Contract')
  if (snapshot.contract) {
    lines.push(`  id: ${snapshot.contract.id}`)
    lines.push(`  state: ${snapshot.contract.state}`)
    lines.push(`  reward: ${snapshot.contract.rewardCoins}`)
    lines.push(`  target: ${snapshot.contract.targetKind}:${snapshot.contract.targetId}`)
    lines.push(`  work share: ${Math.round(snapshot.contract.requestedWorkShare * 100)}% of ${snapshot.contract.remainingWorkAtCreation.toFixed(1)}h at creation`)
    lines.push(`  committed: ${snapshot.contract.npcWorkCompleted.toFixed(1)} / ${snapshot.contract.committedWork.toFixed(1)}h`)
    lines.push(`  target remaining: ${snapshot.contract.targetRemainingWork?.toFixed(1) ?? '-'}h`)
  } else {
    lines.push('  -')
  }

  lines.push('', 'Current action')
  if (snapshot.action) {
    lines.push(`  kind: ${snapshot.action.kind}`)
    lines.push(`  status: ${snapshot.action.status}`)
    lines.push(`  destination: ${snapshot.action.destination.x.toFixed(1)}, ${snapshot.action.destination.z.toFixed(1)}`)
    lines.push(`  queueId: ${snapshot.action.queueId ?? '-'}`)
  } else {
    lines.push('  kind: -')
  }

  lines.push('', 'Queue')
  if (snapshot.queue) {
    lines.push(`  id: ${snapshot.queue.id}`)
    lines.push(`  position: ${snapshot.queue.position}`)
    lines.push(`  serving: ${snapshot.queue.serving ? 'yes' : 'no'}`)
  } else {
    lines.push('  id: -')
  }

  lines.push('', 'Household')
  if (snapshot.household) {
    lines.push(`  food: ${snapshot.household.food}`)
    lines.push(`  wood: ${snapshot.household.wood}`)
    lines.push(`  water: ${snapshot.household.water}`)
  } else {
    lines.push('  household: -')
  }

  lines.push('', 'History')
  const events = npc.history()
  const recent = events.slice(-HISTORY_RENDER_LIMIT).reverse()
  for (const event of recent) {
    lines.push(`  ${formatEvent(event)}`)
  }

  return lines.join('\n')
}

/** Personality/role breakdown behind the winning need (plan ai-002) — reads
 *  `snapshot.candidates`, never recomputes a score. Empty modifiers (e.g.
 *  `idle`, or a duty this NPC's role/traits don't touch) render as `-`. */
function formatWinningModifiers(snapshot: NpcInspectionSnapshot, needId: string): string {
  const candidate = snapshot.candidates?.find((c) => c.target === needId)
  if (!candidate || candidate.modifiers.length === 0) return '-'
  return candidate.modifiers.map((m) => `${m.source} ${m.value >= 0 ? '+' : ''}${m.value.toFixed(2)}`).join(', ')
}

function formatEvent(event: NpcTraceEvent): string {
  const t = event.simTime.toFixed(1)
  switch (event.type) {
    case 'action.completed': return `${t}s action.completed → ${event.action}`
    case 'action.failed': return `${t}s action.failed → ${event.action ?? '-'} (${event.reason})`
    case 'action.planned': return `${t}s action.planned → ${event.action}${event.queueId ? ` @${event.queueId}` : ''}`
    case 'animalThreat.response': return `${t}s animalThreat.response → ${event.response} (canFight ${event.canFight ? 'yes' : 'no'}, hp ${(event.healthRatio * 100).toFixed(0)}%)`
    case 'animalThreat.sensed': return `${t}s animalThreat.sensed → ${event.animalId} @ ${event.distance.toFixed(1)}m`
    case 'combat.died': return `${t}s combat.died`
    case 'combat.ended': return `${t}s combat.ended (${event.outcome})`
    case 'combat.hit': return `${t}s combat.hit → ${event.targetId}`
    case 'combat.started': return `${t}s combat.started → ${event.targetId}`
    case 'contract.accepted': return `${t}s contract.accepted → ${event.contractId} (score ${event.score.toFixed(1)})`
    case 'contract.evaluated': return `${t}s contract.evaluated → ${event.candidates.map((c) => `${c.contractId}:${c.score.toFixed(1)}`).join(', ') || '-'}`
    case 'contract.invalidated': return `${t}s contract.invalidated → ${event.contractId} (${event.reason})`
    case 'contract.workCompleted': return `${t}s contract.workCompleted → ${event.contractId}`
    case 'debug.freeze': return `${t}s debug.freeze`
    case 'debug.reevaluate': return `${t}s debug.reevaluate`
    case 'debug.unfreeze': return `${t}s debug.unfreeze`
    case 'movement.rescue': return `${t}s movement.rescue → ${event.stage}`
    case 'need.selected': return `${t}s need.selected → ${event.need}`
    case 'phase.changed': return `${t}s phase ${event.from} → ${event.to}`
    case 'plan.completed': return `${t}s plan.completed → ${event.goal}`
    case 'plan.created': return `${t}s plan.created → ${event.goal}`
    case 'plan.progressed': return `${t}s plan.progressed → ${event.goal} +${event.amount} (${event.total})`
    case 'plan.stateChanged': return `${t}s plan.stateChanged → ${event.goal} ${event.from} → ${event.to}`
    case 'queue.joined': return `${t}s queue.joined → ${event.queueId}`
    case 'queue.left': return `${t}s queue.left → ${event.queueId}`
    case 'queue.served': return `${t}s queue.served → ${event.queueId}`
    case 'strategy.selected': return `${t}s strategy.selected → ${event.selected ?? '-'} (${event.need})`
  }
}

export function createNpcInspector(
  container: HTMLElement,
  bundle: WorldBundle,
  getTimeOfDay: () => number,
): NpcInspector {
  injectStyles()

  const root = document.createElement('div')
  root.className = 'npc-inspector'
  root.style.display = 'none'
  container.appendChild(root)

  const header = document.createElement('div')
  header.className = 'npc-inspector__header'
  const title = document.createElement('div')
  title.className = 'npc-inspector__title'
  const closeBtn = document.createElement('button')
  closeBtn.className = 'npc-inspector__close'
  closeBtn.textContent = '✕'
  closeBtn.onclick = () => close()
  header.append(title, closeBtn)

  const body = document.createElement('div')
  const unavailable = document.createElement('div')
  unavailable.className = 'npc-inspector__unavailable'
  unavailable.style.display = 'none'
  unavailable.textContent = 'NPC nie jest już dostępny (rebuild/stream).'

  const overview = document.createElement('div')
  const needs = document.createElement('div')
  const why = document.createElement('div')
  const plan = document.createElement('div')
  const action = document.createElement('div')
  const queue = document.createElement('div')
  const household = document.createElement('div')
  const controls = document.createElement('div')
  controls.className = 'npc-inspector__controls'
  const history = document.createElement('div')
  history.className = 'npc-inspector__history'

  function section(titleText: string, content: HTMLElement): HTMLElement {
    const el = document.createElement('div')
    el.className = 'npc-inspector__section'
    const h = document.createElement('h4')
    h.textContent = titleText
    el.append(h, content)
    return el
  }

  body.append(
    unavailable,
    section('Overview', overview),
    section('Needs', needs),
    section('Decision / Why', why),
    section('Plan', plan),
    section('Current action', action),
    section('Queue', queue),
    section('Household', household),
    section('Debug controls', controls),
    section('History', history),
  )

  root.append(header, body)

  function row(target: HTMLElement, label: string, value: string): void {
    const r = document.createElement('div')
    r.className = 'npc-inspector__row'
    const l = document.createElement('span')
    l.textContent = label
    const v = document.createElement('span')
    v.textContent = value
    r.append(l, v)
    target.appendChild(r)
  }

  const freezeBtn = document.createElement('button')
  const reevalBtn = document.createElement('button')
  reevalBtn.textContent = 'Ponów decyzję'
  const copyBtn = document.createElement('button')
  copyBtn.textContent = 'Kopiuj'
  controls.append(freezeBtn, reevalBtn, copyBtn)
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null

  let current: NpcAgent | null = null
  let currentSettlementName = ''
  let timer: ReturnType<typeof setInterval> | null = null

  function renderSnapshot(npc: NpcAgent, snapshot: NpcInspectionSnapshot): void {
    title.textContent = `${snapshot.displayName} · ${currentSettlementName}`

    overview.replaceChildren()
    row(overview, 'id', snapshot.id)
    row(overview, 'role', snapshot.role)
    row(overview, 'phase', snapshot.phase)
    row(overview, 'activity', snapshot.activity.kind)
    row(overview, 'position', `${snapshot.position.x.toFixed(1)}, ${snapshot.position.z.toFixed(1)}`)
    row(overview, 'hp', `${snapshot.health.current.toFixed(0)}/${snapshot.health.max}`)
    row(overview, 'stamina', `${snapshot.stamina.current.toFixed(0)}/${snapshot.stamina.max}`)
    row(overview, 'vigor', `${snapshot.vigor.current.toFixed(0)}/${snapshot.vigor.max}`)
    row(overview, 'rescue', `${snapshot.watchdog.rescueStage} (${snapshot.watchdog.lowProgressStrikes})`)
    row(overview, 'frozen', snapshot.frozen ? 'yes' : 'no')

    needs.replaceChildren()
    row(needs, 'active need', needLabel(snapshot.activeNeed))
    row(needs, 'thirst', snapshot.needs.thirst.toFixed(2))
    row(needs, 'hunger', snapshot.needs.hunger.toFixed(2))
    row(needs, 'woodDuty', snapshot.needs.woodDuty.toFixed(2))
    row(needs, 'waterDuty', snapshot.needs.waterDuty.toFixed(2))

    const whyResult = npc.why(getTimeOfDay())
    why.replaceChildren()
    row(why, 'need', `${whyResult.need.id}${whyResult.need.value !== null ? ` (${whyResult.need.value.toFixed(2)})` : ''}`)
    row(why, 'modifiers', formatWinningModifiers(snapshot, whyResult.need.id))
    row(why, 'phase', whyResult.phase)
    row(why, 'action', whyResult.action ? `${whyResult.action.kind}${whyResult.action.target ? ` → ${whyResult.action.target}` : ''}` : '-')
    row(why, 'blocked', whyResult.blocked ?? '-')

    plan.replaceChildren()
    if (snapshot.plan) {
      row(plan, 'goal', snapshot.plan.goal)
      row(plan, 'strategy', snapshot.plan.strategy ?? '-')
      row(plan, 'state', snapshot.plan.state)
      row(plan, 'progress', String(snapshot.plan.progress))
      row(plan, 'current step', snapshot.plan.currentStep)
    } else {
      row(plan, 'goal', '-')
    }

    action.replaceChildren()
    if (snapshot.action) {
      row(action, 'kind', snapshot.action.kind)
      row(action, 'status', snapshot.action.status)
      row(action, 'destination', `${snapshot.action.destination.x.toFixed(1)}, ${snapshot.action.destination.z.toFixed(1)}`)
      row(action, 'queueId', snapshot.action.queueId ?? '-')
    } else {
      row(action, 'kind', '-')
    }

    queue.replaceChildren()
    if (snapshot.queue) {
      row(queue, 'id', snapshot.queue.id)
      row(queue, 'position', String(snapshot.queue.position))
      row(queue, 'serving', snapshot.queue.serving ? 'yes' : 'no')
    } else {
      row(queue, 'id', '-')
    }

    household.replaceChildren()
    if (snapshot.household) {
      row(household, 'food', String(snapshot.household.food))
      row(household, 'wood', String(snapshot.household.wood))
      row(household, 'water', String(snapshot.household.water))
    } else {
      row(household, 'household', '-')
    }

    freezeBtn.textContent = snapshot.frozen ? 'Wznów' : 'Zamroź'
    freezeBtn.onclick = () => {
      if (snapshot.frozen) unfreezeNpc(bundle, snapshot.id)
      else freezeNpc(bundle, snapshot.id)
      refresh()
    }
    reevalBtn.onclick = () => {
      reevaluateNpc(bundle, snapshot.id)
      refresh()
    }
    copyBtn.onclick = () => {
      const text = buildInspectorText(npc, snapshot, currentSettlementName, whyResult)
      void navigator.clipboard.writeText(text).then(() => {
        if (copyResetTimer !== null) clearTimeout(copyResetTimer)
        copyBtn.textContent = 'Skopiowano'
        copyResetTimer = setTimeout(() => {
          copyBtn.textContent = 'Kopiuj'
          copyResetTimer = null
        }, 1200)
      })
    }

    history.replaceChildren()
    const events = npc.history()
    const recent = events.slice(-HISTORY_RENDER_LIMIT).reverse()
    for (const event of recent) {
      const line = document.createElement('div')
      line.textContent = formatEvent(event)
      history.appendChild(line)
    }
  }

  function refresh(): void {
    if (!current) return
    if (!isNpcRegistered(bundle, current)) {
      root.classList.add('npc-inspector--stale')
      unavailable.style.display = ''
      return
    }
    root.classList.remove('npc-inspector--stale')
    unavailable.style.display = 'none'
    renderSnapshot(current, current.createInspectionSnapshot(getTimeOfDay()))
  }

  function open(npc: NpcAgent, settlementName: string): void {
    current = npc
    currentSettlementName = settlementName
    root.style.display = ''
    refresh()
    if (timer !== null) clearInterval(timer)
    timer = setInterval(refresh, REFRESH_INTERVAL_MS)
  }

  function close(): void {
    current = null
    root.style.display = 'none'
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    if (copyResetTimer !== null) {
      clearTimeout(copyResetTimer)
      copyResetTimer = null
    }
  }

  return {
    open,
    close,
    isOpen: () => current !== null,
    dispose: () => {
      close()
      root.remove()
    },
  }
}
