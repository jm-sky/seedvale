import { describe, expect, it, vi } from 'vitest'
import { type QuestMarkerSink, syncNpcQuestMarkers } from './npcQuestMarkerSync'

function sink(id: string): QuestMarkerSink & { marker: string | null } {
  return {
    id,
    marker: null,
    setQuestMarker(marker) {
      this.marker = marker
    },
  }
}

describe('syncNpcQuestMarkers (plan quests-progression-055)', () => {
  it('initializes a late-created runtime NPC after quest dirty was already cleared', () => {
    const synced = new WeakSet<QuestMarkerSink>()
    const labelMarker = vi.fn((npcId: string) => `marker:${npcId}`)

    syncNpcQuestMarkers({ npcs: [], questDirty: true, labelMarker, synced })
    expect(labelMarker).not.toHaveBeenCalled()

    const agentA = sink('X')
    syncNpcQuestMarkers({
      npcs: [agentA],
      questDirty: false,
      labelMarker,
      synced,
    })
    expect(agentA.marker).toBe('marker:X')
    expect(labelMarker).toHaveBeenCalledTimes(1)

    syncNpcQuestMarkers({
      npcs: [agentA],
      questDirty: false,
      labelMarker,
      synced,
    })
    expect(labelMarker).toHaveBeenCalledTimes(1)
  })

  it('treats a recreated agent with the same stable id as a new sink', () => {
    const synced = new WeakSet<QuestMarkerSink>()
    const labelMarker = vi.fn((npcId: string) => `marker:${npcId}`)
    const agentA = sink('X')
    syncNpcQuestMarkers({
      npcs: [agentA],
      questDirty: true,
      labelMarker,
      synced,
    })
    expect(agentA.marker).toBe('marker:X')

    const agentB = sink('X')
    syncNpcQuestMarkers({
      npcs: [agentB],
      questDirty: false,
      labelMarker,
      synced,
    })
    expect(agentB.marker).toBe('marker:X')
    expect(labelMarker).toHaveBeenCalledTimes(2)
  })

  it('recomputes every currently loaded sink when quests are dirty', () => {
    const synced = new WeakSet<QuestMarkerSink>()
    const first = sink('anna')
    const second = sink('piotr')
    let glyph = '!'
    const labelMarker = vi.fn((npcId: string) => `${glyph}:${npcId}`)

    syncNpcQuestMarkers({
      npcs: [first, second],
      questDirty: true,
      labelMarker,
      synced,
    })
    expect(first.marker).toBe('!:anna')
    expect(second.marker).toBe('!:piotr')

    glyph = '…'
    syncNpcQuestMarkers({
      npcs: [first, second],
      questDirty: true,
      labelMarker,
      synced,
    })
    expect(first.marker).toBe('…:anna')
    expect(second.marker).toBe('…:piotr')
    expect(labelMarker).toHaveBeenCalledTimes(4)
  })
})
