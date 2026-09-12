import type { ConstructionActionView, ResidentialWorkView } from '../app/actions/placementActions'
import type { Interactable } from './Interactable'

/** @domain ui-input */

export type InteractionActionSlot = 'primary' | 'alternate' | 'inspect'

export type InteractionActionView = {
  slot: InteractionActionSlot
  label: string
  enabled: boolean
  reasonLabel: string
}

export type InteractionView = {
  targetLabel: string
  actions: readonly InteractionActionView[]
}

export type InteractionGazePrompt = InteractionView & {
  cycleHint: string
}

export type InteractionViewContext = {
  hasInspect: boolean
  /** Targeted-skill primary slot override (plan items-player-021). */
  primaryOverride?: InteractionActionView | null
  describeWellWork?: (id: string) => { canWork: boolean, reasonLabel: string } | null
  describeWellRoofRepair?: (id: string) => {
    canAct: boolean
    reasonLabel: string
    waterAvailable: boolean
  } | null
  describePalisadeWork?: (id: string) => ConstructionActionView | null
  describeStandingTorchWork?: (id: string) => ConstructionActionView | null
  describePlayerTroughWork?: (id: string) => ConstructionActionView | null
  describePlayerTroughFill?: (id: string) => ConstructionActionView | null
  describeResidentialWork?: (id: string) => ResidentialWorkView | null
}

const STATUS_ONLY_RE = /…$|^\s*Suszy się|^\s*Spalony ul|^\s*Słona woda|Słona woda —|^\s*Prowadzisz:|^\s*Młoda roślina:|^\s*Przejrzała roślina:|^\s*Dziki ul\s*$/i

function stripBracketPrefix(label: string): string {
  return label.replace(/^\[[ERV]\]\s*/, '').trim()
}

function isStatusOnlySegment(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  return STATUS_ONLY_RE.test(trimmed)
}

type ParsedLegacyAction = { label: string, enabled: boolean }

function parseLegacyPrompt(promptLabel: string): { primary: ParsedLegacyAction | null, alternate: ParsedLegacyAction | null } {
  let primary: ParsedLegacyAction | null = null
  let alternate: ParsedLegacyAction | null = null
  for (const segment of promptLabel.split(' · ')) {
    const bracket = segment.match(/^\[([ER])\]\s*(.+)$/)
    if (bracket) {
      const label = bracket[2].trim()
      const enabled = true
      if (bracket[1] === 'E') primary = { label, enabled }
      else alternate = { label, enabled }
      continue
    }
    const label = segment.trim()
    if (!label) continue
    const enabled = !isStatusOnlySegment(label)
    if (!primary) primary = { label, enabled }
    else if (!alternate) alternate = { label, enabled }
  }
  return { primary, alternate }
}

function actionView(slot: InteractionActionSlot, parsed: ParsedLegacyAction | null, reasonLabel = ''): InteractionActionView | null {
  if (!parsed) return null
  return {
    slot,
    label: parsed.label,
    enabled: parsed.enabled,
    reasonLabel: parsed.enabled ? '' : reasonLabel,
  }
}

function digActions(target: Extract<Interactable, { kind: 'dig' }>): InteractionActionView[] {
  const actions: InteractionActionView[] = []
  const digLabel = target.promptLabel.includes('skałę') ? 'Wykop skałę' : 'Wykop dołek'
  if (target.profile) {
    actions.push({ slot: 'primary', label: digLabel, enabled: true, reasonLabel: '' })
  }
  if (target.canLevel) {
    actions.push({ slot: 'alternate', label: 'Wyrównaj', enabled: true, reasonLabel: '' })
  }
  if (actions.length === 0) {
    actions.push({ slot: 'primary', label: stripBracketPrefix(target.promptLabel), enabled: false, reasonLabel: '' })
  }
  return actions
}

function enrichPlayerWell(
  target: Extract<Interactable, { kind: 'playerWell' }>,
  actions: InteractionActionView[],
  ctx: InteractionViewContext,
): InteractionActionView[] {
  if (!target.complete) {
    const work = ctx.describeWellWork?.(target.id)
    return actions.map((action) => {
      if (action.slot !== 'primary') return action
      if (!work) return action
      return {
        ...action,
        enabled: work.canWork,
        reasonLabel: work.canWork ? '' : work.reasonLabel,
      }
    })
  }
  const repair = ctx.describeWellRoofRepair?.(target.id)
  if (!repair) return actions
  return actions.map((action) => {
    if (action.slot === 'primary' && !target.waterSource) {
      return {
        ...action,
        enabled: repair.canAct,
        reasonLabel: repair.canAct ? '' : repair.reasonLabel,
      }
    }
    if (action.slot === 'alternate' && target.waterSource) {
      const blocked = !repair.waterAvailable
      return {
        ...action,
        enabled: !blocked,
        reasonLabel: blocked ? repair.reasonLabel : '',
      }
    }
    return action
  })
}

function standingTorchActions(
  target: Extract<Interactable, { kind: 'standingTorch' }>,
  ctx: InteractionViewContext,
): InteractionActionView[] {
  if (!target.complete) {
    const work = ctx.describeStandingTorchWork?.(target.id)
    return [
      { slot: 'primary', label: 'Kontynuuj budowę', enabled: work?.canWork ?? true, reasonLabel: work?.reasonLabel ?? '' },
      { slot: 'alternate', label: 'Usuń', enabled: true, reasonLabel: '' },
    ]
  }
  if (target.lit) {
    return [
      { slot: 'primary', label: 'Pochodnia świeci', enabled: false, reasonLabel: '' },
      { slot: 'alternate', label: 'Usuń', enabled: true, reasonLabel: '' },
    ]
  }
  return [
    { slot: 'primary', label: 'Zapal pochodnię', enabled: true, reasonLabel: '' },
    { slot: 'alternate', label: 'Usuń', enabled: true, reasonLabel: '' },
  ]
}

function palisadeActions(
  target: Extract<Interactable, { kind: 'palisade' }>,
  ctx: InteractionViewContext,
): InteractionActionView[] {
  const actions: InteractionActionView[] = []
  if (!target.complete) {
    const work = ctx.describePalisadeWork?.(target.id)
    actions.push({
      slot: 'primary',
      label: 'Kontynuuj budowę',
      enabled: work?.canWork ?? true,
      reasonLabel: work?.reasonLabel ?? '',
    })
  }
  actions.push({ slot: 'alternate', label: 'Usuń', enabled: true, reasonLabel: '' })
  return actions
}

function troughActions(
  target: Extract<Interactable, { kind: 'playerTrough' }>,
  ctx: InteractionViewContext,
): InteractionActionView[] {
  const actions: InteractionActionView[] = []
  if (!target.complete) {
    const work = ctx.describePlayerTroughWork?.(target.id)
    actions.push({
      slot: 'primary',
      label: 'Kontynuuj budowę',
      enabled: work?.canWork ?? true,
      reasonLabel: work?.reasonLabel ?? '',
    })
  } else if (target.canFill) {
    const fill = ctx.describePlayerTroughFill?.(target.id)
    actions.push({
      slot: 'primary',
      label: 'Napełnij',
      enabled: fill?.canWork ?? true,
      reasonLabel: fill?.reasonLabel ?? '',
    })
  }
  actions.push({ slot: 'alternate', label: 'Usuń', enabled: true, reasonLabel: '' })
  return actions
}

function residentialActions(
  target: Extract<Interactable, { kind: 'residentialBuilding' }>,
  ctx: InteractionViewContext,
): InteractionActionView[] {
  const actions: InteractionActionView[] = []
  if (!target.complete) {
    const work = ctx.describeResidentialWork?.(target.id)
    if (!target.materialsSupplied) {
      actions.push({
        slot: 'primary',
        label: 'Dostarcz materiały',
        enabled: work?.canSupply ?? true,
        reasonLabel: work?.supplyReasonLabel ?? '',
      })
    } else {
      actions.push({
        slot: 'primary',
        label: 'Kontynuuj budowę',
        enabled: work?.canWork ?? true,
        reasonLabel: work?.workReasonLabel ?? '',
      })
    }
    actions.push({ slot: 'alternate', label: 'Anuluj budowę', enabled: true, reasonLabel: '' })
    return actions
  }
  if (target.playerOwned) {
    actions.push({ slot: 'primary', label: 'Nocuj', enabled: true, reasonLabel: '' })
  }
  return actions
}

function terrainPreparationActions(): InteractionActionView[] {
  return [{ slot: 'primary', label: 'Kontynuuj pracę', enabled: true, reasonLabel: '' }]
}

function campRestActions(): InteractionActionView[] {
  return [{ slot: 'primary', label: 'Odpocznij', enabled: true, reasonLabel: '' }]
}

function cartActions(target: Extract<Interactable, { kind: 'cart' }>): InteractionActionView[] {
  if (target.promptLabel === 'Wózek') {
    return [{ slot: 'primary', label: 'Wózek', enabled: false, reasonLabel: 'Najpierw prowadź zwierzę do wózka.' }]
  }
  return buildFromParsed(parseLegacyPrompt(target.promptLabel))
}

function buildFromParsed(parsed: { primary: ParsedLegacyAction | null, alternate: ParsedLegacyAction | null }): InteractionActionView[] {
  const actions: InteractionActionView[] = []
  const primary = actionView('primary', parsed.primary)
  const alternate = actionView('alternate', parsed.alternate)
  if (primary) actions.push(primary)
  if (alternate) actions.push(alternate)
  return actions
}

/** Stable presentation-only identity for gaze hysteresis and ranking ties. */
export function interactableStableKey(target: Interactable): string {
  switch (target.kind) {
    case 'animal':
      return `animal:${target.animal.animalId}`
    case 'bedroll':
      return `bedroll:${target.id}`
    case 'camp':
      return `camp:${target.tentId}`
    case 'campfire':
      return `campfire:${target.position.x.toFixed(2)}:${target.position.z.toFixed(2)}`
    case 'cart':
      return `cart:${target.id}`
    case 'container':
      return `container:${target.id}`
    case 'corpse':
      return `corpse:${target.animal.animalId}`
    case 'crop':
      return `crop:${target.id}`
    case 'deposit':
      return `deposit:${target.id}`
    case 'dig':
      return `dig:${target.position.x.toFixed(2)}:${target.position.z.toFixed(2)}`
    case 'dryingRack':
      return `dryingRack:${target.id}`
    case 'gardenPlot':
      return `gardenPlot:${target.id}`
    case 'hay':
      return `hay:${target.settlementId}`
    case 'hive':
      return `hive:${target.id}`
    case 'house':
      return `house:${target.houseId}`
    case 'householdStorage':
      return `householdStorage:${target.household.id}`
    case 'item':
      return `item:${target.item.id}`
    case 'landmark':
      return `landmark:${target.landmarkId}`
    case 'landPlot':
      return `landPlot:${target.plotId}`
    case 'noticeBoard':
      return `noticeBoard:${target.settlementId}`
    case 'npc':
      return `npc:${target.npc.id}`
    case 'npcCorpse':
      return `npcCorpse:${target.npc.id}`
    case 'palisade':
      return `palisade:${target.id}`
    case 'platform':
      return `platform:${target.id}`
    case 'playerTrough':
      return `playerTrough:${target.id}`
    case 'playerWell':
      return `playerWell:${target.id}`
    case 'ratNest':
      return `ratNest:${target.settlementId}`
    case 'residentialBuilding':
      return `residentialBuilding:${target.id}`
    case 'settlementStorage':
      return `settlementStorage:${target.settlementId}`
    case 'spawner':
      return `spawner:${target.spawner.id}`
    case 'standingTorch':
      return `standingTorch:${target.id}`
    case 'villageTorch':
      return `villageTorch:${target.torchId}`
    case 'tent':
      return `tent:${target.id}`
    case 'terrainPreparation':
      return `terrainPreparation:${target.id}`
    case 'trap':
      return `trap:${target.id}`
    case 'tree':
      return `tree:${target.id}`
    case 'waterEdge':
      return `waterEdge:${target.position.x.toFixed(2)}:${target.position.z.toFixed(2)}`
    case 'well':
      return `well:${target.position.x.toFixed(2)}:${target.position.z.toFixed(2)}`
    case 'woodStorage':
      return `woodStorage:${target.position.x.toFixed(2)}:${target.position.z.toFixed(2)}`
  }
}

/**
 * Derived presentation for the current interactable — no mutation, no gameplay
 * ownership. Execution paths must still revalidate live state.
 */
export function buildInteractionView(
  target: Interactable,
  ctx: InteractionViewContext,
): InteractionView {
  if (ctx.primaryOverride) {
    const actions: InteractionActionView[] = [ctx.primaryOverride]
    if (ctx.hasInspect) {
      actions.push({ slot: 'inspect', label: 'Sprawdź', enabled: true, reasonLabel: '' })
    }
    return { targetLabel: '', actions }
  }

  let actions: InteractionActionView[]
  switch (target.kind) {
    case 'bedroll':
    case 'platform':
      actions = []
      break
    case 'camp':
    case 'tent':
      actions = campRestActions()
      break
    case 'cart':
      actions = cartActions(target)
      break
    case 'dig':
      actions = digActions(target)
      break
    case 'palisade':
      actions = palisadeActions(target, ctx)
      break
    case 'playerTrough':
      actions = troughActions(target, ctx)
      break
    case 'playerWell':
      actions = enrichPlayerWell(target, buildFromParsed(parseLegacyPrompt(target.promptLabel)), ctx)
      break
    case 'residentialBuilding':
      actions = residentialActions(target, ctx)
      break
    case 'standingTorch':
      actions = standingTorchActions(target, ctx)
      break
    case 'terrainPreparation':
      actions = terrainPreparationActions()
      break
    default:
      actions = buildFromParsed(parseLegacyPrompt(target.promptLabel))
  }

  if (ctx.hasInspect) {
    actions = [...actions, { slot: 'inspect', label: 'Sprawdź', enabled: true, reasonLabel: '' }]
  }

  const targetLabel = actions.length === 1 && !actions[0]!.enabled
    ? actions[0]!.label
    : ''

  return { targetLabel, actions }
}

export function isInteractableActionable(target: Interactable): boolean {
  const view = buildInteractionView(target, { hasInspect: false })
  return view.actions.some((action) => (
    (action.slot === 'primary' || action.slot === 'alternate') && action.enabled
  ))
}

export function slotInputKey(slot: InteractionActionSlot): 'E' | 'R' | 'V' {
  if (slot === 'primary') return 'E'
  if (slot === 'alternate') return 'R'
  return 'V'
}

export function buildInteractionGazePrompt(
  target: Interactable | null,
  ctx: InteractionViewContext,
  cycleHint: string,
): InteractionGazePrompt | null {
  if (!target) return null
  const view = buildInteractionView(target, ctx)
  return { ...view, cycleHint }
}

export function hasInspectAction(view: InteractionView | null | undefined): boolean {
  return view?.actions.some((action) => action.slot === 'inspect') ?? false
}

export function primaryActionState(view: InteractionView | null | undefined): InteractionActionView | null {
  return view?.actions.find((action) => action.slot === 'primary') ?? null
}

export function alternateActionState(view: InteractionView | null | undefined): InteractionActionView | null {
  return view?.actions.find((action) => action.slot === 'alternate') ?? null
}

/** Skill HUD strings still carry legacy `[E]` prefixes — strip for structured slots. */
export function interactionActionFromSkillPrompt(promptLabel: string): InteractionActionView {
  return {
    slot: 'primary',
    label: stripBracketPrefix(promptLabel),
    enabled: promptLabel.includes('[E]'),
    reasonLabel: '',
  }
}
