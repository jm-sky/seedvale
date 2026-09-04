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
  type Domain,
  type Effort,
  EFFORT_PENALTIES,
  IMPLEMENTED_AT_FORMAT_RE,
  parseTokenList,
  PLAN_CREATED_RE,
  PLAN_DEPENDS_RE,
  PLAN_DOMAIN_RE,
  PLAN_EFFORT_RE,
  PLAN_ID_RE,
  PLAN_IMPLEMENTED_AT_RE,
  PLAN_PRIORITY_RE,
  PLAN_ROADMAP_RE,
  PLAN_STATUS_RE,
  PLAN_SUBDOMAINS_RE,
  PLAN_TAGS_RE,
  PLAN_TITLE_RE,
  PLAN_TYPE_RE,
  type PlanType,
  type Priority,
  PRIORITY_WEIGHTS,
  ROADMAP_PATH,
  type Status,
  STATUS_ICONS,
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
  const roadmap = header.match(PLAN_ROADMAP_RE)?.[1]?.trim()

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
    roadmap: ['', '-', 'none'].includes(roadmap ?? '') ? undefined : roadmap,
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

/**
 * Best-effort, deterministic repair of a single plan's metadata header — see
 * `docs/plans/PLAN-METADATA.md` for the contract and
 * `docs/plans/tools-011-plan-metadata-graceful-repair-and-self-healing-synchronization.md`
 * for the design this implements.
 *
 * A ChatGPT-authored plan frequently arrives with missing, unnormalized or
 * conflicting metadata. This is a data-quality problem, not a pipeline
 * error: `repairPlanMetadata()` fills in what it can safely and
 * deterministically infer (preferring explicit metadata, then filename,
 * then title, then a safe default — never guessing from plan body content),
 * normalizes formatting, and reports every change plus anything it
 * deliberately left alone (`repair.warnings`) instead of throwing. The only
 * things it never fabricates are `Created` and `Implemented at` dates.
 *
 * Consumed by `plans-sync.ts` (before any other metadata consumer runs) and
 * `migrate-plan-metadata.ts`, so there is exactly one repair implementation
 * — see the plan's "Single source of truth" design principle.
 *
 * @domain tools
 */

export type RepairSource =
  | 'explicit'
  | 'filename'
  | 'title'
  | 'content'
  | 'default'
  | 'normalization'

export type PlanRepairChange = {
  field: string
  from?: string
  to: string
  source: RepairSource
}

export type PlanRepair = {
  file: string
  changed: boolean
  changes: PlanRepairChange[]
  warnings: string[]
}

export type RepairPlanMetadataOptions = {
  /** Domain implied by the filename. Derived from `file` via `PLAN_ID_RE` when omitted. */
  domainFromFilename?: string
  /** Canonical roadmap basenames (without `.md`), from `listRoadmapFiles()`. Roadmap is only checked (never inferred) when this is supplied. */
  roadmapFiles?: Set<string>
  /** Legacy date-ID plans predate `Domain` — skip filename-based Domain inference entirely, matching `validatePlanHeader`'s `legacy` option. */
  legacy?: boolean
  /**
   * Current `<domain>-<id>` plan IDs (e.g. `npc-010`), from every non-legacy
   * plan file on disk. A bare local `Depends on` ID (`001`) is only expanded
   * to `<current-domain>-001` when that ID is in this set — the repository
   * also has pre-domain legacy plans with bare global numeric IDs (`177`,
   * resolved by `plans-recommended-order.ts` against `docs/plans/archive/`),
   * and a bare number can collide with either scheme. Expanding a bare ID
   * that doesn't resolve to a real local plan would silently break a valid
   * legacy reference, so it's left untouched instead when omitted or when
   * the target doesn't exist.
   */
  existingPlanIds?: Set<string>
}

export type RepairPlanMetadataResult = {
  content: string
  header: PlanHeader
  repair: PlanRepair
}

const DEFAULT_STATUS: Status = 'planned'
const DEFAULT_PRIORITY: Priority = 'medium'
const DEFAULT_EFFORT: Effort = 'S'
const DEFAULT_DEPENDS_ON = '-'

/**
 * Confident title/filename keyword → Type inference. Deliberately narrow —
 * anything not matched here falls back to the `feature` default (or
 * `infrastructure` for the `tools` domain) rather than a semantic
 * classifier, per the plan's "deterministic first" principle.
 */
const TYPE_KEYWORDS: Array<{ type: PlanType, pattern: RegExp }> = [
  { type: 'bug', pattern: /\bbugfix\b/i },
  { type: 'fix', pattern: /\bfix(?:e[ds])?\b/i },
  { type: 'optimization', pattern: /\b(optimi[sz]ation|performance|perf)\b/i },
  { type: 'refactor', pattern: /\brefactor/i },
  { type: 'polish', pattern: /\bpolish\b/i },
  { type: 'infrastructure', pattern: /\b(tooling|infrastructure|pipeline|generator|browser|observatory)\b/i },
]

export const inferType = (
  header: PlanHeader,
  file: string,
  domainFromFilename?: string,
): { type: PlanType, source: RepairSource } => {
  const haystack = header.title ?? file

  for (const { type, pattern } of TYPE_KEYWORDS) {
    if (pattern.test(haystack)) {
      return { type, source: header.title ? 'title' : 'filename' }
    }
  }

  // The `tools` domain is inherently tooling/infrastructure work — a
  // stronger deterministic default than the generic `feature` fallback.
  if (domainFromFilename === 'tools') {
    return { type: 'infrastructure', source: 'filename' }
  }

  return { type: 'feature', source: 'default' }
}

/** Canonical formatting: space-separated backtick tokens, e.g. `` `a` `b` ``. */
export const formatTokenList = (tokens: string[]): string => tokens.map(token => `\`${token}\``).join(' ')

/**
 * Rewrite `Subdomains`/`Tags` to the canonical backtick-space form when the
 * current formatting (comma-separated, bracketed, ...) differs from it.
 * A no-op when already canonical or when the field is absent.
 */
export const normalizeTokenListFormatting = (
  content: string,
  header: PlanHeader,
  changes: PlanRepairChange[],
): string => {
  let next = content

  if (header.subdomains.length > 0) {
    const canonical = formatTokenList(header.subdomains)
    const current = next.match(PLAN_SUBDOMAINS_RE)?.[1]?.trimEnd()

    if (current !== canonical) {
      next = next.replace(PLAN_SUBDOMAINS_RE, `**Subdomains:** ${canonical}`)
      changes.push({ field: 'Subdomains', from: current, to: canonical, source: 'normalization' })
    }
  }

  if (header.tags.length > 0) {
    const canonical = formatTokenList(header.tags)
    const current = next.match(PLAN_TAGS_RE)?.[1]?.trimEnd()

    if (current !== canonical) {
      next = next.replace(PLAN_TAGS_RE, `**Tags:** ${canonical}`)
      changes.push({ field: 'Tags', from: current, to: canonical, source: 'normalization' })
    }
  }

  return next
}

const normalizeStatusValue = (raw: string | undefined): Status | undefined => {
  if (!raw) return undefined
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  return AVAILABLE_STATUSES.includes(normalized as Status) ? (normalized as Status) : undefined
}

const normalizePriorityValue = (raw: string | undefined): Priority | undefined => {
  if (!raw) return undefined
  const lower = raw.trim().toLowerCase()
  return (lower in PRIORITY_WEIGHTS) ? (lower as Priority) : undefined
}

const normalizeEffortValue = (raw: string | undefined): Effort | undefined => {
  if (!raw) return undefined
  const upper = raw.trim().toUpperCase()
  return (upper in EFFORT_PENALTIES) ? (upper as Effort) : undefined
}

const buildStatusLine = (status: Status): string => `**Status:** \`${status}\` ${STATUS_ICONS[status]}`

/**
 * Fix only the icon immediately after the Status value, leaving any trailing
 * prose alone (plans commonly append a note or an implementation-notes link
 * after the icon). Replaces a missing, stale (e.g. `verification needed`
 * carrying the `planned` icon) or visually-similar-but-wrong emoji; a
 * simple "append if the exact icon string isn't found anywhere on the line"
 * check would both miss a wrong icon and duplicate a correct one that's
 * merely followed by more text.
 */
const ensureStatusIcon = (line: string, status: Status, changes: PlanRepairChange[]): string => {
  const icon = STATUS_ICONS[status]
  const prefixMatch = line.match(/^\*\*Status:\*\*\s*`[^`]+`/)
  if (!prefixMatch) return line

  const prefix = prefixMatch[0]
  const rest = line.slice(prefix.length).replace(/^\s*/, '')
  const emojiMatch = rest.match(/^\p{Extended_Pictographic}/u)

  if (emojiMatch) {
    const currentIcon = emojiMatch[0]
    if (currentIcon === icon) return line

    changes.push({ field: 'Status', from: currentIcon, to: icon, source: 'normalization' })
    return `${prefix} ${icon}${rest.slice(currentIcon.length)}`
  }

  changes.push({ field: 'Status', to: icon, source: 'normalization' })
  return `${prefix} ${icon}${rest ? ` ${rest}` : ''}`
}

/** Local dependency shorthand, e.g. `001` or `~~001~~`/`` `001` `` — three digits with only non-word wrapping punctuation. Full IDs like `npc-001` never match (the letters aren't `\W`). */
const LOCAL_DEPENDS_TOKEN_RE = /^(\W*)(\d{3})(\W*)$/

const expandDependsOnToken = (token: string, domain: string, existingPlanIds: Set<string> | undefined): string => {
  const match = token.match(LOCAL_DEPENDS_TOKEN_RE)
  if (!match) return token

  const [, prefix, id, suffix] = match
  const expandedId = `${domain}-${id}`

  // A bare number can also be a legacy global ID (see the option's JSDoc) —
  // only expand when it resolves to a real local plan, otherwise the
  // ambiguous token is left exactly as-is.
  if (!existingPlanIds?.has(expandedId)) return token

  return `${prefix}${expandedId}${suffix}`
}

/** Expand bare local-domain IDs (`001`) to `<domain>-001` when that plan actually exists, preserving whitespace and any explicit/mixed/unresolved IDs untouched. */
const expandDependsOn = (raw: string, domain: string | undefined, existingPlanIds: Set<string> | undefined): string => {
  if (!domain) return raw

  return raw
    .split(/(\s+)/)
    .map(part => (/^\s+$/.test(part) ? part : expandDependsOnToken(part, domain, existingPlanIds)))
    .join('')
}

type RepairContext = {
  file: string
  domainFromFilename?: string
  roadmapFiles?: Set<string>
  existingPlanIds?: Set<string>
  lines: string[]
  cursorIdx: number
  header: PlanHeader
  changes: PlanRepairChange[]
  warnings: string[]
}

const findFieldLineIdx = (lines: string[], test: (line: string) => boolean): number => lines.findIndex(test)

/** Never fabricated (see "Created" in the plan) — missing/invalid values are reported as a warning only. */
const processCreated = (ctx: RepairContext): void => {
  const idx = findFieldLineIdx(ctx.lines, l => /^\*\*Created:\*\*/i.test(l))

  if (idx === -1) {
    ctx.warnings.push('Created: missing — not fabricated, left unset')
    return
  }

  ctx.cursorIdx = idx

  if (!ctx.header.created || !CREATED_DATE_FORMAT_RE.test(ctx.header.created)) {
    ctx.warnings.push(`Created: invalid value "${ctx.header.created ?? ''}" (expected YYYY-MM-DD) — left unchanged`)
  }
}

const processStatus = (ctx: RepairContext): void => {
  const idx = findFieldLineIdx(ctx.lines, l => /^\*\*Status:\*\*/i.test(l))
  const raw = ctx.header.status
  const normalized = normalizeStatusValue(raw)

  if (idx === -1) {
    ctx.lines.splice(ctx.cursorIdx + 1, 0, buildStatusLine(DEFAULT_STATUS))
    ctx.cursorIdx += 1
    ctx.changes.push({ field: 'Status', to: DEFAULT_STATUS, source: 'default' })
    ctx.warnings.push('Status: missing — defaulted to "planned"')
    ctx.header.status = DEFAULT_STATUS
    return
  }

  ctx.cursorIdx = idx

  if (normalized && normalized === raw) {
    ctx.lines[idx] = ensureStatusIcon(ctx.lines[idx], normalized, ctx.changes)
    return
  }

  const finalStatus = normalized ?? DEFAULT_STATUS

  if (!normalized) {
    ctx.warnings.push(`Status: unrecognized value "${raw ?? ''}" — defaulted to "planned"`)
  }

  ctx.changes.push({ field: 'Status', from: raw, to: finalStatus, source: normalized ? 'normalization' : 'default' })
  ctx.lines[idx] = buildStatusLine(finalStatus)
  ctx.header.status = finalStatus
}

/** `Type` is only required for `planned` plans (matches `validatePlanHeader`) — a missing `Type` on any other status is left alone rather than inferred, so historical plans that predate the field aren't touched. */
const processType = (ctx: RepairContext): void => {
  const idx = findFieldLineIdx(ctx.lines, l => /^\*\*Type:\*\*/i.test(l))
  const raw = ctx.header.type

  if (idx === -1) {
    if (ctx.header.status !== 'planned') return

    const { type, source } = inferType(ctx.header, ctx.file, ctx.domainFromFilename)
    ctx.lines.splice(ctx.cursorIdx + 1, 0, `**Type:** ${type}`)
    ctx.cursorIdx += 1
    ctx.changes.push({ field: 'Type', to: type, source })
    return
  }

  ctx.cursorIdx = idx
  if (raw && AVAILABLE_TYPES.includes(raw as PlanType)) return

  const { type, source } = inferType(ctx.header, ctx.file, ctx.domainFromFilename)
  ctx.warnings.push(`Type: invalid value "${raw ?? ''}" — replaced with "${type}"`)
  ctx.changes.push({ field: 'Type', from: raw, to: type, source })
  ctx.lines[idx] = `**Type:** ${type}`
}

/** Priority/Effort aren't required on completed plans (matches `validatePlanHeader`) — a missing value there is left alone. */
const isCompletedStatus = (status: string | undefined): boolean =>
  status !== undefined && COMPLETED_STATUSES.has(status as Status)

const processPriority = (ctx: RepairContext): void => {
  const idx = findFieldLineIdx(ctx.lines, l => /\*\*Priority:\*\*/i.test(l))
  const raw = ctx.header.priority
  const normalized = normalizePriorityValue(raw)

  if (idx === -1) {
    if (isCompletedStatus(ctx.header.status)) return

    ctx.lines.splice(ctx.cursorIdx + 1, 0, `**Priority:** ${DEFAULT_PRIORITY}`)
    ctx.cursorIdx += 1
    ctx.changes.push({ field: 'Priority', to: DEFAULT_PRIORITY, source: 'default' })
    return
  }

  ctx.cursorIdx = idx
  if (normalized === raw) return

  const finalValue = normalized ?? DEFAULT_PRIORITY
  ctx.lines[idx] = raw
    ? ctx.lines[idx].replace(PLAN_PRIORITY_RE, full => full.replace(raw, finalValue))
    : ctx.lines[idx].replace(/\*\*Priority:\*\*/, `**Priority:** ${finalValue}`)
  ctx.changes.push({ field: 'Priority', from: raw, to: finalValue, source: normalized ? 'normalization' : 'default' })

  if (!normalized) {
    ctx.warnings.push(`Priority: unrecognized value "${raw ?? ''}" — defaulted to "${DEFAULT_PRIORITY}"`)
  }
}

const processEffort = (ctx: RepairContext): void => {
  const idx = findFieldLineIdx(ctx.lines, l => /\*\*Effort:\*\*/i.test(l))
  const raw = ctx.header.effort
  const normalized = normalizeEffortValue(raw)

  if (idx === -1) {
    if (isCompletedStatus(ctx.header.status)) return

    ctx.lines.splice(ctx.cursorIdx + 1, 0, `**Effort:** ${DEFAULT_EFFORT}`)
    ctx.cursorIdx += 1
    ctx.changes.push({ field: 'Effort', to: DEFAULT_EFFORT, source: 'default' })
    return
  }

  ctx.cursorIdx = idx
  if (normalized === raw) return

  const finalValue = normalized ?? DEFAULT_EFFORT
  ctx.lines[idx] = raw
    ? ctx.lines[idx].replace(PLAN_EFFORT_RE, full => full.replace(raw, finalValue))
    : ctx.lines[idx].replace(/\*\*Effort:\*\*/, `**Effort:** ${finalValue}`)
  ctx.changes.push({ field: 'Effort', from: raw, to: finalValue, source: normalized ? 'normalization' : 'default' })

  if (!normalized) {
    ctx.warnings.push(`Effort: unrecognized value "${raw ?? ''}" — defaulted to "${DEFAULT_EFFORT}"`)
  }
}

const processDependsOn = (ctx: RepairContext): void => {
  const idx = findFieldLineIdx(ctx.lines, l => /^\*\*Depends on:\*\*/i.test(l))
  const raw = ctx.header.dependsOn

  if (idx === -1) {
    ctx.lines.splice(ctx.cursorIdx + 1, 0, `**Depends on:** ${DEFAULT_DEPENDS_ON}`)
    ctx.cursorIdx += 1
    ctx.changes.push({ field: 'Depends on', to: DEFAULT_DEPENDS_ON, source: 'default' })
    ctx.warnings.push('Depends on: missing — defaulted to "-"')
    return
  }

  ctx.cursorIdx = idx

  const trimmed = raw?.trim().toLowerCase()
  if (!raw || trimmed === '' || trimmed === '-' || trimmed === 'none') return

  const expanded = expandDependsOn(raw, ctx.domainFromFilename, ctx.existingPlanIds)
  if (expanded === raw) return

  ctx.lines[idx] = `**Depends on:** ${expanded}`
  ctx.changes.push({ field: 'Depends on', from: raw, to: expanded, source: 'filename' })
}

const isValidDomain = (value: string | undefined): value is Domain => value !== undefined && value in AVAILABLE_DOMAINS

const processDomain = (ctx: RepairContext): void => {
  const idx = findFieldLineIdx(ctx.lines, l => /^\*\*Domain:\*\*/i.test(l))
  const raw = ctx.header.domain
  const filenameDomain = ctx.domainFromFilename

  if (idx === -1) {
    if (isValidDomain(filenameDomain)) {
      ctx.lines.splice(ctx.cursorIdx + 1, 0, `**Domain:** \`${filenameDomain}\``)
      ctx.cursorIdx += 1
      ctx.changes.push({ field: 'Domain', to: filenameDomain, source: 'filename' })
    } else {
      ctx.warnings.push('Domain: missing and filename does not resolve to a canonical domain — left unset')
    }
    return
  }

  ctx.cursorIdx = idx

  if (isValidDomain(filenameDomain)) {
    if (raw !== filenameDomain) {
      ctx.lines[idx] = `**Domain:** \`${filenameDomain}\``
      ctx.changes.push({ field: 'Domain', from: raw, to: filenameDomain, source: 'filename' })
    }
    return
  }

  if (!isValidDomain(raw)) {
    ctx.warnings.push(`Domain: value "${raw ?? ''}" is not canonical and filename does not resolve it — left unchanged`)
  }
}

const checkRoadmap = (ctx: RepairContext): void => {
  const raw = ctx.header.roadmap
  if (!raw || !ctx.roadmapFiles) return

  const normalized = raw.replace(/\.md$/, '')
  if (!ctx.roadmapFiles.has(normalized)) {
    ctx.warnings.push(`Roadmap: "${raw}" does not match a file in docs/roadmap/`)
  }
}

const checkImplementedAt = (ctx: RepairContext): void => {
  const raw = ctx.header.implementedAt
  if (raw && !IMPLEMENTED_AT_FORMAT_RE.test(raw)) {
    ctx.warnings.push(`Implemented at: invalid format "${raw}" (expected YYYY-MM-DD HH:mm) — left unchanged`)
  }
}

/** Header block is everything above the first `##` heading (mirrors `extractHeaderBlock`, split out for repair's header/body reassembly). */
const splitHeaderBody = (content: string): { header: string, body: string } => {
  const idx = content.search(/^##\s/m)
  return idx === -1 ? { header: content, body: '' } : { header: content.slice(0, idx), body: content.slice(idx) }
}

/**
 * Parse, repair and canonicalize a single plan's metadata header in memory,
 * returning the full canonical content to write plus a `PlanRepair` report.
 * Never throws for metadata-quality problems — anything it can't safely
 * repair is preserved as-is and surfaced via `repair.warnings`.
 *
 * Idempotent: `repairPlanMetadata(file, repairPlanMetadata(file, content).content).content === repairPlanMetadata(file, content).content`.
 */
export const repairPlanMetadata = (
  file: string,
  content: string,
  options: RepairPlanMetadataOptions = {},
): RepairPlanMetadataResult => {
  const header = parsePlanHeader(file, content)
  const domainFromFilename = options.legacy
    ? undefined
    : options.domainFromFilename ?? file.match(PLAN_ID_RE)?.[1]

  const { header: headerBlock, body } = splitHeaderBody(content)
  const lines = headerBlock.split('\n')
  const titleIdx = lines.findIndex(l => PLAN_TITLE_RE.test(l))

  const changes: PlanRepairChange[] = []
  const warnings: string[] = []

  const ctx: RepairContext = {
    file,
    domainFromFilename,
    roadmapFiles: options.roadmapFiles,
    existingPlanIds: options.existingPlanIds,
    lines,
    cursorIdx: titleIdx === -1 ? 0 : titleIdx,
    header,
    changes,
    warnings,
  }

  processCreated(ctx)
  processStatus(ctx)
  processType(ctx)
  processPriority(ctx)
  processEffort(ctx)
  processDependsOn(ctx)
  processDomain(ctx)
  checkRoadmap(ctx)
  checkImplementedAt(ctx)

  let newContent = ctx.lines.join('\n') + body
  newContent = normalizeTokenListFormatting(newContent, header, changes)

  return {
    content: newContent,
    header: parsePlanHeader(file, newContent),
    repair: {
      file,
      changed: changes.length > 0,
      changes,
      warnings,
    },
  }
}
