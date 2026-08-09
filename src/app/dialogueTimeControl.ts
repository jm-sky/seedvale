import { Clock } from 'three'
import { NpcAgent } from '../ai/NpcAgent'
import { PlayerController } from '../player/PlayerController'
import { ui } from '../ui-vue/store'

const DIALOGUE_TIME_SCALE = 0.25

const originalGetDelta = Clock.prototype.getDelta
Clock.prototype.getDelta = function (): number {
  const delta = originalGetDelta.call(this)
  return ui.npcDialogueMenu.open ? delta * DIALOGUE_TIME_SCALE : delta
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
  if (ui.npcDialogueMenu.open && ui.npcDialogueMenu.npc === this) {
    originalNpcUpdate.call(this, 0, observerPos, observerYaw, timeOfDay, nearbyNpcCount)
    return
  }
  originalNpcUpdate.call(this, dt, observerPos, observerYaw, timeOfDay, nearbyNpcCount)
}

const originalPlayerUpdate = PlayerController.prototype.update
PlayerController.prototype.update = function (dt): void {
  if (ui.npcDialogueMenu.open) return
  originalPlayerUpdate.call(this, dt)
}
