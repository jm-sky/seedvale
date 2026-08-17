import { Timer } from 'three'
import { NpcAgent } from '../ai/NpcAgent'
import { PlayerController } from '../player/PlayerController'
import { ui } from '../ui-vue/store'
import { isEngagedNpc, isNpcEngagementOpen, type NpcEngagementState } from './npcEngagement'

const DIALOGUE_TIME_SCALE = 0.25

function engagementState(): NpcEngagementState<NpcAgent> {
  return {
    dialogueOpen: ui.npcDialogueMenu.open,
    dialogueNpc: ui.npcDialogueMenu.npc as NpcAgent | null,
    merchantOpen: ui.merchant.open,
    merchantNpc: ui.merchant.npc as NpcAgent | null,
  }
}

const originalGetDelta = Timer.prototype.getDelta
Timer.prototype.getDelta = function (): number {
  const delta = originalGetDelta.call(this)
  return isNpcEngagementOpen(engagementState()) ? delta * DIALOGUE_TIME_SCALE : delta
}

const originalNpcUpdate = NpcAgent.prototype.update
NpcAgent.prototype.update = function (
  this: NpcAgent,
  dt,
  observerPos,
  observerYaw,
  timeOfDay,
  nearbyNpcCount,
): void {
  if (isEngagedNpc(engagementState(), this)) {
    originalNpcUpdate.call(this, 0, observerPos, observerYaw, timeOfDay, nearbyNpcCount)
    return
  }
  originalNpcUpdate.call(this, dt, observerPos, observerYaw, timeOfDay, nearbyNpcCount)
}

const originalPlayerUpdate = PlayerController.prototype.update
PlayerController.prototype.update = function (dt): void {
  if (isNpcEngagementOpen(engagementState())) return
  originalPlayerUpdate.call(this, dt)
}
