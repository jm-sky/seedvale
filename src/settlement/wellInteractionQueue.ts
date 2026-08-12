import type { InteractionQueueConfig } from '../simulation/interactionQueue'
import type { Vec3 } from '../simulation/types'
import { anchorsForAsset } from '../assets/assetAnchorData'
import { interactionQueueAnchorFromResolved, resolveInteractionPoint } from '../assets/resolveInteractionPoint'
import type { Object3D } from 'three'

/** Rim clearance when the queue anchor is the south rim (`settlement:well` metadata). */
export const WELL_QUEUE_SERVING_OFFSET_ANCHOR = 0.3

/** Well base radius + margin when falling back to plaza-center anchor. */
export const WELL_QUEUE_SERVING_OFFSET_FALLBACK = 0.85 + 0.3

export type WellQueueRestConfig = Omit<InteractionQueueConfig, 'anchor' | 'lineDir' | 'servingOffset'>

/**
 * Build well drink queue config from the procedural well prop + anchor metadata.
 * Falls back to the pre-Phase-6 plaza-center anchor when metadata is absent.
 */
export function buildWellInteractionQueueConfig(
  well: Object3D,
  worldAnchor: Vec3,
  rest: WellQueueRestConfig,
): InteractionQueueConfig {
  const resolved = resolveInteractionPoint(
    well,
    anchorsForAsset('settlement:well'),
    { anchor: worldAnchor, lineDir: { x: 0, z: 1 } },
  )
  const servingOffset = resolved.source === 'anchor'
    ? WELL_QUEUE_SERVING_OFFSET_ANCHOR
    : WELL_QUEUE_SERVING_OFFSET_FALLBACK

  return interactionQueueAnchorFromResolved(resolved, {
    ...rest,
    servingOffset,
  })
}
