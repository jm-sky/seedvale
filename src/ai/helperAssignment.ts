/**
 * Minimal data-only NPC helper assignment (plan 167 §10) — what an existing
 * NPC delivers and to which player `Container`, not a relationship
 * (`relation`/personality decide *whether* an NPC is willing to help, this
 * only records target + permitted delivery) and not a command/order/task
 * system. Water stays out of scope for the food vertical slice (plan §15).
 */
export type HelperResourceKind = 'food'

export type HelperAssignment = {
  readonly targetContainerId: string
  readonly resourceKind: HelperResourceKind
  readonly enabled: boolean
}
