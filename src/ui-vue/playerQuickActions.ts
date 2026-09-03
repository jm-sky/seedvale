import type { ActionRequirement, ActionResult } from '../app/actions/actionContracts'
import type { FireActionId, QuickActionsFireAvailability } from './store'
import { FIRE_PIT_STONE_COST, GRATE_COST, SIMPLE_FIRE_BRANCH_COST, TORCH_BRANCH_COST, WOOD_PILE_BEAM_COST } from '../app/userActions'
import { CAPABILITY_NEED_LABEL } from '../items/itemCatalog'
import { ITEM_DEFS, type ItemKind } from '../items/items'

/** Shared fire-action catalog for Quick Actions and Pauza → Akcje (review 007 C8,
 *  reworked by plan `ui-input-007` around the shared `ActionResult`/
 *  `ActionAvailability` contract). `buildGrate` (plan 175) is Quick-Actions-only,
 *  not duplicated into Pauza → Akcje — it targets whichever fire the player is
 *  standing next to, the same "world-context, not inventory-only" reasoning
 *  that already keeps `onRest`'s `nearTown` out of the pause menu. */

export type { FireActionId }

/** Every fire action in the catalog has a mandatory handler — a missing one
 *  is a wiring bug (an action listed without its implementation), not a
 *  normal gameplay unavailability, so it is asserted rather than silently
 *  treated as unavailable (plan `ui-input-007` §5). */
export type FireActionHandlers = {
  onLightBranch: (() => ActionResult) | null
  onLightWoodenTorch: (() => ActionResult) | null
  onBuildFirePit: (() => ActionResult) | null
  onBuildSimpleFire: (() => ActionResult) | null
  onBuildWoodPile: (() => ActionResult) | null
  onBuildGrate: (() => ActionResult) | null
}

export type VisibleFireAction = {
  id: FireActionId
  label: string
  cost: string
  available: boolean
  missing: readonly ActionRequirement[]
  run: () => { ok: boolean; toast: string; kind: 'info' | 'error' }
}

type FireActionDef = {
  id: FireActionId
  label: string
  costItems: readonly { item: ItemKind; count: number }[]
  run: (handlers: FireActionHandlers) => { ok: boolean; toast: string; kind: 'info' | 'error' }
}

/** Polish label for a `target`-kind `ActionRequirement.id` — the only place
 *  these reason ids are turned into user-facing text (plan `ui-input-007`
 *  §2/§3: structural data in the app layer, labels at the UI edge). */
const TARGET_REQUIREMENT_LABEL: Record<string, string> = {
  firePlacement: 'Nie można postawić ognia w tym miejscu',
  grateTarget: 'Musisz stać przy własnym ognisku',
  torchNotLit: 'Już płonie',
  freeHand: 'Weź pochodnię w rękę',
}

function describeRequirement(req: ActionRequirement): string {
  switch (req.kind) {
    case 'capability':
      return `Potrzebujesz ${CAPABILITY_NEED_LABEL[req.capability]}.`
    case 'item':
      return `Brakuje: ${req.required - req.actual}× ${ITEM_DEFS[req.item].label}`
    case 'target':
      return TARGET_REQUIREMENT_LABEL[req.id] ?? 'Nie można wykonać tej akcji'
  }
}

function describeMissing(missing: readonly ActionRequirement[]): string {
  return missing.map(describeRequirement).join(' ')
}

/** A listed fire action's handler must exist by the time the catalog is
 *  rendered — `createApp.ts` wires every one of them synchronously during
 *  setup. A `null` here means an action was added to the catalog without its
 *  implementation, so this throws instead of masking the bug as an ordinary
 *  "unavailable" result (plan `ui-input-007` §5 — do not use `?.() ?? false`). */
function requireHandler(handler: (() => ActionResult) | null, name: FireActionId): () => ActionResult {
  if (!handler) throw new Error(`Quick Actions: no handler configured for fire action "${name}"`)
  return handler
}

function runResult(result: ActionResult, successToast: string): { ok: boolean; toast: string; kind: 'info' | 'error' } {
  return result.ok
    ? { ok: true, toast: successToast, kind: 'info' }
    : { ok: false, toast: describeMissing(result.missing), kind: 'error' }
}

export function formatCostItems(items: readonly { item: ItemKind; count: number }[]): string {
  return items.map((i) => `${i.count}× ${ITEM_DEFS[i.item].label}`).join(', ')
}

/** Static per-action item costs (plan `ui-input-007` §3) — the single place
 *  the catalog's displayed cost text and its `item` requirements' counts both
 *  come from, alongside the cost constants in `userActions.ts`. */
export const FIRE_COST_ITEMS: Record<FireActionId, readonly { item: ItemKind; count: number }[]> = {
  lightBranch: [{ item: 'branch', count: TORCH_BRANCH_COST }],
  lightWoodenTorch: [],
  buildFirePit: [{ item: 'stone', count: FIRE_PIT_STONE_COST }],
  buildSimpleFire: [{ item: 'branch', count: SIMPLE_FIRE_BRANCH_COST }],
  buildWoodPile: [{ item: 'beam', count: WOOD_PILE_BEAM_COST }],
  buildGrate: [
    { item: 'branch', count: GRATE_COST.branch },
    { item: 'stone', count: GRATE_COST.stone },
    { item: 'iron_rod', count: GRATE_COST.iron_rod },
  ],
}

export const FIRE_QUICK_ACTIONS: readonly FireActionDef[] = [
  {
    id: 'lightBranch',
    label: 'Zapal gałąź',
    costItems: FIRE_COST_ITEMS.lightBranch,
    run: (handlers) => runResult(requireHandler(handlers.onLightBranch, 'lightBranch')(), 'Zapalono gałąź!'),
  },
  {
    id: 'lightWoodenTorch',
    label: 'Zapal pochodnię',
    costItems: FIRE_COST_ITEMS.lightWoodenTorch,
    run: (handlers) => runResult(requireHandler(handlers.onLightWoodenTorch, 'lightWoodenTorch')(), 'Zapalono pochodnię!'),
  },
  {
    id: 'buildFirePit',
    label: 'Zbuduj palenisko',
    costItems: FIRE_COST_ITEMS.buildFirePit,
    run: (handlers) => runResult(requireHandler(handlers.onBuildFirePit, 'buildFirePit')(), 'Zbudowano palenisko!'),
  },
  {
    id: 'buildSimpleFire',
    label: 'Zbuduj ognisko',
    costItems: FIRE_COST_ITEMS.buildSimpleFire,
    run: (handlers) => runResult(requireHandler(handlers.onBuildSimpleFire, 'buildSimpleFire')(), 'Zbudowano ognisko!'),
  },
  {
    id: 'buildWoodPile',
    label: 'Zbuduj stos drewna',
    costItems: FIRE_COST_ITEMS.buildWoodPile,
    run: (handlers) => runResult(requireHandler(handlers.onBuildWoodPile, 'buildWoodPile')(), 'Zbudowano stos drewna!'),
  },
  {
    id: 'buildGrate',
    label: 'Zbuduj ruszt',
    costItems: FIRE_COST_ITEMS.buildGrate,
    run: (handlers) => runResult(requireHandler(handlers.onBuildGrate, 'buildGrate')(), 'Zbudowano ruszt!'),
  },
]

/** The complete fire catalog, stably sorted available-first (plan
 *  `ui-input-007` §4) — never filtered. An unavailable action stays visible
 *  so the caller can render it `disabled` at 50% opacity instead of hiding
 *  it; `missing` is exposed for that presentation. Availability comes solely
 *  from `avail` (the authoritative `userActions.ts` checks synced by
 *  `createApp.ts`'s `syncQuickActionAvailability`) — this function derives
 *  nothing itself. */
export function visibleFireActions(
  avail: QuickActionsFireAvailability,
  handlers: FireActionHandlers,
): VisibleFireAction[] {
  return FIRE_QUICK_ACTIONS
    .map((def) => {
      const availability = avail[def.id]
      return {
        id: def.id,
        label: def.label,
        cost: formatCostItems(def.costItems),
        available: availability.available,
        missing: availability.available ? [] : availability.missing,
        run: () => def.run(handlers),
      }
    })
    .sort((a, b) => Number(b.available) - Number(a.available))
}
