import type { QuickActionsFireAvailability } from './store'
import {
  FIRE_PIT_STONE_COST,
  type LightActionResult,
  SIMPLE_FIRE_BRANCH_COST,
  TORCH_BRANCH_COST,
} from '../app/userActions'

/** Shared fire-action catalog for Quick Actions and Pauza → Akcje (review 007 C8). */

export type FireActionId = 'lightBranch' | 'lightWoodenTorch' | 'buildFirePit' | 'buildSimpleFire'

export type FireActionHandlers = {
  onLightBranch?: (() => LightActionResult) | null
  onLightWoodenTorch?: (() => LightActionResult) | null
  onBuildFirePit?: (() => boolean) | null
  onBuildSimpleFire?: (() => boolean) | null
}

export type VisibleFireAction = {
  id: FireActionId
  label: string
  cost: string
  run: () => { ok: boolean; toast: string; kind: 'info' | 'error' }
}

type FireActionDef = {
  id: FireActionId
  label: string
  cost: string
  availableKey: keyof QuickActionsFireAvailability
  run: (handlers: FireActionHandlers) => { ok: boolean; toast: string; kind: 'info' | 'error' }
}

const LIGHT_FAIL: Record<Exclude<LightActionResult, 'ok'>, string> = {
  'already-lit': 'Już płonie',
  missing: 'Brakuje surowców',
  'need-hold': 'Weź pochodnię w rękę',
}

function lightResult(
  result: LightActionResult,
  success: string,
): { ok: boolean; toast: string; kind: 'info' | 'error' } {
  if (result === 'ok') return { ok: true, toast: success, kind: 'info' }
  return { ok: false, toast: LIGHT_FAIL[result], kind: 'error' }
}

export const FIRE_QUICK_ACTIONS: readonly FireActionDef[] = [
  {
    id: 'lightBranch',
    label: 'Zapal gałąź',
    cost: `${TORCH_BRANCH_COST}× gałąź`,
    availableKey: 'lightBranch',
    run: (handlers) => lightResult(handlers.onLightBranch?.() ?? 'missing', 'Zapalono gałąź!'),
  },
  {
    id: 'lightWoodenTorch',
    label: 'Zapal pochodnię',
    cost: 'pochodnia w ręce',
    availableKey: 'lightWoodenTorch',
    run: (handlers) => lightResult(handlers.onLightWoodenTorch?.() ?? 'missing', 'Zapalono pochodnię!'),
  },
  {
    id: 'buildFirePit',
    label: 'Zbuduj palenisko',
    cost: `${FIRE_PIT_STONE_COST}× kamień`,
    availableKey: 'buildFirePit',
    run: (handlers) => {
      const built = handlers.onBuildFirePit?.() ?? false
      return built
        ? { ok: true, toast: 'Zbudowano palenisko!', kind: 'info' }
        : { ok: false, toast: 'Brakuje kamieni', kind: 'error' }
    },
  },
  {
    id: 'buildSimpleFire',
    label: 'Zbuduj ognisko',
    cost: `${SIMPLE_FIRE_BRANCH_COST}× gałąź`,
    availableKey: 'buildSimpleFire',
    run: (handlers) => {
      const built = handlers.onBuildSimpleFire?.() ?? false
      return built
        ? { ok: true, toast: 'Zbudowano ognisko!', kind: 'info' }
        : { ok: false, toast: 'Brakuje surowców', kind: 'error' }
    },
  },
]

export function visibleFireActions(
  avail: QuickActionsFireAvailability,
  handlers: FireActionHandlers,
): VisibleFireAction[] {
  return FIRE_QUICK_ACTIONS.filter((def) => avail[def.availableKey]).map((def) => ({
    id: def.id,
    label: def.label,
    cost: def.cost,
    run: () => def.run(handlers),
  }))
}
