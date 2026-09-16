/**
 * Runtime NPC quest-marker presentation sync.
 *
 * Quest-domain dirty (`QuestManager.isDirty()`) and sink lifecycle are
 * independent: a newly created `NpcAgent` still needs one initial
 * `labelMarker` projection even when quests are clean. Identity is the
 * runtime object, not stable `NpcId`, so settlement unload/reload treats
 * the replacement agent as a new sink.
 *
 * @domain quests-progression
 */

export type QuestMarkerSink = {
  readonly id: string
  setQuestMarker(marker: string | null): void
}

/**
 * Pushes the current `labelMarker` onto loaded runtime NPC sinks.
 *
 * - `questDirty`: recompute every provided sink and remember it.
 * - otherwise: project once for each sink that is not yet in `synced`.
 *
 * Does not retain sinks strongly; `synced` must be a `WeakSet`.
 *
 * @domain quests-progression
 */
export function syncNpcQuestMarkers<T extends QuestMarkerSink>(options: {
  npcs: Iterable<T>
  questDirty: boolean
  labelMarker: (npcId: string) => string | null
  synced: WeakSet<T>
}): void {
  for (const npc of options.npcs) {
    if (!options.questDirty && options.synced.has(npc)) continue
    npc.setQuestMarker(options.labelMarker(npc.id))
    options.synced.add(npc)
  }
}
