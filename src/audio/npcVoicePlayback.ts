/**
 * Shared spatial NPC voice playback (npc-044 dialogue + npc-049 life barks).
 * Owns the configured `PlayAt` callback so simulation and Vue dialogue share
 * one presentation path without duplicating audio setup.
 *
 * @domain npc
 */

import type { PlayAt, WorldSoundPosition } from './createWorldAudio'

/** Quiet enough to sit under the `emitUiOpen()` panel chirp. */
export const NPC_VOICE_VOLUME = 0.75

let npcVoicePlayAt: PlayAt | null = null

/** Wire (or clear) the world-audio `PlayAt` used for all NPC spoken lines. */
export function configureNpcVoicePlayback(playAt: PlayAt | null): void {
  npcVoicePlayAt = playAt
}

/**
 * Play a resolved NPC voice URL at a world position. No-op when playback is
 * unconfigured, the URL is missing, or position is unavailable.
 */
export function playNpcVoiceAt(
  position: WorldSoundPosition | null | undefined,
  url: string | undefined,
  volume: number = NPC_VOICE_VOLUME,
): void {
  if (!position || !url || !npcVoicePlayAt) return
  npcVoicePlayAt(url, position, volume)
}
