/** Snapshot of the overlays that freeze a face-to-face NPC (dialogue + trade). */
export type NpcEngagementState<T> = {
  dialogueOpen: boolean
  dialogueNpc: T | null
  merchantOpen: boolean
  merchantNpc: T | null
}

export function isNpcEngagementOpen<T>(state: NpcEngagementState<T>): boolean {
  return state.dialogueOpen || state.merchantOpen
}

export function engagedNpc<T>(state: NpcEngagementState<T>): T | null {
  if (state.dialogueOpen) return state.dialogueNpc
  if (state.merchantOpen) return state.merchantNpc
  return null
}

export function isEngagedNpc<T>(state: NpcEngagementState<T>, npc: T): boolean {
  return engagedNpc(state) === npc
}
