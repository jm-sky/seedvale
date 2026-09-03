/**
 * Shared plan-header parsing and validation.
 *
 * Single reusable implementation of the plan metadata contract described in
 * `docs/plans/PLAN-METADATA.md`. Consumed by `plans-sync.ts`,
 * `migrate-plan-metadata.ts`, `cleanup-plan-metadata.ts` and
 * `generate-plan-docs.ts` so the contract has exactly one machine-readable
 * reader, matching `config.ts` being the single machine-readable source of
 * truth for the vocabulary itself.
 *
 * @domain tools
 */

import { readdir } from 'node:fs/promises'
import {
  AVAILABLE_DOMAINS,
  AVAILABLE_STATUSES,
  AVAILABLE_TYPES,
  COMPLETED_STATUSES,
  CREATED_DATE_FORMAT_RE,
  EFFORT_PENALTIES,
  IMPLEMENTED_AT_FORMAT_RE,
  parseTokenList,
  PLAN_CREATED_RE,
  PLAN_DEPENDS_RE,
  PLAN_DOMAIN_RE,
  PLAN_EFFORT_RE,
  PLAN_IMPLEMENTED_AT_RE,
  PLAN_PRIORITY_RE,
  PLAN_ROADMAP_RE,
  PLAN_STATUS_RE,
  PLAN_SUBDOMAINS_RE,
  PLAN_TAGS_RE,
  PLAN_TITLE_RE,
  PLAN_TYPE_RE,
  type PlanType,
  PRIORITY_WEIGHTS,
  ROADMAP_PATH,
  type Status,
} from './config.js'

export type PlanHeader = {
  file: string
  title?: string
  created?: string
  status?: string
  type?: string
  priority?: string
  effort?: string
  dependsOn?: string
  domain?: string
  subdomains: string[]
  tags: string[]
  roadmap?: string
  implementedAt?: string
}

export type ValidationIssue = {
  file: string
  field?: string
  message: string
}

export type ValidatePlanHeaderOptions = {
  /** Domain implied by the filename, e.g. `npc` from `npc-002-...md`. Omit for legacy/date-named plans. */
  domainFromFilename?: string
  /** Canonical roadmap basenames (without `.md`), from `listRoadmapFiles()`. */
  roadmapFiles?: Set<string>
  /** Legacy date-ID plans predate `Domain` and are not required to carry it. */
  legacy?: boolean
}

/** Header block is everything above the first `##` heading. */
const extractHeaderBlock = (content: string): string => {
  const idx = content.search(/^##\s/m)
  return idx === -1 ? content : content.slice(0, idx)
}

export const parsePlanHeader = (file: string, content: string): PlanHeader => {
  const header = extractHeaderBlock(content)

  return {
    file,
    title: header.match(PLAN_TITLE_RE)?.[1]?.trim(),
    created: header.match(PLAN_CREATED_RE)?.[1]?.trim(),
    status: header.match(PLAN_STATUS_RE)?.[1]?.trim(),
    type: header.match(PLAN_TYPE_RE)?.[1]?.trim(),
    priority: header.match(PLAN_PRIORITY_RE)?.[1]?.trim(),
    effort: header.match(PLAN_EFFORT_RE)?.[1]?.trim(),
    dependsOn: header.match(PLAN_DEPENDS_RE)?.[1]?.trim(),
    domain: header.match(PLAN_DOMAIN_RE)?.[1]?.trim(),
    subdomains: parseTokenList(header.match(PLAN_SUBDOMAINS_RE)?.[1]),
    tags: parseTokenList(header.match(PLAN_TAGS_RE)?.[1]),
    roadmap: header.match(PLAN_ROADMAP_RE)?.[1]?.trim(),
    implementedAt: header.match(PLAN_IMPLEMENTED_AT_RE)?.[1]?.trim(),
  }
}

/** Roadmap basenames (without `.md`) currently present in `docs/roadmap/`. */
export const listRoadmapFiles = async (): Promise<Set<string>> => {
  const files = await readdir(ROADMAP_PATH)

  return new Set(
    files
      .filter(file => file.endsWith('.md') && file !== 'README.md')
      .map(file => file.replace(/\.md$/, '')),
  )
}

export const validatePlanHeader = (
  header: PlanHeader,
  options: ValidatePlanHeaderOptions = {},
): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  const push = (field: string, message: string): void => {
    issues.push({ file: header.file, field, message })
  }

  if (!header.created) {
    push('Created', 'missing "Created"')
  } else if (!CREATED_DATE_FORMAT_RE.test(header.created)) {
    push('Created', `invalid "Created" value "${header.created}" (expected YYYY-MM-DD)`)
  }

  if (!header.status) {
    push('Status', 'missing "Status"')
  } else if (!AVAILABLE_STATUSES.includes(header.status as Status)) {
    push('Status', `invalid "Status" value "${header.status}" (expected one of: ${AVAILABLE_STATUSES.join(', ')})`)
  }

  // `Type` is only mandatory for `planned` plans (the migration scope of
  // tools-009) — retroactively requiring it on historical `done`/`verification
  // needed`/`in progress` plans predating the field is out of scope. If
  // present at any status, it must still be a valid vocabulary value.
  if (!header.type) {
    if (header.status === 'planned') push('Type', 'missing "Type"')
  } else if (!AVAILABLE_TYPES.includes(header.type as PlanType)) {
    push('Type', `invalid "Type" value "${header.type}" (expected one of: ${AVAILABLE_TYPES.join(', ')})`)
  }

  const isCompleted = header.status !== undefined && COMPLETED_STATUSES.has(header.status as Status)

  if (!header.priority) {
    if (!isCompleted) push('Priority', 'missing "Priority"')
  } else if (!(header.priority.toLowerCase() in PRIORITY_WEIGHTS)) {
    push('Priority', `invalid "Priority" value "${header.priority}" (expected one of: ${Object.keys(PRIORITY_WEIGHTS).join(', ')})`)
  }

  if (!header.effort) {
    if (!isCompleted) push('Effort', 'missing "Effort"')
  } else if (!(header.effort.toUpperCase() in EFFORT_PENALTIES)) {
    push('Effort', `invalid "Effort" value "${header.effort}" (expected one of: ${Object.keys(EFFORT_PENALTIES).join(', ')})`)
  }

  if (!header.dependsOn) {
    push('Depends on', 'missing "Depends on"')
  }

  if (!options.legacy) {
    if (!header.domain) {
      push('Domain', 'missing "Domain"')
    } else if (!(header.domain in AVAILABLE_DOMAINS)) {
      push('Domain', `invalid "Domain" value "${header.domain}" (expected one of: ${Object.keys(AVAILABLE_DOMAINS).join(', ')})`)
    } else if (
      options.domainFromFilename &&
      header.domain !== options.domainFromFilename
    ) {
      push('Domain', `Domain "${header.domain}" does not match filename domain "${options.domainFromFilename}"`)
    }
  }

  if (header.roadmap && options.roadmapFiles) {
    const normalized = header.roadmap.replace(/\.md$/, '')

    if (!options.roadmapFiles.has(normalized)) {
      push('Roadmap', `Roadmap "${header.roadmap}" does not match a file in docs/roadmap/`)
    }
  }

  if (header.implementedAt && !IMPLEMENTED_AT_FORMAT_RE.test(header.implementedAt)) {
    push('Implemented at', `invalid "Implemented at" value "${header.implementedAt}" (expected YYYY-MM-DD HH:mm)`)
  }

  return issues
}

export const formatValidationIssues = (issues: ValidationIssue[]): string =>
  issues.map(issue => `${issue.file}: ${issue.message}`).join('\n')
