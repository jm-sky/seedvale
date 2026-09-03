import type { QuickActionsFireAvailability } from './store'
import {
  FIRE_PIT_STONE_COST,
  GRATE_COST,
  type LightActionResult,
  SIMPLE_FIRE_BRANCH_COST,
  TORCH_BRANCH_COST,
} from '../app/userActions'
import { CAPABILITY_NEED_LABEL } from '../items/itemCatalog'

/** Shared fire-action catalog for Quick Actions and Pauza → Akcje (review 007 C8).
 *  `buildGrate` (plan 175) is Quick-Actions-only, not duplicated into
 *  Pauza → Akcje — it targets whichever fire the player is standing next to,
 *  the same "world-context, not inventory-only" reasoning that already keeps
 *  `onRest`'s `nearTown` out of the pause menu. */

export type FireActionId = 'lightBranch' | 'lightWoodenTorch' | 'buildFirePit' | 'buildSimpleFire' | 'buildGrate'

export type FireActionHandlers = {
  onLightBranch?: (() => LightActionResult) | null
  onLightWoodenTorch?: (() => LightActionResult) | null
  onBuildFirePit?: (() => boolean) | null
  onBuildSimpleFire?: (() => LightActionResult) | null
  onBuildGrate?: (() => boolean) | null
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

type LightResult = {
  ok: boolean;
  toast: string;
  kind: 'info' | 'error'
}

const LIGHT_FAIL: Record<Exclude<LightActionResult, 'ok'>, string> = {
  'already-lit': 'Już płonie',
  missing: 'Brakuje surowców',
  'missing-capability': `Potrzebujesz ${CAPABILITY_NEED_LABEL.fire_starting}.`,
  'wrong-placement': 'Nie można zapalić ognia w tym miejscu',
  'need-hold': 'Weź pochodnię w rękę',
  'unknown-error': 'Wystąpił nieznany błąd',
}

function lightResult(
  result: LightActionResult,
  success: string,
): LightResult {
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
    cost: '',
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
      const built = handlers.onBuildSimpleFire?.() ?? 'unknown-error'
      return lightResult(built, 'Zbudowano ognisko!')
    },
  },
  {
    id: 'buildGrate',
    label: 'Zbuduj ruszt',
    cost: `${GRATE_COST.branch}× gałąź, ${GRATE_COST.stone}× kamień, ${GRATE_COST.iron_rod}× żelazny pręt`,
    availableKey: 'buildGrate',
    run: (handlers) => {
      const built = handlers.onBuildGrate?.() ?? false
      return built
        ? { ok: true, toast: 'Zbudowano ruszt!', kind: 'info' }
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
