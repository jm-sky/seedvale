import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = resolve(SCRIPT_DIR, '../..')

export const PLANS_DIR = resolve(ROOT_DIR, 'docs/plans')
export const PLANS_PATH = resolve(ROOT_DIR, PLANS_DIR)
export const PLANS_README_PATH = resolve(PLANS_DIR, 'README.md')
export const PLANS_DONE_PATH = resolve(PLANS_DIR, 'DONE.md')
export const NOTES_DIR = 'implementation-notes'
export const NOTES_PATH = resolve(PLANS_PATH, NOTES_DIR)
export const NOTES_SUFFIX = '-implementation-notes.md'
export const REVIEWS_DIR = 'reviews'
export const REVIEWS_PATH = resolve(PLANS_PATH, REVIEWS_DIR)

export const ASSETS_DIR = resolve(ROOT_DIR, '_temp')
export const SRC_DIR = resolve(ROOT_DIR, 'src')
export const DOCS_DIR = resolve(ROOT_DIR, 'docs')
export const CODE_MAP_DIR = resolve(DOCS_DIR, 'code-map')

export const PLAN_FILE_RE = /-[0-9]{3}-.+\.md$/
export const PLAN_ID_RE = /^([a-z0-9-]+)-(\d{3})-/
export const LEGACY_PLAN_FILE_RE = /^\d{4}-\d{2}-\d{2}--\d{3}--.+\.md$/
export const LEGACY_PLAN_ID_RE = /^\d{4}-\d{2}-\d{2}--(\d{3})--/
