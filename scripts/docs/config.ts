import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Status = 'draft' | 'done' | 'in progress' | 'planned' | 'verification needed'
export type Priority = 'high' | 'medium' | 'low'
export type Effort = 'XS' | 'S' | 'M' | 'L' | 'XL'

export type PlanType =
  | 'feature'
  | 'bug'
  | 'fix'
  | 'polish'
  | 'optimization'
  | 'refactor'
  | 'infrastructure'

export type Domain =
  | 'ai'
  | 'fauna'
  | 'items-player'
  | 'npc'
  | 'persistence'
  | 'quests-progression'
  | 'settlements'
  | 'settlements-npcs'
  | 'tools'
  | 'ui-input'
  | 'world'
  | 'world-terrain'

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = resolve(SCRIPT_DIR, '../..')

export const PLANS_DIR = 'docs/plans'
export const PLANS_PATH = resolve(ROOT_DIR, PLANS_DIR)
export const ARCHIVED_PLANS_DIR = resolve(PLANS_DIR, 'archive')
export const ARCHIVED_PLANS_PATH = resolve(ROOT_DIR, ARCHIVED_PLANS_DIR)
export const PLANS_README_PATH = resolve(PLANS_DIR, 'README.md')
export const PLANS_DONE_PATH = resolve(PLANS_DIR, 'DONE.md')
export const PLANS_RECOMMENDED_ORDER_PATH = resolve(PLANS_DIR, 'RECOMMENDED-ORDER.md')
export const NOTES_DIR = 'implementation-notes'
export const NOTES_PATH = resolve(PLANS_PATH, NOTES_DIR)
export const NOTES_SUFFIX = '-implementation-notes.md'
export const REVIEWS_DIR = 'reviews'
export const REVIEWS_PATH = resolve(PLANS_PATH, REVIEWS_DIR)

export const ROADMAP_DIR = 'docs/roadmap'
export const ROADMAP_PATH = resolve(ROOT_DIR, ROADMAP_DIR)
export const PLAN_METADATA_PATH = resolve(PLANS_DIR, 'PLAN-METADATA.md')
export const PLANNING_PATH = resolve(PLANS_DIR, 'PLANNING.md')

export const ASSETS_DIR = resolve(ROOT_DIR, '_temp')
export const SRC_DIR = resolve(ROOT_DIR, 'src')
export const DOCS_DIR = resolve(ROOT_DIR, 'docs')
export const CODE_MAP_DIR = resolve(DOCS_DIR, 'code-map')

export const PLAN_FILE_RE = /^([a-z0-9-]+)-(\d{3})-.+\.md$/
export const PLAN_ID_RE = /^([a-z0-9-]+)-(\d{3})-/
export const LEGACY_PLAN_FILE_RE = /^\d{4}-\d{2}-\d{2}--\d{3}--.+\.md$/
export const LEGACY_PLAN_ID_RE = /^\d{4}-\d{2}-\d{2}--(\d{3})--/

export const PLAN_CREATED_RE = /^\*\*Created:\*\*\s*(.+)$/im
export const PLAN_STATUS_RE = /^\*\*Status:\*\*\s*`([^`]+)`/im
export const PLAN_PRIORITY_RE = /\*\*Priority:\*\*\s*[^\w]*([A-Za-z]+)/i
export const PLAN_EFFORT_RE = /\*\*Effort:\*\*\s*`?([A-Za-z]{1,3})`?/i
export const PLAN_DEPENDS_RE = /^\*\*Depends on:\*\*\s*(.+)$/im
export const PLAN_DOMAIN_RE = /^\*\*Domain:\*\*\s*`?([^`\s]+)`?\s*$/im
export const PLAN_TYPE_RE = /^\*\*Type:\*\*\s*`?([^`\s]+)`?\s*$/im
export const PLAN_SUBDOMAINS_RE = /^\*\*Subdomains:\*\*\s*(.+)$/im
export const PLAN_TAGS_RE = /^\*\*Tags:\*\*\s*(.+)$/im
export const PLAN_ROADMAP_RE = /^\*\*Roadmap:\*\*\s*`?([^`\s]+)`?\s*$/im
export const PLAN_IMPLEMENTED_AT_RE = /^\*\*Implemented at:\*\*\s*(.+)$/im
export const PLAN_TITLE_RE = /^#\s*Plan:?\s*(.+)$/im

export const CREATED_DATE_FORMAT_RE = /^\d{4}-\d{2}-\d{2}$/
export const IMPLEMENTED_AT_FORMAT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/

export const AVAILABLE_STATUSES: Status[] = ['draft', 'done', 'in progress', 'planned', 'verification needed']
export const COMPLETED_STATUSES: Set<Status> = new Set(['done', 'verification needed'])
export const PRIORITY_ICONS: Record<Priority, string> = {
  high: '🔴',
  medium: '🟡',
  low: '⚪',
}

/** Lifecycle display order (Created → planned → in progress → verification needed → done), draft first. */
export const STATUS_DISPLAY_ORDER: Status[] = ['draft', 'planned', 'in progress', 'verification needed', 'done']

export const STATUS_ICONS: Record<Status, string> = {
  draft: '📝',
  planned: '📋',
  'in progress': '🔄',
  'verification needed': '🔍',
  done: '✅',
}

export const STATUS_DESCRIPTIONS: Record<Status, string> = {
  draft: 'Plan exists but is not yet committed to the implementation backlog',
  planned: 'Ready for implementation; participates in planned ordering',
  'in progress': 'Implementation currently underway',
  'verification needed': 'Implementation is complete enough to require meaningful browser/manual verification',
  done: 'Implementation and required verification are complete',
}

export const PRIORITY_WEIGHTS: Record<Priority, number> = {
  high: 30,
  medium: 20,
  low: 10,
}

export const EFFORT_PENALTIES: Record<Effort, number> = {
  XS: 0,
  S: 1,
  M: 3,
  L: 6,
  XL: 10,
}

export const EFFORT_DESCRIPTIONS: Record<Effort, string> = {
  XS: 'minutes',
  S: '~15–30 min',
  M: '~30–90 min',
  L: '~1–3 h',
  XL: 'several sessions',
}

export const AVAILABLE_TYPES: PlanType[] = [
  'feature',
  'bug',
  'fix',
  'polish',
  'optimization',
  'refactor',
  'infrastructure',
]

export const TYPE_DESCRIPTIONS: Record<PlanType, string> = {
  feature: 'New functionality, capability, or world/system behaviour',
  bug: 'Correction of behaviour that is objectively incorrect or broken',
  fix: 'Deliberate correction/improvement of an existing implementation that is not necessarily a bug',
  polish: 'Quality improvement such as UX, visual presentation, animation, audio, feedback, or feel',
  optimization: 'Performance/scalability/resource-cost improvement',
  refactor: 'Internal restructuring without intended behavioural change',
  infrastructure: 'Tooling, build, development infrastructure, scripts, CI, or other supporting infrastructure',
}

/** Field labels as they appear in a plan header, e.g. `**Created:**`. */
export const REQUIRED_PLAN_FIELDS = [
  'Created',
  'Status',
  'Type',
  'Priority',
  'Effort',
  'Depends on',
  'Domain',
] as const

export const OPTIONAL_PLAN_FIELDS = [
  'Subdomains',
  'Tags',
  'Roadmap',
  'Implemented at',
] as const

export const AVAILABLE_DOMAINS: Record<
  Domain,
  {
    summary: string
    subdomains: string[]
  }
> = {
  ai: {
    summary: 'AI-assisted dialogue, characterisation and related AI systems',
    subdomains: ['dialogue', 'characterisation', 'generation', 'agents'],
  },
  fauna: {
    summary: 'Wildlife, predators/prey and ecosystem simulation',
    subdomains: [
      'predation',
      'prey',
      'habitat',
      'reproduction',
      'migration',
      'lifecycle',
      'population',
      'domestication',
    ],
  },
  'items-player': {
    summary: 'Player inventory, items, tools and item interaction',
    subdomains: ['inventory', 'items', 'tools', 'interaction', 'player-needs'],
  },
  npc: {
    summary: 'NPC behaviour, needs, goals, traits, decisions and actions',
    subdomains: [
      'behavior',
      'needs',
      'goals',
      'decision-making',
      'relationships',
      'memory',
      'lifecycle',
      'work',
      'combat',
      'dialogue',
    ],
  },
  persistence: {
    summary: 'Save data, storage, serialization and migrations',
    subdomains: ['save-data', 'serialization', 'storage', 'migration'],
  },
  'quests-progression': {
    summary: 'Quests, relationships, progression and rewards',
    subdomains: ['quests', 'relationships', 'progression', 'rewards'],
  },
  settlements: {
    summary: 'Settlements, buildings, population, resources and development',
    subdomains: ['buildings', 'population', 'resources', 'development', 'economy'],
  },
  'settlements-npcs': {
    summary: 'Households, schedules, settlement NPCs and local economy',
    subdomains: ['household', 'schedules', 'economy', 'logistics', 'social'],
  },
  tools: {
    summary: 'Development tools, diagnostics and automation',
    subdomains: ['debug', 'development', 'diagnostics', 'automation'],
  },
  'ui-input': {
    summary: 'UI, HUD, input and player interaction',
    subdomains: ['hud', 'menus', 'input', 'interaction', 'feedback'],
  },
  world: {
    summary: 'World state, resources, places, time, weather and simulation',
    subdomains: ['resources', 'places', 'time', 'weather', 'events', 'simulation'],
  },
  'world-terrain': {
    summary: 'Terrain, chunks, vegetation, roads and world rendering',
    subdomains: [
      'terrain',
      'chunks',
      'vegetation',
      'roads',
      'landmarks',
      'rendering',
    ],
  },
}

export const AVAILABLE_TAGS = [
  'gameplay',
  'combat',
  'economy',
  'persistence',
  'performance',
  'ui',
  'visual',
  'audio',
  'animation',
  'simulation',
  'multiplayer',
  'ai',
  'polish',
  'tooling',
] as const

/**
 * Split a `Subdomains`/`Tags` field value into individual tokens.
 *
 * Plan headers have used a few interchangeable separator styles historically
 * (`` `a` `b` ``, `a, b`, `[a]`) — this normalizes all of them for parsing.
 * It does not enforce a canonical style; use it for reading, not writing.
 *
 * @domain tools
 */
export const parseTokenList = (raw: string | undefined): string[] => {
  if (!raw) return []

  return raw
    .split(/[`,[\]]+/)
    .map(value => value.trim())
    .filter(Boolean)
}
