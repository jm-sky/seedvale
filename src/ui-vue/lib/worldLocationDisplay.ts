import { Building2, Cross, Gem, MapPin, Mountain, Waves } from 'lucide-vue-next'
import type { WorldLocationKind } from '../../world/locations/worldLocationTypes'
import type { Component } from 'vue'

/** DOM-facing presentation for `WorldLocationKind` (world-012 map-markers
 *  follow-up) — the popover and target list previously showed the map's own
 *  coarse `MapLocationKind` (`settlement`/`landmark`), so every non-settlement
 *  location read as generic "Miejsce". `WorldLocation.kind` (resolved via
 *  `worldLocationKindFromId`) stays the single source of truth for the kind
 *  itself; this only maps that kind to a label/icon. Canvas marker colour
 *  lives in `mapColors.ts` (framework-agnostic, no Vue import). */
export const LOCATION_KIND_LABEL: Record<WorldLocationKind, string> = {
  settlement: 'Osada',
  cave: 'Jaskinia',
  cemetery: 'Cmentarz',
  lake: 'Jezioro',
  mountainPeak: 'Szczyt',
}

export const LOCATION_KIND_LABEL_FALLBACK = 'Miejsce'

export const LOCATION_KIND_ICON: Record<WorldLocationKind, Component> = {
  settlement: Building2,
  cave: Gem,
  cemetery: Cross,
  lake: Waves,
  mountainPeak: Mountain,
}

export const LOCATION_KIND_ICON_FALLBACK: Component = MapPin

export function locationKindLabel(kind: WorldLocationKind | null): string {
  return kind ? LOCATION_KIND_LABEL[kind] : LOCATION_KIND_LABEL_FALLBACK
}

export function locationKindIcon(kind: WorldLocationKind | null): Component {
  return kind ? LOCATION_KIND_ICON[kind] : LOCATION_KIND_ICON_FALLBACK
}
