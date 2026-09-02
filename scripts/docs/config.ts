import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Status = 'draft' | 'done' | 'in progress' | 'planned' | 'verification needed'
export type Priority = 'high' | 'medium' | 'low'
export type Effort = 'XS' | 'S' | 'M' | 'L' | 'XL'

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = resolve(SCRIPT_DIR, '../..')

export const PLANS_DIR = 'docs/plans'
export const PLANS_PATH = resolve(ROOT_DIR, PLANS_DIR)
export const ARCHIVED_PLANS_DIR = resolve(PLANS_DIR, 'archive')
export const ARCHIVED_PLANS_PATH = resolve(ROOT_DIR, ARCHIVED_PLANS_DIR)
export const PLANS_README_PATH = resolve(PLANS_DIR, 'README.md')
export const PLANS_DONE_PATH = resolve(PLANS_DIR, 'DONE.md')
export const PLANS_DEPENDENCIES_PATH = resolve(PLANS_DIR, 'DEPENDENCIES.md')
export const NOTES_DIR = 'implementation-notes'
export const NOTES_PATH = resolve(PLANS_PATH, NOTES_DIR)
export const NOTES_SUFFIX = '-implementation-notes.md'
export const REVIEWS_DIR = 'reviews'
export const REVIEWS_PATH = resolve(PLANS_PATH, REVIEWS_DIR)

export const ASSETS_DIR = resolve(ROOT_DIR, '_temp')
export const SRC_DIR = resolve(ROOT_DIR, 'src')
export const DOCS_DIR = resolve(ROOT_DIR, 'docs')
export const CODE_MAP_DIR = resolve(DOCS_DIR, 'code-map')

export const PLAN_FILE_RE = /^([a-z0-9-]+)-(\d{3})-.+\.md$/
export const PLAN_ID_RE = /^([a-z0-9-]+)-(\d{3})-/
export const LEGACY_PLAN_FILE_RE = /^\d{4}-\d{2}-\d{2}--\d{3}--.+\.md$/
export const LEGACY_PLAN_ID_RE = /^\d{4}-\d{2}-\d{2}--(\d{3})--/

export const PLAN_STATUS_RE = /^\*\*Status:\*\*\s*`([^`]+)`/im
export const PLAN_PRIORITY_RE = /\*\*Priority:\*\*\s*[^\w]*([A-Za-z]+)/i
export const PLAN_EFFORT_RE = /\*\*Effort:\*\*\s*`?([A-Za-z]{1,3})`?/i
export const PLAN_DEPENDS_RE = /^\*\*Depends on:\*\*\s*(.+)$/im
export const PLAN_DOMAIN_RE = /^\*\*domain:\*\*\s*`?([^`\s]+)`?\s*$/im

export const AVAILABLE_STATUSES: Status[] = ['draft', 'done', 'in progress', 'planned', 'verification needed']
export const COMPLETED_STATUSES: Set<Status> = new Set(['done', 'verification needed'])
export const PRIORITY_ICONS: Record<Priority, string> = {
  high: '🔴',
  medium: '🟡',
  low: '⚪',
}
